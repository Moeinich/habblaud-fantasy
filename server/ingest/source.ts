// Agents of other machines, rebuilt from the hook events their habblaud-remote plugin sends (POST /api/ingest/events).
//
// Unlike the local sources, there is no transcript or session registry here: everything comes from the hooks.
// - Presence: SessionStart (or any event of an unknown session) brings the main agent in; SessionEnd takes it out.
//   SessionEnd with reason `clear` waits CLEAR_SWITCH_MS for the new session's SessionStart (source `clear`) in the
//   same folder, and then the same character continues (Office.switchSession). With no event for IDLE_CLOSE_MS (a
//   crashed or killed session never sends SessionEnd), the agent leaves.
// - Status: UserPromptSubmit/PreToolUse/PostToolUse = working, Notification (permission, question) = waiting, Stop =
//   idle; subagents from SubagentStart/SubagentStop. The hooks are asynchronous, so events of one session can arrive
//   out of order: a status only changes with an event at least as new (the sender's `at`) as the one that set it.
// - Activities from the tool calls (describeTool, the same texts as the local agents), the prompt and the task list
//   (TodoWrite); GitHub events (PR opened or merged, CI, release, push) from PostToolUse, with the same detection as
//   the transcripts (sources/github.ts), so the room throws the same party.
// - Not available (no transcript): token counts, the session title (the first prompt stands in), background shells.
import type { Activity, AgentStatus, MachineRef, SourceInfo, TaskItem } from '../../shared/types';
import { describePrompt, describeTool, describeWaitingFor, truncate } from '../../shared/activity';
import { remoteId, type IngestEvent } from '../../shared/ingest';
import { tr } from '../../shared/i18n';
import type { Office } from '../model/office';
import { detectGitHubResult, githubCallOf, type GitHubCall } from '../sources/github';
import type { AgentSource } from '../sources/source';

/** SessionEnd(clear) waits this long for the SessionStart(clear) of the new session. */
export const CLEAR_SWITCH_MS = 10_000;
/** No event at all for this long: the session is gone (killed or crashed without SessionEnd). */
export const IDLE_CLOSE_MS = 12 * 3600_000;
/** Event ids remembered per machine (duplicates of a retried request are ignored). */
const SEEN_MAX = 5_000;
const PENDING_GITHUB_MAX = 64;

interface SubState {
  officeId: string;
  statusAt: number;
  toolCalls: number;
}

interface Session {
  key: string;
  machine: MachineRef;
  localSessionId: string;
  /** sessionId in the office (`r:<machine>:<sessionId>`). */
  sessionId: string;
  agentId: string;
  account: string;
  cwd: string;
  lastSeen: number;
  statusAt: number;
  /** SessionEnd arrived: closes at this time (unless a /clear continues it). */
  endingAt?: number;
  clearing?: boolean;
  toolCalls: number;
  subagents: number;
  tasks: TaskItem[];
  title?: string;
  model?: string;
  permissionMode?: string;
  gitBranch?: string;
  /** Descriptions of Agent/Task calls not yet matched to a SubagentStart. */
  pendingSubTitles: string[];
  subs: Map<string, SubState>;
  github: Map<string, GitHubCall>;
}

export interface IngestSourceOptions {
  office: Office;
  now?: () => number;
  /** A request of this agent was answered on its own machine (its tool ran, or the turn ended). */
  onAnsweredElsewhere?: (agentId: string, tool?: string) => void;
  /** The machines that still have a token (MachineStore): the agents of a revoked machine leave at the next check. */
  knownMachines?: () => ReadonlySet<string>;
}

/** How often tick() checks for revoked machines. */
const REVOKED_CHECK_MS = 5_000;

function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** TodoWrite input -> tasks (the same shape the transcript parser produces). */
function todoTasks(input: unknown): TaskItem[] | undefined {
  const todos = rec(input)?.todos;
  if (!Array.isArray(todos)) return undefined;
  const out: TaskItem[] = [];
  for (const t of todos.slice(0, 50)) {
    const r = rec(t);
    const content = typeof r?.content === 'string' ? r.content.trim() : '';
    if (!content) continue;
    const status = r?.status === 'completed' || r?.status === 'in_progress' ? r.status : 'pending';
    const item: TaskItem = { id: String(out.length + 1), title: truncate(content, 120), status };
    if (typeof r?.activeForm === 'string' && r.activeForm.trim()) item.activeForm = truncate(r.activeForm.trim(), 120);
    out.push(item);
  }
  return out;
}

