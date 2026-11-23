// /api/ingest/*: other machines sending their sessions to this server (HABBLAUD_INGEST=1).
//
// Only on the remote port (HTTPS) and before its cookie login: each request carries the machine's token in
// `Authorization: Bearer`. On the local port these routes do not exist (404). Every id a machine sends is prefixed with
// `r:<machineId>:` here, so a machine can only see and act on its own sessions.
//
//   GET  /api/ingest/hello                      {ok, machine, version, permissions, messages}: checks the token
//   POST /api/ingest/events                     one hook event (shared/ingest.ts): 202 {ok, applied}
//   POST /api/ingest/usage                      plan usage of an account (the statusline-tap JSON + account): 202
//   POST /api/ingest/permissions                permission hook request (as POST /api/permissions): 201 {id} | 200 {skip}
//   GET  /api/ingest/permissions/:id/wait       long-poll (as GET /api/permissions/:id/wait)
//   POST /api/ingest/inbox                      habblaud-mensagens round (as POST /api/mod/inbox)
//   POST /api/ingest/inbox/ack                  (as POST /api/mod/inbox/ack)
//   GET  /api/ingest/summary?session=&account=  the habblaud mod's status line (as GET /api/mod/summary)
//
// Limits: 256 KB per body; per machine, a token bucket of 60 requests refilled at 30/s (429 with Retry-After: 1);
// wrong tokens slow down the next wrong ones (LoginThrottle: after 5 failures in a row, 1 s up to 5 min); a valid
// token is never held back by them.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MachineRef, ModSummary } from '../../shared/types';
import { remoteId, remotePrefix } from '../../shared/ingest';
import { tr } from '../../shared/i18n';
import { HttpError, readJson, sendJson } from '../http/app';
import { LoginThrottle } from '../http/remote';
import { InvalidRequest as InvalidMessage, type MessageRegistry } from '../messages/registry';
import { waitMs } from '../permissions/http';
import { InvalidRequest as InvalidPermission, type PermissionRegistry } from '../permissions/registry';
import type { IngestAccounts } from './accounts';
import type { MachineStore } from './machines';
import { INGEST_BODY_MAX, InvalidIngest, parseIngestEvent, parseIngestUsage } from './protocol';
import type { IngestSource } from './source';

const BUCKET_SIZE = 60;
const REFILL_PER_S = 30;
const SESSION = /^[A-Za-z0-9_.:@-]{1,128}$/;
const ACCOUNT = /^[A-Za-z0-9_.-]{1,64}$/;
const WAIT_ROUTE = /^\/api\/ingest\/permissions\/([A-Za-z0-9_-]{1,64})\/wait$/;

export interface IngestDeps {
  machines: Pick<MachineStore, 'verify'>;
  source: IngestSource;
  accounts: IngestAccounts;
  /** Answering through the office is on (the terminal lock): undefined = permission requests get {skip: 'off'}. */
  permissions?: PermissionRegistry;
  /** Messages through the office are on. */
  messages?: MessageRegistry;
  /** GET /api/mod/summary for one session (http/app.ts, modSummary). */
  summary: (own: { session?: string; account?: string }) => ModSummary;
  version: string;
  now?: () => number;
}

