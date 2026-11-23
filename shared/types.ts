// Protocol shared by the server (Node) and the client (browser).
// Pure code: no Node or DOM APIs.
//
// Evolution rule: changes here must be ADDITIVE (new optional fields).
// Renaming/removing fields breaks the server, the world and the UI at the same time.

import type { AppearanceParts } from './appearance';

export type AgentKind = 'main' | 'sub';

/**
 * Which tool the agent (or the account, source, session, request) comes from. In the protocol types the `provider`
 * field is optional and ABSENT means 'claude' (everything that existed before Codex stays the same).
 * - claude: Claude Code;
 * - codex: OpenAI Codex (the `codex` CLI and the desktop app, which write to the same CODEX_HOME).
 */
export type Provider = 'claude' | 'codex';

/**
 * High-level state of an agent — it drives the character's behavior.
 * - working: processing a turn (busy). Stays at the desk typing.
 * - waiting: needs the user (permission, question, dialog). Stays at the desk with a hand raised.
 * - idle: finished the turn and waits for the next instruction. Wanders around the office (coffee, water cooler...).
 * - shell: finished the turn, but there are shell(s) running in the background (see `shells`); it is waiting for the
 *   shell to finish. Stays at the desk, watching the terminal. (Claude Code's registry records "shell" when the
 *   session is idle with background shells.)
 * - done: a subagent finished. Hands the result to the main agent and leaves.
 * - offline: session ended. Leaves (if it was the last one in the room, turns off the light).
 */
export type AgentStatus = 'working' | 'waiting' | 'idle' | 'shell' | 'done' | 'offline';

/** A shell command the agent is waiting on. */
export interface ShellJob {
  /** Id of the background task (e.g. "bo0ov3q3l") or, in the foreground, the tool_use id. */
  id: string;
  /** Short text in the server's language: the Bash description or a summary of the command (secrets masked). */
  label: string;
  /** Full command (masked, up to ~300 characters), when there is one. */
  command?: string;
  /** Epoch ms when the command started. */
  startedAt: number;
  /** true = run_in_background (the agent ended its turn and waits for the notification); false = a foreground command with no result yet. */
  background: boolean;
  /** 'monitor' = the Monitor tool (follows a process); 'shell' = Bash. */
  kind: 'shell' | 'monitor';
}

export type ActivityKind =
  | 'prompt' // got a new instruction from the user
  | 'think' // thinking (thinking block)
  | 'respond' // writing a text reply
  | 'read'
  | 'search'
  | 'edit'
  | 'write'
  | 'run' // terminal command
  | 'test'
  | 'git'
  | 'web'
  | 'browser'
  | 'plan' // tasks / planning
  | 'delegate' // launched subagent(s)
  | 'communicate' // message to another agent / notice
  | 'ask' // question to the user
  | 'mcp'
  | 'skill'
  | 'wait'
  | 'error'
  | 'compact' // context compaction
  | 'done' // finished the turn
  | 'other';

export interface Activity {
  /** Unique per activity (e.g. entry uuid + block index). */
  id: string;
  kind: ActivityKind;
  /** Emoji that represents the activity. */
  icon: string;
  /** Short text in the server's language (up to ~46 characters). E.g. "Editing App.tsx". */
  text: string;
  /** Optional detail (full command, path, query...), up to ~300 characters. */
  detail?: string;
  /** Raw tool name, when there is one. */
  tool?: string;
  /** Epoch ms. */
  at: number;
  durationMs?: number;
  error?: boolean;
  /** Full questions of an AskUserQuestion (kind 'ask'), so the office can show the options. */
  questions?: AskQuestion[];
}

/**
 * An AskUserQuestion question, already masked and truncated. With the request in the office
 * (PermissionRequestInfo.questions) it can be answered there; otherwise the answer is given in Claude Code.
 */
export interface AskQuestion {
  /** Position of the question in `tool_input.questions` (invalid entries are skipped, so there may be gaps). */
  index: number;
  question: string;
  header?: string;
  multiSelect?: boolean;
  /** `index` = position of the option in the original `options`: it is what comes back in the answer (PermissionAnswer). */
  options: Array<{ index: number; label: string; description?: string }>;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  /** Present-continuous form ("Writing tests"), when available. */
  activeForm?: string;
}

