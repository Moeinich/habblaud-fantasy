// Answer from the office: registry of pending permission requests.
//
// Claude Code's PermissionRequest hook (mod/habblaud-permissoes/hooks/permission-hook.mjs, via the
// habblaud-permissoes plugin or npm run hooks:install) sends each request to POST /api/permissions and waits for the decision in GET /api/permissions/:id/wait (long-poll).
// The page answers in POST /api/permissions/:id/decision. The registry:
// - only accepts the request if some local page is open and the session is known (otherwise the hook exits
//   right away and the terminal carries on as usual);
// - publishes the request on the agent (AgentInfo.permission, via Office) and announces it in the feed;
// - hands the decision to the hook (allow/deny, or the answers to an AskUserQuestion) or releases it without one
//   ("answer in the terminal");
// - drops orphan requests: the hook's timeout, a hook that died (nobody waiting), an agent that left and a
//   request answered in the terminal itself (the tool_result shows up in the transcript).
//
// Codex uses the same routes (the PermissionRequest hook of mod/habblaud-codex/hook.mjs, with `provider: "codex"` and
// the account in the body). Differences: the agent matches by thread (agent_id ?? session_id) among the Codex agents;
// no suggestions or questions; deny only with a reason (no interrupt); no search for the answer in the transcript (in
// Codex the terminal only asks for approval after the hook ends, so it's never answered there while the hook waits).
import { randomBytes } from 'node:crypto';
import { describeTool, maskSecrets, truncate } from '../../shared/activity';
import { ANSWER_OTHER_MAX, answerSummary, ASK_TOOL, checkAnswers } from '../../shared/answers';
import type { Activity, AgentInfo, PermissionAnswer, PermissionDecision, PermissionRequestInfo, PermissionSuggestionInfo } from '../../shared/types';
import { errMsg, log } from '../log';
import { toolView } from '../sources/terminal';
import { codexToolView } from './codex';
import { callSignature, scanToolCall } from './transcript';
import { tr } from '../../shared/i18n';

/** How long the hook waits by default (it sends its own in `timeout_ms`). */
export const DEFAULT_TIMEOUT_MS = 300_000;
export const MIN_TIMEOUT_MS = 5_000;
export const MAX_TIMEOUT_MS = 24 * 60 * 60_000;
/** Grace period after the hook's timeout before the request goes away on its own. */
export const EXPIRY_GRACE_MS = 5_000;
/** Longest response of a long-poll (the hook asks again right after). */
export const WAIT_MAX_MS = 25_000;
/** No hook waiting for this long = the hook died (cancelled, timed out, session interrupted). */
export const ORPHAN_MS = 8_000;
/** Decision kept for a hook that was between two waits to come and fetch. */
export const RESOLVED_KEEP_MS = 30_000;
/** Minimum interval between transcript checks for a request. */
export const SCAN_EVERY_MS = 1_000;
/** A main agent that was waiting (dialog open) and stopped waiting this long ago: answered in the terminal. */
export const LEFT_WAITING_MS = 3_000;
export const MAX_PENDING = 32;
/**
 * A long wait (HABBLAUD_PERMISSION_TIMEOUT above the default) with no page able to answer for this long, and no phone
 * that could connect later: the request goes back to the terminal (otherwise it would sit for up to 24 h where nobody
 * sees it; for background subagents the terminal only shows the dialog when the hook ends).
 */
export const UNWATCHED_MS = 5 * 60_000;

const DESTINATIONS = new Set(['session', 'localSettings', 'projectSettings', 'userSettings']);
const MAX_SUGGESTIONS = 4;
const MAX_MESSAGE = 1_000;
const RULE_MAX = 160;
/** Answers in an `answer` decision (AskUserQuestion asks up to 4 questions). */
const MAX_ANSWERS = 4;

/** What the registry uses from Office (minimal interface: makes testing easier). */
export interface OfficeLike {
  get(id: string): AgentInfo | undefined;
  list(): AgentInfo[];
  markDirty(): void;
  addActivity(id: string, activity: Activity, current: boolean, opts?: { feed?: boolean }): void;
  /** "asks for permission" or "has a question" notice (same dedupe as the status's "needs you" notice). */
  noticePermission(id: string, what: string, kind?: 'permission' | 'question'): void;
}

