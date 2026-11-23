// Sends this machine's Claude Code and Codex sessions to a central Habblaud on another machine (the "Multiple machines" setup).
// Runs on the machine where the sessions run (a Mac), with tsx:
//
//   npm run remote:install -- --server https://pi.<tailnet>.ts.net --token hbl1.<machine>.<secret>
//   npm run remote:uninstall
//   npm run remote:status
//   (options: --account <dir> (repeatable), --skip-check, --dry-run, --claude <cmd>; the token may also come from
//   HABBLAUD_SERVER_TOKEN, which keeps it out of the shell history)
//
// For each Claude Code account it:
// 1. writes HABBLAUD_SERVER_URL and HABBLAUD_SERVER_TOKEN in the `env` of <account>/settings.json (a backup is kept,
//    mode 600): the habblaud-remote hooks, the permission hook, the messages plugin and the habblaud mod read them;
// 2. adds this folder as the "habblaud" plugin marketplace (if missing) and installs the habblaud-remote plugin
//    through the Claude Code CLI. The other Habblaud plugins come from `npm run mod:install`.
// For Codex (unless --no-codex, and only when a Codex folder exists: CODEX_HOME, ~/.codex*, HABBLAUD_CODEX_DIRS) it:
// 3. installs the Habblaud hooks in <CODEX_HOME>/hooks.json of each folder (as npm run codex:install);
// 4. writes `server` and `token` in ~/.habblaud/codex-hook.json (mode 600): the hook then posts every event to the
//    central server. Codex runs a new or changed hook only after you approve it in /hooks.
// Before that it checks the server and the token (GET /api/ingest/hello), unless --skip-check.
//
// Note: variables in the settings `env` reach every process Claude Code starts (tools included). The token only lets
// this machine post its own sessions' events, so an agent on this machine that reads it gains nothing it does not
// already see; still, keep it out of shared settings files.
import { chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverClaudeDirs, expandHome } from '../server/accounts/detect';
import { accountEnv, makeClaudeRunner, parseMarketplaceList, parsePluginList, sameDir, type ClaudeRunner } from './mod-install';
import { readSettings, tildify, writeSettings, type Settings } from './statusline-install';
import { tr } from '../shared/i18n';
import {
  DEFAULT_PORT as CODEX_DEFAULT_PORT,
  DEFAULT_WAIT_S as CODEX_DEFAULT_WAIT_S,
  HOOK_SCRIPT as CODEX_HOOK_SCRIPT,
  configPath as codexConfigPath,
  discoverCodexHomes,
  probeNode,
  readHookConfig,
  run as codexRun,
  setHookRemote,
  type RunOptions as CodexRunOptions,
} from './codex-install';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MARKETPLACE = 'habblaud';
export const REMOTE_PLUGIN = `habblaud-remote@${MARKETPLACE}`;
export const URL_VAR = 'HABBLAUD_SERVER_URL';
export const TOKEN_VAR = 'HABBLAUD_SERVER_TOKEN';
const TOKEN = /^hbl1\.([a-z0-9-]{1,32})\.[A-Za-z0-9_-]{43}$/;

const USAGE = tr(
  'Usage: npm run remote:<install|uninstall|status> [-- options]\n\n  install     sends this machine\'s sessions to a central Habblaud (--server and --token)\n  uninstall   removes the address and token from each account, and the habblaud-remote plugin\n  status      shows, per account, the configured server and the plugin\n\nOptions:\n  --server <url>     HTTPS address of the central Habblaud (e.g. https://pi.<tailnet>.ts.net)\n  --token <token>    this machine\'s token (npm run ingest:token -- add <name> on the server); or HABBLAUD_SERVER_TOKEN\n  --account <dir>    only this account (e.g. --account ~/.claude-work); repeatable\n  --skip-check       does not check the server and token before writing\n  --no-codex         leaves Codex alone (Claude Code only)\n  --dry-run          shows what it would do, without writing anything\n  --claude <cmd>     Claude Code command (default: claude, from the PATH)\n  -h, --help         shows this help',
);

export class FatalError extends Error {}

