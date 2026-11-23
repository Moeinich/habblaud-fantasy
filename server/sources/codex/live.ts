// Codex hook events (the "live" part of the Codex source): the hook script sends the event's stdin to
// POST /api/codex/events and the route forwards it here. The Codex source (sources/codex/source.ts) implements it.

export interface CodexLive {
  /**
   * Applies a Codex hook event (its stdin: `hook_event_name`, `session_id`, `agent_id`, `cwd`, `tool_name`,
   * `tool_use_id`, `tool_input`, `transcript_path`...) to the office. `account` = the sender's Codex account (account
   * id or the CODEX_HOME folder; absent = inferred from `transcript_path` or from the thread). Returns false for an
   * unknown event or a session that matches no Codex account.
   */
  applyHookEvent(account: string | undefined, input: Record<string, unknown>): boolean;
}