export interface RegistryOptions {
  office: OfficeLike;
  /** Connected local pages (Hub.localSize): with none, the request isn't diverted from the terminal. */
  viewers: () => number;
  /** A page not open yet may answer later (a phone with a login and `permissions` allowed). */
  answerLater?: () => boolean;
  /** Transcript of a present agent (ClaudeWatcher.transcriptPathOf). */
  transcriptPathOf?: (agentId: string) => string | undefined;
  /**
   * Codex account (AgentInfo.account) of a Codex hook request, by the CODEX_HOME folder it sends (the basename the hook
   * computes doesn't know about disambiguated ids, e.g. ".codex~2"). undefined = the hook's account counts.
   */
  codexAccount?: (account: string | undefined, codexHome: string | undefined) => string | undefined;
  /** Decision for a fake demo request (Office.decideDemoPermission); true = it was a demo one. */
  demoDecide?: (id: string, d: PermissionDecision) => boolean;
  /** Detail of a fake demo request (the snapshot already carries it). */
  demoDetail?: (id: string) => PermissionRequestInfo | undefined;
  now?: () => number;
  /** Interval of the internal clock (start). */
  tickMs?: number;
  orphanMs?: number;
  resolvedKeepMs?: number;
  maxPending?: number;
}

export type SkipReason = 'no-viewers' | 'unknown-session' | 'unsupported-tool' | 'too-many';
export type RegisterResult = { id: string; expiresAt: number } | { skip: SkipReason };
/** answeredElsewhere: minimum age of a request before an event of another machine may release it. */
export const ANSWERED_ELSEWHERE_MIN_MS = 1_500;

export type ReleaseReason = 'terminal' | 'answered' | 'expired' | 'orphan' | 'gone' | 'unwatched' | 'shutdown';

/**
 * Response to a hook wait. `answer`: the answers by position (the hook swaps them for the original texts of the
 * AskUserQuestion it got from Claude Code).
 */
export type WaitResult =
  | { status: 'pending' }
  | { status: 'decided'; behavior: 'allow' | 'deny'; message?: string; interrupt?: boolean; suggestion?: number }
  | { status: 'decided'; behavior: 'answer'; answers: PermissionAnswer[] }
  | { status: 'released'; reason: ReleaseReason };

/**
 * invalid = unknown rule suggestion; invalid-answer = a decision that doesn't fit the request type (a question is
 * answered with `answer`, and only it) or answers that don't match the questions; unsupported = Codex doesn't accept it
 * (interrupt or "always allow").
 */
export type DecideResult = 'ok' | 'not-found' | 'conflict' | 'invalid' | 'invalid-answer' | 'unsupported';

/** Validation error of the body coming from the hook (becomes 400). */
export class InvalidRequest extends Error {}

