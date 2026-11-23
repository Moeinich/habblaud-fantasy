import { describe, expect, it } from 'vitest';
import type { AccountInfo, AgentInfo, RoomInfo, ShellJob } from '../../../shared/types';
import {
  accountsOf,
  activityFallback,
  aggregateTasks,
  computeCounters,
  displayStatus,
  FOREGROUND_WAIT_MS,
  groupRooms,
  hasRunningShells,
  matchesQuery,
  mergeHistory,
  roleLabel,
  SHELL_STAGES,
  shellBoxText,
  shellDoneKind,
  shellKindLabel,
  shellLine,
  shellStage,
  shellWait,
  shellWaitIn,
  shellWaitingAgents,
  shortcutHint,
  sortByUrgency,
  statusLabel,
  visibleShells,
  waitingAgents,
} from './model';

function agent(p: Partial<AgentInfo> & Pick<AgentInfo, 'id' | 'roomId'>): AgentInfo {
  return {
    kind: 'main',
    name: p.id,
    look: 'f',
    role: p.kind === 'sub' ? 'Explore' : 'Main agent',
    sessionId: `s-${p.id}`,
    account: '.claude',
    status: 'working',
    recent: [],
    tasks: [],
    startedAt: 0,
    lastEventAt: 0,
    statusSince: 0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: 1,
    ...p,
  };
}

function room(id: string, slot: number, path = `/Users/dev/projects/${id}`): RoomInfo {
  return { id, name: id, path, slot, seed: slot, createdAt: 0 };
}

