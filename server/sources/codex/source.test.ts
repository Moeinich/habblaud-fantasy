// Codex source integration: a temporary CODEX_HOME (synthetic rollouts and locks), the AccountsService and the Office.
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentInfo, Notice } from '../../../shared/types';
import { AccountsService } from '../../accounts/service';
import { log, setQuiet } from '../../log';
import { NameStore } from '../../model/names';
import { Office } from '../../model/office';
import { codexHome, R, SOURCES, threadId } from '../../test/codex-fixtures';
import { MAX_LINE_BYTES } from '../tail';
import { CodexSource, scanPrefix } from './source';

setQuiet(true);

const T = threadId(1);
const C = threadId(2);
const KEY = `.codex:${T}`;

let cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups) c();
  cleanups = [];
});

function setup(opts: { names?: string[]; noLocks?: boolean; env?: (dirs: string[]) => NodeJS.ProcessEnv } = {}) {
  const homes = (opts.names ?? ['.codex']).map((n) => codexHome(n));
  const home = homes[0];
  cleanups.push(...homes.map((h) => h.cleanup));
  if (opts.noLocks) rmSync(join(home.dir, 'thread-writer-locks'), { recursive: true });
  let clock = Date.now();
  const now = () => clock;
  const late: { office?: Office } = {};
  const accounts = new AccountsService({ dirs: [], home: home.home, env: {}, now, onChange: () => late.office?.markDirty() });
  const office = new Office({
    names: new NameStore(null),
    version: 'test',
    startedAt: clock,
    accounts: (s) => accounts.list(s),
    sources: () => [],
    accountName: (id) => accounts.find(id)?.detected.name,
    now,
  });
  late.office = office;
  const dirs = homes.map((h) => h.dir);
  const source = new CodexSource({ accounts, office, dirs, env: opts.env?.(dirs) ?? {}, home: home.home, now, watch: false });
  // Stop before deleting the folders (no scheduled cycle runs afterwards).
  cleanups.unshift(() => source.stop());
  const notices: Notice[] = [];
  return {
    home,
    homes,
    accounts,
    office,
    source,
    notices,
    advance(ms: number) {
      clock += ms;
    },
    now,
    poll() {
      source.poll();
      office.tick();
      notices.push(...office.commit().notices);
    },
    agents(): AgentInfo[] {
      return office.commit().snapshot.agents;
    },
    agent(id = KEY): AgentInfo | undefined {
      return office.commit().snapshot.agents.find((a) => a.id === id);
    },
    hook(input: Record<string, unknown>, account?: string): boolean {
      return source.applyHookEvent(account, input);
    },
  };
}