export class IngestSource implements AgentSource {
  readonly provider = 'claude' as const;
  private readonly sessions = new Map<string, Session>();
  private readonly seen = new Map<string, Map<string, number>>();
  private readonly now: () => number;
  private revokedCheckAt = 0;

  constructor(private readonly opts: IngestSourceOptions) {
    this.now = opts.now ?? Date.now;
  }

  start(): void {}

  stop(): void {}

  /** One entry per machine with open sessions (meta.sources). */
  sources(): SourceInfo[] {
    const per = new Map<string, { machine: MachineRef; n: number }>();
    for (const s of this.sessions.values()) {
      const e = per.get(s.machine.id) ?? { machine: s.machine, n: 0 };
      e.n++;
      per.set(s.machine.id, e);
    }
    return [...per.values()].map((e) => ({ label: e.machine.name, path: `ingest:${e.machine.id}`, sessions: e.n, ok: true }));
  }

  /** Remote agents have no transcript on this server. */
  transcriptPathOf(): undefined {
    return undefined;
  }

  /** Remote account ids seen (open sessions), for the account list. */
  openAccounts(): Map<string, { machine: MachineRef; localAccount: string; sessions: number }> {
    const out = new Map<string, { machine: MachineRef; localAccount: string; sessions: number }>();
    for (const s of this.sessions.values()) {
      const e = out.get(s.account) ?? { machine: s.machine, localAccount: s.account.slice(`r:${s.machine.id}:`.length), sessions: 0 };
      e.sessions++;
      out.set(s.account, e);
    }
    return out;
  }

  /** Applies one validated event. Returns false when it was a duplicate or could not be placed. */
  apply(machine: MachineRef, ev: IngestEvent): boolean {
    if (!this.firstTime(machine.id, ev.id)) return false;
    const now = this.now();
    const key = `${machine.id}\0${ev.session_id}`;
    let s = this.sessions.get(key);

    if (ev.event === 'SessionEnd') {
      if (!s) return false;
      s.lastSeen = now;
      s.clearing = ev.reason === 'clear';
      s.endingAt = now + (s.clearing ? CLEAR_SWITCH_MS : 0);
      if (!s.clearing) this.close(s);
      return true;
    }

    if (!s) {
      s = this.open(machine, ev, now);
      if (!s) return false;
    }
    s.lastSeen = now;
    if (s.endingAt !== undefined && !s.clearing) return false;
    if (ev.model) s.model = ev.model;
    if (ev.permission_mode) s.permissionMode = ev.permission_mode;
    if (ev.branch) s.gitBranch = ev.branch;

    const office = this.opts.office;
    const target = this.targetOf(s, ev, now);
    switch (ev.event) {
      case 'SessionStart':
        this.decide(s, s.agentId, 'idle', ev.at);
        break;
      case 'UserPromptSubmit': {
        this.decide(s, s.agentId, 'working', ev.at);
        if (ev.prompt) {
          s.title ??= truncate(ev.prompt.replace(/\s+/g, ' '), 80);
          office.addActivity(s.agentId, { id: `${s.agentId}#p:${ev.id}`, at: now, ...describePrompt(ev.prompt) }, true);
        }
        break;
      }
      case 'PreToolUse': {
        if (!target) break;
        this.decide(s, target, 'working', ev.at);
        const name = ev.tool_name ?? 'tool';
        const sub = s.subs.get(target);
        if (sub) sub.toolCalls++;
        else s.toolCalls++;
        const act: Activity = { id: `${target}#${ev.tool_use_id ?? ev.id}`, at: now, ...describeTool(name, ev.tool_input ?? {}), tool: name };
        office.addActivity(target, act, true);
        if ((name === 'Agent' || name === 'Task') && target === s.agentId) {
          const d = rec(ev.tool_input)?.description;
          if (typeof d === 'string' && d.trim()) s.pendingSubTitles.push(truncate(d.trim(), 80));
          if (s.pendingSubTitles.length > 16) s.pendingSubTitles.shift();
        }
        if (name === 'TodoWrite' && target === s.agentId) s.tasks = todoTasks(ev.tool_input) ?? s.tasks;
        const gh = githubCallOf(name, rec(ev.tool_input) ?? {});
        if (gh && ev.tool_use_id) {
          s.github.set(ev.tool_use_id, gh);
          if (s.github.size > PENDING_GITHUB_MAX) s.github.delete(s.github.keys().next().value!);
        }
        break;
      }
      case 'PostToolUse':
      case 'PostToolUseFailure': {
        if (!target) break;
        this.decide(s, target, 'working', ev.at);
        this.opts.onAnsweredElsewhere?.(target, ev.tool_name);
        this.github(s, target, ev, now);
        break;
      }
      case 'Notification': {
        const type = ev.notification_type;
        const msg = ev.message ?? '';
        if (type === 'permission_prompt' || type === 'elicitation_dialog' || (!type && /permission/i.test(msg))) {
          this.decide(s, target ?? s.agentId, 'waiting', ev.at, describeWaitingFor(type === 'elicitation_dialog' ? 'input needed' : msg || 'permission'));
        }
        break;
      }
      case 'Stop':
        this.decide(s, s.agentId, 'idle', ev.at);
        this.opts.onAnsweredElsewhere?.(s.agentId);
        break;
      case 'SubagentStart':
        break; // handled by targetOf (creates the subagent)
      case 'SubagentStop': {
        if (target && target !== s.agentId) {
          office.completeSub(target, { notify: true });
          this.opts.onAnsweredElsewhere?.(target);
        }
        break;
      }
    }
    this.summarize(s, now);
    return true;
  }