export interface AgentStats {
  toolCalls: number;
  /** input + cache read + cache creation. */
  tokensIn: number;
  tokensOut: number;
  costUSD?: number;
  linesAdded?: number;
  linesRemoved?: number;
  /** Total subagents launched by this agent. */
  subagents: number;
}

export interface AgentInfo {
  /**
   * Stable while the agent exists. Claude Code: main "<account>:<pid>", sub "<sessionId>:<agentId>".
   * Codex: main and sub "<account>:<threadId>" (the sub with `parentId`).
   */
  id: string;
  kind: AgentKind;
  /** The agent's tool; absent = 'claude'. */
  provider?: Provider;
  /** For subagents: id of the agent that launched it. */
  parentId?: string;
  roomId: string;
  /** Human name, unique in the office. E.g. "Marina". */
  name: string;
  /** Presentation hint for the name (used by the art to vary the look). */
  look: 'f' | 'm';
  /** Role. Main: "Main agent". Sub: the subagent type ("Explore", "Plan", "fork"...). */
  role: string;
  /** Session title (main) or task description (sub). */
  title?: string;
  sessionId: string;
  /** Source account = AccountInfo.id (basename of the config dir, e.g. ".claude", ".claude-conta2"). */
  account: string;
  status: AgentStatus;
  /** Reason, in the server's language, when status === 'waiting'. E.g. "approve a permission". */
  waitingFor?: string;
  /** Current (or most recent) activity. */
  activity?: Activity;
  /** Latest activities, oldest to newest (max ~30). */
  recent: Activity[];
  tasks: TaskItem[];
  /** Running shells the agent is waiting on: background ones and the foreground command with no result yet. */
  shells?: ShellJob[];
  model?: string;
  gitBranch?: string;
  permissionMode?: string;
  startedAt: number;
  lastEventAt: number;
  /** When the status last changed (epoch ms). */
  statusSince: number;
  stats: AgentStats;
  /** 32-bit seed for the character's deterministic appearance. */
  seed: number;
  /** Parts picked in the character editor, applied on top of the `seed` appearance (see shared/appearance.ts). */
  parts?: AppearanceParts;
  /** Uses the character chosen for the project (the room): the panel offers going back to the random one. */
  custom?: true;
  /** Subagent running in the background. */
  background?: boolean;
  /**
   * Permission request that can be answered through Habblaud (PermissionRequest hook; the oldest, if there are
   * several). While it exists, the agent shows as 'waiting'. See PermissionRequestInfo.
   */
  permission?: PermissionRequestInfo;
  /**
   * This agent can be messaged through Habblaud (main agents only): the session has the habblaud-mensagens plugin
   * and polled its inbox recently. See POST /api/messages.
   */
  canMessage?: boolean;
  /**
   * The agent runs on another machine and reached this server through the ingest endpoint (server/ingest/, the
   * habblaud-remote plugin). Absent = an agent of this machine. Remote agents have no transcript here: the terminal,
   * history, deliveries, the interactive terminal, New agent and dictation do not apply to them.
   */
  machine?: MachineRef;
}

/** A machine that sends its sessions to this server (HABBLAUD_INGEST). */
export interface MachineRef {
  /** Stable slug chosen when the token was created (`npm run ingest:token -- add <name>`). */
  id: string;
  /** Display name (the same as the id unless a label was given). */
  name: string;
}

