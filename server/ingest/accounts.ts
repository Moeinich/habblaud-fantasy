// Accounts of other machines: one per machine and Claude Code config dir that has an open session here or sent its
// plan usage (POST /api/ingest/usage, the habblaud mod). They go into the snapshot next to the local accounts, tagged
// with the machine. Only the usage numbers travel: no e-mail, organization or folder.
import type { AccountInfo, AccountUsage, MachineRef } from '../../shared/types';
import { remoteId } from '../../shared/ingest';
import { hash32 } from '../../shared/hash';
import { ACCOUNT_COLORS } from '../accounts/detect';
import { parseStatuslineFile } from '../accounts/statusline';
import { rollover, STALE_AFTER_MS } from '../accounts/usage';

/** Usage of a machine that stopped sending is dropped after this long. */
const USAGE_KEEP_MS = 24 * 3600_000;

interface Entry {
  machine: MachineRef;
  localAccount: string;
  usage?: AccountUsage;
  seenAt: number;
}

export class IngestAccounts {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Usage record of a machine's account (the statusline-tap JSON). Returns false when it carries no numbers. */
  setUsage(machine: MachineRef, localAccount: string, body: Record<string, unknown>): boolean {
    const now = this.now();
    const parsed = parseStatuslineFile(JSON.stringify(body), '', now);
    if (!parsed) return false;
    const usage = { ...parsed.usage, via: 'mod' as const };
    const id = remoteId(machine.id, localAccount);
    const prev = this.entries.get(id);
    if (prev?.usage && prev.usage.fetchedAt > usage.fetchedAt) return true;
    this.entries.set(id, { machine, localAccount, usage, seenAt: now });
    return true;
  }

  /** `open` = remote accounts with open sessions (IngestSource.openAccounts), with their session counts. */
  list(open: ReadonlyMap<string, { machine: MachineRef; localAccount: string; sessions: number }>): AccountInfo[] {
    const now = this.now();
    for (const [id, e] of this.entries) if (!open.has(id) && now - e.seenAt > USAGE_KEEP_MS) this.entries.delete(id);
    const ids = new Set([...open.keys(), ...this.entries.keys()]);
    return [...ids].sort().map((id) => {
      const o = open.get(id);
      const e = this.entries.get(id);
      const machine = (o ?? e)!.machine;
      const local = (o ?? e)!.localAccount;
      const extra = local === '.claude' ? '' : ` ${local.replace(/^\.claude-?/, '') || local}`;
      const info: AccountInfo = {
        id,
        short: machine.name.slice(0, 2).toUpperCase(),
        name: `${machine.name}${extra}`,
        color: ACCOUNT_COLORS[(hash32(id) >>> 0) % ACCOUNT_COLORS.length],
        configDir: '',
        sessions: o?.sessions ?? 0,
        usageStatus: 'disabled',
        machine: { ...machine },
      };
      if (e?.usage) {
        info.usage = rollover(e.usage, now);
        info.usageStatus = now - e.usage.fetchedAt > STALE_AFTER_MS ? 'stale' : 'ok';
      }
      return info;
    });
  }

  /** Display name of a remote account (notices: "… arrived in X (mac-anna)"). */
  nameOf(id: string, open: ReadonlyMap<string, { machine: MachineRef; localAccount: string; sessions: number }>): string | undefined {
    return this.list(open).find((a) => a.id === id)?.name;
  }
}