  /** Closes what ended or went quiet. Called by the server's ticker. */
  tick(): void {
    const now = this.now();
    if (this.opts.knownMachines && this.sessions.size && now - this.revokedCheckAt >= REVOKED_CHECK_MS) {
      this.revokedCheckAt = now;
      const known = this.opts.knownMachines();
      for (const id of new Set([...this.sessions.values()].map((s) => s.machine.id))) if (!known.has(id)) this.dropMachine(id);
    }
    for (const s of [...this.sessions.values()]) {
      if (s.endingAt !== undefined && now >= s.endingAt) this.close(s);
      else if (now - s.lastSeen >= IDLE_CLOSE_MS) this.close(s);
    }
  }

  /** Takes every agent of a machine out of the office (its token was removed). */
  dropMachine(machineId: string): void {
    for (const s of [...this.sessions.values()]) if (s.machine.id === machineId) this.close(s);
  }

  // ---------------------------------------------------------------- internals

  private firstTime(machineId: string, eventId: string): boolean {
    let m = this.seen.get(machineId);
    if (!m) this.seen.set(machineId, (m = new Map()));
    if (m.has(eventId)) return false;
    m.set(eventId, this.now());
    if (m.size > SEEN_MAX) m.delete(m.keys().next().value!);
    return true;
  }

