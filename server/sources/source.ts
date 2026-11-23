// Agent sources (one per tool: Claude Code, Codex...) and what the rest of the server expects from them.
//
// Each source watches its tool's OPEN sessions and feeds the Office (addMain, addActivity...). The server wires
// them all through a SourceSet: the snapshot (meta.sources), /api/health, the terminal and an agent's transcript
// path go through it, without knowing which tool the agent comes from. The Claude Code source is
// sources/watcher.ts (ClaudeWatcher); the Codex one plugs in through the same contract.
//
// Terminal history (recent sessions, open or closed): one HistoryProvider per tool, joined in a HistorySet that
// serves the /api/sessions/* routes. Claude Code's is SessionHistory (sources/history.ts).
//
// Boot: a source that rebuilds the open sessions on start calls office.beginBoot() before and office.endBoot()
// after, ALWAYS in pairs (in a `finally`, including in an async boot). The Office counts boots: while any source
// is booting there are no notices and the feed is held back to come out in chronological order at the end of the
// last boot (a source that never called endBoot would silence everyone's notices).
import type { Provider, RecentSession, SourceInfo } from '../../shared/types';
import { errMsg, log } from '../log';
import { HISTORY_LIMIT } from './history';
import { createTerminalParser, type TerminalParser } from './terminal';
import { tr } from '../../shared/i18n';

/** An agent source: watches a tool's open sessions and feeds the Office. */
export interface AgentSource {
  readonly provider: Provider;
  /**
   * Boot (rebuilds the open sessions, between office.beginBoot/endBoot) and live tracking. A sync source
   * finishes booting before returning; an async one returns the promise (failures only go to the log).
   */
  start(): void | Promise<void>;
  stop(): void;
  /** One entry per watched account (snapshot meta.sources and /api/health). */
  sources(): SourceInfo[];
  /** Conversation file of a present agent from this source; undefined if the agent isn't its (or has no file yet). */
  transcriptPathOf(agentId: string): string | undefined;
  /**
   * Terminal parser for the conversation of an agent from this source: a NEW one on every call (parsers keep
   * state). Absent, or undefined, = Claude Code's (createTerminalParser).
   */
  terminalParser?(agentId: string): TerminalParser | undefined;
}

/** All enabled agent sources, seen as one. */
export class SourceSet {
  private readonly list: AgentSource[] = [];

  constructor(sources: readonly AgentSource[] = []) {
    for (const s of sources) this.add(s);
  }

  /** Adds a source (before start()). */
  add(source: AgentSource): void {
    this.list.push(source);
  }

  all(): readonly AgentSource[] {
    return this.list;
  }

  /** A tool's source, if enabled. */
  of(provider: Provider): AgentSource | undefined {
    return this.list.find((s) => s.provider === provider);
  }

  /**
   * Starts the sources in the order they were added: sync ones finish booting right here (before the hub starts
   * broadcasting). One failing doesn't stop the others: it goes to the log. The promise resolves when the async
   * ones have finished starting.
   */
  start(): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const s of this.list) {
      const failed = (err: unknown) => log.error(tr('Agent source {0}: failed to start ({1}).', [s.provider, errMsg(err)]));
      try {
        const r = s.start();
        if (r) pending.push(r.catch(failed));
      } catch (err) {
        failed(err);
      }
    }
    return Promise.all(pending).then(() => undefined);
  }

  stop(): void {
    for (const s of this.list) {
      try {
        s.stop();
      } catch (err) {
        log.warn(tr('Agent source {0}: failed to stop ({1}).', [s.provider, errMsg(err)]));
      }
    }
  }

  sources(): SourceInfo[] {
    return this.list.flatMap((s) => s.sources());
  }

  /** Conversation file of a present agent (the first source that knows it). */
  transcriptPathOf(agentId: string): string | undefined {
    for (const s of this.list) {
      const path = s.transcriptPathOf(agentId);
      if (path) return path;
    }
    return undefined;
  }

  /**
   * NEW parser for an agent's terminal: the one from the source that knows its transcript (transcriptPathOf);
   * with no source, or if it has none of its own, Claude Code's.
   */
  parserFor(agentId: string): TerminalParser {
    const owner = this.list.find((s) => s.transcriptPathOf(agentId) !== undefined);
    return owner?.terminalParser?.(agentId) ?? createTerminalParser();
  }
}

// ------------------------------------------------------------------ terminal history

/** A history session found: the conversation file and the terminal parser for it. */
export interface HistorySession {
  path: string;
  /** A NEW parser on every call (the terminal creates another when the file is truncated or replaced). */
  createParser: () => TerminalParser;
}

/** Result of resolve(): the session or the HTTP error. */
export type HistoryResolveResult = HistorySession | { status: 400 | 404; error: string };

/** What the /api/sessions/* routes need: a single provider or the HistorySet. */
export interface SessionLookup {
  /** Recent sessions, from most recent activity to oldest. */
  list(): Promise<RecentSession[]>;
  /**
   * Validates and finds the account's `sessionId` session (no path traversal). Never throws: 400 = invalid id,
   * 404 = unknown account or session.
   */
  resolve(account: string, sessionId: string): HistoryResolveResult;
}

/** A tool's history: the recent sessions of its accounts. */
export interface HistoryProvider extends SessionLookup {
  readonly provider: Provider;
  /** The account belongs to this provider (the HistorySet routes its resolve() here). */
  hasAccount(account: string): boolean;
}

/**
 * Joins every tool's history: the combined listing (from most recent activity to oldest, up to `limit`) and each
 * session resolved by the account's provider. An account no provider knows goes to the first one (Claude Code's),
 * which gives the usual error (400 for an invalid id, else 404).
 */
export class HistorySet implements SessionLookup {
  private readonly list_: HistoryProvider[] = [];

  constructor(
    providers: readonly HistoryProvider[] = [],
    private readonly limit = HISTORY_LIMIT,
  ) {
    for (const p of providers) this.add(p);
  }

  add(provider: HistoryProvider): void {
    this.list_.push(provider);
  }

  /** A failing provider doesn't break the others' listing (it only goes to the log); if all fail, the failure propagates. */
  async list(): Promise<RecentSession[]> {
    const results = await Promise.allSettled(this.list_.map((p) => p.list()));
    const out: RecentSession[] = [];
    const failures: Array<{ provider: Provider; err: unknown }> = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') out.push(...r.value);
      else failures.push({ provider: this.list_[i].provider, err: r.reason });
    });
    if (failures.length && failures.length === results.length) throw failures[0].err;
    for (const f of failures) {
      log.warnOnce(`history-list:${f.provider}:${errMsg(f.err)}`, tr('Session history ({0}): failed to list ({1}).', [f.provider, errMsg(f.err)]));
    }
    return out.sort((a, b) => b.lastAt - a.lastAt).slice(0, this.limit);
  }

  resolve(account: string, sessionId: string): HistoryResolveResult {
    const owner = this.list_.find((p) => p.hasAccount(account)) ?? this.list_[0];
    return owner ? owner.resolve(account, sessionId) : { status: 404, error: tr('unknown account') };
  }
}