export interface RemoteOptions {
  command: 'install' | 'uninstall' | 'status';
  server?: string;
  token?: string;
  accounts: string[];
  skipCheck: boolean;
  dryRun: boolean;
  claudeCmd?: string;
  /** Also set up Codex (default: yes, when a Codex folder exists). */
  codex: boolean;
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): RemoteOptions | 'help' {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help' || rest.includes('-h') || rest.includes('--help')) return 'help';
  if (command !== 'install' && command !== 'uninstall' && command !== 'status') throw new FatalError(tr('unknown command: {0}', [command]));
  const o: RemoteOptions = { command, accounts: [], skipCheck: false, dryRun: false, codex: true };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const value = () => {
      const v = rest[++i];
      if (v === undefined || v.startsWith('--')) throw new FatalError(tr('{0} needs a value', [a]));
      return v;
    };
    if (a === '--server') o.server = value();
    else if (a === '--token') o.token = value();
    else if (a === '--account') o.accounts.push(value());
    else if (a === '--skip-check') o.skipCheck = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--no-codex') o.codex = false;
    else if (a === '--claude') o.claudeCmd = value();
    else throw new FatalError(tr('unknown option: {0}', [a]));
  }
  o.token ??= env[TOKEN_VAR]?.trim() || undefined;
  if (command === 'install') {
    const server = normalizeServer(o.server);
    if (!server) throw new FatalError(tr('--server must be an https:// address with no path (e.g. https://pi.<tailnet>.ts.net)'));
    o.server = server;
    if (!o.token || !TOKEN.test(o.token)) throw new FatalError(tr('--token (or HABBLAUD_SERVER_TOKEN) must be the token created on the server (hbl1.<machine>.<secret>)'));
  }
  return o;
}

/** `https://host[:port]` without a trailing slash, or undefined. http:// only to this computer (tests). */
export function normalizeServer(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return undefined;
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return undefined;
  if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return undefined;
  return `${u.protocol}//${u.host}`;
}

/** settings.json with the server (install) or without it (server undefined: uninstall). Never touches other keys. */
export function withServer(settings: Settings, server: { url: string; token: string } | undefined): Settings {
  const env = settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env) ? { ...(settings.env as Record<string, unknown>) } : {};
  if (server) {
    env[URL_VAR] = server.url;
    env[TOKEN_VAR] = server.token;
  } else {
    delete env[URL_VAR];
    delete env[TOKEN_VAR];
  }
  const out: Settings = { ...settings };
  if (Object.keys(env).length) out.env = env;
  else delete out.env;
  return out;
}

/** What settings.json says (status): the server URL and the machine id inside the token, never the secret. */
export function describeSettings(settings: Settings): { url?: string; machine?: string } {
  const env = (settings.env ?? {}) as Record<string, unknown>;
  const url = typeof env[URL_VAR] === 'string' ? (env[URL_VAR] as string) : undefined;
  const token = typeof env[TOKEN_VAR] === 'string' ? (env[TOKEN_VAR] as string) : undefined;
  return { url, machine: token ? TOKEN.exec(token)?.[1] : undefined };
}