  private open(machine: MachineRef, ev: IngestEvent, now: number): Session | undefined {
    if (!ev.cwd) return undefined;
    const account = remoteId(machine.id, ev.account);
    const sessionId = remoteId(machine.id, ev.session_id);
    const office = this.opts.office;
    // /clear: the session that just ended in the same folder continues with the new id.
    if (ev.event === 'SessionStart' && ev.source === 'clear') {
      const prev = [...this.sessions.values()].find((x) => x.clearing && x.machine.id === machine.id && x.account === account && x.cwd === ev.cwd);
      if (prev) {
        this.sessions.delete(prev.key);
        const s: Session = {
          ...prev,
          key: `${machine.id}\0${ev.session_id}`,
          localSessionId: ev.session_id,
          sessionId,
          endingAt: undefined,
          clearing: false,
          toolCalls: 0,
          subagents: 0,
          tasks: [],
          title: undefined,
          pendingSubTitles: [],
          subs: new Map(),
          github: new Map(),
        };
        office.switchSession(s.agentId, sessionId);
        this.sessions.set(s.key, s);
        return s;
      }
    }
    const s: Session = {
      key: `${machine.id}\0${ev.session_id}`,
      machine,
      localSessionId: ev.session_id,
      sessionId,
      agentId: sessionId,
      account,
      cwd: ev.cwd,
      lastSeen: now,
      statusAt: ev.at,
      toolCalls: 0,
      subagents: 0,
      tasks: [],
      pendingSubTitles: [],
      subs: new Map(),
      github: new Map(),
    };
    office.addMain({
      id: s.agentId,
      account,
      sessionId,
      // The room: the machine and the folder (two machines with the same path get two rooms).
      cwd: `${machine.id}:${ev.cwd}`,
      role: tr('Agente principal'),
      startedAt: now,
      status: ev.event === 'SessionStart' || ev.event === 'Stop' ? 'idle' : 'working',
      machine,
    });
    this.sessions.set(s.key, s);
    return s;
  }

  /** The agent an event is about: the main one, or the subagent in `agent_id` (created when first seen). */
  private targetOf(s: Session, ev: IngestEvent, now: number): string | undefined {
    if (!ev.agent_id) return s.agentId;
    const id = `${s.sessionId}:${ev.agent_id}`;
    const office = this.opts.office;
    if (!s.subs.has(id)) {
      if (ev.event === 'SubagentStop') return office.has(id) ? id : undefined;
      const title = s.pendingSubTitles.shift();
      const ok = office.addSub({
        id,
        parentId: s.agentId,
        sessionId: s.sessionId,
        role: ev.agent_type || tr('Subagente'),
        title,
        background: false,
        startedAt: now,
      });
      if (!ok) return undefined;
      s.subs.set(id, { officeId: id, statusAt: ev.at, toolCalls: 0 });
      s.subagents++;
    } else if (ev.event === 'SubagentStart') office.reactivateSub(id);
    return id;
  }

  private decide(s: Session, agentId: string, status: AgentStatus, at: number, waitingFor?: string): void {
    const sub = agentId === s.agentId ? undefined : s.subs.get(agentId);
    const last = sub ? sub.statusAt : s.statusAt;
    if (at < last) return;
    if (sub) sub.statusAt = at;
    else s.statusAt = at;
    // A finished subagent only comes back with a new SubagentStart.
    if (sub && this.opts.office.isSubDone(agentId)) return;
    this.opts.office.setStatus(agentId, status, waitingFor);
  }

  private github(s: Session, target: string, ev: IngestEvent, now: number): void {
    const id = ev.tool_use_id;
    const call = id ? s.github.get(id) : undefined;
    if (!id || !call) return;
    s.github.delete(id);
    const resp = ev.tool_response;
    const failed = ev.event === 'PostToolUseFailure';
    const content = failed ? ev.error : typeof resp === 'string' || Array.isArray(resp) ? resp : undefined;
    const event = detectGitHubResult(call, { content, tur: rec(resp) ?? {}, isError: failed, branch: ev.branch ?? s.gitBranch });
    if (event) this.opts.office.githubEvent(target, event, { key: `${target}#gh:${id}`, at: now, live: true });
  }

  private summarize(s: Session, now: number): void {
    const office = this.opts.office;
    office.applyTranscript(s.agentId, {
      title: s.title,
      tasks: s.tasks,
      stats: { toolCalls: s.toolCalls, tokensIn: 0, tokensOut: 0, subagents: s.subagents },
      model: s.model,
      gitBranch: s.gitBranch,
      permissionMode: s.permissionMode,
      lastAt: now,
    });
    for (const sub of s.subs.values()) {
      if (!office.has(sub.officeId)) continue;
      office.applyTranscript(sub.officeId, { tasks: [], stats: { toolCalls: sub.toolCalls, tokensIn: 0, tokensOut: 0, subagents: 0 }, lastAt: now });
    }
  }

  private close(s: Session): void {
    this.sessions.delete(s.key);
    this.opts.office.closeMain(s.agentId);
  }
}
