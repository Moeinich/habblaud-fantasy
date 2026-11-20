#!/usr/bin/env node
// Hook do Habblaud para o OpenAI Codex (CLI `codex` e o app desktop, que gravam no mesmo CODEX_HOME): mostra no
// escritório o que as sessões do Codex fazem e deixa aprovar ou recusar pelo escritório os pedidos de aprovação
// (PermissionRequest). `npm run codex:install` acrescenta em <CODEX_HOME>/hooks.json, no FIM da lista de cada evento,
// um grupo que roda:
//
//   node "/caminho/do/habblaud/mod/habblaud-codex/hook.mjs"
//
// O comando nunca leva opções: o Codex guarda a confiança de cada hook (aprovada por você em /hooks) num hash que
// inclui o comando. Porta e espera ficam em ~/.habblaud/codex-hook.json ({port, permissionTimeoutS}, gravado pelo
// instalador); HABBLAUD_PORT vale como reserva (o ambiente do hook é o do processo que subiu o daemon do Codex, então
// variáveis exportadas no seu shell nem sempre chegam aqui).
//
// O hook:
// 1. lê do stdin o JSON do evento (session_id, hook_event_name, cwd, transcript_path...);
// 2. manda o evento, com os textos cortados, para POST http://127.0.0.1:<porta>/api/codex/events (prazo curto), com
//    a conta (basename do CODEX_HOME, como o servidor calcula) e o caminho do CODEX_HOME;
// 3. só no PermissionRequest: registra o pedido em POST /api/permissions (provider "codex") e espera a decisão em
//    GET /api/permissions/:id/wait até a espera do arquivo (padrão 25 s, entre 5 e 120). Aprovado: imprime a decisão
//    allow; recusado: deny com o motivo. Qualquer outra coisa ("responder no terminal", tempo esgotado, Habblaud fora
//    do ar ou sem página aberta): sai sem imprimir nada e o Codex segue a aprovação normal. Atenção: o Codex só mostra
//    a aprovação no terminal DEPOIS que o hook termina (enquanto isso, o terminal mostra o statusMessage do hook).
//
// Central server (the "Multiple machines" setup, `npm run remote:install`): when codex-hook.json also has `server`
// and `token` (or HABBLAUD_SERVER_URL / HABBLAUD_SERVER_TOKEN reach the hook), every event goes, fire-and-forget, to
// POST <server>/api/ingest/events with `Authorization: Bearer <token>` and `provider: "codex"` instead of the local
// Habblaud. Approval requests then stay in the terminal (the office only shows the agent as waiting).
//
// Regras: Node puro (22+), só `node:*`, sem dependências; nunca trava nem quebra a sessão: todo erro = sair com 0 e
// sem saída (nunca com 2, que no Codex recusa o pedido). Nunca imprime updatedInput, updatedPermissions nem interrupt
// (o Codex não os aceita: o hook "falha" sem decidir). Nos eventos de observação, nada vai para o stdout (no
// UserPromptSubmit e no SessionStart ele viraria contexto do modelo). Só fala com 127.0.0.1.
// HABBLAUD_HOOK_DEBUG=1 escreve o que acontece no stderr.
import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_PORT = 4747;
/** Espera padrão por uma decisão no escritório (segundos). */
export const DEFAULT_WAIT_S = 25;
export const MIN_WAIT_S = 5;
export const MAX_WAIT_S = 120;
/** Arquivo de configuração, em ~/.habblaud (o instalador grava). */
export const CONFIG_FILE = 'codex-hook.json';
/** Eventos mandados ao Habblaud (o PermissionRequest também, antes de registrar o pedido). */
export const OBSERVED = new Set(['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop', 'PermissionRequest']);
/** Prazo do envio de um evento: o Habblaud responde na hora (e o hook não pode atrasar o Codex). */
const EVENT_TIMEOUT_MS = 1_500;
/** O SessionEnd tem só 1 s no Codex (e roda sempre em primeiro plano). */
const SESSION_END_TIMEOUT_MS = 600;
/** Registrar o pedido: se o Habblaud não responder nisso, ele está fora do ar (ou travado). */
const REGISTER_TIMEOUT_MS = 2_000;
/** Espera máxima de cada long-poll (o servidor responde "pending" e o hook pergunta de novo). */
const POLL_S = 25;
const STDIN_TIMEOUT_MS = 5_000;
const MAX_STDIN = 8 * 1024 * 1024;
/** Textos do evento e dos argumentos mandados ao Habblaud (o servidor só mostra prévias). */
const MAX_STRING = 8_000;
/** Corpo do pedido (o servidor recusa acima de 256 KB). */
const MAX_BODY = 200_000;

