// Ingest protocol: other machines send their Claude Code sessions to this server (HABBLAUD_INGEST=1).
//
// The habblaud-remote plugin (mod/habblaud-remote) runs one asynchronous hook per Claude Code event and posts it,
// fire-and-forget, to POST /api/ingest/events on the remote port (HTTPS, `Authorization: Bearer <machine token>`).
// The server rebuilds the agents from those events (server/ingest/source.ts). The permission hook, the messages plugin
// and the habblaud mod reach the same server through /api/ingest/* when HABBLAUD_SERVER_URL is set.
//
// Ids on the server: every session, agent and account of a machine gets the prefix `r:<machineId>:` (remoteId), so
// the same sessionId on two machines never collides. A subagent keeps the usual `<sessionId>:<agentId>` shape, with
// the prefixed sessionId.

export const INGEST_PROTOCOL = 1;

/** Hook events the server understands (anything else is ignored with 202). */
export const INGEST_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
] as const;

export type IngestEventName = (typeof INGEST_EVENTS)[number];

/** One hook event, as the plugin sends it (already trimmed; the server validates and trims again). */
export interface IngestEvent {
  v: number;
  /** Random id per event (deduplication of retries). */
  id: string;
  /** When the hook ran, epoch ms on the sending machine (ordering of events of one session). */
  at: number;
  event: IngestEventName;
  /** Basename of the Claude Code config dir (CLAUDE_CONFIG_DIR, or `.claude`). */
  account: string;
  session_id: string;
  cwd?: string;
  agent_id?: string;
  agent_type?: string;
  /** SessionStart: startup | resume | clear | compact. */
  source?: string;
  /** SessionEnd: clear | logout | prompt_input_exit | other. */
  reason?: string;
  prompt?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  /** PostToolUseFailure: the error text. */
  error?: string;
  message?: string;
  notification_type?: string;
  model?: string;
  permission_mode?: string;
  /** Current git branch of `cwd` (sent with git pushes: the GitHub "push" event needs it). */
  branch?: string;
}

/** Prefix of every id that comes from machine `machineId`. */
export function remotePrefix(machineId: string): string {
  return `r:${machineId}:`;
}

export function remoteId(machineId: string, localId: string): string {
  return `${remotePrefix(machineId)}${localId}`;
}

/** Machine ids: what `npm run ingest:token -- add <name>` accepts. */
export const MACHINE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
