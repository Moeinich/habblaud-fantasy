import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Activity } from '../../shared/types';
import { nameKey } from '../../shared/appearance';
import { hash32 } from '../../shared/hash';
import { FANTASY_NAME_POOLS, isFantasyName } from '../../shared/fantasy-names';
import { raceOfRoom } from '../../shared/race';
import { setQuiet } from '../log';
import { tempDir } from '../test/fixtures';
import { NameStore } from './names';
import { DONE_GRACE_MS, Office, OFFLINE_GRACE_MS, SNAPSHOT_RECENT } from './office';
import { isLegacyRoomId, normalizeCwd, projectPath, roomDisplayNames, roomKey, SlotAllocator } from './rooms';

setQuiet(true);

describe('SlotAllocator', () => {
  it('lowest free slot, stable while the room exists', () => {
    const s = new SlotAllocator(30_000);
    s.sync(['a', 'b', 'c'], 0);
    expect(['a', 'b', 'c'].map((id) => s.slotOf(id))).toEqual([0, 1, 2]);
    s.sync(['c', 'a', 'b'], 1);
    expect(s.slotOf('c')).toBe(2);
  });

  it('a freed slot is only reused after the cooldown', () => {
    const s = new SlotAllocator(30_000);
    s.sync(['a', 'b'], 0);
    s.sync(['b'], 1_000);
    s.sync(['b', 'c'], 2_000);
    expect(s.slotOf('c')).toBe(2);
    s.sync(['b', 'c', 'd'], 31_000);
    expect(s.slotOf('d')).toBe(0);
  });
});

describe('rooms', () => {
  it('normalizes the cwd', () => {
    expect(normalizeCwd('/a//b/')).toBe('/a/b');
    expect(normalizeCwd('/')).toBe('/');
  });

  it('disambiguates repeated basenames with the parent folder', () => {
    const names = roomDisplayNames(
      new Map([
        ['1', '/p/company/applications/app'],
        ['2', '/p/other/app'],
        ['3', '/p/habblaud'],
      ]),
    );
    expect([...names.values()]).toEqual(['applications/app', 'other/app', 'habblaud']);
  });
});

describe('room identity (roomKey)', () => {
  it('two different paths with the same folder name are the same room, across case and trailing slashes', () => {
    expect(roomKey('/Users/ana/GitHub/tilbudsmodul')).toBe('tilbudsmodul');
    expect(roomKey('/Users/ana/kode/tilbudsmodul/')).toBe('tilbudsmodul');
    expect(roomKey('/home/ana/Code/Tilbudsmodul')).toBe('tilbudsmodul');
    expect(roomKey('C:\\Users\\ana\\kode\\tilbudsmodul')).toBe('tilbudsmodul');
  });

  it('different folder names are different rooms', () => {
    expect(roomKey('/p/shop')).not.toBe(roomKey('/p/shop-api'));
    expect(roomKey('/p/api')).not.toBe(roomKey('/p/web'));
  });

  it('an agent worktree is the room of its repository (also a subfolder of it, and Codex worktrees)', () => {
    expect(projectPath('/p/GitHub/shop/.claude/worktrees/feat-x')).toBe('/p/GitHub/shop');
    expect(roomKey('/p/GitHub/shop/.claude/worktrees/feat-x')).toBe('shop');
    expect(roomKey('/p/GitHub/shop/.claude/worktrees/feat-x/server')).toBe('shop');
    expect(roomKey('/p/shop/.codex/worktrees/abc')).toBe('shop');
  });

  it('root and legacy ids', () => {
    expect(roomKey('/')).toBe('/');
    expect(isLegacyRoomId('/p/api')).toBe(true);
    expect(isLegacyRoomId('C:\\p\\api')).toBe(true);
    expect(isLegacyRoomId('api')).toBe(false);
    expect(isLegacyRoomId('/')).toBe(false);
  });
});

describe('NameStore', () => {
  it('names unique among those present and persisted across restarts', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'data', 'names.json');
      const a = new NameStore(file);
      const used = new Set<string>();
      const first = a.assign('sess-1', 'orc', used);
      used.add(first.name);
      const second = a.assign('sess-2', 'orc', used);
      expect(second.name).not.toBe(first.name);
      expect(FANTASY_NAME_POOLS.orc.some((p) => p.name === first.name && p.look === first.look)).toBe(true);
      expect(FANTASY_NAME_POOLS.orc.some((p) => p.name === second.name)).toBe(true);
      a.flush();
      expect(JSON.parse(readFileSync(file, 'utf8')).names['sess-1'].name).toBe(first.name);

      const b = new NameStore(file);
      b.load();
      expect(b.assign('sess-1', 'orc', new Set()).name).toBe(first.name);
      // If the persisted name clashes with someone present, picks another.
      expect(b.assign('sess-1', 'orc', new Set([first.name])).name).not.toBe(first.name);
    } finally {
      tmp.cleanup();
    }
  });
});

