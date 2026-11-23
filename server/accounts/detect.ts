// Detection of Claude Code accounts (one config dir per account) and their metadata.
// Plain Node with no dependencies: scripts/docker-up.ts imports it too (via tsx) on the host.
// A Codex folder (CODEX_HOME, e.g. ~/.codex) also has `sessions/` and is left out (isCodexHome): Codex accounts
// are discovered by the Codex source and enter AccountsService with `provider: 'codex'`.
//
// Privacy: from .claude.json we read ONLY the e-mail and organization of the account profile
// (oauthAccount.{emailAddress, organizationName}) and the usage cache (cachedUsageUtilization);
// from the shell files, ONLY the `alias X='... claude ...'` lines (and `alias X='... codex ...'`, for the Codex
// accounts: see sources/codex/accounts.ts). Credentials are never read and none of this goes to the log.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { Provider } from '../../shared/types';
import { tr } from '../../shared/i18n';

export interface DetectedAccount {
  id: string;
  /** The account's tool; absent = 'claude' (detectAccounts only returns Claude Code accounts). */
  provider?: Provider;
  configDir: string;
  short: string;
  name: string;
  email?: string;
  organization?: string;
  plan?: string;
  color: string;
  cachedUsage?: unknown;
}

/** Fixed, clearly distinct palette, assigned in the accounts' stable order. */
export const ACCOUNT_COLORS = ['#f08a3c', '#4aa8e8', '#5cc97b', '#a77bf3', '#f06fa0'] as const;

const RC_FILES = ['.zshrc', '.bashrc', '.zprofile', '.bash_profile'];

/** Override from HABBLAUD_ACCOUNTS (the host passes ready-made metadata to the container). */
export interface AccountOverride {
  id?: string;
  /** The account's tool; absent = 'claude'. Codex ones stay out of the Claude Code account discovery. */
  provider?: Provider;
  configDir?: string;
  mountDir?: string;
  short?: string;
  name?: string;
  email?: string;
  organization?: string;
  plan?: string;
  color?: string;
  cachedUsage?: unknown;
}

export interface ClaudeAlias {
  /** Alias name, as typed in the shell (e.g. "d"). */
  name: string;
  /**
   * Absolute folder of the alias's variable (CLAUDE_CONFIG_DIR; for Codex, CODEX_HOME); absent = default account
   * ($HOME/.claude; for Codex, its default folder).
   */
  configDir?: string;
}