describe('Codex source: presence through locks', () => {
  it('lock + rollout: main agent in the project room, with title, model, branch, tokens and status', () => {
    const ctx = setup();
    const t0 = ctx.now();
    const path = ctx.home.rollout(T, [
      R.meta(T, { at: t0 - 50_000, cwd: '/projetos/loja', branch: 'feat/x' }),
      R.turnContext({ at: t0 - 49_000, model: 'gpt-test-codex' }),
      R.taskStarted('turn1', t0 - 48_000),
      R.user(T, 'turn1', 'u1', "Run the shop's tests", t0 - 47_000),
      R.command(T, 'turn1', 'call_1', 'npm test', { at: t0 - 46_000, output: 'ok' }),
      R.tokens({ input: 2_000, cached: 1_500, output: 300, at: t0 - 45_000 }),
    ]);
    ctx.home.lock(T, t0 - 60_000);
    ctx.source.boot();
    const a = ctx.agent()!;
    expect(a).toMatchObject({
      kind: 'main',
      provider: 'codex',
      account: '.codex',
      sessionId: T,
      roomId: 'loja',
      role: 'Main agent (Codex)',
      status: 'working',
      title: "Run the shop's tests",
      model: 'gpt-test-codex',
      gitBranch: 'feat/x',
    });
    expect(a.stats).toMatchObject({ tokensIn: 2_000, tokensOut: 300, toolCalls: 1 });
    expect(a.activity?.text).toBe('Running tests');
    expect(ctx.source.sources()).toEqual([{ label: '.codex', provider: 'codex', path: ctx.home.dir, sessions: 1, ok: true }]);
    expect(ctx.source.transcriptPathOf(KEY)).toBe(path);
    expect(ctx.source.terminalParser(KEY)).toBeDefined();
    expect(ctx.accounts.list(new Map())[0]).toMatchObject({ id: '.codex', provider: 'codex', name: 'Codex', short: 'X' });

    // Turn completed: idle.
    ctx.advance(1_000);
    ctx.home.append(path, [R.agent(T, 'turn1', 'a1', 'All passed.', ctx.now()), R.taskComplete('turn1', ctx.now() + 1)]);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('idle');
    expect(ctx.agent()?.activity?.kind).toBe('done');

    // No lock: closes (after the slack).
    ctx.home.unlock(T);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('idle');
    ctx.advance(2_000);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('offline');
    expect(ctx.notices.some((n) => n.text.includes('ended the session'))).toBe(true);
  });

  it('a rolled-back thread hook swaps the open rollout and the terminal path right away', () => {
    const ctx = setup();
    const at = ctx.now() - 10_000;
    const old = ctx.home.rollout(T, [
      R.meta(T, { at }),
      R.taskStarted('t1', at),
      R.user(T, 't1', 'u1', 'Old turn', at + 1),
      R.command(T, 't1', 'c1', 'npm test', { at: at + 2 }),
      R.taskComplete('t1', at + 3),
    ], { mtime: at + 3 });
    ctx.home.lock(T, at);
    ctx.source.boot();
    expect(ctx.agent()).toMatchObject({ status: 'idle', title: 'Old turn', stats: { toolCalls: 1 } });
    const path = old.replace('.jsonl', `_${C}.jsonl`);
    writeFileSync(path, [
      R.meta(T, { at }),
      R.taskStarted('t2', ctx.now()),
      R.user(T, 't2', 'u2', 'Rolled-back turn', ctx.now() + 1),
    ].join('\n') + '\n');
    ctx.home.touch(path, ctx.now());
    expect(ctx.hook({ hook_event_name: 'SessionStart', session_id: T, transcript_path: path })).toBe(true);
    expect(ctx.source.transcriptPathOf(KEY)).toBe(realpathSync(path));
    expect(ctx.agent()).toMatchObject({ status: 'working', title: 'Rolled-back turn', stats: { toolCalls: 0 } });
    // Keeps reading only the new one: a write to the old one doesn't end the rolled-back turn.
    ctx.home.append(old, [R.taskComplete('t1', ctx.now() + 2)]);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('working');
    ctx.home.append(path, [R.taskComplete('t2', ctx.now() + 3)]);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('idle');
  });

  it('a rollout opened by the hook is not reloaded needlessly (symlinked path, scan and repeated hook)', () => {
    const ctx = setup();
    const at = ctx.now() - 10_000;
    const path = ctx.home.rollout(T, [R.meta(T, { at }), R.taskStarted('t1', at), R.user(T, 't1', 'u1', 'Turn', at + 1)], { mtime: at + 1 });
    ctx.home.lock(T, at);
    ctx.source.boot();
    // The macOS tmpdir goes through a symlink (/var -> /private/var): the index keeps one path and the hook sends the other.
    const load = vi.spyOn(ctx.source as unknown as { load: (...a: unknown[]) => void }, 'load');
    ctx.hook({ hook_event_name: 'UserPromptSubmit', session_id: T, transcript_path: path });
    ctx.advance(3_000);
    ctx.poll();
    ctx.hook({ hook_event_name: 'UserPromptSubmit', session_id: T, transcript_path: path });
    ctx.advance(30_000);
    ctx.poll();
    expect(load.mock.calls.length <= 1).toBe(true);
    load.mockRestore();
  });

  it.each([
    { date: '2026/10/09', wait: 3_000 },
    { date: '2026/01/02', wait: 30_000 },
  ])('without a hook, revalidates the rolled-back thread rollout in $date without losing the reads between scans', ({ date, wait }) => {
    const ctx = setup();
    const at = ctx.now() - 10_000;
    const old = ctx.home.rollout(T, [R.meta(T, { at }), R.user(T, 't1', 'u1', 'Old turn', at + 1), R.taskComplete('t1', at + 2)], { date, mtime: at + 2 });
    // The old folder is outside the scan of the two most recent days.
    ctx.home.rollout(threadId(3), [], { date: '2026/10/10' });
    ctx.home.rollout(threadId(4), [], { date: '2026/10/09' });
    ctx.home.lock(T, at);
    ctx.source.boot();
    expect(ctx.source.transcriptPathOf(KEY)).toBe(old);
    expect(ctx.agent()).toMatchObject({ status: 'idle', title: 'Old turn' });
    const path = old.replace('.jsonl', `_${C}.jsonl`);
    writeFileSync(path, [R.meta(T, { at }), R.taskStarted('t2', ctx.now()), R.user(T, 't2', 'u2', 'Rolled-back turn', ctx.now() + 1)].join('\n') + '\n');
    ctx.home.touch(path, ctx.now());
    // Before the next scan, the current tail still receives lines normally.
    ctx.home.append(old, [R.command(T, 't1', 'c1', 'npm test', { at: at + 3 })]);
    ctx.home.touch(old, at + 3);
    ctx.poll();
    expect(ctx.agent()?.stats.toolCalls).toBe(1);
    expect(ctx.source.transcriptPathOf(KEY)).toBe(old);
    ctx.advance(wait);
    ctx.poll();
    expect(ctx.source.transcriptPathOf(KEY)).toBe(path);
    expect(ctx.agent()).toMatchObject({ status: 'working', title: 'Rolled-back turn', stats: { toolCalls: 0 } });
  });

  it("keeps the rollout being read when its current mtime is newer than another of the thread's files", () => {
    const ctx = setup();
    const at = ctx.now() - 10_000;
    const path = ctx.home.rollout(T, [R.meta(T, { at }), R.user(T, 't1', 'u1', 'Current turn', at + 1), R.taskComplete('t1', at + 2)], { mtime: at + 2 });
    ctx.home.lock(T, at);
    ctx.source.boot();
    const other = path.replace('.jsonl', `_${C}.jsonl`);
    writeFileSync(other, [R.meta(T, { at }), R.user(T, 't2', 'u2', 'Other rollout', at + 3), R.taskComplete('t2', at + 4)].join('\n') + '\n');
    ctx.home.touch(other, at + 4);
    ctx.home.append(path, [R.taskStarted('t3', ctx.now())]);
    ctx.home.touch(path, ctx.now());
    ctx.advance(3_000);
    ctx.poll();
    expect(ctx.source.transcriptPathOf(KEY)).toBe(path);
    expect(ctx.agent()).toMatchObject({ status: 'working', title: 'Current turn' });
  });

  it("a quick lock (maintenance) doesn't become a session; one that lasts a few seconds does", () => {
    const ctx = setup();
    ctx.home.rollout(T, [R.meta(T, { at: ctx.now() - 3_600_000 }), R.user(T, 't', 'u', 'old', ctx.now() - 3_600_000)], { mtime: ctx.now() - 3_600_000 });
    ctx.source.boot();
    ctx.home.lock(T, ctx.now());
    ctx.poll();
    ctx.advance(1_000);
    ctx.poll();
    expect(ctx.agent()).toBeUndefined();
    ctx.home.unlock(T);
    ctx.advance(1_000);
    ctx.poll();
    expect(ctx.agent()).toBeUndefined();
    // A real resume: the lock stays.
    ctx.home.lock(T, ctx.now());
    ctx.poll();
    expect(ctx.agent()).toBeUndefined();
    ctx.advance(3_500);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('idle');
  });

  it('a stale crash lock (rollout idle for more than 12 h, no hook) stays out; a new write reopens', () => {
    const ctx = setup();
    const old = ctx.now() - 13 * 3600_000;
    const path = ctx.home.rollout(T, [R.meta(T, { at: old }), R.taskStarted('t', old), R.user(T, 't', 'u', 'hi', old)], { mtime: old });
    ctx.home.lock(T, old);
    ctx.source.boot();
    expect(ctx.agent()).toBeUndefined();
    ctx.advance(1_000);
    ctx.home.append(path, [R.taskStarted('t2', ctx.now()), R.user(T, 't2', 'u2', 'back', ctx.now())]);
    ctx.poll();
    expect(ctx.agent()).toMatchObject({ status: 'working' });
  });

  it('an old thread resumed now (new lock, rollout idle for days) shows up', () => {
    const ctx = setup();
    const old = ctx.now() - 3 * 86_400_000;
    ctx.home.rollout(T, [R.meta(T, { at: old, cwd: '/projetos/velho' }), R.user(T, 't', 'u', 'old one', old), R.taskComplete('t', old + 10)], { mtime: old });
    ctx.home.lock(T, ctx.now() - 30_000);
    ctx.source.boot();
    expect(ctx.agent()).toMatchObject({ roomId: 'velho', status: 'idle', title: 'old one' });
    // A lock without a rollout forgotten for more than 12 h (crash before the first prompt): out.
    ctx.home.lock(C, ctx.now() - 13 * 3600_000);
    ctx.poll();
    expect(ctx.agent(`.codex:${C}`)).toBeUndefined();
  });

  it('lock without a rollout (CLI open, no message yet): stays out until the project shows up and goes straight to its room', () => {
    const ctx = setup();
    ctx.home.lock(T, ctx.now() - 20_000);
    ctx.source.boot();
    // The lock doesn't say the folder: no project, no room (no provisional room).
    expect(ctx.agent()).toBeUndefined();
    expect(ctx.office.commit().snapshot.rooms).toEqual([]);
    ctx.home.rollout(T, [R.meta(T, { at: ctx.now(), cwd: '/projetos/api' }), R.taskStarted('t1', ctx.now()), R.user(T, 't1', 'u1', 'Start', ctx.now())]);
    ctx.advance(3_100);
    ctx.poll();
    expect(ctx.agent()).toMatchObject({ roomId: 'api', status: 'working', title: 'Start' });
    const rooms = ctx.office.commit().snapshot.rooms.map((r) => r.id);
    expect(rooms).toEqual(['api']);
  });

  it('lock without a rollout: a hook that gives the project makes the agent enter right away, already in the right room', () => {
    const ctx = setup();
    ctx.source.boot();
    ctx.home.lock(T, ctx.now() - 60_000);
    ctx.poll();
    expect(ctx.agent()).toBeUndefined();
    expect(ctx.hook({ hook_event_name: 'SessionStart', session_id: T, cwd: '/projetos/api', transcript_path: null, model: 'gpt-test-codex', source: 'startup' })).toBe(true);
    expect(ctx.agent()).toMatchObject({ roomId: 'api', status: 'idle', provider: 'codex' });
  });

  it('internal threads (guardian, review) stay out', () => {
    const ctx = setup();
    const at = ctx.now() - 5_000;
    ctx.home.rollout(T, [R.meta(T, { at, source: SOURCES.guardian() }), R.taskStarted('t', at)]);
    ctx.home.rollout(C, [R.meta(C, { at, source: SOURCES.review() }), R.taskStarted('t', at)]);
    ctx.home.lock(T, at);
    ctx.home.lock(C, at);
    ctx.source.boot();
    expect(ctx.agents()).toEqual([]);
  });

  it('without thread-writer-locks/: presence by the rollout modified in the last 30 min', () => {
    const ctx = setup({ noLocks: true });
    const old = ctx.now() - 2 * 3600_000;
    ctx.home.rollout(T, [R.meta(T, { at: ctx.now() - 60_000 }), R.user(T, 't', 'u', 'recent', ctx.now() - 60_000)]);
    ctx.home.rollout(C, [R.meta(C, { at: old }), R.user(C, 't', 'u', 'old', old)], { mtime: old });
    ctx.source.boot();
    expect(ctx.agents().map((a) => a.id)).toEqual([KEY]);
  });
});