export interface RoomInfo {
  /**
   * Stable key: the project's folder name, lower-cased (server/model/rooms.ts, roomKey). The same project in different
   * folders or on different machines shares one room, and an agent worktree counts as its repository.
   */
  id: string;
  /** Display name: the folder name of the room's most recent agent (this computer's first). */
  name: string;
  /** Full path of the project. */
  path: string;
  /**
   * Arrival order of the room, assigned by the server and stable while the room exists (a freed slot is only reused
   * after a waiting period). The client uses it only as an order: in the building, each room takes the first free
   * spot and, when a spot frees up between rooms, the farthest one moves into it (client/src/world/sim/sim.ts,
   * compact). Spot on the client: column = floor(spot / 2); even = north side of the corridor, odd = south side.
   */
  slot: number;
  /** Seed for deterministic colors/decoration. */
  seed: number;
  createdAt: number;
  /** Temporary visual effect in the room (GitHub events detected in the transcripts; see shared/github.ts). */
  effect?: RoomEffect;
  /** The room belongs to another machine (see AgentInfo.machine). */
  machine?: MachineRef;
}

/**
 * Temporary effect in a project room, triggered by a GitHub event seen live:
 * - party: celebration (PR opened or merged, release, green CI after an alarm); lasts ~12 s;
 * - alarm: red CI; lasts until a green CI in that room or expires after ~10 min.
 */
export interface RoomEffect {
  kind: 'party' | 'alarm';
  /** Short banner in the server's language. E.g. "PR #12 merged!", "CI failed (feat/x)". */
  text: string;
  /** Start (epoch ms, server clock): a new effect has a different `at`. */
  at: number;
  /** Expected end (epoch ms, server clock). */
  until: number;
  /** Responsible agent: who opened/merged (party) or who saw the CI fail (alarm, "!" bubble). */
  agentId?: string;
}

/**
 * New-version check: the server looks up the repository's latest release on GitHub (server/updates/checker.ts) and
 * compares it with the version in use.
 */
export interface UpdateStatus {
  /**
   * - off: check disabled (HABBLAUD_UPDATE_CHECK=0 or package.json without a GitHub repository);
   * - pending: not checked yet;
   * - ok: checked (with or without a published release);
   * - error: the last attempt failed (no internet, GitHub rate limit...).
   */
  state: 'off' | 'pending' | 'ok' | 'error';
  /** Repository checked, "owner/name". */
  repo?: string;
  /** Last successful check (epoch ms). */
  checkedAt?: number;
  /** Version of the latest release, without the "v" (absent: no published release). */
  latest?: string;
  /** Page of the latest release on GitHub. */
  url?: string;
  /** When the latest release was published (epoch ms). */
  publishedAt?: number;
  /** The latest release is newer than the version in use. */
  available: boolean;
  /** Reason for the failure (state "error"). */
  error?: string;
}

export interface SourceInfo {
  /** Account label (basename of the config dir). */
  label: string;
  /** The source's tool; absent = 'claude'. */
  provider?: Provider;
  path: string;
  /** Open sessions detected in this source. */
  sessions: number;
  ok: boolean;
  error?: string;
}

/** A plan usage-limit window (e.g. 5h session, week). */
export interface UsageWindow {
  /** Percentage used, 0–100. */
  utilization: number;
  /** When the window resets (epoch ms). */
  resetsAt?: number;
}

export interface AccountUsage {
  /** 5-hour session. */
  fiveHour?: UsageWindow;
  /** Weekly limit (all models). */
  sevenDay?: UsageWindow;
  sevenDayOpus?: UsageWindow;
  sevenDaySonnet?: UsageWindow;
  /**
   * Where the numbers come from (all are local files written by the tool itself):
   * - 'statusline': captured live and written to ~/.habblaud/usage/<account>.json by the Habblaud mod
   *   (mod/habblaud, recommended) or by scripts/statusline-tap.mjs (the statusline's rate_limits field);
   * - 'cache': `cachedUsageUtilization` written by Claude Code itself (updated when someone runs /usage);
   * - 'codex': `rate_limits` from the Codex session files (only refreshed while some session is running).
   */
  source: 'cache' | 'statusline' | 'codex';
  /** Who wrote the live file ('statusline'): the Habblaud mod in Claude Code or the statusline tap. */
  via?: 'mod' | 'tap';
  /**
   * Account with no quota or credits to use right now (Codex: null `rate_limits.primary`, e.g. workspace credits
   * exhausted). It is not "0% used": the windows are absent.
   */
  noQuota?: boolean;
  /** When the numbers were obtained at the source (epoch ms). */
  fetchedAt: number;
}

