// Machines allowed to send their sessions to this server (HABBLAUD_INGEST=1), one token each.
//
// `npm run ingest:token -- add <name>` creates a token, prints it ONCE and stores only its SHA-256 in
// <dataDir>/ingest-machines.json (mode 600). The token is `hbl1.<machineId>.<43 base64url chars>` (32 random bytes):
// the id inside it picks the record, and the hash is compared in constant time. SHA-256 is enough here, unlike the
// password of the remote port (scrypt): the token has 256 bits of entropy, so it cannot be guessed from its hash, and
// a slow hash on every hook event would weigh on a Raspberry Pi.
//
// The server re-reads the file when it changes (adding or removing a machine needs no restart).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MACHINE_ID } from '../../shared/ingest';
import type { MachineRef } from '../../shared/types';

export const MACHINES_FILE = 'ingest-machines.json';
const TOKEN = /^hbl1\.([a-z0-9][a-z0-9-]{0,31})\.([A-Za-z0-9_-]{43})$/;
/** How often the file's mtime is checked (at most). */
const RECHECK_MS = 2_000;

export interface MachineRecord {
  id: string;
  name: string;
  /** SHA-256 (hex) of the whole token. */
  hash: string;
  createdAt: number;
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function parseMachinesFile(raw: string): MachineRecord[] {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = (j as { machines?: unknown })?.machines;
  if (!Array.isArray(list)) return [];
  const out: MachineRecord[] = [];
  for (const m of list) {
    const r = m as Record<string, unknown>;
    if (typeof r?.id !== 'string' || !MACHINE_ID.test(r.id)) continue;
    if (typeof r.hash !== 'string' || !/^[0-9a-f]{64}$/.test(r.hash)) continue;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : r.id;
    out.push({ id: r.id, name, hash: r.hash, createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0 });
  }
  return out;
}

/** Reads and writes the machines file (the CLI) and checks tokens (the server). */
export class MachineStore {
  private list: MachineRecord[] = [];
  private mtime = -1;
  private checkedAt = 0;

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {}

  private refresh(force = false): void {
    const now = this.now();
    if (!force && now - this.checkedAt < RECHECK_MS) return;
    this.checkedAt = now;
    let mtime = 0;
    try {
      mtime = statSync(this.file).mtimeMs;
    } catch {
      this.list = [];
      this.mtime = 0;
      return;
    }
    if (mtime === this.mtime) return;
    this.mtime = mtime;
    try {
      this.list = parseMachinesFile(readFileSync(this.file, 'utf8'));
    } catch {
      this.list = [];
    }
  }

  machines(): MachineRecord[] {
    this.refresh(true);
    return this.list.map((m) => ({ ...m }));
  }

  /** The machine of a bearer token, or undefined (unknown machine, revoked or wrong token). */
  verify(tokenText: string | undefined): MachineRef | undefined {
    if (!tokenText) return undefined;
    const m = TOKEN.exec(tokenText);
    // Always hash, so a malformed token and a wrong one take the same time.
    const got = Buffer.from(sha256(tokenText), 'hex');
    if (!m) return undefined;
    this.refresh();
    const rec = this.list.find((x) => x.id === m[1]);
    if (!rec) return undefined;
    const want = Buffer.from(rec.hash, 'hex');
    return want.length === got.length && timingSafeEqual(want, got) ? { id: rec.id, name: rec.name } : undefined;
  }

  /** Creates (or replaces) a machine: returns the token, which is never stored. */
  add(id: string, name?: string): string {
    if (!MACHINE_ID.test(id)) throw new Error('machine name: 1 to 32 characters, lowercase letters, digits and dashes, starting with a letter or digit');
    const token = `hbl1.${id}.${randomBytes(32).toString('base64url')}`;
    const list = this.machines().filter((m) => m.id !== id);
    list.push({ id, name: (name ?? id).trim().slice(0, 40) || id, hash: sha256(token), createdAt: this.now() });
    this.write(list);
    return token;
  }

  remove(id: string): boolean {
    const list = this.machines();
    const next = list.filter((m) => m.id !== id);
    if (next.length === list.length) return false;
    this.write(next);
    return true;
  }

  private write(list: MachineRecord[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, machines: list }, null, 2)}\n`, { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.file);
    this.mtime = -1;
    this.refresh(true);
  }

  exists(): boolean {
    return existsSync(this.file);
  }
}
