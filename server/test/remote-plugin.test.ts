// The hook scripts of another machine, run as real processes against the ingest endpoint of a test server:
// habblaud-remote (mod/habblaud-remote/hooks/remote-hook.mjs) makes the session show up, and the permission hook
// (mod/habblaud-permissoes) with HABBLAUD_SERVER_URL is answered through the office.
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { IngestAccounts } from '../ingest/accounts';
import { createIngestHandler } from '../ingest/http';
import { MachineStore } from '../ingest/machines';
import { IngestSource } from '../ingest/source';
import { setQuiet } from '../log';
import { MessageRegistry } from '../messages/registry';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import { PermissionRegistry } from '../permissions/registry';
import { tempDir } from './fixtures';

setQuiet(true);

const REMOTE_HOOK = resolve(__dirname, '../../mod/habblaud-remote/hooks/remote-hook.mjs');
const PERMISSION_HOOK = resolve(__dirname, '../../mod/habblaud-permissoes/hooks/permission-hook.mjs');
const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

interface RemoteHookModule {
  serverOf(env: NodeJS.ProcessEnv): { base: string; token: string } | undefined;
  accountOf(env: NodeJS.ProcessEnv): string;
  eventBody(input: unknown, env?: NodeJS.ProcessEnv, now?: number, opts?: { branchOf?: (cwd: string) => string | undefined }): Record<string, unknown> | undefined;
}
const remoteHook = (await import(pathToFileURL(REMOTE_HOOK).href)) as RemoteHookModule;

const closers: Array<() => void> = [];
afterEach(() => {
  while (closers.length) closers.pop()!();
});

async function startServer() {
  const tmp = tempDir();
  closers.push(tmp.cleanup);
  const machines = new MachineStore(join(tmp.dir, 'ingest-machines.json'));
  const token = machines.add('mac-test');
  let permissions: PermissionRegistry | undefined;
  const office = new Office({
    names: new NameStore(null),
    version: 't',
    startedAt: 0,
    accounts: () => [],
    sources: () => [],
    accountName: () => undefined,
    permissions: () => permissions?.snapshot() ?? new Map(),
  });
  permissions = new PermissionRegistry({ office, viewers: () => 1, answerLater: () => false });
  const messages = new MessageRegistry({ office });
  closers.push(() => permissions!.stop(), () => messages.stop());
  const source = new IngestSource({ office, onAnsweredElsewhere: (a, t) => permissions!.answeredElsewhere(a, t) });
  const handler = createIngestHandler({
    machines,
    source,
    accounts: new IngestAccounts(),
    permissions,
    messages,
    summary: () => ({ version: 't', agents: 0, working: 0, waiting: [] }),
    version: 't',
  });
  const server = http.createServer((req, res) => {
    if (!handler(req, res, new URL(req.url ?? '/', 'http://localhost'))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  closers.push(() => server.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { office, permissions, url, token };
}

function runNode(script: string, stdin: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string }> {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [script], { env: { PATH: process.env.PATH, HOME: '/nonexistent', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (c: string) => (stdout += c));
    const kill = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(kill);
      ok({ code, stdout });
    });
    child.stdin.end(stdin);
  });
}

async function waitFor(cond: () => boolean, what: string, ms = 5_000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error(`waiting for: ${what}`);
    await new Promise((ok) => setTimeout(ok, 10));
  }
}