describe('NameStore: each room\'s character', () => {
  const NOW = 1_700_000_000_000;
  const DAY = 86_400_000;

  it('writes, reloads, returns copies and reservedNames leaves its own room out', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'names.json');
      const a = new NameStore(file, { now: () => NOW });
      a.setCharacter('api', { name: 'Ana', look: 'f', seed: 7, parts: { hairStyle: 'bob' } });
      a.setCharacter('web', { name: 'Bia', look: 'f', seed: 8 });
      a.flush();
      expect(JSON.parse(readFileSync(file, 'utf8')).rooms['api']).toEqual({ name: 'Ana', look: 'f', seed: 7, parts: { hairStyle: 'bob' }, at: NOW });

      const b = new NameStore(file, { now: () => NOW });
      b.load();
      expect(b.character('api')).toEqual({ name: 'Ana', look: 'f', seed: 7, parts: { hairStyle: 'bob' }, at: NOW });
      expect([...b.reservedNames('api')]).toEqual([['Bia', 'web']]);
      expect(b.reservedNames().size).toBe(2);
      b.character('api')!.parts!.hairStyle = 'long';
      expect(b.character('api')!.parts).toEqual({ hairStyle: 'bob' });
      b.clearCharacter('api');
      expect(b.character('api')).toBeUndefined();
    } finally {
      tmp.cleanup();
    }
  });

  it('names.json with an invalid rooms: the names stay and only what is broken is dropped', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'names.json');
      const names = { s1: { name: 'Marina', look: 'f', at: NOW } };
      writeFileSync(
        file,
        JSON.stringify({
          version: 2,
          names,
          rooms: {
            'ok': { name: ' Ana   Paula ', look: 'f', seed: 1, at: NOW },
            'color': { name: 'Bia', look: 'f', seed: 1, parts: { skin: 'red' }, at: NOW },
            'seed': { name: 'Caio', look: 'm', seed: -1, at: NOW },
            'look': { name: 'Davi', look: 'x', seed: 1, at: NOW },
            'name': { name: '', look: 'm', seed: 1, at: NOW },
            'junk': 'x',
          },
        }),
      );
      const s = new NameStore(file, { now: () => NOW });
      s.load();
      expect(s.assign('s1', 'human', new Set()).name).toBe('Marina');
      expect(s.character('ok')?.name).toBe('Ana Paula');
      for (const r of ['color', 'seed', 'look', 'name', 'junk']) expect(s.character(r)).toBeUndefined();

      for (const rooms of ['x', [1], null]) {
        writeFileSync(file, JSON.stringify({ version: 2, names, rooms }));
        const t = new NameStore(file, { now: () => NOW });
        t.load();
        expect(t.assign('s1', 'human', new Set()).name).toBe('Marina');
        expect(t.reservedNames().size).toBe(0);
      }
    } finally {
      tmp.cleanup();
    }
  });

  it('names.json from before the fantasy names: old names are re-picked in the race style, chosen characters stay', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'names.json');
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          names: { old: { name: 'Marina', look: 'f', at: NOW }, fantasy: { name: 'Aldric', look: 'm', at: NOW } },
          rooms: {
            '/Users/ana/GitHub/shop': { name: 'Zé Backend', look: 'm', seed: 42, owner: 's1', at: NOW - 1_000 },
            '/Users/ana/kode/shop': { name: 'Bia', look: 'f', seed: 3, at: NOW },
            '/Users/ana/web': { name: 'Caio', look: 'm', seed: 5, at: NOW },
          },
        }),
      );
      const s = new NameStore(file, { now: () => NOW });
      s.load();
      expect(s.get('old')).toBeUndefined();
      const repicked = s.assign('old', 'orc', new Set());
      expect(FANTASY_NAME_POOLS.orc.some((p) => p.name === repicked.name)).toBe(true);
      expect(s.assign('fantasy', 'elf', new Set()).name).toBe('Aldric');
      // Characters move to the folder-name room; two folders of the same project: the most recently used one wins.
      expect(s.character('shop')).toMatchObject({ name: 'Bia', seed: 3 });
      expect(s.character('web')).toMatchObject({ name: 'Caio' });
      expect(s.character('/Users/ana/web')).toBeUndefined();
      s.flush();
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      expect(saved.version).toBe(2);
      expect(Object.keys(saved.rooms).sort()).toEqual(['shop', 'web']);

      // Version 2: a name outside the pools (a character kept as a session name) is not migrated again.
      s.remember('custom', { name: 'Zé', look: 'm' });
      s.flush();
      const t = new NameStore(file, { now: () => NOW });
      t.load();
      expect(t.get('custom')?.name).toBe('Zé');
      expect(t.get('old')?.name).toBe(repicked.name);
    } finally {
      tmp.cleanup();
    }
  });

  it('owner: claimCharacter changes the owner and it is written; an out-of-format owner is dropped without losing the entry', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'names.json');
      const base = { look: 'f', seed: 1, at: NOW } as const;
      writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          names: {},
          rooms: {
            'ok': { ...base, name: 'Ana', owner: 'sess-1' },
            'limit': { ...base, name: 'Bia', owner: 'x'.repeat(200) },
            'number': { ...base, name: 'Caio', owner: 5 },
            'empty': { ...base, name: 'Davi', owner: '' },
            'long': { ...base, name: 'Eva', owner: 'x'.repeat(201) },
          },
        }),
      );
      const s = new NameStore(file, { now: () => NOW });
      s.load();
      expect(s.character('ok')).toEqual({ ...base, name: 'Ana', owner: 'sess-1' });
      expect(s.character('limit')?.owner).toBe('x'.repeat(200));
      for (const [r, name] of [['number', 'Caio'], ['empty', 'Davi'], ['long', 'Eva']]) {
        expect(s.character(r), r).toEqual({ ...base, name });
      }
      s.claimCharacter('number', 'sess-2');
      s.flush();
      expect(JSON.parse(readFileSync(file, 'utf8')).rooms['number']).toEqual({ ...base, name: 'Caio', owner: 'sess-2' });
    } finally {
      tmp.cleanup();
    }
  });

  it('a character unused for 60 days goes away on flush; using it renews the deadline', () => {
    const tmp = tempDir();
    try {
      const file = join(tmp.dir, 'names.json');
      let clock = NOW;
      const s = new NameStore(file, { now: () => clock });
      s.setCharacter('old', { name: 'Otto', look: 'm', seed: 1 });
      s.setCharacter('used', { name: 'Nina', look: 'f', seed: 2 });
      clock += 59 * DAY;
      s.claimCharacter('used', 's1');
      clock += 2 * DAY;
      s.flush();
      expect(s.character('old')).toBeUndefined();
      const r = new NameStore(file, { now: () => clock });
      r.load();
      expect(r.character('old')).toBeUndefined();
      expect(r.character('used')?.name).toBe('Nina');
    } finally {
      tmp.cleanup();
    }
  });
});

function makeOffice(names = new NameStore(null)) {
  let clock = 1_000_000;
  const office = new Office({
    names,
    version: 't',
    startedAt: clock,
    accounts: (s) => [{ id: 'acc', short: 'C', name: 'Account C', color: '#f08a3c', configDir: '/x', sessions: s.get('acc') ?? 0, usageStatus: 'disabled' }],
    sources: () => [],
    accountName: () => 'Account C',
    now: () => clock,
  });
  return { office, names, advance: (ms: number) => (clock += ms), now: () => clock };
}