interface Waiter {
  done: (r: WaitResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** ORIGINAL format of an AskUserQuestion question: to check the answers, which come back by position. */
interface AskFormat {
  multiSelect: boolean;
  /** How many options the original has (including those Habblaud doesn't show). */
  options: number;
}

interface Pending {
  /** Full version (with `input`): GET /api/permissions/:id. */
  info: PermissionRequestInfo;
  /** Codex request (no search for the answer in the transcript). */
  codex?: boolean;
  /** Question (AskUserQuestion): the format of `tool_input.questions`, by position (undefined = invalid input). */
  askFormat?: Array<AskFormat | undefined>;
  agentId: string;
  sessionId: string;
  /** The hook's agent_id (subagent request). */
  hookAgentId?: string;
  signature: string;
  toolUseId?: string;
  lastScanAt: number;
  /** The session registry has already shown the main agent waiting (the dialog opened in the terminal). */
  sawWaiting?: boolean;
  /** Since when it stopped waiting (after having waited). */
  notWaitingSince?: number;
  waiters: Set<Waiter>;
  /** Since when no hook has been waiting. */
  idleSince: number;
  outcome?: Exclude<WaitResult, { status: 'pending' }>;
  resolvedAt?: number;
}

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : undefined;
}

function shortStr(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : undefined;
}

function isIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** A request answered with `answer` (AskUserQuestion's questions; Codex doesn't send them through the hook). */
function isQuestion(info: { tool: string; provider?: string }): boolean {
  return info.tool === ASK_TOOL && info.provider !== 'codex';
}

/** Codex doesn't accept interrupt or "always allow" (its hook only approves or denies with a reason). */
function unsupportedByCodex(info: PermissionRequestInfo, d: PermissionDecision): boolean {
  return info.provider === 'codex' && (d.interrupt === true || d.suggestion !== undefined);
}

/**
 * The decision doesn't fit the request type: `answer` only applies to questions, and a question isn't approved without
 * the answers (deny and "answer in the terminal" apply to both).
 */
function wrongKind(info: PermissionRequestInfo, d: PermissionDecision): boolean {
  return d.behavior === 'answer' ? !isQuestion(info) || !info.questions?.length : d.behavior === 'allow' && isQuestion(info);
}

/** Original format of AskUserQuestion's questions, by position. */
function askFormat(raw: unknown): Array<AskFormat | undefined> {
  if (!Array.isArray(raw)) return [];
  return raw.map((q) => {
    const r = rec(q);
    return r ? { multiSelect: r.multiSelect === true, options: Array.isArray(r.options) ? r.options.length : 0 } : undefined;
  });
}

/** Real questions (with text) in the original: all of them must show up in the office for it to be answerable there. */
function askCount(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  return raw.filter((q) => {
    const text = rec(q)?.question;
    return typeof text === 'string' && !!text.trim();
  }).length;
}

/** The answer fits the question's original format (option positions and how many choices). */
function fitsFormat(f: AskFormat | undefined, a: PermissionAnswer): boolean {
  if (!f) return false;
  const options = a.options ?? [];
  if (options.some((i) => i >= f.options)) return false;
  return f.multiSelect || options.length + (a.other ? 1 : 0) === 1;
}

/** An agent that can still receive a request (hasn't left or finished). */
function present(a: AgentInfo | undefined): a is AgentInfo {
  return !!a && a.status !== 'offline' && a.status !== 'done';
}

/** "Bash(npm test:*)" from {toolName, ruleContent}. */
function ruleText(raw: unknown): string | undefined {
  const r = rec(raw);
  const tool = shortStr(r?.toolName, 200);
  if (!tool) return undefined;
  const content = typeof r?.ruleContent === 'string' && r.ruleContent.trim() ? r.ruleContent : undefined;
  return truncate(maskSecrets(content ? `${tool}(${content})` : tool), RULE_MAX);
}

/**
 * "Always allow" suggestions Habblaud offers: only `addRules` with `behavior: "allow"` to a known destination. The
 * page picks by position and the hook applies the ORIGINAL suggestion it got from Claude Code
 * (the server never makes up rules).
 */
export function pickSuggestions(raw: unknown): PermissionSuggestionInfo[] {
  if (!Array.isArray(raw)) return [];
  const out: PermissionSuggestionInfo[] = [];
  raw.forEach((s, index) => {
    const r = rec(s);
    if (!r || r.type !== 'addRules' || r.behavior !== 'allow' || typeof r.destination !== 'string' || !DESTINATIONS.has(r.destination)) return;
    const rules = Array.isArray(r.rules) ? r.rules.map(ruleText).filter((x): x is string => !!x) : [];
    if (!rules.length || out.length >= MAX_SUGGESTIONS) return;
    out.push({ index, rules: rules.slice(0, 4), destination: r.destination });
  });
  return out;
}

/**
 * Puts the pending request on the snapshot's agent (a copy already cloned by Office). While there's a request, the agent
 * shows as 'waiting' — including a background subagent, whose dialog only shows up in the terminal after the hook
 * answers (Claude Code's session registry doesn't say it's waiting).
 */
export function applyPermission(a: AgentInfo, p: PermissionRequestInfo | undefined): AgentInfo {
  if (!p || !present(a)) return a;
  a.permission = p;
  if (a.status !== 'waiting') {
    a.status = 'waiting';
    a.statusSince = p.createdAt;
  }
  a.waitingFor ??= isQuestion(p) ? tr('answer a question') : p.provider === 'codex' ? tr('approve a command') : tr('approve a permission');
  return a;
}

/**
 * Validates the hook's JSON (the same Claude Code passes on stdin, plus the hook's `timeout_ms`). The Codex hook also
 * sends `provider: "codex"`, the account (`account`, the basename of CODEX_HOME) and its path (`codexHome`); there,
 * `agent_id` is the subagent's thread (and `session_id`, the root thread).
 */
export function parseHookInput(raw: unknown): {
  provider?: 'codex';
  account?: string;
  codexHome?: string;
  sessionId: string;
  agentId?: string;
  agentType?: string;
  cwd?: string;
  tool: string;
  input: Rec;
  suggestions: unknown;
  timeoutMs: number;
} {
  const r = rec(raw);
  const sessionId = shortStr(r?.session_id, 200);
  const tool = shortStr(r?.tool_name, 200);
  if (!r || !sessionId || !tool) throw new InvalidRequest(tr('expected the PermissionRequest hook JSON (session_id and tool_name)'));
  const t = typeof r.timeout_ms === 'number' && Number.isFinite(r.timeout_ms) ? r.timeout_ms : DEFAULT_TIMEOUT_MS;
  const codex = r.provider === 'codex';
  return {
    ...(codex ? { provider: 'codex' as const, account: shortStr(r.account, 200), codexHome: shortStr(r.codexHome, 4_096) } : {}),
    sessionId,
    agentId: shortStr(r.agent_id, 200),
    agentType: shortStr(r.agent_type, 120),
    cwd: shortStr(r.cwd, 4_096),
    tool,
    input: rec(r.tool_input) ?? {},
    suggestions: codex ? undefined : r.permission_suggestions,
    timeoutMs: Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, t)),
  };
}