/** A Claude account (a config dir: ~/.claude, ~/.claude-conta2, ...) or a Codex one (a CODEX_HOME: ~/.codex). */
export interface AccountInfo {
  /** = AgentInfo.account (basename of the config dir, e.g. ".claude"); unique across the accounts of every tool. */
  id: string;
  /** The account's tool; absent = 'claude'. */
  provider?: Provider;
  /** Very short label (1–3 characters), e.g. "C" and "D" — aliases detected in the shell — or derived. */
  short: string;
  /** Friendly name. E.g. "Account C". */
  name: string;
  email?: string;
  organization?: string;
  /** Plan, when known (e.g. "Max", "Pro"). */
  plan?: string;
  /** The account's identifying color (hex). */
  color: string;
  configDir: string;
  /** Sessions open right now in this account. */
  sessions: number;
  usage?: AccountUsage;
  /**
   * - ok: recent numbers;
   * - stale: old numbers (e.g. a /usage cache from hours ago);
   * - disabled: no numbers (statusline tap not installed and no /usage cache).
   */
  usageStatus: 'ok' | 'stale' | 'disabled';
  /** The account lives on another machine (see AgentInfo.machine). */
  machine?: MachineRef;
}

export interface OfficeSnapshot {
  /** Incremented on every change. */
  rev: number;
  serverTime: number;
  rooms: RoomInfo[];
  agents: AgentInfo[];
  /** Interactive terminals opened by Habblaud (Claude Code running inside the browser). */
  ptys?: PtyInfo[];
  /** Detected Claude accounts (with 5h/weekly usage when available). */
  accounts: AccountInfo[];
  meta: {
    demo: boolean;
    sources: SourceInfo[];
    startedAt: number;
    version: string;
    /**
     * Id of the client build the server is serving (bundle name, e.g. "main-BFqheOCa").
     * A page open with a different build is out of date and should reload. Absent in dev mode.
     */
    build?: string;
    /**
     * Terminal (GET /api/agents/:id/terminal) available: only when Habblaud is not exposed beyond this computer
     * (local bind). Absent/false = feature off.
     */
    terminal?: boolean;
    /**
     * Messages through the office enabled (POST /api/messages): the same lock as the terminal, and HABBLAUD_MENSAGENS
     * not turned off. AgentInfo.canMessage says who can receive right now. Absent/false = feature off.
     */
    messages?: boolean;
    /**
     * Interactive terminal (open/take over sessions and end agents from the office): only outside Docker, with
     * node-pty and local access. Absent = feature off.
     */
    pty?: PtyStatus;
    /** New-version check on GitHub (absent in tests and in the timelapse). */
    updates?: UpdateStatus;
  };
}

/**
 * What THIS page may do (GET /api/access): the local port allows everything through a local Host; the remote port with
 * login (server/http/remote.ts) only what HABBLAUD_REMOTE_ALLOW allows. `local` = opened from this computer (editing
 * characters and renaming rooms, which never work through the remote port).
 */
export interface AccessInfo {
  remote: boolean;
  local: boolean;
  permissions: boolean;
  messages: boolean;
  terminal: boolean;
  /** May open new agents in the Claude app (POST /api/spawn). */
  spawn: boolean;
}

export interface FeedItem {
  id: string;
  agentId: string;
  roomId: string;
  agentName: string;
  roomName: string;
  /** The agent's account (= AccountInfo.id). */
  account?: string;
  activity: Activity;
}

export type NoticeLevel = 'info' | 'success' | 'warn' | 'alert';

export interface Notice {
  id: string;
  level: NoticeLevel;
  text: string;
  agentId?: string;
  roomId?: string;
  at: number;
}

/**
 * Server messages over SSE on GET /api/stream.
 * Each message arrives as a named SSE event (`event: snapshot|feed|notice`) whose `data` is the JSON of `data`.
 * On connect, the server sends a full `snapshot` and a `feed` with the recent items.
 */
