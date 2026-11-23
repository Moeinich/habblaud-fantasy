// Messages from the office (Claude Code 2.1.287+): brings into the session what you type in Habblaud (in the agent
// panel or in the T-key terminal), as if you had typed it in the terminal.
//
// What it does, and `claude plugin validate` lists exactly what the module calls (the output is in mod/README.md):
//
// 1. Every 2 s, only where the session draws (empty `$.session.surfaces()` = `claude -p`/SDK: nothing to do) or in a
//    desktop app session (CLAUDE_CODE_ENTRYPOINT=claude-desktop: SDK underneath, no surface while off screen), it asks
//    the local Habblaud whether there are messages for it: POST http://127.0.0.1:<HABBLAUD_PORT or 4747>/api/mod/inbox with
//    {session, account}. The query also marks the session as present: that is what lights up, in the office, this
//    agent's message box. When it is down, or answers anything other than 2xx (403 = messages turned off
//    in Habblaud; 404 = a version without the route), it switches to asking every 30 s until it is back.
// 2. Each message, in order, goes to the session through `$.prompt.submit({ text, asUser: true })`: the model reads it as
//    yours, without the "The habblaud-mensagens plugin sent a message" (the session log still names the plugin). The
//    text goes exactly as it arrived. `{drop}` (a hook rejected it) or an exception = failure, with the reason.
//    With the session in the middle of a turn, Claude Code holds the prompt until it is free and the call may take a while
//    to return: the wait per message is at most 2 s. Past that, the message is in the session's queue and counts
//    as delivered, and the following ones in the same round go right after, in order, without waiting. That way the round never
//    exceeds a few seconds: the presence (10 s on the server) and the acknowledgement (30 s) don't expire because of a
//    busy session. The price: a hook that rejects the message after those 2 s doesn't reach the office.
// 3. A single POST /api/mod/inbox/ack with {session, results: [{id, ok, error?}]}. No messages, no ack.
//
// Why a plugin separate from the `habblaud` mod: that one only observes (plan usage, the notice under the prompt,
// /habblaud) and never changes what the session does. This one acts: it types into the session on your behalf. Separate, you can
// go without it (npm run mod:install -- --sem-mensagens) and each one's static analysis stays short.
//
// Rules: no hook throws (a hook that throws is skipped, but whatever it left half-done stays): each step has its own
// try/catch and failure = silence. One round at a time (a slow Habblaud doesn't pile up queries). No $.process,
// $.model, $.fs, reading the conversation or tool decisions; the network is only 127.0.0.1. The state lives in module
// variables: a hot reload starts from scratch (a message fetched and not acknowledged fails on the server within 30 s).
// Claude Code may load the plugin from a copy of its own: the path helpers are copies of the ones in
// mod/habblaud/hooks/register.ts, not imports.
//
// Claude Code's static analysis: each call is written out in full ($.noun.method), the event name is
// always a string literal and `$` is only passed to functions declared at the top of this file.
import type { EngineInterface, HttpResponse, Register } from 'claude-code'

/** Habblaud's default port (the same as the server, the mod and docker-compose). */
export const DEFAULT_PORT = 4747
/** Interval of the queries to Habblaud; when it is down, it backs off to the second one until it is back. */
export const POLL_MS = 2_000
export const OFFLINE_POLL_MS = 30_000
/** How long to wait for the local Habblaud to answer (`$.http.fetch` doesn't take an AbortSignal: it races a timer). */
export const FETCH_TIMEOUT_MS = 2_000
/** The same deadline to a central server on another machine (network, TLS). */
export const SERVER_FETCH_TIMEOUT_MS = 5_000
/** How long to wait for `$.prompt.submit` to return before treating the message as queued in the session. */
export const SUBMIT_WAIT_MS = 2_000
/** Maximum length of a failure reason (it comes from a hook or an exception; the message text is never cut). */
export const MAX_REASON = 500

/** A message as POST /api/mod/inbox delivers it (shared/types.ts, InboxMessage). */
export interface InboxMessage {
  id: string
  /** The text as it was typed; empty when the server sent something that isn't text. */
  text: string
}

/** Result of a message, as POST /api/mod/inbox/ack receives it. */
export interface AckResult {
  id: string
  ok: boolean
  error?: string
}

/** Outcome of a `$.prompt.submit`. */
type Submitted = { ok: true } | { ok: false; error: string }

interface ModEnv {
  /** The account id (the folder name, as the server calls it); absent without HOME (or USERPROFILE) and CLAUDE_CONFIG_DIR. */
  accountId?: string
  port: number
  /** Central server on another machine (serverOf); absent = the local Habblaud. */
  server?: { base: string; token: string }
  /** A Claude desktop app session (CLAUDE_CODE_ENTRYPOINT=claude-desktop): runs as an SDK and only has a surface
   *  while it is on the app screen, but it is interactive and gets prompts anyway. */
  desktop: boolean
}