describe('habblaud-remote hook (pure parts)', () => {
  it('needs both variables, https (or this computer) and a well-formed token', () => {
    const token = `hbl1.mac.${'a'.repeat(43)}`;
    expect(remoteHook.serverOf({})).toBeUndefined();
    expect(remoteHook.serverOf({ HABBLAUD_SERVER_URL: 'https://pi.tail.ts.net', HABBLAUD_SERVER_TOKEN: 'short' })).toBeUndefined();
    expect(remoteHook.serverOf({ HABBLAUD_SERVER_URL: 'http://pi.tail.ts.net', HABBLAUD_SERVER_TOKEN: token })).toBeUndefined();
    expect(remoteHook.serverOf({ HABBLAUD_SERVER_URL: 'https://pi.tail.ts.net/path', HABBLAUD_SERVER_TOKEN: token })).toBeUndefined();
    expect(remoteHook.serverOf({ HABBLAUD_SERVER_URL: 'https://pi.tail.ts.net:4748/', HABBLAUD_SERVER_TOKEN: token })).toEqual({ base: 'https://pi.tail.ts.net:4748', token });
    expect(remoteHook.serverOf({ HABBLAUD_SERVER_URL: 'http://127.0.0.1:9', HABBLAUD_SERVER_TOKEN: token })).toEqual({ base: 'http://127.0.0.1:9', token });
  });

  it('keeps only what the office uses; tool results only for Bash and GitHub tools; branch on git push', () => {
    const env = { CLAUDE_CONFIG_DIR: '/Users/ana/.claude-work' };
    expect(remoteHook.accountOf(env)).toBe('.claude-work');
    const edit = remoteHook.eventBody(
      { hook_event_name: 'PostToolUse', session_id: SID, cwd: '/p', tool_name: 'Edit', tool_input: { file_path: '/p/a.ts', new_string: 'x'.repeat(10_000) }, tool_response: { secret: 'file contents' }, transcript_path: '/t.jsonl' },
      env,
    )!;
    expect(edit).not.toHaveProperty('tool_response');
    expect(edit).not.toHaveProperty('transcript_path');
    expect(((edit.tool_input as Record<string, string>).new_string).length).toBe(2_000);
    const push = remoteHook.eventBody(
      { hook_event_name: 'PostToolUse', session_id: SID, cwd: '/p', tool_name: 'Bash', tool_input: { command: 'git push origin feat' }, tool_response: { stdout: 'ok' } },
      env,
      1,
      { branchOf: () => 'feat' },
    )!;
    expect(push).toMatchObject({ v: 1, event: 'PostToolUse', account: '.claude-work', branch: 'feat', tool_response: { stdout: 'ok' } });
    expect(remoteHook.eventBody({ hook_event_name: 'PreCompact', session_id: SID })).toBeUndefined();
  });
});

describe('another machine through the hook scripts', () => {
  it('a session shows up and a permission request is approved through the office', async () => {
    const s = await startServer();
    const env = { HABBLAUD_SERVER_URL: s.url, HABBLAUD_SERVER_TOKEN: s.token };
    const start = await runNode(REMOTE_HOOK, JSON.stringify({ hook_event_name: 'SessionStart', session_id: SID, cwd: '/Users/ana/shop', source: 'startup' }), env);
    expect(start).toEqual({ code: 0, stdout: '' });
    const id = `r:mac-test:${SID}`;
    await waitFor(() => !!s.office.get(id), 'remote agent');
    expect(s.office.get(id)!.machine).toEqual({ id: 'mac-test', name: 'mac-test' });

    const hook = runNode(
      PERMISSION_HOOK,
      JSON.stringify({ hook_event_name: 'PermissionRequest', session_id: SID, cwd: '/Users/ana/shop', tool_name: 'Bash', tool_input: { command: 'npm test' }, permission_suggestions: [] }),
      { ...env, HABBLAUD_PERMISSION_TIMEOUT: '30' },
    );
    await waitFor(() => s.permissions.snapshot().has(id), 'permission request');
    const req = s.permissions.snapshot().get(id)!;
    expect(s.permissions.decide(req.id, { behavior: 'allow' })).toBe('ok');
    const out = await hook;
    expect(JSON.parse(out.stdout)).toEqual({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
  });

  it('without the variables the remote hook does nothing and exits at once', async () => {
    const r = await runNode(REMOTE_HOOK, JSON.stringify({ hook_event_name: 'SessionStart', session_id: SID, cwd: '/p' }), {});
    expect(r).toEqual({ code: 0, stdout: '' });
  });

  it('a wrong token: the event is dropped, the hook still exits 0 with no output', async () => {
    const s = await startServer();
    const r = await runNode(REMOTE_HOOK, JSON.stringify({ hook_event_name: 'SessionStart', session_id: SID, cwd: '/p' }), {
      HABBLAUD_SERVER_URL: s.url,
      HABBLAUD_SERVER_TOKEN: `hbl1.mac-test.${'b'.repeat(43)}`,
    });
    expect(r).toEqual({ code: 0, stdout: '' });
    expect(s.office.list()).toHaveLength(0);
  });
});