/**
 * Answers of an `answer` decision: up to MAX_ANSWERS, each with the question's position, the option positions
 * (distinct; sorted ascending) and/or the free text (trimmed, up to ANSWER_OTHER_MAX). Whether they match the
 * request's questions is checked by the registry (decide).
 */
function parseAnswers(raw: unknown): PermissionAnswer[] | undefined {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_ANSWERS) return undefined;
  const out: PermissionAnswer[] = [];
  for (const item of raw) {
    const r = rec(item);
    if (!r || !isIndex(r.question)) return undefined;
    const a: PermissionAnswer = { question: r.question };
    if (r.options !== undefined) {
      if (!Array.isArray(r.options) || !r.options.every(isIndex) || new Set(r.options).size !== r.options.length) return undefined;
      if (r.options.length) a.options = (r.options as number[]).slice().sort((x, y) => x - y);
    }
    if (r.other !== undefined) {
      if (typeof r.other !== 'string') return undefined;
      const other = r.other.trim();
      if (other.length > ANSWER_OTHER_MAX) return undefined;
      if (other) a.other = other;
    }
    out.push(a);
  }
  return out;
}

/** Body of a decision coming from the page. */
export function parseDecision(raw: unknown): PermissionDecision | undefined {
  const r = rec(raw);
  if (r?.behavior === 'answer') {
    const answers = parseAnswers(r.answers);
    return answers ? { behavior: 'answer', answers } : undefined;
  }
  if (!r || (r.behavior !== 'allow' && r.behavior !== 'deny' && r.behavior !== 'terminal')) return undefined;
  const d: PermissionDecision = { behavior: r.behavior };
  if (r.behavior === 'deny') {
    if (typeof r.message === 'string' && r.message.trim()) d.message = r.message.trim().slice(0, MAX_MESSAGE);
    if (r.interrupt === true) d.interrupt = true;
  }
  if (r.behavior === 'allow' && r.suggestion !== undefined) {
    if (typeof r.suggestion !== 'number' || !Number.isInteger(r.suggestion) || r.suggestion < 0) return undefined;
    d.suggestion = r.suggestion;
  }
  return d;
}

export class PermissionRegistry {
  private pending = new Map<string, Pending>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq = 0;
  private readonly now: () => number;
  private readonly orphanMs: number;
  private readonly resolvedKeepMs: number;
  private readonly maxPending: number;
  /** Since when there has been no page able to answer (null = there is one). */
  private unwatchedSince: number | null = null;