// ---------------------------------------------------------------------------------------------
// Pure functions (tested in tests/habblaud-mensagens.test.ts)
// ---------------------------------------------------------------------------------------------

/**
 * Normalises a path (repeated slashes, `.`, `..` and the trailing slash): the mod environment has no node:path. A copy
 * of mod/habblaud: Windows paths (with a drive or UNC) come out with `/` and the drive counts as the root; on the others, `\`
 * is part of the name.
 */
export function normalizePath(p: string): string {
  const win = /^(?:[A-Za-z]:|\\\\)/.test(p)
  const slashed = win ? p.replace(/\\/g, '/') : p
  const drive = /^[A-Za-z]:(?=\/|$)/.exec(slashed)?.[0] ?? (win && slashed.startsWith('//') ? '/' : '')
  const rest = slashed.slice(drive.length)
  const abs = rest.startsWith('/')
  const out: string[] = []
  for (const seg of rest.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!abs) out.push(seg)
      continue
    }
    out.push(seg)
  }
  const joined = out.join('/')
  return drive + (abs ? `/${joined}` : joined || (drive ? '' : '.'))
}

/** A leading `~` becomes HOME. */
function expandHome(p: string, home: string | undefined): string {
  return home && /^~(?=[\\/]|$)/.test(p) ? home + p.slice(1) : p
}

/** The account's config dir: the first item of CLAUDE_CONFIG_DIR (with `~` expanded) or ~/.claude. */
export function configDirOf(claudeConfigDir: string | undefined, home: string | undefined): string | undefined {
  const first = (claudeConfigDir ?? '').split(',')[0]?.trim() ?? ''
  if (first) return normalizePath(expandHome(first, home))
  return home ? normalizePath(`${home}/.claude`) : undefined
}

/** Account id = folder name (the server's AccountInfo.id, e.g. ".claude-conta2"). */
export function accountIdOf(configDir: string): string | undefined {
  const name = configDir.split('/').filter(Boolean).pop()
  return name && name !== '.' && name !== '..' ? name : undefined
}

export function portOf(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isInteger(n) && n > 0 && n < 65_536 ? n : DEFAULT_PORT
}

/**
 * Central Habblaud server (another machine, HABBLAUD_SERVER_URL + HABBLAUD_SERVER_TOKEN): its base URL and the machine
 * token, or undefined (talk to the local Habblaud as always). Only https://, or http:// to this computer itself (tests).
 * Same function in mod/habblaud and mod/habblaud-mensagens.
 */