function splitList(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Expands `~`, `$HOME` and `${HOME}` and returns the absolute path without a trailing slash. */
export function expandHome(p: string, home: string): string {
  const expanded = p
    .trim()
    .replace(/^~(?=\/|$)/, home)
    .replace(/\$\{HOME\}|\$HOME\b/g, home);
  const abs = resolve(expanded);
  return abs.length > 1 ? abs.replace(/\/+$/, '') : abs;
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Year folder (YYYY) inside sessions/: Codex keeps rollouts in sessions/YYYY/MM/DD/. */
const YEAR_DIR = /^\d{4}$/;

/**
 * Is the folder Codex's (a CODEX_HOME, e.g. ~/.codex)? It also has `sessions/`; without this check it would become an
 * empty Claude Code account and the watcher would read `sessions/` as the session registry. Only markers Claude Code
 * never writes, checked by EXISTENCE (nothing is opened, neither `auth.json` nor `config.toml`):
 * - `sessions/YYYY/` (rollouts by date; Claude Code keeps `sessions/<pid>.json` right there);
 * - `thread-writer-locks/` or `archived_sessions/`;
 * - `config.toml` or `auth.json`.
 * With `projects/` (which Codex doesn't create) it's always Claude Code's: no account that already worked stops working.
 * A missing or empty folder isn't Codex's.
 */
export function isCodexHome(p: string): boolean {
  if (isDir(join(p, 'projects'))) return false;
  if (isDir(join(p, 'thread-writer-locks')) || isDir(join(p, 'archived_sessions'))) return true;
  if (isFile(join(p, 'config.toml')) || isFile(join(p, 'auth.json'))) return true;
  try {
    return readdirSync(join(p, 'sessions'), { withFileTypes: true }).some((e) => e.isDirectory() && YEAR_DIR.test(e.name));
  } catch {
    return false;
  }
}

/** Looks like a Claude Code config dir (`projects/` or `sessions/`), without checking whether it's Codex's. */
function hasClaudeLayout(p: string): boolean {
  return isDir(join(p, 'projects')) || isDir(join(p, 'sessions'));
}

/** Claude Code config dir: `projects/` or `sessions/`, and not a Codex folder. */
export function isClaudeDir(p: string): boolean {
  return hasClaudeLayout(p) && !isCodexHome(p);
}

export function isDefaultDir(dir: string, home: string): boolean {
  return resolve(dir) === resolve(home, '.claude');
}

export function parseAccountOverrides(raw: string | undefined): AccountOverride[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((o): o is AccountOverride => !!o && typeof o === 'object' && !Array.isArray(o));
  } catch {
    return [];
  }
}

/** Overrides of Claude Code accounts (no `provider` or 'claude'); Codex ones stay with its source. */
function claudeOverrides(raw: string | undefined): AccountOverride[] {
  return parseAccountOverrides(raw).filter((o) => o.provider === undefined || o.provider === 'claude');
}

/**
 * Watched config dirs. HABBLAUD_CLAUDE_DIRS (comma-separated list) replaces everything;
 * otherwise: `$HOME/.claude*` directories with `projects/` or `sessions/`, plus CLAUDE_CONFIG_DIR
 * (a list is accepted too) and the HABBLAUD_ACCOUNTS `mountDir`s that exist.
 * In every path, Codex folders are left out (isCodexHome; see codexDirsRefused).
 * Stable order: the default account first, then alphabetical.
 */
export function discoverClaudeDirs(env: NodeJS.ProcessEnv = process.env, home: string = env.HOME || homedir()): string[] {
  return scanClaudeDirs(env, home).dirs;
}

/**
 * Folders the Claude Code account discovery found (or got from HABBLAUD_CLAUDE_DIRS,
 * CLAUDE_CONFIG_DIR or HABBLAUD_ACCOUNTS) and refused because they're Codex's: to warn whoever listed them.
 */
export function codexDirsRefused(env: NodeJS.ProcessEnv = process.env, home: string = env.HOME || homedir()): string[] {
  return scanClaudeDirs(env, home).codex;
}

function scanClaudeDirs(env: NodeJS.ProcessEnv, home: string): { dirs: string[]; codex: string[] } {
  const codex: string[] = [];
  /** Left out if it's Codex's (noted in `codex`). */
  const notCodex = (p: string) => {
    if (!isCodexHome(p)) return true;
    codex.push(p);
    return false;
  };
  const unique = (list: string[]) => [...new Set(list)];

  const override = splitList(env.HABBLAUD_CLAUDE_DIRS);
  if (override.length) {
    const dirs = unique(override.map((p) => expandHome(p, home)));
    return { dirs: dirs.filter(notCodex), codex };
  }

  const found: string[] = [];
  try {
    for (const ent of readdirSync(home, { withFileTypes: true })) {
      if (!ent.name.startsWith('.claude')) continue;
      if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
      const p = join(home, ent.name);
      if (hasClaudeLayout(p) && notCodex(p)) found.push(p);
    }
  } catch {
    // Unreadable $HOME (e.g. a container without a home): carry on with the other sources
  }
  for (const p of splitList(env.CLAUDE_CONFIG_DIR)) {
    const abs = expandHome(p, home);
    if (isDir(abs) && notCodex(abs)) found.push(abs);
  }
  for (const o of claudeOverrides(env.HABBLAUD_ACCOUNTS)) {
    if (typeof o.mountDir !== 'string') continue;
    if (hasClaudeLayout(o.mountDir) && notCodex(o.mountDir)) found.push(expandHome(o.mountDir, home));
  }
  const dirs = unique(found.map((p) => expandHome(p, home)));
  dirs.sort((a, b) => {
    const da = isDefaultDir(a, home) ? 0 : 1;
    const db = isDefaultDir(b, home) ? 0 : 1;
    return da - db || a.localeCompare(b);
  });
  return { dirs, codex: unique(codex.map((p) => expandHome(p, home))) };
}

const ALIAS_RE = /^\s*alias\s+([A-Za-z0-9_][A-Za-z0-9_.-]*)=(?:'([^']*)'|"((?:[^"\\]|\\.)*)")\s*(?:#.*)?$/;
/** What identifies each tool's alias: the invoked command and the variable with the account folder. */
const ALIAS_TOOLS: Record<Provider, { invokes: RegExp; dir: RegExp }> = {
  claude: {
    invokes: /(?:^|[\s;&|(])(?:[\w.~/-]*\/)?claude(?=$|[\s;&|)])/,
    dir: /\bCLAUDE_CONFIG_DIR=(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/,
  },
  codex: {
    invokes: /(?:^|[\s;&|(])(?:[\w.~/-]*\/)?codex(?=$|[\s;&|)])/,
    dir: /\bCODEX_HOME=(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/,
  },
};

/**
 * Extracts the shell aliases that invoke the tool (`claude` or `codex`), with the account folder (CLAUDE_CONFIG_DIR
 * or CODEX_HOME). Considers ONLY `alias NAME='...'` lines (or with double quotes); any other line is ignored.
 */
export function parseToolAliases(text: string, home: string, tool: Provider): ClaudeAlias[] {
  const { invokes, dir: dirRe } = ALIAS_TOOLS[tool];
  const out: ClaudeAlias[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = ALIAS_RE.exec(line);
    if (!m) continue;
    const body = m[2] ?? m[3]?.replace(/\\(.)/g, '$1') ?? '';
    if (!invokes.test(body)) continue;
    const dir = dirRe.exec(body);
    const raw = dir ? (dir[1] ?? dir[2] ?? dir[3]) : undefined;
    out.push(raw ? { name: m[1], configDir: expandHome(raw, home) } : { name: m[1] });
  }
  return out;
}

/** Shell aliases that invoke `claude` (see parseToolAliases). */
export function parseClaudeAliases(text: string, home: string): ClaudeAlias[] {
  return parseToolAliases(text, home, 'claude');
}

/** Reads the tool's aliases (default: `claude`) from the user's shell startup files. */
export function readShellAliases(home: string, tool: Provider = 'claude'): ClaudeAlias[] {
  const out: ClaudeAlias[] = [];
  for (const f of RC_FILES) {
    try {
      out.push(...parseToolAliases(readFileSync(join(home, f), 'utf8'), home, tool));
    } catch {
      // missing/unreadable file
    }
  }
  return out;
}

/**
 * Picks each account's shortcut: the shortest alias (up to 3 characters); tie = the first declared. An alias without
 * a folder belongs to the default account (`defaultDir`; default $HOME/.claude).
 */
export function shortcutsByDir(aliases: ClaudeAlias[], home: string, defaultDir: string = resolve(home, '.claude')): Map<string, string> {
  const best = new Map<string, string>();
  for (const a of aliases) {
    if (a.name.length > 3) continue;
    const dir = a.configDir ?? defaultDir;
    const cur = best.get(dir);
    if (cur === undefined || a.name.length < cur.length) best.set(dir, a.name);
  }
  return new Map([...best].map(([dir, name]) => [dir, name.toUpperCase()]));
}

interface GlobalConfigInfo {
  email?: string;
  organization?: string;
  cachedUsage?: unknown;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Organization name worth showing. Personal accounts get an automatically generated name
 * ("<e-mail>'s Organization"), which says nothing: it's left out.
 */
export function meaningfulOrganization(organization: string | undefined, email: string | undefined): string | undefined {
  if (!organization) return undefined;
  const generic = /^(.+?)['’]s organi[sz]ation$/i.exec(organization.trim());
  if (generic && (!email || generic[1].trim().toLowerCase() === email.trim().toLowerCase() || generic[1].includes('@'))) return undefined;
  return organization;
}

/**
 * Reads from Claude Code's global config ($HOME/.claude.json for the default account, <dir>/.claude.json
 * for the others) only the account identification and the usage cache.
 */
export function readGlobalConfig(dir: string, home: string): GlobalConfigInfo {
  const candidates = isDefaultDir(dir, home) ? [join(home, '.claude.json'), join(dir, '.claude.json')] : [join(dir, '.claude.json')];
  let fallback: GlobalConfigInfo | undefined;
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const j = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const profile = j.oauthAccount && typeof j.oauthAccount === 'object' ? (j.oauthAccount as Record<string, unknown>) : undefined;
      const cache = j.cachedUsageUtilization && typeof j.cachedUsageUtilization === 'object' ? j.cachedUsageUtilization : undefined;
      const email = str(profile?.emailAddress);
      const info: GlobalConfigInfo = {
        email,
        organization: meaningfulOrganization(str(profile?.organizationName), email),
        cachedUsage: cache,
      };
      if (profile) return info;
      fallback ??= info;
    } catch {
      // Invalid JSON (being written?): try the next candidate
    }
  }
  return fallback ?? {};
}

function matchOverride(overrides: AccountOverride[], id: string, dir: string, home: string): AccountOverride | undefined {
  const norm = (p: unknown) => (typeof p === 'string' && p.trim() ? expandHome(p, home) : undefined);
  return (
    overrides.find((o) => o.id === id) ??
    overrides.find((o) => norm(o.mountDir) === dir) ??
    overrides.find((o) => norm(o.configDir) === dir)
  );
}

/** Account ids (the dir's basename), disambiguated if two dirs have the same name. */
export function accountIds(dirs: string[]): string[] {
  const seen = new Map<string, number>();
  return dirs.map((d) => {
    const base = basename(d) || d;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}~${n}`;
  });
}

/**
 * One account per config dir, IN THE SAME ORDER as `dirs`.
 * `configDir` is the display path (in Docker, the host's, from HABBLAUD_ACCOUNTS).
 */
export function detectAccounts(dirs: string[], opts: { home?: string; env?: NodeJS.ProcessEnv } = {}): DetectedAccount[] {
  const env = opts.env ?? process.env;
  const home = opts.home ?? (env.HOME || homedir());
  const overrides = claudeOverrides(env.HABBLAUD_ACCOUNTS);
  const shortcuts = shortcutsByDir(readShellAliases(home), home);
  const ids = accountIds(dirs);

  const partial = dirs.map((dir, i) => {
    const id = ids[i];
    const ov = matchOverride(overrides, id, resolve(dir), home);
    const cfg = readGlobalConfig(dir, home);
    return { dir, id, ov, cfg, short: str(ov?.short)?.slice(0, 3) ?? shortcuts.get(resolve(dir)) };
  });

  // Accounts without a detected shortcut get A, B, C... (without clashing with the shortcuts already used).
  const used = new Set(partial.map((p) => p.short).filter((s): s is string => !!s));
  let next = 0;
  const fallbackShort = () => {
    for (; next < 26; next++) {
      const letter = String.fromCharCode(65 + next);
      if (!used.has(letter)) {
        used.add(letter);
        return letter;
      }
    }
    return '?';
  };

  return partial.map((p, i) => {
    const short = p.short ?? fallbackShort();
    const acc: DetectedAccount = {
      id: p.id,
      configDir: str(p.ov?.configDir) ?? p.dir,
      short,
      name: str(p.ov?.name) ?? tr('Account {0}', [short]),
      color: str(p.ov?.color) ?? ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
    };
    const email = str(p.ov?.email) ?? p.cfg.email;
    const organization = meaningfulOrganization(str(p.ov?.organization) ?? p.cfg.organization, email);
    const plan = str(p.ov?.plan);
    const cachedUsage = p.ov?.cachedUsage ?? p.cfg.cachedUsage;
    if (email) acc.email = email;
    if (organization) acc.organization = organization;
    if (plan) acc.plan = plan;
    if (cachedUsage !== undefined) acc.cachedUsage = cachedUsage;
    return acc;
  });
}