const act = (id: string, at: number, kind: Activity['kind'] = 'read'): Activity => ({ id, at, kind, icon: '📖', text: 'Reading x' });

describe('Office', () => {
  it('notices with a 10 s dedupe and a batched feed', () => {
    const { office, advance, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/loja/', role: 'Main agent', startedAt: now(), status: 'working' });
    const name = office.get('acc:1')!.name;
    office.addActivity('acc:1', act('a1', now()), true);
    let r = office.commit();
    expect(r.changed).toBe(true);
    expect(r.notices.map((n) => n.text)).toEqual(['🏗️ New room: loja', `👋 ${name} arrived in loja (Account C)`]);
    expect(r.feed.map((f) => f.id)).toEqual(['a1']);
    expect(r.snapshot.accounts[0].sessions).toBe(1);
    office.setStatus('acc:1', 'waiting', 'approve a permission');
    office.setStatus('acc:1', 'working');
    office.setStatus('acc:1', 'waiting', 'approve a permission');
    r = office.commit();
    expect(r.notices.filter((n) => n.level === 'alert')).toHaveLength(1);
    advance(11_000);
    office.setStatus('acc:1', 'working');
    office.setStatus('acc:1', 'waiting', 'approve a permission');
    expect(office.commit().notices.filter((n) => n.level === 'alert')).toHaveLength(1);
  });

  it('the feed carries the agent\'s account; the snapshot carries only the latest activities (full history in the detail)', () => {
    const { office, advance, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    for (let i = 0; i < 20; i++) {
      advance(1_000);
      office.addActivity('acc:1', act(`a${i}`, now()), true);
    }
    const r = office.commit();
    expect(r.feed.every((f) => f.account === 'acc')).toBe(true);
    const snap = r.snapshot.agents[0];
    expect(snap.recent.map((a) => a.id)).toEqual(Array.from({ length: SNAPSHOT_RECENT }, (_, i) => `a${20 - SNAPSHOT_RECENT + i}`));
    expect(snap.activity?.id).toBe('a19');
    expect(office.detail('acc:1')!.history).toHaveLength(20);
    // Old activities (start of the transcript) only go into the history, in order and without duplicates.
    office.mergeHistory('acc:1', [act('old-1', 10), act('old-2', 20), act('a0', now())]);
    const h = office.detail('acc:1')!.history;
    expect(h.slice(0, 3).map((a) => a.id)).toEqual(['old-1', 'old-2', 'a0']);
    expect(h).toHaveLength(22);
    expect(office.commit().feed).toEqual([]);
  });

  it('boot with the agent waiting for you: "Needs you" bubble with no notice or feed', () => {
    const { office, now } = makeOffice();
    office.beginBoot();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'waiting', waitingFor: 'answer a question' });
    office.addActivity('acc:1', { ...act('w1', now()), kind: 'delegate', text: 'Orchestrating a workflow' }, true);
    office.endBoot();
    const r = office.commit();
    expect(r.snapshot.agents[0].activity).toMatchObject({ kind: 'wait', text: 'Needs you: answer a question' });
    expect(r.notices).toEqual([]);
    // The boot feed goes to whoever connects (recentFeed), without the synthesized wait.
    expect(office.recentFeed(10).map((f) => f.id)).toEqual(['w1']);
    // Answered: shows again what it was doing.
    office.setStatus('acc:1', 'working');
    expect(office.get('acc:1')!.activity?.id).toBe('w1');
  });

  it('counted boot: several sources booting, the office is only ready when the last one finishes', () => {
    const { office, advance, now } = makeOffice();
    expect(office.isBooting()).toBe(false);
    office.beginBoot(); // source A (e.g. Claude Code)
    office.beginBoot(); // source B (e.g. Codex, asynchronous)
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    office.addActivity('acc:1', act('a-late', now() - 1_000), true);
    office.endBoot(); // A finished, B not yet
    expect(office.isBooting()).toBe(true);
    // Still booting: no notices or live feed; whatever arrives goes into the boot feed.
    office.addMain({ id: '.codex:t1', provider: 'codex', account: '.codex', sessionId: 't1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'waiting', waitingFor: 'approve a command' });
    office.addActivity('.codex:t1', act('b-early', now() - 5_000), true);
    let r = office.commit();
    expect(r.notices).toEqual([]);
    expect(r.feed).toEqual([]);
    expect(office.recentFeed(10)).toEqual([]);
    office.endBoot(); // B finished: ready
    expect(office.isBooting()).toBe(false);
    // Both sources' feed comes out in chronological order; whoever waits gets the bubble (no notice).
    expect(office.recentFeed(10).map((f) => f.id)).toEqual(['b-early', 'a-late']);
    r = office.commit();
    expect(r.notices).toEqual([]);
    expect(r.snapshot.agents.find((a) => a.id === '.codex:t1')?.activity).toMatchObject({ kind: 'wait' });
    expect(r.snapshot.agents.find((a) => a.id === '.codex:t1')?.provider).toBe('codex');
    expect(r.snapshot.agents.find((a) => a.id === 'acc:1')).not.toHaveProperty('provider');
    // An extra endBoot is ignored (it doesn't make the counter negative).
    office.endBoot();
    office.beginBoot();
    expect(office.isBooting()).toBe(true);
    office.endBoot();
    expect(office.isBooting()).toBe(false);
    // After boot, notices come back.
    advance(1_000);
    office.setStatus('acc:1', 'waiting', 'approve a permission');
    expect(office.commit().notices.length).toBeGreaterThan(0);
  });

  it('a subagent inherits the main agent\'s tool', () => {
    const { office, now } = makeOffice();
    office.addMain({ id: '.codex:t1', provider: 'codex', account: '.codex', sessionId: 't1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    expect(office.addSub({ id: '.codex:t2', parentId: '.codex:t1', sessionId: 't2', role: 'worker', background: false, startedAt: now() })).toBe(true);
    expect(office.get('.codex:t2')).toMatchObject({ provider: 'codex', account: '.codex', parentId: '.codex:t1' });
    // An explicit 'claude' is left absent (absent = 'claude').
    office.addMain({ id: 'acc:9', provider: 'claude', account: 'acc', sessionId: 's9', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    expect(office.get('acc:9')).not.toHaveProperty('provider');
  });

  it('rev only changes when something changed', () => {
    const { office } = makeOffice();
    const r1 = office.commit();
    const r2 = office.commit();
    expect(r2.changed).toBe(false);
    expect(r2.snapshot.rev).toBe(r1.snapshot.rev);
  });

  it('the transcript\'s "Done" replaces the one synthesized from the status change', () => {
    const { office, advance, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    office.addActivity('acc:1', act('a1', now()), true);
    advance(30_000);
    office.setStatus('acc:1', 'idle');
    const synth = office.get('acc:1')!.activity!;
    expect(synth).toMatchObject({ kind: 'done', durationMs: 30_000 });
    office.addActivity('acc:1', { ...act('real', now(), 'done'), text: 'Done in 29s', durationMs: 29_000 }, true);
    const a = office.get('acc:1')!;
    expect(a.activity).toMatchObject({ id: synth.id, text: 'Done in 29s' });
    expect(a.recent.filter((x) => x.kind === 'done')).toHaveLength(1);
  });

  it('busy with the bubble still on an old "Done": shows it is keeping an eye on the subagents (outside the feed)', () => {
    const { office, advance, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    office.addActivity('acc:1', { ...act('fim', now(), 'done'), text: 'Done in 3s' }, true);
    office.commit();
    office.fillWorkingActivity('acc:1');
    expect(office.get('acc:1')!.activity!.id).toBe('fim');
    advance(20_000);
    office.addSub({ id: 's1:x', parentId: 'acc:1', sessionId: 's1', role: 'Workflow', background: false, startedAt: now() });
    office.fillWorkingActivity('acc:1');
    expect(office.get('acc:1')!.activity).toMatchObject({ kind: 'delegate', text: 'Keeping an eye on subagents' });
    expect(office.commit().feed).toEqual([]);
  });

  it('pending foreground command: the "Thinking…" filler doesn\'t cover the wait for the command', () => {
    const { office, advance, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    office.addActivity('acc:1', { ...act('fim', now(), 'done'), text: 'Done in 3s' }, true);
    office.setShells('acc:1', [{ id: 'fg', label: 'Install the dependencies', startedAt: now(), background: false, kind: 'shell' }]);
    advance(20_000);
    office.fillWorkingActivity('acc:1');
    expect(office.get('acc:1')!.activity!.id).toBe('fim');
    office.setShells('acc:1', []);
    expect(office.get('acc:1')!.shells).toBeUndefined();
    office.fillWorkingActivity('acc:1');
    expect(office.get('acc:1')!.activity!.text).toBe('Thinking…');
  });

  it('shell status: "Waiting on shell" bubble instead of "Done", a notice at most every 10 min; ShellDone with a notice', () => {
    const { office, advance, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/loja', role: 'x', startedAt: now(), status: 'working' });
    const name = office.get('acc:1')!.name;
    office.commit();
    const job = { id: 'b1', label: 'Production build', command: 'npm run build', startedAt: now(), background: true, kind: 'shell' as const };
    office.setShells('acc:1', [job, { ...job, id: 'b2', label: 'Migration', startedAt: now() + 5 }]);
    advance(1_000);
    office.setStatus('acc:1', 'shell');
    office.fillShellActivity('acc:1');
    expect(office.get('acc:1')!.activity).toMatchObject({ text: 'Waiting on 2 shells: Production build', detail: 'npm run build', tool: 'ShellWait' });
    // The transcript's "Done" arrives later: the bubble stays on the wait.
    advance(500);
    office.addActivity('acc:1', { ...act('fim', now(), 'done'), text: 'Done in 3s' }, true);
    office.fillShellActivity('acc:1');
    expect(office.get('acc:1')!.activity!.tool).toBe('ShellWait');
    let r = office.commit();
    expect(r.notices.map((n) => n.text)).toEqual([`⏳ ${name} is waiting on the shell in loja: Production build`]);
    expect(r.feed.map((f) => f.activity.text)).toEqual(['Waiting on 2 shells: Production build', 'Done in 3s']);
    expect(r.notices.some((n) => n.text.includes('finished in'))).toBe(false);
    // Back to working and waiting within 10 min: no repeated notice.
    office.setStatus('acc:1', 'working');
    advance(60_000);
    office.setStatus('acc:1', 'shell');
    expect(office.commit().notices).toEqual([]);
    // One of the shells ends.
    office.shellDone('acc:1', job, 'ok', now() + 1_000);
    r = office.commit();
    expect(r.snapshot.agents[0].activity).toMatchObject({ tool: 'ShellDone', text: 'Shell finished: Production build (1min 3s)' });
    expect(r.notices.map((n) => [n.level, n.text])).toEqual([['success', `✅ ${name}: shell finished in loja — Production build`]]);
    // A re-read doesn't duplicate; another shell in the same second still notifies.
    office.shellDone('acc:1', job, 'ok', now() + 1_000);
    office.shellDone('acc:1', { ...job, id: 'b2', label: 'Migration' }, 'failed', now() + 1_000);
    r = office.commit();
    expect(r.notices.map((n) => [n.level, n.text])).toEqual([['warn', `❌ ${name}: shell failed in loja — Migration`]]);
    expect(office.detail('acc:1')!.history.filter((a) => a.tool === 'ShellDone')).toHaveLength(2);
  });

  it('subagent: finishing or closing the session clears the shells', () => {
    const { office, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    office.addSub({ id: 's1:x', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: now() });
    const job = { id: 'fg', label: 'x', startedAt: now(), background: false, kind: 'shell' as const };
    office.setShells('acc:1', [job]);
    office.setShells('s1:x', [job]);
    office.completeSub('s1:x');
    expect(office.get('s1:x')!.shells).toBeUndefined();
    office.setShells('s1:x', [job]);
    expect(office.get('s1:x')!.shells).toBeUndefined();
    office.closeMain('acc:1');
    expect(office.get('acc:1')!.shells).toBeUndefined();
  });

  it('a finished subagent stays 25 s; an offline main agent stays 20 s and takes the room with it', () => {
    const { office, advance, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'x', startedAt: now(), status: 'working' });
    office.addSub({ id: 's1:x', parentId: 'acc:1', sessionId: 's1', role: 'Explore', title: 'Map', background: false, startedAt: now() });
    office.addSub({ id: 's1:y', parentId: 'acc:1', sessionId: 's1', role: 'Plan', background: true, startedAt: now() });
    office.completeSub('s1:x');
    expect(office.commit().notices.at(-1)?.text).toMatch(/delivered “Map” to/);
    advance(DONE_GRACE_MS + 1);
    office.tick();
    expect(office.has('s1:x')).toBe(false);
    office.closeMain('acc:1');
    expect(office.get('s1:y')!.status).toBe('done');
    advance(OFFLINE_GRACE_MS + 1);
    office.tick();
    const snap = office.commit().snapshot;
    expect(snap.agents).toEqual([]);
    expect(snap.rooms).toEqual([]);
  });

  it('mixed demo: rooms in the same allocator, its own accounts and on/off', () => {
    const { office, now } = makeOffice();
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/real', role: 'x', startedAt: now(), status: 'idle' });
    office.setDemo(true);
    const snap = office.commit().snapshot;
    expect(snap.meta.demo).toBe(true);
    const slots = snap.rooms.map((r) => r.slot);
    expect(new Set(slots).size).toBe(slots.length);
    expect(snap.rooms.find((r) => r.id === 'real')!.slot).toBe(0);
    expect(snap.agents.some((a) => a.id.startsWith('demo:'))).toBe(true);
    expect(snap.accounts.map((a) => a.short)).toEqual(['C', 'X', 'Y', 'Z']);
    const demoAgent = snap.agents.find((a) => a.id.startsWith('demo:'))!;
    expect(office.detail(demoAgent.id)?.agent.id).toBe(demoAgent.id);
    office.setDemo(false);
    const off = office.commit().snapshot;
    expect(off.meta.demo).toBe(false);
    expect(off.agents.map((a) => a.id)).toEqual(['acc:1']);
  });

  it('meta.terminal: only with the terminal on', () => {
    expect(makeOffice().office.commit().snapshot.meta.terminal).toBe(false);
    const deps = { names: new NameStore(null), version: 't', startedAt: 0, accounts: () => [], sources: () => [], accountName: () => undefined };
    expect(new Office({ ...deps, terminal: true }).commit().snapshot.meta.terminal).toBe(true);
    expect(new Office({ ...deps, terminal: false }).commit().snapshot.meta.terminal).toBe(false);
  });

  it('canMessage: only present main agents the message registry sees connected; meta.messages with the feature on', () => {
    const reach = new Set<string>();
    const deps = { names: new NameStore(null), version: 't', startedAt: 0, accounts: () => [], sources: () => [], accountName: () => undefined };
    const office = new Office({ ...deps, messages: () => reach });
    office.addMain({ id: 'acc:1', account: 'acc', sessionId: 's1', cwd: '/p/a', role: 'Main agent', startedAt: 0, status: 'idle' });
    office.addMain({ id: 'acc:2', account: 'acc', sessionId: 's2', cwd: '/p/a', role: 'Main agent', startedAt: 0, status: 'working' });
    office.addSub({ id: 's1:sub', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: 0 });
    reach.add('acc:1').add('s1:sub');
    office.markDirty();
    const snap = office.commit().snapshot;
    expect(snap.meta.messages).toBe(true);
    expect(snap.agents.filter((a) => a.canMessage).map((a) => a.id)).toEqual(['acc:1']);
    // Whoever ended the session doesn't receive, even if the registry hasn't noticed yet.
    office.closeMain('acc:1');
    expect(office.commit().snapshot.agents.filter((a) => a.canMessage)).toEqual([]);
    // Without the registry (feature off): meta.messages false and the demo main agents don't receive either.
    const off = new Office(deps);
    off.setDemo(true);
    const offSnap = off.commit().snapshot;
    expect(offSnap.meta.messages).toBe(false);
    expect(offSnap.agents.some((a) => a.canMessage)).toBe(false);
    const on = new Office({ ...deps, messages: () => new Set() });
    on.setDemo(true);
    expect(on.commit().snapshot.agents.filter((a) => a.canMessage).every((a) => a.kind === 'main' && a.id.startsWith('demo:'))).toBe(true);
    expect(on.commit().snapshot.agents.some((a) => a.canMessage)).toBe(true);
  });
});

describe('Office: project character', () => {
  const main = (id: string, sessionId: string, cwd: string, now: number) =>
    ({ id, account: 'acc', sessionId, cwd, role: 'Main agent', startedAt: now, status: 'working' }) as const;
  const parts = { skin: '#5a3623', hairStyle: 'bob' } as const;

  it('setCharacter stores it for the room, applies it right away and notifies; the next session in the room starts with it', () => {
    const { office, names, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api/', now()));
    office.commit();
    const before = office.get('acc:1')!.name;
    expect(office.setCharacter('acc:1', { name: 'Zé Backend', seed: 42, parts })).toEqual({ result: 'ok' });
    expect(office.get('acc:1')).toMatchObject({ name: 'Zé Backend', seed: 42, parts, custom: true });
    expect(names.character('api')).toMatchObject({ name: 'Zé Backend', look: office.get('acc:1')!.look, seed: 42, parts });
    expect(office.commit().notices.map((n) => n.text)).toContain(`✏️ ${before} is now Zé Backend in api`);
    expect(office.setCharacter('acc:1', { name: 'Zé Backend', seed: 43, parts: {} })).toEqual({ result: 'ok' });
    expect(office.get('acc:1')!.parts).toBeUndefined();
    expect(office.commit().notices.map((n) => n.text)).toContain('✏️ Zé Backend got a new look in api');
  });

  it('reopening the session right after closing it (the old one still leaving): the character comes back', () => {
    const { office, advance, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.setCharacter('acc:1', { name: 'Zé Backend', seed: 42, parts });
    office.closeMain('acc:1');
    advance(5_000);
    office.addMain(main('acc:2', 's2', '/p/api', now()));
    expect(office.get('acc:2')).toMatchObject({ name: 'Zé Backend', seed: 42, parts, custom: true });
  });

  it('a second session at the same time in the same room gets a random name', () => {
    const { office, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.setCharacter('acc:1', { name: 'Zé Backend', seed: 42, parts });
    office.addMain(main('acc:2', 's2', '/p/api', now()));
    const b = office.get('acc:2')!;
    expect(b.name).not.toBe('Zé Backend');
    expect(b.custom).toBeUndefined();
    expect(b.parts).toBeUndefined();
    expect(b.seed).toBe(hash32('acc:2'));
  });

  it('a chosen name stays reserved: the draw doesn\'t give it to another session (neither its stored name, nor with other casing)', () => {
    const { office, names, advance, now } = makeOffice();
    names.remember('s9', { name: 'Ana', look: 'f' });
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    expect(office.setCharacter('acc:1', { name: 'ana', seed: 1, parts: {} })).toEqual({ result: 'ok' });
    office.closeMain('acc:1');
    advance(OFFLINE_GRACE_MS + 1);
    office.tick();
    office.addMain(main('acc:9', 's9', '/p/web', now()));
    expect(nameKey(office.get('acc:9')!.name)).not.toBe('ana');
  });

  it('conflicts: someone in the office (case-insensitive), another room\'s character and the demo', () => {
    const { office, advance, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.addMain(main('acc:2', 's2', '/p/web', now()));
    const other = office.get('acc:2')!.name;
    expect(office.setCharacter('acc:1', { name: other.toUpperCase(), seed: 1, parts: {} })).toEqual({
      result: 'conflict',
      message: `${other} is already in the office, in web`,
    });
    expect(office.setCharacter('acc:2', { name: 'Zé', seed: 1, parts: {} })).toEqual({ result: 'ok' });
    office.closeMain('acc:2');
    advance(OFFLINE_GRACE_MS + 1);
    office.tick();
    expect(office.setCharacter('acc:1', { name: 'zé', seed: 1, parts: {} })).toEqual({ result: 'conflict', message: 'Zé is already web\'s character' });
    office.setDemo(true);
    const demo = office.commit().snapshot.agents.find((a) => a.id.startsWith('demo:'))!;
    expect(office.setCharacter('acc:1', { name: demo.name, seed: 1, parts: {} })).toMatchObject({ result: 'conflict' });
  });

  it('a conflict across Unicode forms too: "Júlia" in NFD is the same as the NFC one reserved for another room', () => {
    const { office, advance, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.addMain(main('acc:2', 's2', '/p/web', now()));
    expect(office.setCharacter('acc:2', { name: 'Júlia', seed: 1, parts: {} })).toEqual({ result: 'ok' });
    office.closeMain('acc:2');
    advance(OFFLINE_GRACE_MS + 1);
    office.tick();
    expect(office.setCharacter('acc:1', { name: 'Júlia', seed: 1, parts: {} })).toEqual({
      result: 'conflict',
      message: 'Júlia is already web\'s character',
    });
  });

  it('subagent, demo, someone leaving and an unknown id: not-found', () => {
    const { office, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.addSub({ id: 's1:sub', parentId: 'acc:1', sessionId: 's1', role: 'Explore', background: false, startedAt: now() });
    office.setDemo(true);
    const demo = office.commit().snapshot.agents.find((a) => a.id.startsWith('demo:'))!;
    for (const id of ['s1:sub', demo.id, 'nao-existe']) {
      expect(office.setCharacter(id, { name: 'Zé', seed: 1, parts: {} })).toEqual({ result: 'not-found' });
      expect(office.resetCharacter(id)).toBe('not-found');
    }
    office.closeMain('acc:1');
    expect(office.setCharacter('acc:1', { name: 'Zé', seed: 1, parts: {} })).toEqual({ result: 'not-found' });
  });

  it('resetCharacter goes back to the session\'s drawn name and the id\'s seed; the room loses the character', () => {
    const { office, names, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    const drawn = { name: office.get('acc:1')!.name, look: office.get('acc:1')!.look, seed: office.get('acc:1')!.seed };
    office.setCharacter('acc:1', { name: 'Zé', seed: 9, parts });
    expect(office.resetCharacter('acc:1')).toBe('ok');
    const a = office.get('acc:1')!;
    expect(a).toMatchObject({ ...drawn, seed: hash32('acc:1') });
    expect(a.parts).toBeUndefined();
    expect(a.custom).toBeUndefined();
    expect(names.character('api')).toBeUndefined();
  });

  it('/clear keeps the character and doesn\'t store the chosen name as the new session\'s name', () => {
    const { office, names, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.setCharacter('acc:1', { name: 'Zé', seed: 9, parts });
    office.switchSession('acc:1', 's2');
    expect(office.get('acc:1')).toMatchObject({ name: 'Zé', seed: 9, parts, custom: true, sessionId: 's2' });
    expect(names.get('s2')).toBeUndefined();
  });

  describe('Habblaud restart (names.json on disk)', () => {
    /** Writes names.json and starts a new NameStore and Office reading the same file. */
    const restart = (before: NameStore, file: string) => {
      before.flush();
      const names = new NameStore(file);
      names.load();
      return makeOffice(names);
    };

    /** A (s1) edits the room's character; B (s2), open at the same time, keeps its drawn name. */
    const ownerAndOther = (file: string) => {
      const env = makeOffice(new NameStore(file));
      env.office.addMain(main('acc:1', 's1', '/p/api', env.now()));
      env.office.setCharacter('acc:1', { name: 'Zé Backend', seed: 42, parts });
      env.office.addMain(main('acc:2', 's2', '/p/api', env.now()));
      return { ...env, drawn: env.office.get('acc:2')!.name };
    };

    it('the owner and another session open, and the other arrives first: each comes back with its own', () => {
      const tmp = tempDir();
      try {
        const file = join(tmp.dir, 'names.json');
        const { names, drawn } = ownerAndOther(file);
        const after = restart(names, file);
        after.office.addMain(main('acc:2', 's2', '/p/api', after.now()));
        after.office.addMain(main('acc:1', 's1', '/p/api', after.now()));
        expect(after.office.get('acc:2')).toMatchObject({ name: drawn, seed: hash32('acc:2') });
        expect(after.office.get('acc:2')!.custom).toBeUndefined();
        expect(after.office.get('acc:1')).toMatchObject({ name: 'Zé Backend', seed: 42, parts, custom: true });
        expect(after.names.character('api')?.owner).toBe('s1');
        after.names.flush();
      } finally {
        tmp.cleanup();
      }
    });

    it('the owner left and only the other carries on: it doesn\'t switch character midway through the session', () => {
      const tmp = tempDir();
      try {
        const file = join(tmp.dir, 'names.json');
        const { office, names, advance, drawn } = ownerAndOther(file);
        office.closeMain('acc:1');
        advance(OFFLINE_GRACE_MS + 1);
        office.tick();
        const after = restart(names, file);
        after.office.addMain(main('acc:2', 's2', '/p/api', after.now()));
        expect(after.office.get('acc:2')).toMatchObject({ name: drawn, seed: hash32('acc:2') });
        expect(after.office.get('acc:2')!.custom).toBeUndefined();
        expect(after.names.character('api')?.owner).toBe('s1');
        after.names.flush();
      } finally {
        tmp.cleanup();
      }
    });

    it('a new session (no stored name) in an empty room: gets the character and becomes the owner', () => {
      const tmp = tempDir();
      try {
        const file = join(tmp.dir, 'names.json');
        const { office, names, advance } = ownerAndOther(file);
        for (const id of ['acc:1', 'acc:2']) office.closeMain(id);
        advance(OFFLINE_GRACE_MS + 1);
        office.tick();
        const after = restart(names, file);
        after.office.addMain(main('acc:3', 's3', '/p/api', after.now()));
        expect(after.office.get('acc:3')).toMatchObject({ name: 'Zé Backend', seed: 42, parts, custom: true });
        expect(after.names.character('api')?.owner).toBe('s3');
        after.names.flush();
      } finally {
        tmp.cleanup();
      }
    });

    it('an old entry, without an owner: applies to whoever arrives first, who becomes the owner', () => {
      const tmp = tempDir();
      try {
        const file = join(tmp.dir, 'names.json');
        const at = Date.now();
        writeFileSync(
          file,
          JSON.stringify({
            version: 1,
            names: { s2: { name: 'Marina', look: 'f', at } },
            rooms: { '/p/api': { name: 'Zé Backend', look: 'm', seed: 42, at } },
          }),
        );
        const names = new NameStore(file);
        names.load();
        const { office, now } = makeOffice(names);
        office.addMain(main('acc:2', 's2', '/p/api', now()));
        expect(office.get('acc:2')).toMatchObject({ name: 'Zé Backend', seed: 42, custom: true });
        expect(names.character('api')?.owner).toBe('s2');
        names.flush();
      } finally {
        tmp.cleanup();
      }
    });

    it('the owner\'s /clear: the character passes to the new session, which gets it after the restart', () => {
      const tmp = tempDir();
      try {
        const file = join(tmp.dir, 'names.json');
        const { office, names, drawn } = ownerAndOther(file);
        office.switchSession('acc:1', 's1b');
        expect(names.character('api')?.owner).toBe('s1b');
        const after = restart(names, file);
        after.office.addMain(main('acc:2', 's2', '/p/api', after.now()));
        after.office.addMain(main('acc:1', 's1b', '/p/api', after.now()));
        expect(after.office.get('acc:2')!.name).toBe(drawn);
        expect(after.office.get('acc:1')).toMatchObject({ name: 'Zé Backend', custom: true });
        after.names.flush();
      } finally {
        tmp.cleanup();
      }
    });

    it('one got the character on arrival and another session of the room saves another: after the restart each comes back as who it was', () => {
      const tmp = tempDir();
      try {
        const file = join(tmp.dir, 'names.json');
        const { office, names, advance, now } = makeOffice(new NameStore(file));
        office.addMain(main('acc:0', 's0', '/p/api', now()));
        office.setCharacter('acc:0', { name: 'Zé', seed: 9, parts });
        office.closeMain('acc:0');
        advance(OFFLINE_GRACE_MS + 1);
        office.tick();
        office.addMain(main('acc:1', 's1', '/p/api', now()));
        expect(office.get('acc:1')).toMatchObject({ name: 'Zé', custom: true });
        office.addMain(main('acc:2', 's2', '/p/api', now()));
        expect(office.setCharacter('acc:2', { name: 'Bia', seed: 3, parts: {} })).toEqual({ result: 'ok' });
        expect(office.get('acc:1')!.name).toBe('Zé');
        expect(office.get('acc:1')!.custom).toBeUndefined();
        const after = restart(names, file);
        after.office.addMain(main('acc:1', 's1', '/p/api', after.now()));
        after.office.addMain(main('acc:2', 's2', '/p/api', after.now()));
        expect(after.office.get('acc:1')!.name).toBe('Zé');
        expect(after.office.get('acc:2')).toMatchObject({ name: 'Bia', custom: true });
        after.names.flush();
      } finally {
        tmp.cleanup();
      }
    });
  });

  it('"Back to random" from a non-owner doesn\'t delete the character another session of the room saved', () => {
    const { office, names, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.setCharacter('acc:1', { name: 'Zé', seed: 9, parts });
    office.addMain(main('acc:2', 's2', '/p/api', now()));
    office.setCharacter('acc:2', { name: 'Bia', seed: 3, parts: {} });
    expect(office.resetCharacter('acc:1')).toBe('ok');
    expect(names.character('api')).toMatchObject({ name: 'Bia', owner: 's2' });
    expect(office.get('acc:2')).toMatchObject({ name: 'Bia', custom: true });
  });

  it('the name of someone who just left (and may reopen the session) can\'t be chosen', () => {
    const { office, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.addMain(main('acc:2', 's2', '/p/web', now()));
    const leaving = office.get('acc:2')!.name;
    office.closeMain('acc:2');
    expect(office.setCharacter('acc:1', { name: leaving, seed: 1, parts: {} })).toMatchObject({ result: 'conflict' });
  });

  it('/clear from a non-owner (another agent of the room saved later) doesn\'t touch the owner', () => {
    const { office, names, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.setCharacter('acc:1', { name: 'Zé', seed: 9, parts });
    office.addMain(main('acc:2', 's2', '/p/api', now()));
    office.setCharacter('acc:2', { name: 'Bia', seed: 3, parts: {} });
    expect(names.character('api')?.owner).toBe('s2');
    office.switchSession('acc:1', 's1b');
    expect(names.character('api')?.owner).toBe('s2');
    office.switchSession('acc:2', 's2b');
    expect(names.character('api')?.owner).toBe('s2b');
  });
});

describe('Office: one room per project folder name', () => {
  const main = (id: string, sessionId: string, cwd: string, now: number, machine?: { id: string; name: string }) => ({
    id,
    account: 'acc',
    sessionId,
    cwd,
    role: 'Main agent',
    startedAt: now,
    status: 'working' as const,
    ...(machine ? { machine } : {}),
  });

  it('two paths with the same folder name share one room; each agent keeps its own folder', () => {
    const { office, advance, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/Users/ana/GitHub/tilbudsmodul', now()));
    advance(1_000);
    office.addMain(main('acc:2', 's2', '/Users/ana/kode/Tilbudsmodul', now()));
    const snap = office.commit().snapshot;
    expect(snap.rooms).toHaveLength(1);
    expect(snap.rooms[0]).toMatchObject({ id: 'tilbudsmodul', slot: 0, seed: hash32('tilbudsmodul') });
    expect(snap.agents.map((a) => a.roomId)).toEqual(['tilbudsmodul', 'tilbudsmodul']);
    // The room shows the folder of the most recently active agent.
    expect(snap.rooms[0]).toMatchObject({ path: '/Users/ana/kode/Tilbudsmodul', name: 'Tilbudsmodul' });
    advance(1_000);
    office.addActivity('acc:1', act('a1', now()), true);
    expect(office.commit().snapshot.rooms[0]).toMatchObject({ path: '/Users/ana/GitHub/tilbudsmodul', name: 'tilbudsmodul' });
    expect(office.roomPaths('tilbudsmodul')).toEqual(['/Users/ana/GitHub/tilbudsmodul', '/Users/ana/kode/Tilbudsmodul']);
    expect(office.agentCwd('acc:1')).toBe('/Users/ana/GitHub/tilbudsmodul');
    expect(office.agentCwd('acc:2')).toBe('/Users/ana/kode/Tilbudsmodul');
    office.addSub({ id: 's2:x', parentId: 'acc:2', sessionId: 's2', role: 'Explore', background: false, startedAt: now() });
    expect(office.agentCwd('s2:x')).toBe('/Users/ana/kode/Tilbudsmodul');
  });

  it('different folder names are different rooms', () => {
    const { office, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/api', now()));
    office.addMain(main('acc:2', 's2', '/p/web', now()));
    expect(office.commit().snapshot.rooms.map((r) => r.id)).toEqual(['api', 'web']);
  });

  it('an agent worktree joins the room of its repository, which shows the repository folder', () => {
    const { office, advance, now } = makeOffice();
    office.addMain(main('acc:1', 's1', '/p/GitHub/shop', now()));
    advance(1_000);
    office.addMain(main('acc:2', 's2', '/p/GitHub/shop/.claude/worktrees/feat-x', now()));
    const snap = office.commit().snapshot;
    expect(snap.rooms).toMatchObject([{ id: 'shop', name: 'shop', path: '/p/GitHub/shop' }]);
    expect(office.agentCwd('acc:2')).toBe('/p/GitHub/shop/.claude/worktrees/feat-x');
  });

  it('machine: kept while every agent of the room comes from the same other machine; a local folder is preferred', () => {
    const { office, advance, now } = makeOffice();
    const mac = { id: 'mac-a', name: 'mac-a' };
    office.addMain(main('r:mac-a:1', 's1', '/Users/bo/code/shop', now(), mac));
    expect(office.commit().snapshot.rooms[0]).toMatchObject({ id: 'shop', machine: mac, path: '/Users/bo/code/shop' });
    office.addMain(main('acc:2', 's2', '/Users/ana/GitHub/shop', now()));
    advance(1_000);
    office.addActivity('r:mac-a:1', act('r1', now()), true);
    const room = office.commit().snapshot.rooms[0];
    expect(room.machine).toBeUndefined();
    // The remote agent is the most recent, but "New session" opens a terminal here: the local folder wins.
    expect(room.path).toBe('/Users/ana/GitHub/shop');
    office.closeMain('acc:2');
    advance(OFFLINE_GRACE_MS + 1);
    office.tick();
    expect(office.commit().snapshot.rooms[0]).toMatchObject({ machine: mac, path: '/Users/bo/code/shop' });
  });

  it('a room renamed by any of its folders keeps the name', () => {
    const aliases = new Map([['/p/old/shop', 'Shop']]);
    const office = new Office({
      names: new NameStore(null),
      roomAlias: (path) => aliases.get(path),
      version: 't',
      startedAt: 0,
      accounts: () => [],
      sources: () => [],
      accountName: () => undefined,
    });
    office.addMain(main('acc:1', 's1', '/p/new/shop', 0));
    expect(office.commit().snapshot.rooms[0].name).toBe('shop');
    office.addMain(main('acc:2', 's2', '/p/old/shop', 0));
    expect(office.commit().snapshot.rooms[0].name).toBe('Shop');
  });

  it('agents get fantasy names in the style of their room race', () => {
    const { office, now } = makeOffice();
    for (const [i, folder] of ['api', 'web', 'shop', 'docs', 'infra', 'mobile'].entries()) {
      office.addMain(main(`acc:${i}`, `s${i}`, `/p/${folder}`, now()));
      const a = office.get(`acc:${i}`)!;
      expect(FANTASY_NAME_POOLS[raceOfRoom(a.roomId)].some((p) => p.name === a.name && p.look === a.look), a.name).toBe(true);
    }
    expect(office.list().every((a) => isFantasyName(a.name))).toBe(true);
  });
});
