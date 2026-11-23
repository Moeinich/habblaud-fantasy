// Server configuration from environment variables (documented in server/README.md).
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverClaudeDirs } from './accounts/detect';
import { parseAllowedHosts } from './http/guard';
import { parseRemoteConfig, type RemoteConfig } from './http/remote';
import { parseGithubRepo } from './updates/checker';
import { tr } from '../shared/i18n';
import { parseBrand, type Brand } from '../shared/brand';

export interface ServerConfig {
  port: number;
  host: string;
  /** `--dev`: Vite in middleware mode (HMR) on the same server. */
  dev: boolean;
  /** Starts the demo simulator on boot. */
  demo: boolean;
  /** Running inside a container (registry PIDs belong to the host, so they can't be checked). */
  inDocker: boolean;
  home: string;
  /** Claude Code config dirs being watched (one per account). */
  claudeDirs: string[];
  /** Where Habblaud keeps its own state (persisted names). */
  dataDir: string;
  /**
   * Folder with the usage captured by Claude Code's statusline (scripts/statusline-tap.mjs):
   * HABBLAUD_USAGE_DIR or ~/.habblaud/usage. In Docker, docker-up mounts this folder at /usage.
   */
  usageDir: string;
  /** Extra names accepted in the Host/Origin header (HABBLAUD_ALLOWED_HOSTS); localhost and IPs always pass. */
  allowedHosts: Set<string>;
  /**
   * Terminal (GET /api/agents/:id/terminal) on: only with a local bind, i.e. with Habblaud reachable only from
   * this computer (see terminalOffReason). It's the lock for everything that shows or acts on the sessions.
   */
  terminal: boolean;
  /**
   * Messages through the office (POST /api/messages and the habblaud-mensagens plugin's inbox) on: the terminal
   * lock plus HABBLAUD_MENSAGENS not turned off (see messagesOffReason).
   */
  messages: boolean;
  /** Records the office timeline for the timelapse (<dataDir>/timeline); HABBLAUD_TIMELINE=0 turns it off. */
  timeline: boolean;
  /** Project root (where package.json lives); dist/client is served from here. */
  rootDir: string;
  version: string;
  /** GitHub repository ("owner/name", from package.json's `repository` field) where new versions are released. */
  repo?: string;
  /** Checks GitHub for a new version (server/updates/checker.ts); HABBLAUD_UPDATE_CHECK=0 turns it off. */
  updateCheck: boolean;
  /** Watches Codex sessions (sources/codex/); HABBLAUD_CODEX=0 turns it off. */
  codex: boolean;
  /** Second port, with login, for the phone on the local network (http/remote.ts); absent = off. */
  remote?: RemoteConfig;
  /** Why remote access stayed off when the variables are incomplete. */
  remoteWarning?: string;
  /**
   * HABBLAUD_INGEST=1: other machines send their sessions to /api/ingest/* (server/ingest/), only on the remote port
   * with HTTPS. False when off or when the remote port is missing or without TLS (`ingestWarning` says why).
   */
  ingest: boolean;
  ingestWarning?: string;
  /**
   * White-labeling: HABBLAUD_BRAND_NAME (default "Habblaud") and HABBLAUD_BRAND_SHORT (default: the name), injected
   * into index.html, the manifest and the login page at runtime (http/brand.ts). Invalid values fall back.
   */
  brand: Brand;
}

export function isTruthy(v: string | undefined): boolean {
  return !!v && /^(1|true|yes|sim|on)$/i.test(v.trim());
}

/** Walks up from `from` until it finds the project's package.json. */
export function findRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const name = (JSON.parse(readFileSync(pkg, 'utf8')) as { name?: unknown }).name;
        if (name === 'habblaud') return dir;
      } catch {
        // unreadable package.json: keep walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(from, '..');
}

/** Version and repository from package.json. */
function readPackage(rootDir: string): { version: string; repo?: string } {
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { version?: unknown; repository?: unknown };
    return { version: typeof pkg.version === 'string' ? pkg.version : '0.0.0', repo: parseGithubRepo(pkg.repository) };
  } catch {
    return { version: '0.0.0' };
  }
}

export function detectDocker(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.HABBLAUD_IN_DOCKER !== undefined) return isTruthy(env.HABBLAUD_IN_DOCKER);
  return existsSync('/.dockerenv');
}

/**
 * Listen address that only this computer can reach: 127.0.0.0/8, `::1` (with or without brackets)
 * or `localhost`. `0.0.0.0`, `::`, network IPs and arbitrary names don't count.
 */
