#!/usr/bin/env node
// habblaud-remote: sends one Claude Code hook event to a central Habblaud on another machine.
//
// Claude Code runs this script for each event (hooks.json; every event except SessionEnd with `async: true`, so the
// session never waits for it). It:
// 1. reads the event JSON from stdin;
// 2. keeps only what the office uses (session, folder, tool name and arguments, prompt, notification...), with texts
//    cut short; tool results only for Bash and GitHub MCP tools (the GitHub party needs them);
// 3. posts it, once, to `<HABBLAUD_SERVER_URL>/api/ingest/events` with `Authorization: Bearer
//    <HABBLAUD_SERVER_TOKEN>` (5 s deadline). A failure is dropped: the next event fixes the state.
//
// Rules: plain Node (22+), only `node:*`; never prints anything (on UserPromptSubmit and SessionStart stdout would
// become model context); always exits 0. Only https:// (or http:// to this computer, for tests).
// HABBLAUD_HOOK_DEBUG=1 writes what it does to stderr.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVENTS = new Set([
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
]);
const SEND_TIMEOUT_MS = 5_000;
const STDIN_TIMEOUT_MS = 5_000;
const MAX_STDIN = 8 * 1024 * 1024;
/** Texts inside tool arguments and results (the server only shows previews). */
const MAX_STRING = 2_000;
/** Body of one event (the server refuses above 256 KB). */
const MAX_BODY = 120_000;
const TOKEN = /^hbl1\.[a-z0-9-]{1,32}\.[A-Za-z0-9_-]{43}$/;

const debug = process.env.HABBLAUD_HOOK_DEBUG === '1' ? (msg) => process.stderr.write(`[habblaud-remote] ${msg}\n`) : () => {};
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);

/** The central server from the environment, or undefined (not configured: do nothing). */
export function serverOf(env = process.env) {
  const url = (env.HABBLAUD_SERVER_URL ?? '').trim().replace(/\/+$/, '');
  const token = (env.HABBLAUD_SERVER_TOKEN ?? '').trim();
  if (!url || !TOKEN.test(token)) return undefined;
  let u;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return undefined;
  if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return undefined;
  return { base: `${u.protocol}//${u.host}`, token };
}

/** Account id as the server calls it: the basename of CLAUDE_CONFIG_DIR (first item), or `.claude`. */
export function accountOf(env = process.env) {
  const first = (env.CLAUDE_CONFIG_DIR ?? '').split(',')[0]?.trim();
  const name = first ? basename(first.replace(/[\\/]+$/, '')) : '.claude';
  return /^[A-Za-z0-9_.-]{1,64}$/.test(name) ? name : '.claude';
}

/** Long texts cut short, deep or huge structures trimmed. */
export function trim(v, max = MAX_STRING, depth = 0) {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) : v;
  if (depth > 5 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => trim(x, max, depth + 1));
  const out = {};
  let n = 0;
  for (const [k, x] of Object.entries(v)) {
    if (n++ >= 40) break;
    out[k] = trim(x, max, depth + 1);
  }
  return out;
}

/** Tool results travel only where the office reads them: Bash (git push, gh pr/run/release) and GitHub MCP tools. */
function wantsResponse(tool) {
  return tool === 'Bash' || (typeof tool === 'string' && /^mcp__.*github/i.test(tool));
}

/** The current branch of `cwd` (for git pushes); undefined when it cannot tell quickly. */
function branchOf(cwd) {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: 1_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const b = out.trim();
    return b && b !== 'HEAD' ? b.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

/** The event as the server takes it (shared/ingest.ts, IngestEvent); undefined for events the office does not use. */
export function eventBody(input, env = process.env, now = Date.now(), opts = {}) {
  if (!isObject(input)) return undefined;
  const event = input.hook_event_name;
  if (!EVENTS.has(event) || typeof input.session_id !== 'string') return undefined;
  const body = { v: 1, id: randomUUID().replace(/-/g, ''), at: now, event, account: accountOf(env), session_id: input.session_id };
  const put = (k, v) => {
    if (v !== undefined) body[k] = v;
  };
  put('cwd', str(input.cwd, 1024));
  put('agent_id', str(input.agent_id, 128));
  put('agent_type', str(input.agent_type, 80));
  put('source', str(input.source, 32));
  put('reason', str(input.reason, 32));
  put('prompt', str(input.prompt, 4_000));
  put('tool_name', str(input.tool_name, 128));
  put('tool_use_id', str(input.tool_use_id, 128));
  if (input.tool_input !== undefined) put('tool_input', trim(input.tool_input));
  if (input.tool_response !== undefined && wantsResponse(input.tool_name)) put('tool_response', trim(input.tool_response, 6_000));
  put('error', str(input.error, 2_000));
  put('message', str(input.message, 1_000));
  put('notification_type', str(input.notification_type, 64));
  put('model', typeof input.model === 'string' ? input.model.slice(0, 128) : str(input.model?.id, 128));
  put('permission_mode', str(input.permission_mode, 32));
  const command = input.tool_name === 'Bash' && isObject(input.tool_input) ? input.tool_input.command : undefined;
  if (event === 'PostToolUse' && typeof command === 'string' && /\bgit\s+push\b/.test(command) && body.cwd) {
    put('branch', (opts.branchOf ?? branchOf)(body.cwd));
  }
  // Still too big (a huge edit): the arguments become a short preview.
  if (JSON.stringify(body).length > MAX_BODY) {
    if (body.tool_input !== undefined) body.tool_input = trim(body.tool_input, 200);
    if (body.tool_response !== undefined) body.tool_response = trim(body.tool_response, 400);
    if (JSON.stringify(body).length > MAX_BODY) {
      delete body.tool_input;
      delete body.tool_response;
    }
  }
  return body;
}

function readStdin() {
  return new Promise((ok) => {
    const chunks = [];
    let size = 0;
    const finish = (text) => {
      clearTimeout(timer);
      ok(text);
    };
    const timer = setTimeout(() => finish(undefined), STDIN_TIMEOUT_MS);
    process.stdin.on('data', (c) => {
      size += c.length;
      if (size > MAX_STDIN) return finish(undefined);
      chunks.push(c);
    });
    process.stdin.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => finish(undefined));
  });
}

/** Sends the event. Returns the HTTP status, or 0 (not configured, not an event, network failure). Never throws. */
export async function run(env = process.env, stdinText) {
  try {
    const server = serverOf(env);
    if (!server) {
      debug('HABBLAUD_SERVER_URL / HABBLAUD_SERVER_TOKEN not set: nothing to do');
      return 0;
    }
    const raw = stdinText ?? (await readStdin());
    if (!raw) return 0;
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return 0;
    }
    const body = eventBody(input, env);
    if (!body) return 0;
    const res = await fetch(`${server.base}/api/ingest/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${server.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    await res.text().catch(() => '');
    debug(`${body.event}: ${res.status}`);
    return res.status;
  } catch (err) {
    debug(`error: ${err?.message ?? err}`);
    return 0;
  }
}

function isMain() {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  // Safety net: nothing keeps the process alive past the deadline.
  setTimeout(() => process.exit(0), SEND_TIMEOUT_MS + STDIN_TIMEOUT_MS + 1_000).unref();
  run()
    .catch(() => 0)
    .finally(() => setTimeout(() => process.exit(0), 50).unref());
}