export async function checkServer(url: string, token: string, f: typeof fetch = fetch): Promise<{ ok: true; machine: string } | { ok: false; error: string }> {
  try {
    const res = await f(`${url}/api/ingest/hello`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const body = (await res.json().catch(() => ({}))) as { machine?: { name?: string }; error?: string };
    if (res.status === 200 && body.machine?.name) return { ok: true, machine: body.machine.name };
    if (res.status === 401) return { ok: false, error: tr('the server refused the token (401)') };
    if (res.status === 404) return { ok: false, error: tr('the server has no /api/ingest: turn on HABBLAUD_INGEST=1 there and use the remote port (HTTPS)') };
    return { ok: false, error: `HTTP ${res.status}${body.error ? `: ${body.error}` : ''}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

interface Ctx {
  env: NodeJS.ProcessEnv;
  home: string;
  claude: ClaudeRunner;
  out: (line: string) => void;
  /** npm run codex:install|status (tests inject a fake). */
  codex?: (opts: CodexRunOptions) => Promise<number>;
}

/** The Codex part: hooks in each Codex folder and the central server in ~/.habblaud/codex-hook.json. */
async function runCodex(o: RemoteOptions, ctx: Ctx): Promise<number> {
  const found = discoverCodexHomes(ctx.env, ctx.home);
  const cfgFile = tildify(codexConfigPath(ctx.home), ctx.home);
  if (o.command === 'status') {
    if (!found.dirs.length) return 0;
    const cfg = readHookConfig(ctx.home);
    const machine = cfg?.token ? TOKEN.exec(cfg.token)?.[1] : undefined;
    ctx.out(cfg?.server ? tr('[remote] Codex: {0} as "{1}" ({2})', [cfg.server, machine ?? '?', cfgFile]) : tr('[remote] Codex: no central server'));
    return 0;
  }
  if (o.command === 'uninstall') {
    if (o.dryRun) ctx.out(tr('[remote] Codex: would remove the central server from {0}', [cfgFile]));
    else if (setHookRemote(ctx.home, undefined)) ctx.out(tr('[remote] Codex: central server removed from {0} (the hooks stay and talk to the local Habblaud again; npm run codex:uninstall removes them).', [cfgFile]));
    return 0;
  }
  if (!found.dirs.length) return 0;
  const cfg = readHookConfig(ctx.home);
  const runner =
    ctx.codex ??
    ((opts: CodexRunOptions) =>
      codexRun(opts, {
        env: ctx.env,
        home: ctx.home,
        now: new Date(),
        hookPath: CODEX_HOOK_SCRIPT,
        out: (l) => ctx.out(`   ${l}`),
        nodeProbe: probeNode,
        nodeCandidates: ['/opt/homebrew/bin/node', '/usr/local/bin/node', process.execPath],
      }));
  ctx.out(tr('[remote] Codex: installing the Habblaud hooks…'));
  const code = await runner({
    command: 'install',
    dryRun: o.dryRun,
    port: typeof cfg?.port === 'number' ? cfg.port : CODEX_DEFAULT_PORT,
    waitS: typeof cfg?.permissionTimeoutS === 'number' ? cfg.permissionTimeoutS : CODEX_DEFAULT_WAIT_S,
  });
  if (code !== 0) {
    ctx.out(tr('[remote] Codex: the hooks were not installed in every folder.'));
    return 1;
  }
  if (o.dryRun) ctx.out(tr('[remote] Codex: would write the central server to {0}', [cfgFile]));
  else {
    setHookRemote(ctx.home, { server: o.server!, token: o.token! });
    ctx.out(tr('[remote] Codex: done. Events go to {0} (approve the Habblaud hooks in /hooks inside Codex if it asks).', [o.server!]));
  }
  return 0;
}

function accountDirs(o: RemoteOptions, env: NodeJS.ProcessEnv, home: string): string[] {
  return o.accounts.length ? [...new Set(o.accounts.map((a) => expandHome(a, home)))] : discoverClaudeDirs(env, home);
}

/** Marketplace + habblaud-remote plugin in one account, through the Claude Code CLI. */
function installPlugin(dir: string, ctx: Ctx, dryRun: boolean): string | undefined {
  const env = accountEnv(ctx.env, dir, ctx.home);
  const markets = parseMarketplaceList(ctx.claude(['plugin', 'marketplace', 'list', '--json'], env).stdout) ?? [];
  const steps: string[][] = [];
  if (!markets.some((m) => m.name === MARKETPLACE && (!m.path || sameDir(m.path, ROOT)))) steps.push(['plugin', 'marketplace', 'add', ROOT]);
  const plugins = parsePluginList(ctx.claude(['plugin', 'list', '--json'], env).stdout) ?? [];
  if (!plugins.some((p) => p.id === REMOTE_PLUGIN && p.scope === 'user')) steps.push(['plugin', 'install', REMOTE_PLUGIN, '--scope', 'user']);
  for (const args of steps) {
    if (dryRun) {
      ctx.out(`   claude ${args.join(' ')}`);
      continue;
    }
    const r = ctx.claude(args, env);
    if (r.code !== 0) return r.error ?? (r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`);
  }
  return undefined;
}

export async function run(o: RemoteOptions, ctx: Ctx, f: typeof fetch = fetch): Promise<number> {
  const dirs = accountDirs(o, ctx.env, ctx.home);
  const withCodex = o.codex && !o.accounts.length;
  const codexDirs = withCodex ? discoverCodexHomes(ctx.env, ctx.home).dirs : [];
  if (!dirs.length && !codexDirs.length) {
    ctx.out(tr('No Claude Code account found (~/.claude* with projects/ or sessions/). Use --account <dir> or HABBLAUD_CLAUDE_DIRS.'));
    return 1;
  }
  if (o.command === 'install' && !o.skipCheck) {
    const c = await checkServer(o.server!, o.token!, f);
    if (!c.ok) {
      ctx.out(tr('[remote] Could not reach {0}: {1}', [o.server!, c.error]));
      return 1;
    }
    ctx.out(tr('[remote] Server ok: this machine joins as "{0}".', [c.machine]));
  }
  let failures = 0;
  for (const dir of dirs) {
    const label = tildify(dir, ctx.home);
    const file = join(dir, 'settings.json');
    const read = readSettings(file);
    if ('error' in read) {
      ctx.out(tr('[remote] {0}: settings.json {1}', [label, read.error]));
      failures++;
      continue;
    }
    if (o.command === 'status') {
      const d = describeSettings(read.settings);
      const plugins = parsePluginList(ctx.claude(['plugin', 'list', '--json'], accountEnv(ctx.env, dir, ctx.home)).stdout) ?? [];
      const plugin = plugins.find((p) => p.id === REMOTE_PLUGIN);
      ctx.out(
        d.url
          ? tr('[remote] {0}: {1} as "{2}"; habblaud-remote plugin {3}', [label, d.url, d.machine ?? '?', plugin ? (plugin.enabled ? tr('enabled') : tr('off')) : tr('not installed')])
          : tr('[remote] {0}: no central server', [label]),
      );
      continue;
    }
    const next = withServer(read.settings, o.command === 'install' ? { url: o.server!, token: o.token! } : undefined);
    if (o.dryRun) ctx.out(tr('[remote] {0}: would write {1}', [label, tildify(file, ctx.home)]));
    else if (JSON.stringify(next) !== JSON.stringify(read.settings)) {
      writeSettings(file, next, read.raw, new Date());
      try {
        chmodSync(file, 0o600);
      } catch {
        // the file stays with its previous mode
      }
    }
    if (o.command === 'install') {
      const err = installPlugin(dir, ctx, o.dryRun);
      if (err) {
        ctx.out(tr('[remote] {0}: the habblaud-remote plugin was not installed ({1})', [label, err]));
        failures++;
        continue;
      }
      if (!o.dryRun) ctx.out(tr('[remote] {0}: done. New sessions (or /reload-plugins) show up at {1}.', [label, o.server!]));
    } else {
      if (!o.dryRun) {
        const env = accountEnv(ctx.env, dir, ctx.home);
        const plugins = parsePluginList(ctx.claude(['plugin', 'list', '--json'], env).stdout) ?? [];
        if (plugins.some((p) => p.id === REMOTE_PLUGIN)) ctx.claude(['plugin', 'uninstall', REMOTE_PLUGIN, '--scope', 'user'], env);
      }
      ctx.out(tr('[remote] {0}: central server removed.', [label]));
    }
  }
  if (withCodex) failures += await runCodex(o, ctx);
  return failures ? 1 : 0;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    console.log(USAGE);
    return;
  }
  process.exitCode = await run(parsed, {
    env: process.env,
    home: process.env.HOME || homedir(),
    claude: makeClaudeRunner(parsed.claudeCmd),
    out: (l) => console.log(l),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof FatalError ? tr('[remote] Error: {0}', [err.message]) : tr('[remote] Unexpected error: {0}', [String(err)]));
    process.exitCode = 1;
  });
}