/**
 * Deadline of one event sent to a central server (it may be across the network): under the 5 s timeout of the
 * observation events; SessionEnd (1 s, foreground) and PermissionRequest (the terminal approval waits for the hook) get
 * a short one.
 */
const REMOTE_TIMEOUT_MS = 3_500;
const REMOTE_SHORT_TIMEOUT_MS = 700;
/** Body of one event sent to a central server (it refuses above 256 KB). */
const REMOTE_MAX_BODY = 120_000;
/** Texts inside tool arguments and results sent to a central server (it only shows previews). */
const REMOTE_MAX_STRING = 2_000;
const TOKEN = /^hbl1\.[a-z0-9-]{1,32}\.[A-Za-z0-9_-]{43}$/;

const debug = process.env.HABBLAUD_HOOK_DEBUG === '1' ? (msg) => process.stderr.write(`[habblaud-codex] ${msg}\n`) : () => {};

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const validPort = (p) => Number.isInteger(p) && p > 0 && p < 65_536;

/** Caminho absoluto, com `~`/`$HOME` expandidos e sem barra final (como o servidor normaliza as pastas das contas). */
function expandHome(p, home) {
  const abs = resolve(p.trim().replace(/^~(?=[\\/]|$)/, home).replace(/\$\{HOME\}|\$HOME\b/g, home));
  return abs.length > 1 ? abs.replace(/[\\/]+$/, '') : abs;
}

/** The central server ({base, token}) from `server`/`token`, or undefined when missing or invalid. */
export function remoteOf(server, token) {
  const url = typeof server === 'string' ? server.trim().replace(/\/+$/, '') : '';
  const tok = typeof token === 'string' ? token.trim() : '';
  if (!url || !TOKEN.test(tok)) return undefined;
  let u;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return undefined;
  if (u.username || u.password || u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) return undefined;
  return { base: `${u.protocol}//${u.host}`, token: tok };
}

/**
 * Porta e espera: ~/.habblaud/codex-hook.json ({port, permissionTimeoutS}); sem porta no arquivo, HABBLAUD_PORT;
 * senão os padrões. Arquivo ausente ou ilegível = padrões.
 */
export function readConfig(env = process.env) {
  const home = env.HOME || homedir();
  let file;
  try {
    file = JSON.parse(readFileSync(join(home, '.habblaud', CONFIG_FILE), 'utf8'));
  } catch {
    file = undefined;
  }
  const f = isObject(file) ? file : {};
  const filePort = Number(f.port);
  const envPort = Number.parseInt(env.HABBLAUD_PORT ?? '', 10);
  const wait = Number(f.permissionTimeoutS);
  const out = {
    port: validPort(filePort) ? filePort : validPort(envPort) ? envPort : DEFAULT_PORT,
    waitMs: (Number.isFinite(wait) && wait > 0 ? Math.min(MAX_WAIT_S, Math.max(MIN_WAIT_S, wait)) : DEFAULT_WAIT_S) * 1_000,
  };
  const remote = remoteOf(f.server, f.token) ?? remoteOf(env.HABBLAUD_SERVER_URL, env.HABBLAUD_SERVER_TOKEN);
  if (remote) out.remote = remote;
  return out;
}

/**
 * CODEX_HOME da sessão: a variável, se veio; senão a pasta acima de sessions/AAAA/MM/DD/ (ou de archived_sessions/)
 * no transcript_path; senão ~/.codex.
 */
export function codexHomeOf(env, input) {
  const home = env.HOME || homedir();
  const fromEnv = typeof env.CODEX_HOME === 'string' ? env.CODEX_HOME.trim() : '';
  if (fromEnv) return expandHome(fromEnv, home);
  const t = typeof input?.transcript_path === 'string' ? input.transcript_path : '';
  const m = /^(.+)[\\/]sessions[\\/]\d{4}[\\/]\d{2}[\\/]\d{2}[\\/][^\\/]+$/.exec(t) ?? /^(.+)[\\/]archived_sessions[\\/][^\\/]+$/.exec(t);
  if (m && isAbsolute(m[1])) return expandHome(m[1], home);
  return join(home, '.codex');
}

/** Id da conta = basename do CODEX_HOME (como o servidor dá ids às contas; colisões ele resolve pelo caminho). */
export function accountOf(codexHome) {
  return basename(codexHome) || codexHome;
}