  constructor(private readonly opts: RegistryOptions) {
    this.now = opts.now ?? Date.now;
    this.orphanMs = opts.orphanMs ?? ORPHAN_MS;
    this.resolvedKeepMs = opts.resolvedKeepMs ?? RESOLVED_KEEP_MS;
    this.maxPending = opts.maxPending ?? MAX_PENDING;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        log.warnOnce(`permissions-tick:${errMsg(err)}`, tr('Permission requests: clock failed ({0}).', [errMsg(err)]));
      }
    }, this.opts.tickMs ?? 500);
    this.timer.unref?.();
  }

  /** Stops the clock and releases whoever is waiting (the hook exits without a decision). */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const p of this.pending.values()) if (!p.outcome) this.release(p, 'shutdown');
  }

  /** Open requests (without a decision). */
  get size(): number {
    let n = 0;
    for (const p of this.pending.values()) if (!p.outcome) n++;
    return n;
  }

  /**
   * Registers a request from the hook. `{skip}` = don't divert (the hook exits right away and the terminal carries on):
   * a question the office can't show in full, nobody watching, unknown session or too many requests. Invalid body:
   * throws InvalidRequest.
   */
  register(raw: unknown): RegisterResult {
    const req = parseHookInput(raw);
    const codex = req.provider === 'codex';
    const desc = codex ? codexToolView(req.tool, req.input, req.cwd) : describeTool(req.tool, req.input);
    const questions = 'questions' in desc ? desc.questions : undefined;
    const ask = isQuestion(req);
    // Question: all of them must show up in the office (the hook only answers if each one has an answer).
    if (ask && (!questions?.length || questions.length !== askCount(req.input.questions))) return { skip: 'unsupported-tool' };
    if (this.opts.viewers() <= 0) return { skip: 'no-viewers' };
    const target = codex
      ? this.resolveCodexAgent(req.sessionId, req.agentId, req.agentType, this.opts.codexAccount?.(req.account, req.codexHome) ?? req.account)
      : this.resolveAgent(req.sessionId, req.agentId, req.agentType);
    if (!target) return { skip: 'unknown-session' };
    if (this.size >= this.maxPending) return { skip: 'too-many' };

    const now = this.now();
    const id = `p-${now.toString(36)}-${++this.seq}-${randomBytes(9).toString('base64url')}`;
    // Codex: title, summary and arguments by its tool names (permissions/codex.ts).
    const view = 'title' in desc ? desc : toolView(req.tool, req.input, req.cwd);
    const info: PermissionRequestInfo = { id, tool: req.tool, title: view.title, text: desc.text, icon: desc.icon, createdAt: now, expiresAt: now + req.timeoutMs };
    if (codex) info.provider = 'codex';
    if (view.input) info.input = view.input;
    if (view.inputKind) info.inputKind = view.inputKind;
    if (target.subagent) info.subagent = target.subagent;
    const suggestions = pickSuggestions(req.suggestions);
    if (suggestions.length) info.suggestions = suggestions;
    if (ask) info.questions = questions;

    const p: Pending = {
      info,
      agentId: target.id,
      sessionId: req.sessionId,
      signature: codex ? '' : callSignature(req.tool, req.input),
      lastScanAt: 0,
      waiters: new Set(),
      idleSince: now,
    };
    if (codex) p.codex = true;
    if (req.agentId) p.hookAgentId = req.agentId;
    if (ask) p.askFormat = askFormat(req.input.questions);
    this.pending.set(id, p);

    const by = target.subagent ? tr(' (subagent {0})', [target.subagent]) : '';
    const first = info.questions?.[0]?.question;
    if (first) {
      const all = info.questions!.map((q) => q.question).join(' · ');
      this.opts.office.addActivity(target.id, { id: `${target.id}#perm:${id}`, at: now, kind: 'wait', icon: '❓', text: truncate(tr('Question: {0}', [first]), 46), detail: truncate(all, 300), tool: 'PermissionRequest' }, false);
      this.opts.office.noticePermission(target.id, `${truncate(first, 120)}${by}`, 'question');
    } else {
      this.opts.office.addActivity(target.id, { id: `${target.id}#perm:${id}`, at: now, kind: 'wait', icon: '🔐', text: truncate(tr('Asks for permission: {0}', [desc.text]), 46), detail: view.title, tool: 'PermissionRequest' }, false);
      this.opts.office.noticePermission(target.id, `${desc.text}${by}`);
    }
    this.opts.office.markDirty();
    return { id, expiresAt: info.expiresAt + EXPIRY_GRACE_MS };
  }

  /** Full detail of an open request (with the arguments), or undefined. */
  /** The agent a request belongs to (ingest checks that a machine only waits on its own requests). */
  agentOf(id: string): string | undefined {
    return this.pending.get(id)?.agentId;
  }

  /**
   * The request was answered somewhere the registry cannot read (the terminal of another machine): its tool ran
   * (`tool` given) or the agent's turn ended (no `tool`). Releases the matching open requests of that agent as
   * `answered`, so the hook stops waiting. Used for agents of other machines (server/ingest/source.ts), which have no
   * transcript here.
   */
  answeredElsewhere(agentId: string, tool?: string): void {
    for (const p of [...this.pending.values()]) {
      if (p.outcome || p.agentId !== agentId) continue;
      if (tool !== undefined && p.info.tool !== tool) continue;
      // A late event of an earlier call (async hooks) must not release a request that just arrived: nobody answers a
      // dialog in the terminal that fast.
      if (this.now() - p.info.createdAt < ANSWERED_ELSEWHERE_MIN_MS) continue;
      this.release(p, 'answered');
      if (tool !== undefined) break;
    }
  }

  detail(id: string): PermissionRequestInfo | undefined {
    const p = this.pending.get(id);
    if (p && !p.outcome) return { ...p.info, ...this.queueOf(p) };
    return this.opts.demoDetail?.(id);
  }

  /**
   * Oldest request of each agent (without `input`, which only goes out through the detail), with how many wait behind
   * it. This is what Office puts in the snapshot.
   */
  snapshot(): Map<string, PermissionRequestInfo> {
    const out = new Map<string, PermissionRequestInfo>();
    const counts = new Map<string, number>();
    for (const p of this.pending.values()) {
      if (p.outcome) continue;
      counts.set(p.agentId, (counts.get(p.agentId) ?? 0) + 1);
      if (out.has(p.agentId)) continue;
      const { input: _input, inputKind: _kind, ...info } = p.info;
      out.set(p.agentId, info);
    }
    for (const [agentId, info] of out) {
      const n = (counts.get(agentId) ?? 1) - 1;
      if (n > 0) info.queued = n;
    }
    return out;
  }

  /**
   * Waits for a request's decision for up to `ms`. undefined = unknown id (the hook gives up). `cancel`
   * turns off the wait (connection closed). A decision already made comes back right away.
   */
  wait(id: string, ms: number): { result: Promise<WaitResult>; cancel: () => void } | undefined {
    const p = this.pending.get(id);
    if (!p) return undefined;
    if (p.outcome) {
      const outcome = p.outcome;
      // Delivered: no need to keep it any more.
      this.pending.delete(id);
      return { result: Promise.resolve(outcome), cancel: () => {} };
    }
    let waiter: Waiter | undefined;
    const result = new Promise<WaitResult>((done) => {
      const timer = setTimeout(() => this.dropWaiter(p, waiter!, { status: 'pending' }), Math.max(0, Math.min(ms, WAIT_MAX_MS)));
      timer.unref?.();
      waiter = { done, timer };
      p.waiters.add(waiter);
    });
    return { result, cancel: () => waiter && this.dropWaiter(p, waiter) };
  }

  /** The page's decision. A demo request goes to `demoDecide` (with the same rules for questions). */
  decide(id: string, d: PermissionDecision): DecideResult {
    const p = this.pending.get(id);
    if (!p) {
      const demo = this.opts.demoDetail?.(id);
      if (demo && unsupportedByCodex(demo, d)) return 'unsupported';
      if (demo && (wrongKind(demo, d) || (d.behavior === 'answer' && !checkAnswers(demo.questions ?? [], d.answers)))) return 'invalid-answer';
      return this.opts.demoDecide?.(id, d) ? 'ok' : 'not-found';
    }
    if (p.outcome) return 'conflict';
    if (unsupportedByCodex(p.info, d)) return 'unsupported';
    if (d.suggestion !== undefined && !p.info.suggestions?.some((s) => s.index === d.suggestion)) return 'invalid';
    if (d.behavior === 'terminal') {
      this.release(p, 'terminal');
      return 'ok';
    }
    if (wrongKind(p.info, d)) return 'invalid-answer';
    if (d.behavior === 'answer') return this.answer(p, d.answers);
    const outcome: WaitResult = { status: 'decided', behavior: d.behavior };
    if (d.message) outcome.message = d.message;
    if (d.interrupt) outcome.interrupt = true;
    if (d.suggestion !== undefined) outcome.suggestion = d.suggestion;
    this.resolve(p, outcome);
    const now = this.now();
    const act: Activity =
      d.behavior === 'allow'
        ? { id: `${p.agentId}#perm-ok:${id}`, at: now, kind: 'other', icon: '✅', text: d.suggestion !== undefined ? tr('Approved in Habblaud (always allow)') : tr('Approved in Habblaud'), detail: p.info.title, tool: 'PermissionRequest' }
        : { id: `${p.agentId}#perm-no:${id}`, at: now, kind: 'wait', icon: '🚫', text: tr('Denied in Habblaud'), detail: d.message ? `${p.info.title} — ${d.message}` : p.info.title, tool: 'PermissionRequest' };
    this.opts.office.addActivity(p.agentId, act, false);
    return 'ok';
  }

  /**
   * Answers to an AskUserQuestion's questions: each shown question answered exactly once, with its options, also
   * checked against the ORIGINAL format (the hook finds the texts by position).
   */
  private answer(p: Pending, raw: PermissionAnswer[] | undefined): DecideResult {
    const questions = p.info.questions ?? [];
    const answers = checkAnswers(questions, raw);
    if (!answers || answers.some((a) => !fitsFormat(p.askFormat?.[a.question], a))) return 'invalid-answer';
    this.resolve(p, { status: 'decided', behavior: 'answer', answers });
    const act: Activity = { id: `${p.agentId}#perm-answer:${p.info.id}`, at: this.now(), kind: 'other', icon: '💬', text: tr('Answered in Habblaud'), detail: answerSummary(questions, answers), tool: 'PermissionRequest' };
    this.opts.office.addActivity(p.agentId, act, false);
    return 'ok';
  }

  /** Clock: expiry, orphans, agents that left, answers in the terminal and cleanup of delivered decisions. */
  tick(): void {
    const now = this.now();
    this.unwatchedSince = this.opts.viewers() > 0 ? null : (this.unwatchedSince ?? now);
    const unwatched = this.unwatchedSince !== null && now - this.unwatchedSince >= UNWATCHED_MS && !this.opts.answerLater?.();
    for (const [id, p] of this.pending) {
      if (p.outcome) {
        if (now - (p.resolvedAt ?? now) >= this.resolvedKeepMs) this.pending.delete(id);
        continue;
      }
      if (now >= p.info.expiresAt + EXPIRY_GRACE_MS) this.release(p, 'expired');
      else if (!p.waiters.size && now - p.idleSince >= this.orphanMs) this.release(p, 'orphan');
      else if (!present(this.opts.office.get(p.agentId))) this.release(p, 'gone');
      else if (unwatched && p.info.expiresAt - p.info.createdAt > DEFAULT_TIMEOUT_MS) this.release(p, 'unwatched');
      // In Codex the terminal only asks for approval after the hook ends: there's no answer given there to look for.
      else if (p.codex) continue;
      else if (now - p.lastScanAt >= SCAN_EVERY_MS && this.answeredInTerminal(p, now)) this.release(p, 'answered');
      else if (this.leftWaiting(p, now)) this.release(p, 'answered');
    }
  }

  // ---------------------------------------------------------------- internals

  private resolveAgent(sessionId: string, agentId?: string, agentType?: string): { id: string; subagent?: string } | undefined {
    const office = this.opts.office;
    if (agentId) {
      const subId = `${sessionId}:${agentId}`;
      const sub = office.get(subId);
      if (present(sub) && sub.provider !== 'codex') return { id: subId };
    }
    const main = office.list().find((a) => a.kind === 'main' && a.provider !== 'codex' && a.sessionId === sessionId && a.status !== 'offline');
    if (!main) return undefined;
    return agentId ? { id: main.id, subagent: agentType ?? tr('subagent') } : { id: main.id };
  }

  /**
   * Codex agent of a request: the one of thread `agent_id ?? session_id` (a subagent has its own thread; the main agent
   * is the root thread). The account only breaks ties (thread ids are UUIDs). A subagent Habblaud doesn't show: the
   * request goes to the main agent, with the subagent's type.
   */
  private resolveCodexAgent(sessionId: string, agentId: string | undefined, agentType: string | undefined, account: string | undefined): { id: string; subagent?: string } | undefined {
    const find = (thread: string): AgentInfo | undefined => {
      const found = this.opts.office.list().filter((a) => a.provider === 'codex' && a.sessionId === thread && present(a));
      return found.find((a) => a.account === account) ?? found[0];
    };
    const sub = agentId && agentId !== sessionId ? agentId : undefined;
    const own = sub ? find(sub) : undefined;
    if (own) return { id: own.id };
    const main = find(sessionId);
    if (!main) return undefined;
    return sub ? { id: main.id, subagent: agentType ?? tr('subagent') } : { id: main.id };
  }

  private queueOf(p: Pending): { queued?: number } {
    // By arrival order (the Map's), not by createdAt: two requests in the same millisecond would tie and each would
    // count the other as "behind it".
    let n = 0;
    let after = false;
    for (const o of this.pending.values()) {
      if (o === p) after = true;
      else if (after && !o.outcome && o.agentId === p.agentId) n++;
    }
    return n ? { queued: n } : {};
  }

  /** Did the call's tool_result show up in the transcript (answered in the terminal)? Never throws. */
  private answeredInTerminal(p: Pending, now: number): boolean {
    p.lastScanAt = now;
    // A subagent Habblaud doesn't track (request shown on the main agent): its transcript isn't known and the main
    // agent's doesn't have the call; what's left is expiry and the orphan check.
    if (p.hookAgentId && p.agentId !== `${p.sessionId}:${p.hookAgentId}`) return false;
    const path = this.opts.transcriptPathOf?.(p.agentId);
    if (!path) return false;
    try {
      const r = scanToolCall(path, { tool: p.info.tool, signature: p.signature, knownId: p.toolUseId, createdAt: p.info.createdAt });
      if (r.toolUseId) p.toolUseId = r.toolUseId;
      return r.answered;
    } catch {
      return false;
    }
  }

  /**
   * Plan B for an answer in the terminal, only for main-agent requests whose call wasn't found in the transcript: the
   * session registry showed the dialog open ('waiting') and then stopped showing it for LEFT_WAITING_MS. (With the call
   * found, only the tool_result counts: consecutive requests of the same agent go through 'busy' between one dialog
   * and the next.)
   */
  private leftWaiting(p: Pending, now: number): boolean {
    if (p.hookAgentId || p.toolUseId) return false;
    const a = this.opts.office.get(p.agentId);
    if (a?.kind !== 'main') return false;
    if (a.status === 'waiting') {
      p.sawWaiting = true;
      delete p.notWaitingSince;
      return false;
    }
    if (!p.sawWaiting) return false;
    p.notWaitingSince ??= now;
    return now - p.notWaitingSince >= LEFT_WAITING_MS;
  }

  private dropWaiter(p: Pending, w: Waiter, result?: WaitResult): void {
    if (!p.waiters.delete(w)) return;
    clearTimeout(w.timer);
    if (!p.waiters.size) p.idleSince = this.now();
    if (result) w.done(result);
  }

  private resolve(p: Pending, outcome: Exclude<WaitResult, { status: 'pending' }>): void {
    p.outcome = outcome;
    p.resolvedAt = this.now();
    const delivered = p.waiters.size > 0;
    for (const w of [...p.waiters]) this.dropWaiter(p, w, outcome);
    // Delivered to whoever was waiting: gone right away; otherwise kept until the hook comes back (or RESOLVED_KEEP_MS).
    if (delivered) this.pending.delete(p.info.id);
    this.opts.office.markDirty();
  }

  private release(p: Pending, reason: ReleaseReason): void {
    this.resolve(p, { status: 'released', reason });
  }
}