describe('Codex source: subagents', () => {
  it("a subagent enters as the parent's sub while working and delivers when the turn ends", () => {
    const ctx = setup();
    const at = ctx.now() - 10_000;
    ctx.home.rollout(T, [R.meta(T, { at }), R.taskStarted('p1', at), R.user(T, 'p1', 'u', 'Investigate with help', at)]);
    const sub = ctx.home.rollout(C, [
      R.meta(C, { at: at + 1_000, sessionId: T, source: SOURCES.sub(T, 'explorer') }),
      R.taskStarted('s1', at + 1_000),
      R.user(C, 's1', 'su', 'Find where the login is validated', at + 1_100),
    ]);
    ctx.home.lock(T, at);
    ctx.home.lock(C, at + 1_000);
    ctx.source.boot();
    expect(ctx.agent(`.codex:${C}`)).toMatchObject({
      kind: 'sub',
      provider: 'codex',
      parentId: KEY,
      sessionId: C,
      role: 'Explorer',
      title: 'Find where the login is validated',
      status: 'working',
      roomId: 'loja',
    });
    ctx.advance(1_000);
    ctx.home.append(sub, [R.agent(C, 's1', 'sa', "It's in auth.ts", ctx.now()), R.taskComplete('s1', ctx.now() + 1)]);
    ctx.poll();
    expect(ctx.agent(`.codex:${C}`)?.status).toBe('done');
    expect(ctx.notices.some((n) => n.text.includes('delivered'))).toBe(true);
    // Back to work (the parent sent another task).
    ctx.advance(1_000);
    ctx.home.append(sub, [R.taskStarted('s2', ctx.now())]);
    ctx.poll();
    expect(ctx.agent(`.codex:${C}`)?.status).toBe('working');
    // Lock gone: delivers and leaves.
    ctx.home.unlock(C);
    ctx.poll();
    expect(ctx.agent(`.codex:${C}`)?.status).toBe('working');
    ctx.advance(2_000);
    ctx.poll();
    expect(ctx.agent(`.codex:${C}`)?.status).toBe('done');
    expect(ctx.agent()?.status).toBe('working');
  });

  it("a subagent already idle at startup doesn't show up", () => {
    const ctx = setup();
    const at = ctx.now() - 10_000;
    ctx.home.rollout(T, [R.meta(T, { at })]);
    ctx.home.rollout(C, [R.meta(C, { at, sessionId: T, source: SOURCES.sub(T) }), R.taskStarted('s', at), R.taskComplete('s', at + 10)]);
    ctx.home.lock(T, at);
    ctx.home.lock(C, at);
    ctx.source.boot();
    expect(ctx.agents().map((a) => a.id)).toEqual([KEY]);
  });
});