export function serverOf(url: string | undefined, token: string | undefined): { base: string; token: string } | undefined {
  const u = (url ?? '').trim().replace(/\/+$/, '')
  const t = (token ?? '').trim()
  if (!u || !/^hbl1\.[a-z0-9-]{1,32}\.[A-Za-z0-9_-]{43}$/.test(t)) return undefined
  const m = /^(https?):\/\/([^/?#@\s]+)$/.exec(u)
  if (!m) return undefined
  const host = m[2].replace(/:\d+$/, '')
  if (m[1] === 'http' && host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') return undefined
  return { base: u, token: t }
}

/** Body of POST /api/mod/inbox: the account only when it is known. */
export function inboxBody(session: string, account: string | undefined): string {
  return JSON.stringify(account ? { session, account } : { session })
}

/** Body of POST /api/mod/inbox/ack. */
export function ackBody(session: string, results: readonly AckResult[]): string {
  return JSON.stringify({ session, results })
}

/**
 * Reads the POST /api/mod/inbox response; outside the format = undefined (counts as "down"). An item without an id is left out
 * (there is no way to acknowledge it); with an id and no text, it goes in with empty text, to be acknowledged as a failure instead of the
 * server waiting 30 s.
 */
export function parseInbox(text: string): InboxMessage[] | undefined {
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return undefined
  const list = (j as Record<string, unknown>).messages
  if (!Array.isArray(list)) return undefined
  const out: InboxMessage[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    if (typeof m.id !== 'string' || !m.id) continue
    out.push({ id: m.id, text: typeof m.text === 'string' ? m.text : '' })
  }
  return out
}

/** A failure reason on a single line, with a limited length: the text of a `{drop}` or the message of an exception. */
export function reasonText(raw: unknown, fallback: string): string {
  const msg = typeof raw === 'string' ? raw : raw && typeof (raw as { message?: unknown }).message === 'string' ? (raw as { message: string }).message : ''
  const line = msg.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!line) return fallback
  return line.length > MAX_REASON ? `${line.slice(0, MAX_REASON - 1)}…` : line
}

// ---------------------------------------------------------------------------------------------
// Module state (gone on a hot reload) and what talks to Claude Code
// ---------------------------------------------------------------------------------------------

let env: ModEnv | undefined
let timer: { cancel: () => void } | undefined
let timerMs = 0
/** One round at a time: a slow Habblaud or a busy session doesn't stack rounds. */
let polling = false

/** The session environment, read once per load (each name written out in full, as the analysis requires). */
async function readEnv($: EngineInterface): Promise<ModEnv> {
  if (env) return env
  // On Windows, HOME only exists if someone sets it: USERPROFILE applies (the same order as the habblaud mod).
  const home = (await $.env.get('HOME'))?.trim() || (await $.env.get('USERPROFILE'))?.trim() || undefined
  const configDir = configDirOf(await $.env.get('CLAUDE_CONFIG_DIR'), home)
  const next: ModEnv = {
    port: portOf(await $.env.get('HABBLAUD_PORT')),
    desktop: (await $.env.get('CLAUDE_CODE_ENTRYPOINT'))?.trim() === 'claude-desktop',
  }
  const server = serverOf(await $.env.get('HABBLAUD_SERVER_URL'), await $.env.get('HABBLAUD_SERVER_TOKEN'))
  if (server) next.server = server
  const accountId = configDir ? accountIdOf(configDir) : undefined
  if (accountId) next.accountId = accountId
  env = next
  return next
}

/** Whatever `promise` resolves to within `ms`; past that, undefined (the promise carries on by itself). */
async function waitAtMost<T>($: EngineInterface, promise: Promise<T>, ms: number): Promise<T | undefined> {
  let wait: { cancel: () => void } | undefined
  const timeout = new Promise<undefined>((resolve) => {
    wait = $.clock.after(ms, () => resolve(undefined))
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    wait?.cancel()
  }
}

/**
 * POST of a JSON to Habblaud with a 2 s deadline (5 s to a central server): the response, or undefined (down, stuck).
 * Never throws. With a central server, `/api/mod/inbox…` becomes `/api/ingest/inbox…` with the machine token.
 */
async function postJson($: EngineInterface, e: ModEnv, path: string, body: string): Promise<HttpResponse | undefined> {
  try {
    // Without the Content-Type, the server's guard rejects the POST (415).
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' }
    let url = `http://127.0.0.1:${e.port}${path}`
    if (e.server) {
      url = `${e.server.base}${path.replace('/api/mod/', '/api/ingest/')}`
      headers.authorization = `Bearer ${e.server.token}`
    }
    const request = $.http.fetch(url, { method: 'POST', headers, body })
    return await waitAtMost($, request, e.server ? SERVER_FETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS)
  } catch {
    return undefined
  }
}

/** A message to the session, as if you had typed it. Never throws. */
async function submitOne($: EngineInterface, text: string): Promise<Submitted> {
  try {
    const r = await $.prompt.submit({ text, asUser: true })
    if (typeof r?.drop === 'string') return { ok: false, error: reasonText(r.drop, 'a session hook rejected the message') }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: reasonText(err, 'the session did not accept the message') }
  }
}

/** Sends the messages to the session, in order, and returns the result of each one. Never throws. */
async function deliver($: EngineInterface, messages: readonly InboxMessage[]): Promise<AckResult[]> {
  const results: AckResult[] = []
  /** A call went past the deadline: the session is busy and the following ones queue up behind it, without waiting. */
  let queued = false
  for (const m of messages) {
    if (!m.text.trim()) {
      results.push({ id: m.id, ok: false, error: 'empty message' })
      continue
    }
    const submitted = submitOne($, m.text)
    if (queued) {
      void submitted
      results.push({ id: m.id, ok: true })
      continue
    }
    const out = await waitAtMost($, submitted, SUBMIT_WAIT_MS)
    if (!out) {
      queued = true
      results.push({ id: m.id, ok: true })
    } else results.push(out.ok ? { id: m.id, ok: true } : { id: m.id, ok: false, error: out.error })
  }
  return results
}

/** (Re)schedules the rounds: 2 s with Habblaud up, 30 s when it is down. */
function schedule($: EngineInterface, ms: number): void {
  if (timer && timerMs === ms) return
  timer?.cancel()
  timerMs = ms
  timer = $.clock.every(ms, () => {
    void round($)
  })
}

/** One round: fetches this session's messages, sends each one and acknowledges. Never throws. */
async function round($: EngineInterface): Promise<void> {
  if (polling) return
  polling = true
  try {
    const e = await readEnv($)
    const surfaces = await $.session.surfaces()
    if (!surfaces.length && !e.desktop) return
    const session = await $.session.id()
    const res = await postJson($, e, '/api/mod/inbox', inboxBody(session, e.accountId))
    const messages = res?.ok ? parseInbox(res.text) : undefined
    if (!messages) {
      schedule($, OFFLINE_POLL_MS)
      return
    }
    schedule($, POLL_MS)
    if (!messages.length) return
    const results = await deliver($, messages)
    // The acknowledgement failed: the server marks the messages as failed within 30 s ("the session did not confirm delivery").
    await postJson($, e, '/api/mod/inbox/ack', ackBody(session, results))
  } catch {
    // silence: the next round tries again
  } finally {
    polling = false
  }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    try {
      schedule($, POLL_MS)
    } catch {
      // without the rounds, the session carries on as usual
    }
    return next(e)
  })
}