export type ServerMessage =
  | { type: 'snapshot'; data: OfficeSnapshot }
  | { type: 'feed'; data: FeedItem[] }
  | { type: 'notice'; data: Notice };

/** Response of GET /api/agents/:id */
export interface AgentDetail {
  agent: AgentInfo;
  /** Longer history (max ~200), oldest to newest. */
  history: Activity[];
}

// ------------------------------------------------------------------ Claude Code mod

/**
 * Response of GET /api/mod/summary: the minimum the Claude Code mod (mod/habblaud) needs for the "needs you" line
 * under the prompt and for the /habblaud command. Only real agents (the demo is left out) that are present (not those
 * that ended or delivered); with `?session=` (and `?account=`), without the asking session itself: its main agent and
 * its subagents.
 */
export interface ModSummary {
  /** Habblaud version in use. */
  version: string;
  /** Agents present and how many are working. */
  agents: number;
  working: number;
  /** Who needs you, from the longest-waiting to the most recent. */
  waiting: ModWaitingAgent[];
}

export interface ModWaitingAgent {
  /** = AgentInfo.id. */
  id: string;
  name: string;
  /** Display name of the room (project). */
  room: string;
  /** = AccountInfo.id. */
  account: string;
  /** Reason in the server's language (AgentInfo.waitingFor), e.g. "approve a permission". */
  waitingFor: string;
  /** Waiting since (epoch ms). */
  since?: number;
  /** There is a permission request to answer through the office (AgentInfo.permission). */
  answerable: boolean;
}

// ------------------------------------------------------------------ terminal

/**
 * How to show the `input` of a tool call:
 * - command: shell command; diff: "- old" / "+ new" lines (Edit/Write); json: raw arguments; text: free text.
 */
export type TerminalInputKind = 'command' | 'diff' | 'json' | 'text';

/**
 * A terminal entry: the session's conversation rebuilt from the JSONL transcript, in the format Claude Code shows it.
 * All text arrives with secrets masked and truncated. Entries are only appended (never edited): a tool's result
 * arrives later, in a 'result' entry that points to the 'tool' through `toolUseId`.
 */
export type TerminalEntry =
  /** User prompt or slash command (e.g. "/model"). */
  | { kind: 'user'; id: string; at: number; text: string }
  /** Text of the agent's reply (markdown). */
  | { kind: 'assistant'; id: string; at: number; text: string }
  /** Reasoning block; `text` absent when the transcript only keeps the signature. */
  | { kind: 'thinking'; id: string; at: number; text?: string }
  /**
   * Tool call. `id` = the tool_use id. `title` in Claude Code style: "Bash(npm test)", "Read(server/index.ts)".
   * `input` = the relevant arguments (command, diff...), when there are any.
   */
  | { kind: 'tool'; id: string; at: number; tool: string; title: string; input?: string; inputKind?: TerminalInputKind }
  /** A tool's result. `truncated` = the text was cut (result too long). */
  | { kind: 'result'; id: string; at: number; toolUseId: string; text: string; error?: boolean; truncated?: boolean }
  /** Session event: compaction, interruption, background result, API error... */
  | { kind: 'system'; id: string; at: number; text: string; detail?: string; level?: 'info' | 'warn' | 'error' };

/** `init` event of the terminal stream: the recent conversation (replaces whatever the client has). */
export interface TerminalInit {
  agentId: string;
  /** Oldest to newest. */
  entries: TerminalEntry[];
  /** There is earlier conversation that was not loaded (the transcript is larger than the window read). */
  truncated: boolean;
}

/**
 * Terminal stream (Server-Sent Events) on GET /api/agents/:id/terminal.
 * On connect (and on every reconnect, or if the transcript is truncated/replaced) an `init` arrives; then `append`
 * with the new entries. Errors before the stream respond with JSON `{error}`: 403 (feature off or non-local access),
 * 404 (unknown agent/transcript), 429 (too many open terminals).
 */
export type TerminalMessage = { type: 'init'; data: TerminalInit } | { type: 'append'; data: TerminalEntry[] };