describe('Codex source: plan usage', () => {
  it('the most recent rate_limits among the sessions goes to the account, with the plan; no quota', () => {
    const ctx = setup();
    const at = ctx.now() - 60_000;
    ctx.home.rollout(T, [R.meta(T, { at }), R.tokens({ input: 1, output: 1, at, rateLimits: { primary: { used: 30 }, plan: 'pro' } })]);
    ctx.home.rollout(C, [R.meta(C, { at: at - 1_000 }), R.tokens({ input: 1, output: 1, at: at - 1_000, rateLimits: { primary: { used: 99 } } })]);
    ctx.home.lock(T, at);
    ctx.home.lock(C, at);
    ctx.source.boot();
    const acc = ctx.accounts.list(new Map())[0];
    expect(acc).toMatchObject({ id: '.codex', plan: 'Pro', usageStatus: 'ok', usage: { source: 'codex', fetchedAt: at, fiveHour: { utilization: 30 } } });
    const path = ctx.home.rollout(T, []);
    ctx.home.append(path, [R.tokens({ input: 1, output: 1, at: ctx.now(), rateLimits: { primary: null, secondary: null, reached: 'workspace_owner_credits_depleted' } })]);
    ctx.poll();
    expect(ctx.accounts.list(new Map())[0].usage).toEqual({ source: 'codex', fetchedAt: ctx.now(), noQuota: true });
  });

  it("account with no open session: the last rollout's usage (with its age)", () => {
    const ctx = setup();
    const at = ctx.now() - 2 * 3600_000;
    ctx.home.rollout(T, [R.meta(T, { at }), R.tokens({ input: 1, output: 1, at, rateLimits: { plan: 'plus' } })], { mtime: at });
    ctx.source.boot();
    expect(ctx.agents()).toEqual([]);
    expect(ctx.accounts.list(new Map())[0]).toMatchObject({ plan: 'Plus', usageStatus: 'stale', usage: { fetchedAt: at } });
  });

  it('account with no open session: skips the most recent rollout without numbers and finds usage in an old date folder', () => {
    const ctx = setup();
    const at = ctx.now() - 5 * 3600_000;
    // Resumed session: the file stays in the creation (old) folder, but was touched recently.
    ctx.home.rollout(T, [R.meta(T, { at }), R.tokens({ input: 1, output: 1, at, rateLimits: { plan: 'team' } })], { date: '2026/01/02', mtime: at });
    // Archived afterwards, with no token_count: it's the most recent, but says nothing about usage.
    const T3 = threadId(3);
    ctx.home.rollout(T3, [R.meta(T3, { at: at + 60_000 })], { archived: true, mtime: at + 60_000 });
    ctx.source.boot();
    expect(ctx.accounts.list(new Map())[0]).toMatchObject({ plan: 'Team', usageStatus: 'stale', usage: { source: 'codex', fetchedAt: at } });
  });
});