function rec(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function bearer(req: IncomingMessage): string | undefined {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return undefined;
  const m = /^Bearer\s+(\S{1,200})$/i.exec(h.trim());
  return m?.[1];
}

class Buckets {
  private readonly map = new Map<string, { tokens: number; at: number }>();
  constructor(private readonly now: () => number) {}
  take(id: string): boolean {
    const now = this.now();
    const b = this.map.get(id) ?? { tokens: BUCKET_SIZE, at: now };
    b.tokens = Math.min(BUCKET_SIZE, b.tokens + ((now - b.at) / 1000) * REFILL_PER_S);
    b.at = now;
    this.map.set(id, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}

/** Returns a handler for /api/ingest/*: true when it answered (any /api/ingest path), false for everything else. */
export function createIngestHandler(deps: IngestDeps): (req: IncomingMessage, res: ServerResponse, url: URL) => boolean {
  const now = deps.now ?? Date.now;
  const throttle = new LoginThrottle(now);
  const buckets = new Buckets(now);

  const fail = (res: ServerResponse, err: unknown) => {
    if (res.headersSent) return void res.destroy();
    if (err instanceof HttpError) sendJson(res, err.status, { error: err.message });
    else if (err instanceof InvalidIngest || err instanceof InvalidPermission || err instanceof InvalidMessage) sendJson(res, 400, { error: err.message });
    else sendJson(res, 500, { error: tr('internal error') });
  };

  /** The session id of a body, prefixed with the machine (400 if missing or malformed). */
  const sessionOf = (m: MachineRef, v: unknown, field: string): string => {
    if (typeof v !== 'string' || !SESSION.test(v)) throw new InvalidIngest(`invalid ${field}`);
    return remoteId(m.id, v);
  };
  const accountOf = (m: MachineRef, v: unknown): string | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v !== 'string' || !ACCOUNT.test(v)) throw new InvalidIngest('invalid account');
    return remoteId(m.id, v);
  };

  const events = async (m: MachineRef, req: IncomingMessage, res: ServerResponse) => {
    const ev = parseIngestEvent(await readJson(req, INGEST_BODY_MAX), now());
    const applied = deps.source.apply(m, ev);
    sendJson(res, 202, { ok: true, applied });
  };

  const usage = async (m: MachineRef, req: IncomingMessage, res: ServerResponse) => {
    const u = parseIngestUsage(await readJson(req, INGEST_BODY_MAX));
    deps.accounts.setUsage(m, u.account, u.body);
    sendJson(res, 202, { ok: true });
  };

  const permission = async (m: MachineRef, req: IncomingMessage, res: ServerResponse) => {
    const body = rec(await readJson(req, INGEST_BODY_MAX));
    if (!body) throw new InvalidIngest('expected a JSON object');
    if (!deps.permissions) return sendJson(res, 200, { skip: 'off' });
    // Only Claude Code requests travel between machines (the Codex hook stays on its own machine).
    if (body.provider !== undefined && body.provider !== 'claude') return sendJson(res, 200, { skip: 'unsupported-tool' });
    const r = deps.permissions.register({ ...body, provider: undefined, account: undefined, codexHome: undefined, session_id: sessionOf(m, body.session_id, 'session_id') });
    if ('skip' in r) sendJson(res, 200, { skip: r.skip });
    else sendJson(res, 201, r);
  };

  const wait = (m: MachineRef, req: IncomingMessage, res: ServerResponse, url: URL, id: string) => {
    const registry = deps.permissions;
    const owner = registry?.agentOf(id);
    if (!registry || !owner?.startsWith(remotePrefix(m.id))) return sendJson(res, 404, { error: tr('unknown request') });
    const w = registry.wait(id, waitMs(url));
    if (!w) return sendJson(res, 404, { error: tr('unknown request') });
    req.socket.setTimeout(0);
    res.on('close', () => {
      if (!res.writableEnded) w.cancel();
    });
    w.result.then(
      (result) => {
        if (!res.destroyed && !res.writableEnded) sendJson(res, 200, result);
      },
      (err) => fail(res, err),
    );
  };

  const inbox = async (m: MachineRef, req: IncomingMessage, res: ServerResponse) => {
    const body = rec(await readJson(req, INGEST_BODY_MAX));
    if (!body) throw new InvalidIngest('expected a JSON object');
    if (!deps.messages) return sendJson(res, 200, { messages: [] });
    const account = accountOf(m, body.account);
    const messages = deps.messages.inbox({ session: sessionOf(m, body.session, 'session'), ...(account ? { account } : {}) });
    sendJson(res, 200, { messages });
  };

  const ack = async (m: MachineRef, req: IncomingMessage, res: ServerResponse) => {
    const body = rec(await readJson(req, INGEST_BODY_MAX));
    if (!body) throw new InvalidIngest('expected a JSON object');
    if (deps.messages) deps.messages.ack({ session: sessionOf(m, body.session, 'session'), results: body.results });
    sendJson(res, 200, { ok: true });
  };

  const summary = (m: MachineRef, res: ServerResponse, url: URL) => {
    const session = url.searchParams.get('session');
    const account = url.searchParams.get('account');
    const own: { session?: string; account?: string } = {};
    if (session) own.session = sessionOf(m, session, 'session');
    if (account) own.account = accountOf(m, account);
    sendJson(res, 200, deps.summary(own));
  };

  return (req, res, url) => {
    const path = url.pathname;
    if (path !== '/api/ingest' && !path.startsWith('/api/ingest/')) return false;
    const method = req.method ?? 'GET';
    // A valid token always passes: the brake only slows down the wrong ones (a stranger guessing must not lock the
    // real machines out).
    const machine = deps.machines.verify(bearer(req));
    if (!machine) {
      req.resume();
      const wait = throttle.retryAfter();
      if (wait > 0) {
        res.setHeader('Retry-After', String(wait));
        sendJson(res, 429, { error: tr('Too many attempts. Try again in {0} s.', [wait]) });
        return true;
      }
      throttle.fail();
      res.setHeader('WWW-Authenticate', 'Bearer');
      sendJson(res, 401, { error: tr('invalid machine token: create one with npm run ingest:token -- add <name> on the server') });
      return true;
    }
    if (!buckets.take(machine.id)) {
      req.resume();
      res.setHeader('Retry-After', '1');
      sendJson(res, 429, { error: tr('too many requests from this machine') });
      return true;
    }
    const post = (handler: (m: MachineRef, req: IncomingMessage, res: ServerResponse) => Promise<void>) => {
      if (method !== 'POST') {
        req.resume();
        res.setHeader('Allow', 'POST');
        return sendJson(res, 405, { error: tr('method not allowed') });
      }
      handler(machine, req, res).catch((err) => fail(res, err));
    };
    const get = (handler: () => void) => {
      req.resume();
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return sendJson(res, 405, { error: tr('method not allowed') });
      }
      try {
        handler();
      } catch (err) {
        fail(res, err);
      }
    };
    if (path === '/api/ingest/hello') {
      get(() => sendJson(res, 200, { ok: true, machine, version: deps.version, permissions: !!deps.permissions, messages: !!deps.messages }));
    } else if (path === '/api/ingest/events') post(events);
    else if (path === '/api/ingest/usage') post(usage);
    else if (path === '/api/ingest/permissions') post(permission);
    else if (path === '/api/ingest/inbox') post(inbox);
    else if (path === '/api/ingest/inbox/ack') post(ack);
    else if (path === '/api/ingest/summary') get(() => summary(machine, res, url));
    else {
      const m = WAIT_ROUTE.exec(path);
      if (m) get(() => wait(machine, req, res, url, m[1]));
      else {
        req.resume();
        sendJson(res, 404, { error: tr('unknown route') });
      }
    }
    return true;
  };
}