/** Corta textos longos (saída de comando, patch enorme...). */
export function trimInput(v, max = MAX_STRING, depth = 0) {
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) : v;
  if (depth > 8 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => trimInput(x, max, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = trimInput(x, max, depth + 1);
  return out;
}

/** O valor com os textos cortados; se ainda ficar grande demais no corpo, corta mais curto. */
function fitted(v, size) {
  let out = v;
  for (const max of [MAX_STRING, 1_000, 200]) {
    out = trimInput(v, max);
    if (size(out) <= MAX_BODY) break;
  }
  return out;
}

/** Corpo de POST /api/codex/events: o stdin do hook inteiro, com os textos cortados. */
export function eventBody(input, account, codexHome) {
  const body = { account, codexHome, event: input };
  body.event = fitted(input, (event) => JSON.stringify({ ...body, event }).length);
  return body;
}

/** Tool results travel to a central server only where the office reads them: shell commands and GitHub MCP tools. */
function wantsResponse(tool) {
  return typeof tool === 'string' && (/^(Bash|shell|shell_command|local_shell|exec_command)$/.test(tool) || /^mcp__.*github/i.test(tool));
}

/** Body of POST /api/ingest/events (shared/ingest.ts, IngestEvent) for a central server; undefined = not an event. */
export function ingestBody(input, account, now = Date.now()) {
  if (!isObject(input) || typeof input.session_id !== 'string' || !input.session_id) return undefined;
  const str = (v, max) => (typeof v === 'string' && v ? v.slice(0, max) : undefined);
  const body = { v: 1, id: randomUUID().replace(/-/g, ''), at: now, event: input.hook_event_name, provider: 'codex', account, session_id: input.session_id };
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
  if (input.tool_input !== undefined) put('tool_input', trimInput(input.tool_input, REMOTE_MAX_STRING));
  if (input.tool_response !== undefined && wantsResponse(input.tool_name)) put('tool_response', trimInput(input.tool_response, 6_000));
  put('model', typeof input.model === 'string' ? input.model.slice(0, 128) : str(input.model?.id, 128));
  put('permission_mode', str(input.permission_mode, 32));
  // Still too big (a huge patch): the arguments become a short preview, or go away.
  if (JSON.stringify(body).length > REMOTE_MAX_BODY) {
    if (body.tool_input !== undefined) body.tool_input = trimInput(body.tool_input, 200);
    if (body.tool_response !== undefined) body.tool_response = trimInput(body.tool_response, 400);
    if (JSON.stringify(body).length > REMOTE_MAX_BODY) {
      delete body.tool_input;
      delete body.tool_response;
    }
  }
  return body;
}

/** Sends one event to the central server. Returns the HTTP status, or 0 (network failure). */
async function sendRemote(remote, body, timeoutMs) {
  try {
    const res = await fetch(`${remote.base}/api/ingest/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${remote.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.text().catch(() => '');
    return res.status;
  } catch (err) {
    debug(`remote: ${err?.name ?? 'error'} ${err?.message ?? ''}`);
    return 0;
  }
}

/** Corpo de POST /api/permissions: só o que o Habblaud usa (nada do transcript_path). */
export function permissionBody(input, account, codexHome, timeoutMs) {
  const body = { provider: 'codex', account, codexHome, session_id: input.session_id, tool_name: input.tool_name, tool_input: {}, timeout_ms: timeoutMs };
  for (const k of ['agent_id', 'agent_type', 'cwd', 'turn_id']) if (typeof input[k] === 'string') body[k] = input[k];
  body.tool_input = fitted(isObject(input.tool_input) ? input.tool_input : {}, (toolInput) => JSON.stringify({ ...body, tool_input: toolInput }).length);
  return body;
}

/** Saída do hook para uma decisão do Habblaud (undefined = sair sem decidir). Só allow e deny (+ message). */
export function decisionOutput(result) {
  if (!result || result.status !== 'decided') return undefined;
  if (result.behavior === 'allow') return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
  if (result.behavior === 'deny') {
    const reason = typeof result.message === 'string' && result.message.trim() ? result.message.trim().slice(0, 1_000) : '';
    const message = reason ? `Recusado pelo usuário no Habblaud: ${reason}` : 'Recusado pelo usuário no Habblaud.';
    return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message } } };
  }
  return undefined;
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

/** Requisição ao Habblaud local; null = fora do ar, tempo esgotado ou resposta ilegível. */
async function call(base, method, path, body, timeoutMs) {
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  } catch (err) {
    debug(`${method} ${path}: ${err?.name ?? 'erro'} ${err?.message ?? ''}`);
    return null;
  }
}

/** Manda o evento e, no PermissionRequest, decide o pedido (ou não). Devolve a saída a imprimir, ou undefined. Nunca lança. */
export async function run(env = process.env, stdinText) {
  const startedAt = Date.now();
  try {
    const raw = stdinText ?? (await readStdin());
    if (!raw) return undefined;
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return undefined;
    }
    if (!isObject(input) || typeof input.hook_event_name !== 'string' || typeof input.session_id !== 'string' || !input.session_id) return undefined;
    const event = input.hook_event_name;
    if (!OBSERVED.has(event)) return undefined;

    const cfg = readConfig(env);
    const codexHome = codexHomeOf(env, input);
    const account = accountOf(codexHome);
    if (cfg.remote) {
      const body = ingestBody(input, account);
      if (body) debug(`${event} -> ${cfg.remote.base}: ${await sendRemote(cfg.remote, body, event === 'SessionEnd' || event === 'PermissionRequest' ? REMOTE_SHORT_TIMEOUT_MS : REMOTE_TIMEOUT_MS)}`);
      return undefined;
    }
    const base = `http://127.0.0.1:${cfg.port}`;
    const sent = await call(base, 'POST', '/api/codex/events', eventBody(input, account, codexHome), event === 'SessionEnd' ? SESSION_END_TIMEOUT_MS : EVENT_TIMEOUT_MS);
    debug(`${event}: ${sent ? `${sent.status} ${JSON.stringify(sent.json ?? null)}` : 'Habblaud fora do ar'}`);
    if (event !== 'PermissionRequest' || typeof input.tool_name !== 'string' || !input.tool_name) return undefined;
    // Sem resposta nem ao evento: o Habblaud está fora do ar (ou travado); a aprovação segue no terminal.
    if (!sent) return undefined;

    // A espera conta desde o início do hook (o Codex só mostra a aprovação no terminal quando ele termina).
    const deadline = startedAt + cfg.waitMs;
    const reg = await call(base, 'POST', '/api/permissions', permissionBody(input, account, codexHome, Math.max(0, deadline - Date.now())), REGISTER_TIMEOUT_MS);
    if (!reg || reg.status !== 201 || typeof reg.json?.id !== 'string') {
      debug(`sem desvio (${reg ? `${reg.status} ${JSON.stringify(reg.json ?? null)}` : 'Habblaud fora do ar'})`);
      return undefined;
    }
    const id = encodeURIComponent(reg.json.id);
    for (;;) {
      const left = deadline - Date.now();
      if (left <= 0) {
        debug('tempo esgotado: vale o terminal');
        return undefined;
      }
      const waitS = Math.max(0.05, Math.min(POLL_S, left / 1_000));
      const r = await call(base, 'GET', `/api/permissions/${id}/wait?timeout=${waitS}`, undefined, waitS * 1_000 + 5_000);
      if (!r || r.status !== 200) return undefined;
      if (r.json?.status === 'pending') continue;
      debug(`resposta: ${JSON.stringify(r.json)}`);
      return decisionOutput(r.json);
    }
  } catch (err) {
    debug(`erro: ${err?.message ?? err}`);
    return undefined;
  }
}

export async function main() {
  const { waitMs } = readConfig();
  // Rede de segurança: nada mantém o processo vivo além da espera (o Codex também tem o tempo limite do hook).
  setTimeout(() => process.exit(0), waitMs + 15_000).unref();
  // (with a central server the hook never waits for a decision: REMOTE_TIMEOUT_MS + the stdin deadline at most)
  const out = await run();
  // Sem process.exit() logo depois do fetch: no Windows (Node 23 até 24.19) ele derruba o processo com 0xC0000409
  // enquanto o V8 ainda compila em segundo plano o parser do fetch (nodejs/node#56645). O processo sai sozinho quando
  // o loop esvazia, o que também espera a escrita da decisão no pipe; se algo ainda segurar o loop, o process.exit
  // vem 1 s depois.
  const finish = () => setTimeout(() => process.exit(0), 1_000).unref();
  if (out) process.stdout.write(`${JSON.stringify(out)}\n`, finish);
  else finish();
}

function isMain() {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) main().catch(() => process.exit(0));