const accounts: AccountInfo[] = [
  { id: '.claude', short: 'C', name: 'Account C', email: 'dev@company.example', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' },
  { id: '.claude-conta2', short: 'D', name: 'Account D', email: 'me@personal.example', color: '#4aa8e8', configDir: '~/.claude-conta2', sessions: 1, usageStatus: 'disabled' },
];

const rooms = [room('shop', 2), room('api', 0), room('site', 1)];
const agents: AgentInfo[] = [
  agent({ id: 'marina', name: 'Marina', roomId: 'api', startedAt: 10, status: 'waiting', statusSince: 50 }),
  agent({ id: 'joao', name: 'João', roomId: 'api', startedAt: 5, account: '.claude-conta2', tasks: [{ id: '1', title: 'a', status: 'completed' }, { id: '2', title: 'b', status: 'in_progress' }] }),
  agent({ id: 'sub1', name: 'Bruno', kind: 'sub', parentId: 'joao', roomId: 'api', startedAt: 20, role: 'Explore', account: '.claude-conta2' }),
  agent({ id: 'sub2', name: 'Clara', kind: 'sub', parentId: 'joao', roomId: 'api', startedAt: 15, role: 'Plan', status: 'done', account: '.claude-conta2' }),
  agent({ id: 'orphan', name: 'Diego', kind: 'sub', parentId: 'sumiu', roomId: 'site', startedAt: 1 }),
  agent({ id: 'leaving', name: 'Elisa', roomId: 'shop', status: 'offline', tasks: [{ id: '1', title: 'x', status: 'pending' }] }),
  agent({ id: 'ana', name: 'Ana', roomId: 'shop', status: 'waiting', statusSince: 20 }),
];
const snap = { rooms, agents, accounts };

describe('computeCounters', () => {
  it('counts rooms, present agents, working, active subagents and waiting', () => {
    expect(computeCounters(snap)).toEqual({ rooms: 3, agents: 6, working: 3, subagents: 2, waiting: 2, shells: 0 });
    expect(computeCounters(null)).toEqual({ rooms: 0, agents: 0, working: 0, subagents: 0, waiting: 0, shells: 0 });
  });
  it('waitingAgents sorts by who has waited longest', () => {
    expect(waitingAgents(agents).map((a) => a.id)).toEqual(['ana', 'marina']);
  });
});

describe('groupRooms', () => {
  it('sorts rooms by slot and nests subagents under the parent', () => {
    const g = groupRooms(snap);
    expect(g.map((r) => r.room.id)).toEqual(['api', 'site', 'shop']);
    const api = g[0];
    expect(api.nodes.map((n) => n.agent.id)).toEqual(['joao', 'marina']);
    expect(api.nodes[0].subs.map((s) => s.id)).toEqual(['sub2', 'sub1']);
    expect(api.nodes[0].subTotal).toBe(2);
    expect(api.accounts).toEqual(['.claude', '.claude-conta2']);
    expect(api.tasks).toEqual({ completed: 1, inProgress: 1, total: 2 });
  });
  it('a subagent without its parent in the room becomes a top-level item', () => {
    const site = groupRooms(snap).find((r) => r.room.id === 'site')!;
    expect(site.nodes.map((n) => n.agent.id)).toEqual(['orphan']);
  });
  it('filters by accent-insensitive text (a subagent name keeps the parent as context)', () => {
    const g = groupRooms(snap, { query: 'bruno', hiddenAccounts: new Set() });
    expect(g.map((r) => r.room.id)).toEqual(['api']);
    expect(g[0].nodes.map((n) => n.agent.id)).toEqual(['joao']);
    expect(g[0].nodes[0].subs.map((s) => s.id)).toEqual(['sub1']);
    expect(g[0].matches).toBe(1);
  });
  it('if the main agent matches, shows all subagents', () => {
    const g = groupRooms(snap, { query: 'joao', hiddenAccounts: new Set() });
    expect(g[0].nodes[0].subs).toHaveLength(2);
  });
  it('searches by room/path and by account', () => {
    expect(groupRooms(snap, { query: 'projects/shop', hiddenAccounts: new Set() }).map((r) => r.room.id)).toEqual(['shop']);
    const byAccount = groupRooms(snap, { query: 'personal', hiddenAccounts: new Set() });
    expect(byAccount.flatMap((r) => r.nodes.map((n) => n.agent.id))).toEqual(['joao']);
  });
  it('hides accounts turned off in the filter', () => {
    const g = groupRooms(snap, { query: '', hiddenAccounts: new Set(['.claude-conta2']) });
    const api = g.find((r) => r.room.id === 'api')!;
    expect(api.nodes.map((n) => n.agent.id)).toEqual(['marina']);
    const onlyD = groupRooms(snap, { query: '', hiddenAccounts: new Set(['.claude']) });
    expect(onlyD.map((r) => r.room.id)).toEqual(['api']);
  });
  it('without a snapshot returns an empty list', () => {
    expect(groupRooms(null)).toEqual([]);
  });
});

describe('utilities', () => {
  it('matchesQuery requires every term', () => {
    const a = agents[0];
    expect(matchesQuery(a, rooms[1], accounts[0], 'marina api')).toBe(true);
    expect(matchesQuery(a, rooms[1], accounts[0], 'marina shop')).toBe(false);
    expect(matchesQuery(a, rooms[1], accounts[0], '   ')).toBe(true);
  });
  it('roleLabel', () => {
    expect(roleLabel({ kind: 'main', role: 'Main agent' })).toBe('Main agent');
    expect(roleLabel({ kind: 'main', role: '' })).toBe('Main agent');
    expect(roleLabel({ kind: 'sub', role: '' })).toBe('Subagent');
  });
  it('aggregateTasks sums tasks of several agents', () => {
    expect(aggregateTasks(agents)).toEqual({ completed: 1, inProgress: 1, total: 3 });
  });
  it('accountsOf keeps the account order', () => {
    expect(accountsOf([{ account: '.claude-conta2' }, { account: '.claude' }, { account: 'x' }], accounts)).toEqual(['.claude', '.claude-conta2', 'x']);
  });
  it('sortByUrgency puts who needs you first', () => {
    expect(sortByUrgency(agents.filter((a) => a.roomId === 'api')).map((a) => a.id)).toEqual(['marina', 'joao', 'sub1', 'sub2']);
  });
  it('shortcutHint', () => {
    expect(shortcutHint(accounts)).toBe('shortcuts c or d');
    expect(shortcutHint([accounts[0]])).toBe('shortcut c');
    expect(shortcutHint([{ short: 'C' }, { short: 'D' }, { short: 'E' }])).toBe('shortcuts c, d or e');
    expect(shortcutHint([])).toBe('');
  });
  it('mergeHistory dedupes and sorts by time', () => {
    const h = [
      { id: 'a', at: 1 },
      { id: 'b', at: 3 },
    ];
    const r = [
      { id: 'b', at: 3 },
      { id: 'c', at: 2 },
    ];
    expect(mergeHistory(h, r).map((x) => x.id)).toEqual(['a', 'c', 'b']);
    expect(mergeHistory(h, r, 2).map((x) => x.id)).toEqual(['c', 'b']);
  });
  it('mergeHistory in replay drops activities after the instant', () => {
    // Selected the agent at t=2000 (final activity already in the history) and went back to t=1000:
    // the snapshot only has the 1000 one, but the 2000 one must not stay in the drawer.
    const accumulated = [
      { id: 'a', at: 1000 },
      { id: 'b', at: 2000 },
    ];
    const atInstant = [{ id: 'a', at: 1000 }];
    expect(mergeHistory(accumulated, atInstant).map((x) => x.id)).toEqual(['a', 'b']);
    expect(mergeHistory(accumulated, atInstant, 200, 1000).map((x) => x.id)).toEqual(['a']);
    // A live history response that still includes the future: at the replay instant it is dropped too.
    const liveResponse = [
      { id: 'a', at: 1000 },
      { id: 'c', at: 500 },
      { id: 'b', at: 2000 },
    ];
    expect(mergeHistory(atInstant, liveResponse, 200, 1000).map((x) => x.id)).toEqual(['c', 'a']);
  });
});

describe('activityFallback', () => {
  it('no activity yet: text by status, never "Arriving…" for someone already seated', () => {
    expect(activityFallback({ status: 'idle' })).toBe('Waiting for instructions');
    expect(activityFallback({ status: 'working' })).toBe('Working…');
    expect(activityFallback({ status: 'waiting', waitingFor: 'approve a permission' })).toBe('Needs you: approve a permission');
    expect(activityFallback({ status: 'waiting' })).toBe('Needs you');
    expect(activityFallback({ status: 'shell' })).toBe('Waiting for the shell to finish');
    expect(activityFallback({ status: 'done' })).toBe('Finished the task');
    expect(activityFallback({ status: 'offline' })).toBe('Leaving the office');
  });
});

// ---------------------------------------------------------------- waiting on the shell

const S = 1_000;
const MIN = 60 * S;
const NOW = 1_800_000_000_000;

function job(p: Partial<ShellJob> & Pick<ShellJob, 'id'>): ShellJob {
  return { label: `Command ${p.id}`, startedAt: NOW - MIN, background: true, kind: 'shell', ...p };
}

describe('shellWait', () => {
  it("status 'shell': all commands, the time is the oldest shell's", () => {
    const w = shellWait(
      {
        status: 'shell',
        statusSince: NOW - 5 * S,
        shells: [job({ id: 'b2', startedAt: NOW - 2 * MIN }), job({ id: 'b1', label: 'Run the suite', startedAt: NOW - 12 * MIN })],
      },
      NOW,
    )!;
    expect(w.jobs.map((j) => j.id)).toEqual(['b1', 'b2']);
    expect(w.main?.label).toBe('Run the suite');
    expect(w.since).toBe(NOW - 12 * MIN);
    expect(w.foreground).toBe(false);
  });
  it('an older monitor doesn\'t drive the time when there is a shell', () => {
    const w = shellWait(
      { status: 'shell', statusSince: NOW, shells: [job({ id: 'm', kind: 'monitor', startedAt: NOW - 60 * MIN }), job({ id: 'b', startedAt: NOW - MIN })] },
      NOW,
    )!;
    expect(w.main?.id).toBe('b');
    expect(w.since).toBe(NOW - MIN);
    expect(w.jobs).toHaveLength(2);
  });
  it("status 'shell' with no known commands uses statusSince", () => {
    const w = shellWait({ status: 'shell', statusSince: NOW - 30 * S }, NOW)!;
    expect(w.jobs).toEqual([]);
    expect(w.main).toBeUndefined();
    expect(w.since).toBe(NOW - 30 * S);
  });
  it('working: only foreground commands running for more than 10 s', () => {
    const fresh = job({ id: 'f', background: false, startedAt: NOW - 3 * S });
    const long = job({ id: 'l', background: false, startedAt: NOW - FOREGROUND_WAIT_MS });
    const bg = job({ id: 'bg', startedAt: NOW - 20 * MIN });
    expect(shellWait({ status: 'working', statusSince: 0, shells: [fresh, bg] }, NOW)).toBeNull();
    const w = shellWait({ status: 'working', statusSince: 0, shells: [fresh, long, bg] }, NOW)!;
    expect(w.jobs.map((j) => j.id)).toEqual(['l']);
    expect(w.foreground).toBe(true);
  });
  it('other statuses never wait on a shell; a start in the future (clock ahead) is capped at now', () => {
    expect(shellWait({ status: 'idle', statusSince: 0, shells: [job({ id: 'x' })] }, NOW)).toBeNull();
    expect(shellWait({ status: 'waiting', statusSince: 0, shells: [job({ id: 'x' })] }, NOW)).toBeNull();
    expect(shellWait({ status: 'shell', statusSince: 0, shells: [job({ id: 'x', startedAt: NOW + 5 * S })] }, NOW)!.since).toBe(NOW);
  });
  it('displayStatus shows a long foreground command as "Waiting on shell"', () => {
    const long = job({ id: 'l', background: false, startedAt: NOW - 15 * S });
    expect(displayStatus({ status: 'working', statusSince: 0, shells: [long] }, NOW)).toBe('shell');
    expect(displayStatus({ status: 'working', statusSince: 0, shells: [] }, NOW)).toBe('working');
    expect(displayStatus({ status: 'shell', statusSince: 0 }, NOW)).toBe('shell');
    expect(statusLabel('shell')).toBe('Waiting on shell');
  });
});

describe('counting and order with shells', () => {
  const shellRoom = [room('mega', 0)];
  const list: AgentInfo[] = [
    agent({ id: 'beatriz', roomId: 'mega', status: 'shell', statusSince: NOW - MIN, shells: [job({ id: 'b1', startedAt: NOW - 8 * MIN }), job({ id: 'b2' })] }),
    agent({ id: 'caio', roomId: 'mega', status: 'working', startedAt: 2, shells: [job({ id: 'fg', background: false, startedAt: NOW - 30 * S })] }),
    agent({ id: 'dani', roomId: 'mega', status: 'working', startedAt: 3, shells: [job({ id: 'fg2', background: false, startedAt: NOW - 2 * S })] }),
    agent({ id: 'eva', roomId: 'mega', status: 'shell', startedAt: 4, statusSince: NOW - 3 * S }),
    agent({ id: 'gone', roomId: 'mega', status: 'offline', shells: [job({ id: 'z' })] }),
    agent({ id: 'gabi', roomId: 'mega', status: 'waiting', startedAt: 5 }),
  ];
  it('computeCounters counts the awaited shells and removes from "working" anyone stuck on a long command', () => {
    expect(computeCounters({ rooms: shellRoom, agents: list }, NOW)).toEqual({ rooms: 1, agents: 5, working: 1, subagents: 0, waiting: 1, shells: 4 });
  });
  it('shellWaitingAgents: longest-waiting first', () => {
    expect(shellWaitingAgents(list, NOW).map((a) => a.id)).toEqual(['beatriz', 'caio', 'eva']);
  });
  it('sortByUrgency: "needs you" > "waiting on shell" > "working"', () => {
    expect(sortByUrgency(list).map((a) => a.id)).toEqual(['gabi', 'beatriz', 'eva', 'caio', 'dani', 'gone']);
  });
  it('hasRunningShells turns on the timer only with running shells', () => {
    expect(hasRunningShells({ agents: list })).toBe(true);
    expect(hasRunningShells({ agents: [agent({ id: 'x', roomId: 'mega', status: 'idle' })] })).toBe(false);
    expect(hasRunningShells({ agents: [agent({ id: 'x', roomId: 'mega', status: 'offline', shells: [job({ id: 'z' })] })] })).toBe(false);
    expect(hasRunningShells(null)).toBe(false);
  });
  it('visibleShells hides just-started foreground commands', () => {
    const a = { shells: [job({ id: 'new', background: false, startedAt: NOW - 500 }), job({ id: 'mon', kind: 'monitor', startedAt: NOW - 100 }), job({ id: 'bg', startedAt: NOW - 5 * MIN })] };
    expect(visibleShells(a, NOW).map((j) => j.id)).toEqual(['bg', 'mon']);
    expect(visibleShells({}, NOW)).toEqual([]);
  });
  it('search finds the agent by the shell it is waiting on', () => {
    const a = agent({ id: 'b', roomId: 'mega', status: 'shell', shells: [job({ id: 'b1', label: 'Run the full suite with phpunit' })] });
    expect(matchesQuery(a, shellRoom[0], undefined, 'phpunit')).toBe(true);
    expect(matchesQuery(a, shellRoom[0], undefined, 'waiting shell')).toBe(true);
    expect(matchesQuery(agent({ id: 'x', roomId: 'mega', status: 'idle' }), shellRoom[0], undefined, 'shell')).toBe(false);
  });
});

describe('shellWaitIn', () => {
  const main = agent({ id: 'm', roomId: 'mega', status: 'shell', statusSince: NOW - 10 * S });
  const sub = agent({ id: 's', kind: 'sub', parentId: 'm', roomId: 'mega', status: 'done', shells: [job({ id: 'b1', label: 'Sub build', startedAt: NOW - 4 * MIN })] });
  const grandchild = agent({ id: 'n', kind: 'sub', parentId: 's', roomId: 'mega', status: 'working', shells: [job({ id: 'b2', startedAt: NOW - MIN }), job({ id: 'fg', background: false, startedAt: NOW - 2 * S })] });
  it('without its own shells, uses the subagents\' background ones (at any level)', () => {
    const w = shellWaitIn(main, [main, sub, grandchild], NOW)!;
    expect(w.jobs.map((j) => j.id)).toEqual(['b1', 'b2']);
    expect(w.main?.label).toBe('Sub build');
    expect(w.since).toBe(NOW - 4 * MIN);
  });
  it('with its own shells (or outside the shell status), ignores the subagents', () => {
    const own = { ...main, shells: [job({ id: 'mine' })] };
    expect(shellWaitIn(own, [own, sub], NOW)!.jobs.map((j) => j.id)).toEqual(['mine']);
    expect(shellWaitIn({ ...main, status: 'idle' }, [main, sub], NOW)).toBeNull();
    expect(shellWaitIn(main, [main], NOW)!.jobs).toEqual([]);
  });
  it('computeCounters counts inherited shells', () => {
    expect(computeCounters({ rooms: [room('mega', 0)], agents: [main, sub] }, NOW).shells).toBe(1);
    expect(computeCounters({ rooms: [room('mega', 0)], agents: [main, sub, grandchild] }, NOW).shells).toBe(2);
  });
});

describe('wait texts', () => {
  it('shellLine: "⏳ <label> · <time>" and "×N" with several', () => {
    const one = shellLine({ jobs: [job({ id: 'a', label: 'Run tests' })], main: job({ id: 'a', label: 'Run tests' }), since: NOW - 75 * S, foreground: false }, NOW);
    expect(one).toEqual({ label: 'Run tests', time: '1:15', count: '', text: '⏳ Run tests · 1:15' });
    const two = shellLine({ jobs: [job({ id: 'a' }), job({ id: 'b' })], main: job({ id: 'a', label: 'Build' }), since: NOW - 62 * MIN, foreground: false }, NOW);
    expect(two.count).toBe('×2');
    expect(two.time).toBe('1:02:00');
    expect(two.text).toBe('⏳ Build · 1:02:00 (2 shells)');
  });
  it('shellLine with no known commands uses a generic text', () => {
    expect(shellLine({ jobs: [], since: NOW, foreground: false }, NOW).label).toBe('Waiting for the shell to finish');
    expect(shellLine({ jobs: [], since: NOW, foreground: true }, NOW).label).toBe('Waiting for the command to finish');
  });
  it('shellBoxText explains what is happening', () => {
    expect(shellBoxText({ foreground: false, jobs: [job({ id: 'a' })] })).toMatch(/^Finished the turn and is waiting for the shell to finish\./);
    expect(shellBoxText({ foreground: false, jobs: [job({ id: 'a' }), job({ id: 'b' })] })).toMatch(/waiting for 2 shells to finish/);
    expect(shellBoxText({ foreground: true, jobs: [] })).toMatch(/Stuck on a terminal command/);
  });
  it('shellKindLabel', () => {
    expect(shellKindLabel({ kind: 'shell', background: true })).toBe('background');
    expect(shellKindLabel({ kind: 'shell', background: false })).toBe('foreground');
    expect(shellKindLabel({ kind: 'monitor', background: true })).toBe('monitor');
  });
  it('shellStage follows the escalation: popcorn, chair spin, cobweb, nap', () => {
    expect(SHELL_STAGES.map((s) => s.stage)).toEqual(['popcorn', 'spin', 'cobweb', 'nap']);
    expect(shellStage(0)).toMatchObject({ stage: 'popcorn', nextIn: 3 * MIN });
    expect(shellStage(3 * MIN - 1).stage).toBe('popcorn');
    expect(shellStage(3 * MIN)).toMatchObject({ stage: 'spin', nextIn: 7 * MIN });
    expect(shellStage(10 * MIN).stage).toBe('cobweb');
    expect(shellStage(24 * MIN + 59 * S)).toMatchObject({ stage: 'cobweb', nextIn: S });
    expect(shellStage(25 * MIN)).toMatchObject({ stage: 'nap', nextIn: null });
    expect(shellStage(-5 * S).stage).toBe('popcorn');
  });
  it('shellDoneKind recognizes the server\'s ShellDone marker', () => {
    expect(shellDoneKind({ tool: 'ShellDone' })).toBe('ok');
    expect(shellDoneKind({ tool: 'ShellDone', error: true })).toBe('fail');
    expect(shellDoneKind({ tool: 'Bash', error: true })).toBeNull();
    expect(shellDoneKind(undefined)).toBeNull();
  });
});