/**
 * A recent session (open or already ended) in the terminal history, on GET /api/sessions/recent. The conversation of
 * an ended session comes, with the same protocol as the agent terminal (TerminalMessage), from
 * GET /api/sessions/:account/:sessionId/terminal.
 */
export interface RecentSession {
  /** = AccountInfo.id. */
  account: string;
  /** The session's tool; absent = 'claude'. */
  provider?: Provider;
  sessionId: string;
  /** Project path (the `cwd` of the transcript's first lines); absent if it could not be found. */
  project?: string;
  /** Name of the project folder under `projects/` (the encoded cwd), for when `project` is missing. */
  projectDir: string;
  /** Title like the agent's: /rename > agent name > automatic title > last prompt (or the first). */
  title?: string;
  /** First and last timestamped activity (epoch ms); `lastAt` falls back to the file mtime with no timestamp at the end. */
  firstAt?: number;
  lastAt: number;
  /** Transcript size in bytes. */
  size: number;
  /** The session is still open: `agentId` is its main agent in the office. */
  open: boolean;
  agentId?: string;
}

// ------------------------------------------------------------------ deliveries

/** Type of a delivery attachment, to pick the viewer. */
export type DeliveryAttachmentKind = 'image' | 'pdf' | 'video' | 'page' | 'text' | 'file';

/** A file the agent delivered (SendUserFile, a link in the reply) or a screen captured at the end of the work. */
export interface DeliveryAttachment {
  /** Opaque id for GET /api/deliveries/file/:id (never the path). */
  id: string;
  name: string;
  kind: DeliveryAttachmentKind;
  /** The agent's caption (SendUserFile) or "Screen capture". */
  caption?: string;
  /** A screenshot that came inside the conversation (not a file on the computer). */
  capture?: boolean;
}

/**
 * A delivery: the end of a request the agent worked on (used tools) and answered. Built from the transcript
 * (server/deliveries/deliveries.ts) the way a BA would receive it: headline, summary, request and attachments.
 */
export interface DeliveryInfo {
  /** "<account>:<session>:<request entry>". */
  id: string;
  account: string;
  provider?: Provider;
  sessionId: string;
  /** Agent still in the office (for the avatar and "open terminal"). */
  agentId?: string;
  /** Agent name (the office one) or the session title. */
  agentName?: string;
  project?: string;
  /** What was asked (one line). */
  request: string;
  /** First sentence of the reply, without markdown. */
  headline: string;
  /** Plain-language paragraph (the last one of the reply), when there is one. */
  summary?: string;
  /** The full reply (markdown). */
  text: string;
  startedAt: number;
  finishedAt: number;
  /** Tools used and files changed in the request. */
  tools: number;
  edited: number;
  attachments: DeliveryAttachment[];
}

export interface DeliveriesResponse {
  deliveries: DeliveryInfo[];
}

/** Response of GET /api/sessions/recent: most recent activity first. */
export interface RecentSessionsResponse {
  sessions: RecentSession[];
  /** Listing window (days) and maximum sessions. */
  days: number;
  limit: number;
}

// ------------------------------------------------------------------ answering through the office

/** "Always allow" rule suggested by Claude Code for a request (the hook's permission_suggestions). */
export interface PermissionSuggestionInfo {
  /** Position in the list the hook received: it is what comes back in the decision (the hook applies the original suggestion). */
  index: number;
  /** Rules in Claude Code permission format, e.g. "Bash(npm test:*)". */
  rules: string[];
  /** Where the rule is stored: 'session', 'localSettings', 'projectSettings' or 'userSettings'. */
  destination: string;
}

/**
 * Pending permission request that can be answered through Habblaud: Claude Code's PermissionRequest hook
 * (mod/habblaud-permissoes/hooks/permission-hook.mjs) registers it and waits for the decision. It only exists with a
 * local bind (the same lock as the terminal) and with some Habblaud page open.
 * In the snapshot it goes without `input` (the full arguments only come from GET /api/permissions/:id, with local
 * access); the demo's fake requests already include it.
 */
