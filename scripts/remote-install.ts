// Sends this machine's Claude Code sessions to a central Habblaud on another machine (the "Multiple machines" setup).
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MARKETPLACE = 'habblaud';
export const REMOTE_PLUGIN = `habblaud-remote@${MARKETPLACE}`;
export const URL_VAR = 'HABBLAUD_SERVER_URL';
export const TOKEN_VAR = 'HABBLAUD_SERVER_TOKEN';
const TOKEN = /^hbl1\.([a-z0-9-]{1,32})\.[A-Za-z0-9_-]{43}$/;

const USAGE = tr(
  'Uso: npm run remote:<install|uninstall|status> [-- opções]\n\n  install     manda as sessões desta máquina para um Habblaud central (--server e --token)\n  uninstall   tira o endereço e o token de cada conta e o plugin habblaud-remote\n  status      mostra, por conta, o servidor configurado e o plugin\n\nOpções:\n  --server <url>     endereço HTTPS do Habblaud central (ex.: https://pi.<tailnet>.ts.net)\n  --token <token>    token desta máquina (npm run ingest:token -- add <nome> no servidor); ou HABBLAUD_SERVER_TOKEN\n  --account <pasta>  só esta conta (ex.: --account ~/.claude-conta2); pode repetir\n  --skip-check       não confere o servidor e o token antes de gravar\n  --dry-run          mostra o que faria, sem gravar nada\n  --claude <cmd>     comando do Claude Code (padrão: claude, do PATH)\n  -h, --help         mostra esta ajuda',
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
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): RemoteOptions | 'help' {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help' || rest.includes('-h') || rest.includes('--help')) return 'help';
  if (command !== 'install' && command !== 'uninstall' && command !== 'status') throw new FatalError(tr('comando desconhecido: {0}', [command]));
  const o: RemoteOptions = { command, accounts: [], skipCheck: false, dryRun: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const value = () => {
      const v = rest[++i];
      if (v === undefined || v.startsWith('--')) throw new FatalError(tr('{0} precisa de um valor', [a]));
      return v;
    };
    if (a === '--server') o.server = value();
    else if (a === '--token') o.token = value();
    else if (a === '--account') o.accounts.push(value());
    else if (a === '--skip-check') o.skipCheck = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--claude') o.claudeCmd = value();
    else throw new FatalError(tr('opção desconhecida: {0}', [a]));
  }
  o.token ??= env[TOKEN_VAR]?.trim() || undefined;
  if (command === 'install') {
    const server = normalizeServer(o.server);
    if (!server) throw new FatalError(tr('--server precisa ser um endereço https:// sem caminho (ex.: https://pi.<tailnet>.ts.net)'));
    o.server = server;
    if (!o.token || !TOKEN.test(o.token)) throw new FatalError(tr('--token (ou HABBLAUD_SERVER_TOKEN) precisa ser o token criado no servidor (hbl1.<máquina>.<segredo>)'));
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
    if (res.status === 401) return { ok: false, error: tr('o servidor recusou o token (401)') };
    if (res.status === 404) return { ok: false, error: tr('o servidor não tem /api/ingest: ligue HABBLAUD_INGEST=1 lá e use a porta remota (HTTPS)') };
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
  if (!dirs.length) {
    ctx.out(tr('Nenhuma conta do Claude Code encontrada (~/.claude* com projects/ ou sessions/). Use --account <pasta> ou HABBLAUD_CLAUDE_DIRS.'));
    return 1;
  }
  if (o.command === 'install' && !o.skipCheck) {
    const c = await checkServer(o.server!, o.token!, f);
    if (!c.ok) {
      ctx.out(tr('[remote] Não deu para falar com {0}: {1}', [o.server!, c.error]));
      return 1;
    }
    ctx.out(tr('[remote] Servidor ok: esta máquina entra como "{0}".', [c.machine]));
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
          ? tr('[remote] {0}: {1} como "{2}"; plugin habblaud-remote {3}', [label, d.url, d.machine ?? '?', plugin ? (plugin.enabled ? tr('ligado') : tr('desligado')) : tr('não instalado')])
          : tr('[remote] {0}: sem servidor central', [label]),
      );
      continue;
    }
    const next = withServer(read.settings, o.command === 'install' ? { url: o.server!, token: o.token! } : undefined);
    if (o.dryRun) ctx.out(tr('[remote] {0}: gravaria {1}', [label, tildify(file, ctx.home)]));
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
        ctx.out(tr('[remote] {0}: o plugin habblaud-remote não foi instalado ({1})', [label, err]));
        failures++;
        continue;
      }
      if (!o.dryRun) ctx.out(tr('[remote] {0}: pronto. Sessões novas (ou /reload-plugins) aparecem em {1}.', [label, o.server!]));
    } else {
      if (!o.dryRun) {
        const env = accountEnv(ctx.env, dir, ctx.home);
        const plugins = parsePluginList(ctx.claude(['plugin', 'list', '--json'], env).stdout) ?? [];
        if (plugins.some((p) => p.id === REMOTE_PLUGIN)) ctx.claude(['plugin', 'uninstall', REMOTE_PLUGIN, '--scope', 'user'], env);
      }
      ctx.out(tr('[remote] {0}: servidor central removido.', [label]));
    }
  }
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
    console.error(err instanceof FatalError ? tr('[remote] Erro: {0}', [err.message]) : tr('[remote] Erro inesperado: {0}', [String(err)]));
    process.exitCode = 1;
  });
}