describe('Codex source: hook events', () => {
  const ev = (name: string, extra: Record<string, unknown> = {}) => ({
    hook_event_name: name,
    session_id: T,
    cwd: '/projetos/api',
    transcript_path: null,
    model: 'gpt-test-codex',
    permission_mode: 'default',
    turn_id: 'turn1',
    ...extra,
  });

  it("SessionStart: the agent shows up right away, in the event cwd's room, before the lock and the rollout", () => {
    const ctx = setup();
    ctx.source.boot();
    expect(ctx.hook(ev('SessionStart', { source: 'startup' }))).toBe(true);
    expect(ctx.agent()).toMatchObject({ roomId: 'api', provider: 'codex', status: 'idle' });
  });

  it('prompt, tool (without duplicating the completed item), approval and end of turn', () => {
    const ctx = setup();
    ctx.source.boot();
    expect(ctx.hook(ev('UserPromptSubmit', { prompt: 'run the tests' }))).toBe(true);
    expect(ctx.agent()?.status).toBe('working');
    expect(ctx.hook(ev('PreToolUse', { tool_name: 'Bash', tool_use_id: 'call_7', tool_input: { command: 'npm test' } }))).toBe(true);
    expect(ctx.agent()?.activity).toMatchObject({ id: `${KEY}#call_7`, text: 'Running tests', tool: 'Bash' });
    expect(ctx.hook(ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm test', description: 'x' } }))).toBe(true);
    expect(ctx.agent()).toMatchObject({ status: 'waiting', waitingFor: 'approve a command' });
    // The rollout shows up with the turn's old line: it doesn't undo the wait.
    ctx.advance(10);
    const path = ctx.home.rollout(T, [R.meta(T, { at: ctx.now() - 5_000, cwd: '/projetos/api' }), R.taskStarted('turn1', ctx.now() - 4_000)]);
    ctx.home.lock(T, ctx.now() - 5_000);
    ctx.advance(3_100);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('waiting');
    // Approved in the terminal: the command completed (same call_id: the activity isn't duplicated).
    ctx.home.append(path, [R.command(T, 'turn1', 'call_7', 'npm test', { at: ctx.now(), output: 'ok' })]);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('working');
    const recent = ctx.office.detail(KEY)!.history.filter((a) => a.id === `${KEY}#call_7`);
    expect(recent).toHaveLength(1);
    expect(ctx.hook(ev('PostToolUse', { tool_name: 'Bash', tool_use_id: 'call_7', tool_input: {}, tool_response: {} }))).toBe(true);
    expect(ctx.hook(ev('Stop', { stop_hook_active: false, last_assistant_message: 'ok' }))).toBe(true);
    expect(ctx.agent()?.status).toBe('idle');
  });

  it('apply_patch and MCP: the same activities as Claude Code', () => {
    const ctx = setup();
    ctx.source.boot();
    ctx.hook(ev('PreToolUse', { tool_name: 'apply_patch', tool_use_id: 'c1', tool_input: { command: '*** Begin Patch\n*** Update File: src/app.ts\n@@\n-a\n+b\n*** End Patch' } }));
    expect(ctx.agent()?.activity).toMatchObject({ text: 'Editing app.ts', tool: 'Edit' });
    ctx.hook(ev('PreToolUse', { tool_name: 'mcp__github__merge_pull_request', tool_use_id: 'c2', tool_input: { pullNumber: 3 } }));
    expect(ctx.agent()?.activity).toMatchObject({ text: 'GitHub: merge pull request', tool: 'mcp__github__merge_pull_request' });
  });

  it("agent_id vs session_id: the subagent event goes to the child, which enters as the parent's sub", () => {
    const ctx = setup();
    ctx.source.boot();
    ctx.hook(ev('SessionStart'));
    expect(ctx.hook(ev('SubagentStart', { agent_id: C, agent_type: 'worker' }))).toBe(true);
    expect(ctx.agent(`.codex:${C}`)).toMatchObject({ kind: 'sub', parentId: KEY, role: 'Worker', status: 'working' });
    expect(ctx.hook(ev('PreToolUse', { agent_id: C, agent_type: 'worker', tool_name: 'Bash', tool_use_id: 'c9', tool_input: { command: 'ls' } }))).toBe(true);
    expect(ctx.agent(`.codex:${C}`)?.activity?.id).toBe(`.codex:${C}#c9`);
    expect(ctx.agent()?.activity?.id).not.toBe(`${KEY}#c9`);
    expect(ctx.hook(ev('PermissionRequest', { agent_id: C, tool_name: 'Bash', tool_input: { command: 'rm x' } }))).toBe(true);
    expect(ctx.agent(`.codex:${C}`)?.status).toBe('waiting');
    expect(ctx.agent()?.status).not.toBe('waiting');
    expect(ctx.hook(ev('SubagentStop', { agent_id: C, agent_type: 'worker', stop_hook_active: false, agent_transcript_path: null }))).toBe(true);
    expect(ctx.agent(`.codex:${C}`)?.status).toBe('done');
  });

  it('unknown event, invalid session or no matching account: false', () => {
    const ctx = setup({ names: ['.codex', '.codex-trabalho'] });
    ctx.source.boot();
    expect(ctx.hook(ev('Unknown'))).toBe(false);
    expect(ctx.hook(ev('SessionStart', { session_id: 'not-a-uuid' }))).toBe(false);
    // Two accounts and nothing saying which: no match.
    expect(ctx.hook(ev('SessionStart'))).toBe(false);
    // By account id, by folder or by transcript_path.
    expect(ctx.hook(ev('SessionStart'), '.codex-trabalho')).toBe(true);
    expect(ctx.agent(`.codex-trabalho:${T}`)?.account).toBe('.codex-trabalho');
    expect(ctx.hook(ev('SessionStart', { session_id: C }), ctx.homes[0].dir)).toBe(true);
    expect(ctx.agent(`.codex:${C}`)).toBeDefined();
    const T3 = threadId(3);
    const tp = join(ctx.homes[1].dir, 'sessions', '2026', '10', '09', `rollout-2026-10-09T09-00-00-${T3}.jsonl`);
    expect(ctx.hook(ev('SessionStart', { session_id: T3, transcript_path: tp }))).toBe(true);
    expect(ctx.agent(`.codex-trabalho:${T3}`)).toBeDefined();
    // SessionEnd of a session nobody knows: false.
    expect(ctx.hook(ev('SessionEnd', { session_id: threadId(4), reason: 'other' }), '.codex')).toBe(false);
  });

  it('a subagent whose first event is an approval request enters already waiting', () => {
    const ctx = setup();
    ctx.source.boot();
    ctx.hook(ev('SessionStart'));
    expect(ctx.hook(ev('PermissionRequest', { agent_id: C, agent_type: 'worker', tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }))).toBe(true);
    expect(ctx.agent(`.codex:${C}`)).toMatchObject({ kind: 'sub', parentId: KEY, status: 'waiting', waitingFor: 'approve a command' });
  });

  it("Docker: the hook runs on the host and matches the account by the HOST folder (configDir) or by its transcript_path", () => {
    const ctx = setup({
      names: ['.codex', '.codex-b'],
      env: (dirs) => ({
        HABBLAUD_ACCOUNTS: JSON.stringify([
          { id: '.codex', provider: 'codex', configDir: '/Users/host/.codex', mountDir: dirs[0], short: 'CX', name: 'Codex CX', color: '#111111' },
          { id: '.codex-b', provider: 'codex', configDir: '/Users/host/.codex-b', mountDir: dirs[1], short: 'CB', name: 'Codex CB', color: '#222222' },
        ]),
      }),
    });
    ctx.source.boot();
    expect(ctx.accounts.list(new Map()).map((a) => [a.id, a.configDir, a.short])).toEqual([
      ['.codex', '/Users/host/.codex', 'CX'],
      ['.codex-b', '/Users/host/.codex-b', 'CB'],
    ]);
    expect(ctx.source.sources().map((s) => s.path)).toEqual(['/Users/host/.codex', '/Users/host/.codex-b']);
    expect(ctx.hook(ev('SessionStart'), '/Users/host/.codex-b')).toBe(true);
    expect(ctx.agent(`.codex-b:${T}`)).toBeDefined();
    const tp = `/Users/host/.codex/sessions/2026/10/09/rollout-2026-10-09T09-00-00-${C}.jsonl`;
    expect(ctx.hook(ev('SessionStart', { session_id: C, transcript_path: tp }))).toBe(true);
    expect(ctx.agent(`.codex:${C}`)).toBeDefined();
  });

  it('hook presence lasts 60 s without a lock; SessionEnd closes', () => {
    const ctx = setup();
    ctx.source.boot();
    ctx.hook(ev('SessionStart'));
    ctx.advance(30_000);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('idle');
    ctx.advance(31_000);
    ctx.poll();
    ctx.advance(2_000);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('offline');
    // Again, now with a lock: SessionEnd closes when the lock goes away (or after 5 s).
    ctx.advance(30_000);
    ctx.poll();
    ctx.hook(ev('SessionStart'));
    ctx.home.lock(T, ctx.now() - 10_000);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('idle');
    expect(ctx.hook(ev('SessionEnd', { reason: 'other' }))).toBe(true);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('idle');
    ctx.advance(6_000);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('offline');
  });

  it('Docker without the locks folder mounted: the hook gives presence; with no events for 60 s, it leaves', () => {
    const ctx = setup({ noLocks: true });
    ctx.source.boot();
    ctx.hook(ev('UserPromptSubmit', { prompt: 'x' }));
    expect(ctx.agent()?.status).toBe('working');
    ctx.advance(61_000);
    ctx.poll();
    ctx.advance(2_000);
    ctx.poll();
    expect(ctx.agent()?.status).toBe('offline');
  });
});

describe('Codex source: accounts', () => {
  it('two accounts: "Codex X" names, letters and colors without clashing; ids returned by the AccountsService', () => {
    const ctx = setup({ names: ['.codex', '.codex-trabalho'] });
    const list = ctx.accounts.list(new Map());
    expect(list.map((a) => [a.id, a.provider, a.short, a.name])).toEqual([
      ['.codex', 'codex', 'X', 'Codex X'],
      ['.codex-trabalho', 'codex', 'T', 'Codex T'],
    ]);
    expect(new Set(list.map((a) => a.color)).size).toBe(2);
    expect(ctx.source.accountEntries().map((e) => e.id)).toEqual(['.codex', '.codex-trabalho']);
  });

  it('compressed rollout (.zst) alone: ignored (with a log warning), the session stays out for lack of a project', () => {
    const ctx = setup();
    const dir = join(ctx.home.dir, 'sessions', '2026', '10', '01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `rollout-2026-10-01T09-00-00-${T}.jsonl.zst`), Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0, 1, 2]));
    ctx.home.lock(T, ctx.now() - 60_000);
    ctx.source.boot();
    // Without a readable rollout there's no project: stays out (a hook with the cwd would bring it in).
    expect(ctx.agent()).toBeUndefined();
    expect(ctx.source.transcriptPathOf(KEY)).toBeUndefined();
  });
});

describe('Codex scanPrefix', () => {
  it('skips a line over the cap and reads its neighbours', async () => {
    const dir = join(tmpdir(), `habblaud-codex-prefix-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const warn = vi.spyOn(log, 'warnOnce').mockImplementation(() => {});
    try {
      const file = join(dir, 'rollout.jsonl');
      const body = Buffer.concat([
        Buffer.from(`${R.turnContext({ model: 'before' })}\n`),
        Buffer.from('{"timestamp":"2026-10-10T00:00:00.000Z","type":"turn_context","payload":{"model":"'),
        Buffer.alloc(MAX_LINE_BYTES, 0x6e),
        Buffer.from('"}}\n'),
        Buffer.from(`${R.taskStarted('t1')}\n`),
      ]);
      writeFileSync(file, body);
      const { state } = await scanPrefix(file, body.length, 'codex:test', 0);
      // Boolean on purpose: the wrong value would be the giant line, and the diff must not print it.
      expect(state.model === 'before').toBe(true);
      expect(state.turnOpen).toBe(true);
      expect(warn).toHaveBeenCalledWith(`oversize-line:${file}`, expect.stringContaining('8 MiB'));
    } finally {
      warn.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