export function isLoopbackBind(value: string | undefined): boolean {
  let v = value?.trim().toLowerCase() ?? '';
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  if (v === 'localhost') return true;
  const family = isIP(v);
  if (family === 4) return v.startsWith('127.');
  if (family !== 6) return false;
  try {
    // Canonical form (0:0:0:0:0:0:0:1 -> [::1]).
    return new URL(`http://[${v}]/`).hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Why the terminal is off (undefined = on). Transcripts hold the whole conversation, so it only turns on
 * when Habblaud isn't exposed beyond this computer:
 * - Node: HABBLAUD_HOST must be loopback;
 * - Docker: the process always listens on 0.0.0.0 inside the container, and what decides exposure is the port
 *   published on the host, HABBLAUD_BIND (docker-compose.yml passes the same value to the container). Absent
 *   or empty = off: without it there's no way to know whether the port is exposed.
 * HABBLAUD_TERMINAL with any value other than "on" (0, false, off...) turns it off; there is no way to turn
 * it on with the port exposed.
 */
export function terminalOffReason(env: NodeJS.ProcessEnv, host: string, inDocker: boolean): string | undefined {
  const flag = env.HABBLAUD_TERMINAL?.trim();
  if (flag && !isTruthy(flag)) return `HABBLAUD_TERMINAL=${flag}`;
  if (inDocker) {
    const bind = env.HABBLAUD_BIND?.trim();
    if (!bind) return tr('HABBLAUD_BIND didn\'t reach the container, so the port may be exposed on the network');
    return isLoopbackBind(bind) ? undefined : tr('the port is exposed on the network: HABBLAUD_BIND={0}', [bind]);
  }
  return isLoopbackBind(host) ? undefined : tr('the port is exposed on the network: HABBLAUD_HOST={0}', [host]);
}

/**
 * Why messages through the office are off (undefined = on). They enter the session as if you had typed them, so
 * they follow the terminal lock; HABBLAUD_MENSAGENS with any value other than "on" (0, false, off, no...) turns
 * off just them.
 */
export function messagesOffReason(env: NodeJS.ProcessEnv, host: string, inDocker: boolean): string | undefined {
  const flag = env.HABBLAUD_MENSAGENS?.trim();
  if (flag && !isTruthy(flag)) return `HABBLAUD_MENSAGENS=${flag}`;
  const terminal = terminalOffReason(env, host, inDocker);
  return terminal ? tr('same lock as the terminal: {0}', [terminal]) : undefined;
}

/**
 * Whether the ingest endpoint is on (undefined = on). It needs HABBLAUD_INGEST=1 AND the remote port with HTTPS: the
 * machine tokens never travel in the clear and the local port (no login) never takes them.
 */
export function ingestOffReason(env: NodeJS.ProcessEnv, remote: RemoteConfig | undefined): string | undefined {
  if (!isTruthy(env.HABBLAUD_INGEST)) return 'off';
  if (!remote) return tr('HABBLAUD_INGEST=1 needs remote access turned on (npm run remote:setup): tokens are only accepted on the remote port');
  if (!remote.tls) return tr('HABBLAUD_INGEST=1 needs the remote port with HTTPS (HABBLAUD_REMOTE_INSECURE_HTTP is not enough)');
  return undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): ServerConfig {
  const home = env.HOME || homedir();
  const inDocker = detectDocker(env);
  const port = Number.parseInt(env.HABBLAUD_PORT ?? '', 10);
  const rootDir = findRoot(dirname(fileURLToPath(import.meta.url)));
  const host = env.HABBLAUD_HOST?.trim() || '127.0.0.1';
  const pkg = readPackage(rootDir);
  const remote = parseRemoteConfig(env, inDocker);
  const ingestOff = ingestOffReason(env, remote.config);
  return {
    port: Number.isFinite(port) && port > 0 && port < 65536 ? port : 4747,
    host,
    dev: argv.includes('--dev'),
    demo: isTruthy(env.HABBLAUD_DEMO),
    inDocker,
    home,
    claudeDirs: discoverClaudeDirs(env, home),
    dataDir: resolve(env.HABBLAUD_DATA_DIR?.trim() || (inDocker ? '/data' : join(home, '.habblaud'))),
    usageDir: resolve(env.HABBLAUD_USAGE_DIR?.trim() || join(home, '.habblaud', 'usage')),
    allowedHosts: parseAllowedHosts(env.HABBLAUD_ALLOWED_HOSTS),
    terminal: terminalOffReason(env, host, inDocker) === undefined,
    messages: messagesOffReason(env, host, inDocker) === undefined,
    timeline: !env.HABBLAUD_TIMELINE?.trim() || isTruthy(env.HABBLAUD_TIMELINE),
    rootDir,
    version: pkg.version,
    repo: pkg.repo,
    updateCheck: !env.HABBLAUD_UPDATE_CHECK?.trim() || isTruthy(env.HABBLAUD_UPDATE_CHECK),
    codex: !env.HABBLAUD_CODEX?.trim() || isTruthy(env.HABBLAUD_CODEX),
    remote: remote.config,
    remoteWarning: remote.warning,
    ingest: !ingestOff,
    ingestWarning: ingestOff && ingestOff !== 'off' ? ingestOff : undefined,
    brand: parseBrand(env),
  };
}
