// /api/ingest/*: machine tokens, validation, rate limit, and the permission and inbox paths of another machine.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setQuiet } from '../log';
import { MessageRegistry } from '../messages/registry';
import { Office } from '../model/office';
import { NameStore } from '../model/names';
import { PermissionRegistry } from '../permissions/registry';
import { tempDir } from '../test/fixtures';
import { IngestAccounts } from './accounts';
import { createIngestHandler } from './http';
import { MachineStore } from './machines';
import { parseIngestEvent, cleanValue } from './protocol';
import { IngestSource } from './source';

setQuiet(true);

const SID = '11111111-2222-3333-4444-555555555555';
const closers: Array<() => void> = [];
afterEach(() => {
  while (closers.length) closers.pop()!();
});

async function setup(opts: { permissions?: boolean } = {}) {
  const tmp = tempDir();
  closers.push(tmp.cleanup);
  const machines = new MachineStore(join(tmp.dir, 'ingest-machines.json'));
  const tokenA = machines.add('mac-a', 'Anna Mac');
  const tokenB = machines.add('mac-b');
  let permissions: PermissionRegistry | undefined;
  let messages: MessageRegistry | undefined;
  const office = new Office({
    names: new NameStore(null),
    version: 't',
    startedAt: 0,
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    permissions: () => permissions?.snapshot() ?? new Map(),
    messages: () => messages?.reachable() ?? new Set(),
  });
  const source = new IngestSource({ office, onAnsweredElsewhere: (a, t) => permissions?.answeredElsewhere(a, t) });
  if (opts.permissions !== false) {
    permissions = new PermissionRegistry({ office, viewers: () => 1, answerLater: () => false });
    closers.push(() => permissions!.stop());
  }
  messages = new MessageRegistry({ office });
  closers.push(() => messages!.stop());
  const accounts = new IngestAccounts();
  const handler = createIngestHandler({
    machines,
    source,
    accounts,
    permissions,
    messages,
    summary: (own) => ({ version: 't', agents: 0, working: 0, waiting: [], ...(own.session ? { own: own.session } : {}) }) as never,
    version: 't',
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!handler(req, res, url)) {
      res.writeHead(418);
      res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  closers.push(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (path: string, token: string | undefined, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : undefined };
  };
  let n = 0;
  const event = (over: Record<string, unknown> = {}) => ({
    v: 1,
    id: `evt-${String(++n).padStart(6, '0')}`,
    at: Date.now() + n,
    event: 'SessionStart',
    account: '.claude',
    session_id: SID,
    cwd: '/Users/ana/shop',
    ...over,
  });
  return { office, source, accounts, permissions, messages, machines, tokenA, tokenB, call, event };
}

describe('ingest: machine tokens', () => {
  it('only the hash is stored; a removed machine stops working', () => {
    const tmp = tempDir();
    try {
      const store = new MachineStore(join(tmp.dir, 'm.json'));
      const token = store.add('pi-test');
      expect(token).toMatch(/^hbl1\.pi-test\.[A-Za-z0-9_-]{43}$/);
      const raw = JSON.stringify(store.machines());
      expect(raw).not.toContain(token.split('.')[2]);
      expect(store.verify(token)).toEqual({ id: 'pi-test', name: 'pi-test' });
      expect(store.verify(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`)).toBeUndefined();
      expect(store.verify('hbl1.other.' + 'a'.repeat(43))).toBeUndefined();
      store.remove('pi-test');
      expect(store.verify(token)).toBeUndefined();
      expect(() => store.add('Bad Name')).toThrow();
    } finally {
      tmp.cleanup();
    }
  });

  it('401 without or with a wrong token; a valid token is never held back by the wrong ones', async () => {
    const t = await setup();
    expect((await t.call('/api/ingest/hello', undefined)).status).toBe(401);
    for (let i = 0; i < 7; i++) await t.call('/api/ingest/hello', 'hbl1.mac-a.' + 'x'.repeat(43));
    expect((await t.call('/api/ingest/hello', 'nope')).status).toBe(429);
    const ok = await t.call('/api/ingest/hello', t.tokenA);
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ ok: true, machine: { id: 'mac-a', name: 'Anna Mac' }, permissions: true, messages: true });
  });

  it('rate limit per machine: 429 with Retry-After when a machine floods', async () => {
    const t = await setup();
    const results = await Promise.all(Array.from({ length: 90 }, () => t.call('/api/ingest/hello', t.tokenA)));
    expect(results.some((r) => r.status === 429)).toBe(true);
    // Another machine has its own bucket.
    expect((await t.call('/api/ingest/hello', t.tokenB)).status).toBe(200);
  });
});

describe('ingest: events', () => {
  it('validated and placed under the machine prefix', async () => {
    const t = await setup();
    const r = await t.call('/api/ingest/events', t.tokenA, t.event());
    expect(r).toEqual({ status: 202, json: { ok: true, applied: true } });
    expect(t.office.get(`r:mac-a:${SID}`)?.machine).toEqual({ id: 'mac-a', name: 'Anna Mac' });
  });

  it('400 for malformed events; unknown fields are dropped', async () => {
    const t = await setup();
    for (const bad of [
      t.event({ v: 2 }),
      t.event({ event: 'Explode' }),
      t.event({ session_id: '../../etc/passwd' }),
      t.event({ account: 'a/b' }),
      t.event({ id: 'x' }),
      [1, 2, 3],
    ]) {
      expect((await t.call('/api/ingest/events', t.tokenA, bad)).status).toBe(400);
    }
    const ev = parseIngestEvent(t.event({ evil: 'x', cwd: 'a\u0000b', prompt: 'p'.repeat(10_000) }), Date.now());
    expect(ev).not.toHaveProperty('evil');
    expect(ev.cwd).toBe('ab');
    expect(ev.prompt).toHaveLength(4_000);
    expect(parseIngestEvent(t.event({ provider: 'codex' }), Date.now()).provider).toBe('codex');
    expect(parseIngestEvent(t.event({ provider: 'other' }), Date.now())).not.toHaveProperty('provider');
  });

  it('tool values are rebuilt with limits (no prototype keys, bounded depth and size)', () => {
    const deep: Record<string, unknown> = {};
    let cur = deep;
    for (let i = 0; i < 20; i++) cur = (cur.x = {}) as Record<string, unknown>;
    const v = cleanValue(JSON.parse('{"__proto__": {"polluted": true}, "a": [1, "b", null], "big": "' + 'z'.repeat(20_000) + '"}')) as Record<string, unknown>;
    expect(Object.keys(v)).toEqual(['a', 'big']);
    expect((v.big as string).length).toBe(8_000);
    expect(JSON.stringify(cleanValue(deep)).split('"x"').length - 1).toBeLessThanOrEqual(6);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('usage of a remote account shows up tagged with the machine', async () => {
    const t = await setup();
    const fetchedAt = Date.now();
    const r = await t.call('/api/ingest/usage', t.tokenA, { account: '.claude', fetchedAt, five_hour: { utilization: 42, resets_at: Math.floor(fetchedAt / 1000) + 3600 } });
    expect(r.status).toBe(202);
    const list = t.accounts.list(t.source.openAccounts());
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'r:mac-a:.claude', machine: { id: 'mac-a' }, usageStatus: 'ok', usage: { fiveHour: { utilization: 42 } } });
    expect(list[0]).not.toHaveProperty('email');
  });
});

describe('ingest: permissions and inbox of another machine', () => {
  it('a permission request is registered for the remote agent and answered through the office', async () => {
    const t = await setup();
    await t.call('/api/ingest/events', t.tokenA, t.event());
    const reg = await t.call('/api/ingest/permissions', t.tokenA, {
      session_id: SID,
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      timeout_ms: 60_000,
    });
    expect(reg.status).toBe(201);
    const id = reg.json!.id as string;
    expect(t.permissions!.agentOf(id)).toBe(`r:mac-a:${SID}`);
    // Another machine cannot wait on (or learn the outcome of) this request.
    expect((await t.call(`/api/ingest/permissions/${id}/wait?timeout=1`, t.tokenB)).status).toBe(404);
    const waiting = t.call(`/api/ingest/permissions/${id}/wait?timeout=5`, t.tokenA);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(t.permissions!.decide(id, { behavior: 'allow' })).toBe('ok');
    expect((await waiting).json).toMatchObject({ status: 'decided', behavior: 'allow' });
  });

  it('a request for a session of another machine is not found (no cross-machine sessions)', async () => {
    const t = await setup();
    await t.call('/api/ingest/events', t.tokenA, t.event());
    const r = await t.call('/api/ingest/permissions', t.tokenB, { session_id: SID, tool_name: 'Bash', tool_input: { command: 'ls' }, timeout_ms: 60_000 });
    expect(r.json).toEqual({ skip: 'unknown-session' });
  });

  it('with answering off, the hook is told to skip', async () => {
    const t = await setup({ permissions: false });
    await t.call('/api/ingest/events', t.tokenA, t.event());
    const r = await t.call('/api/ingest/permissions', t.tokenA, { session_id: SID, tool_name: 'Bash', tool_input: {}, timeout_ms: 60_000 });
    expect(r.json).toEqual({ skip: 'off' });
  });

  it('a message to a remote agent goes to that machine’s inbox only', async () => {
    const t = await setup();
    await t.call('/api/ingest/events', t.tokenA, t.event());
    // The plugin's first round marks the presence; then the page can send.
    expect((await t.call('/api/ingest/inbox', t.tokenA, { session: SID, account: '.claude' })).json).toEqual({ messages: [] });
    const sent = t.messages!.send({ agentId: `r:mac-a:${SID}`, text: 'please also run the linter' });
    expect('message' in sent).toBe(true);
    expect((await t.call('/api/ingest/inbox', t.tokenB, { session: SID, account: '.claude' })).json).toEqual({ messages: [] });
    const got = await t.call('/api/ingest/inbox', t.tokenA, { session: SID, account: '.claude' });
    const msgs = got.json!.messages as Array<{ id: string; text: string }>;
    expect(msgs.map((m) => m.text)).toEqual(['please also run the linter']);
    expect((await t.call('/api/ingest/inbox/ack', t.tokenA, { session: SID, results: [{ id: msgs[0].id, ok: true }] })).status).toBe(200);
    expect(t.messages!.get(msgs[0].id)?.status).toBe('delivered');
  });
});