export interface PermissionRequestInfo {
  id: string;
  /** The requester's tool; absent = 'claude'. */
  provider?: Provider;
  /** Raw tool name (e.g. "Bash", "Edit", "mcp__github__create_issue"). */
  tool: string;
  /** Title in Claude Code style: "Bash(npm test)", "Edit(src/app.ts)". Masked and truncated. */
  title: string;
  /** Summary in the server's language (e.g. "Running the tests") and the activity icon. */
  text: string;
  icon: string;
  /** Arguments (command, diff, JSON...), masked and truncated. */
  input?: string;
  inputKind?: TerminalInputKind;
  /** Request from a subagent Habblaud doesn't show yet: its type (e.g. "Explore"). */
  subagent?: string;
  /** "Always allow" rules that can be applied along with the approval. */
  suggestions?: PermissionSuggestionInfo[];
  /**
   * AskUserQuestion request: the questions, to answer through the office (the `answer` decision). Also included in
   * the snapshot (without them the card has nothing to show).
   */
  questions?: AskQuestion[];
  /** Other requests from the same agent waiting after this one. */
  queued?: number;
  createdAt: number;
  /** When the hook gives up waiting and the request can only be answered in the terminal. */
  expiresAt: number;
}

/**
 * Answer to an AskUserQuestion question, by POSITION (AskQuestion.index and the options' `index`): the hook swaps the
 * positions for the original texts it got from Claude Code (the page only sees the masked, truncated texts).
 */
export interface PermissionAnswer {
  /** AskQuestion.index. */
  question: number;
  /** Positions of the chosen options (just one without multiSelect). */
  options?: number[];
  /** Free text ("Other"). Without multiSelect, it counts instead of an option. */
  other?: string;
}

/** Body of POST /api/permissions/:id/decision (from the page). */
export interface PermissionDecision {
  /**
   * allow = approve; deny = refuse; terminal = hand the request back to the terminal (the hook exits without deciding);
   * answer = answer the questions of an AskUserQuestion (`answers`).
   */
  behavior: 'allow' | 'deny' | 'terminal' | 'answer';
  /** Refusal: reason passed on to the agent. */
  message?: string;
  /** Refusal: interrupts the agent (it stops and waits for you). */
  interrupt?: boolean;
  /** Approval: also applies the suggestion at this position (PermissionSuggestionInfo.index). */
  suggestion?: number;
  /** Answer (`answer`): one per question of the request. */
  answers?: PermissionAnswer[];
}

// ------------------------------------------------------------------ messages through the office

/**
 * Status of a message sent from the page to an agent (GET /api/messages/:id):
 * queued = waiting for the session to fetch it; sent = the session fetched it and is delivering it; delivered = it went
 * into the session (or its queue, if the agent was busy); failed = it didn't go in (`error` says why).
 */
export type OutboxStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface OutboxMessage {
  id: string;
  /** AgentInfo.id of the recipient (always a main agent). */
  agentId: string;
  status: OutboxStatus;
  error?: string;
  createdAt: number;
  /** Last status change. */
  updatedAt: number;
}

/** State of the interactive terminal (OfficeSnapshot.meta.pty). */
export interface PtyStatus {
  enabled: boolean;
  /** Why it is off. */
  reason?: string;
}

/** Interactive terminal opened by Habblaud (node-pty on the server, xterm.js in the browser). */
export interface PtyInfo {
  id: string;
  /** Claude Code PID: the matching agent is `${account}:${pid}` (= agentId). */
  pid: number;
  cwd: string;
  account: string;
  agentId: string;
  /** Resumed session (`claude --resume`), when the terminal took over an existing session. */
  resumed?: string;
  /** Agent this terminal took over (the old id, of the ended process). */
  fromAgent?: string;
  startedAt: number;
  exitedAt?: number;
  exitCode?: number;
}

/** Message delivered to the habblaud-mensagens plugin (POST /api/mod/inbox). */
export interface InboxMessage {
  id: string;
  /** The text as typed: the plugin sends it to the session as if you had typed it. */
  text: string;
}
