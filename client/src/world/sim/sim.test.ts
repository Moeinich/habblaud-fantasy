// Simulation integration without a DOM: snapshots -> characters walking, sitting, turning off the light and leaving.
import { describe, expect, it } from 'vitest';
import { COL_W } from '../constants';
import type { AppearanceParts } from '../../../../shared/appearance';
import type { AgentInfo, OfficeSnapshot, RoomInfo, ShellJob } from '../../../../shared/types';
import type { Appearance, ArtModule, RoomTheme } from '../../art/api';
import { DEFAULT_WORLD_OPTIONS } from '../api';
import type { Character } from './character';
import { SHELL_DONE_TOOL, Sim } from './sim';
import { cellSlot, emptyShape, inRect, slotColumn, slotWing } from '../layout/geometry';
import { packDepartments } from '../layout/departments';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

const appearance: Appearance = {
  skin: '#f0c8a0',
  hair: '#3a2a20',
  hairStyle: 'short',
  eyes: '#222',
  top: '#3f7fd8',
  topAccent: '#fff',
  topStyle: 'tshirt',
  bottom: '#333',
  shoes: '#111',
  accessory: 'none',
  accessoryColor: '#000',
  lanyard: null,
  look: 'm',
};

const art = {
  appearanceFromSeed: () => appearance,
  roomTheme: () => theme,
} as unknown as ArtModule;

const T0 = 1_700_000_000_000;

/** Where n orc rooms end up once everything is in place. */
function orcPlan(n: number) {
  return packDepartments(Array.from({ length: n }, (_, i) => ({ id: `r${i}`, race: 'orc' as const, span: 1, order: i })));
}

/** Cell of the k-th of n orc rooms once everything is in place. */
function at(n: number, k: number): number {
  return orcPlan(n).targets.get(`r${k}`)!.slot;
}

function room(id: string, slot: number): RoomInfo {
  // an orc room, so the rooms line up in the orc zone (orcPlan)
  return { id, name: id.replace('/', ''), path: id, slot, seed: slot * 120 + 2, createdAt: T0 };
}

function agent(id: string, roomId: string, status: AgentInfo['status'], extra: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    kind: 'main',
    roomId,
    name: id,
    look: 'f',
    role: 'Main agent',
    sessionId: `s-${id}`,
    account: '.claude',
    status,
    recent: [],
    tasks: [],
    startedAt: T0,
    lastEventAt: T0,
    statusSince: T0,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed: id.length * 1234567,
    ...extra,
  };
}

function snap(rooms: RoomInfo[], agents: AgentInfo[], rev = 1): OfficeSnapshot {
  return {
    rev,
    serverTime: T0,
    rooms,
    agents,
    accounts: [{ id: '.claude', short: 'C', name: 'Account C', color: '#f08a3c', configDir: '~/.claude', sessions: 1, usageStatus: 'ok' }],
    meta: { demo: true, sources: [], startedAt: T0, version: 't' },
  };
}

/** Advances the simulation in steps of 1/30 s. */
function run(sim: Sim, clock: { now: number }, seconds: number, until?: () => boolean): void {
  const steps = Math.round(seconds * 30);
  for (let i = 0; i < steps; i++) {
    clock.now += 1000 / 30;
    sim.update(1 / 30, clock.now);
    if (until?.()) return;
  }
}

function newSim(): Sim {
  return new Sim(art, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }));
}

describe('office simulation', () => {
  it('initial load: whoever is working is already seated typing, room lit', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working'), agent('bia', '/a', 'waiting', { waitingFor: 'approve' })]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    const bia = sim.chars.get('bia')!;
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ana.pose).toBe('type');
    expect(bia.pose).toBe('raise_hand');
    expect(bia.mode).toBe('wait');
    const r = sim.rooms.get('/a')!;
    expect(r.phase).toBe('ready');
    expect(r.lightOn).toBe(true);
  });

  it('arrival: a new room is built dark, the first one turns on the light and sits', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 0.2);
    sim.applySnapshot(snap([room('/a', 0), room('/b', 1)], [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 2), clock.now);
    const b = sim.rooms.get('/b')!;
    expect(b.phase).toBe('building');
    expect(b.lightOn).toBe(false);
    const caio = sim.chars.get('caio')!;
    expect(caio.step?.t ?? caio.queue[0]?.t).toBe('elevOut');
    run(sim, clock, 60, () => !!caio.homeSpot && caio.atSpot === caio.homeSpot && !caio.step && !caio.queue.length);
    expect(b.phase).toBe('ready');
    expect(b.lightOn).toBe(true);
    expect(caio.atSpot).toBe(caio.homeSpot);
    run(sim, clock, 0.1);
    expect(caio.pose).toBe('type');
  });

  it('arrival: changing status on the way to the switch does not leave the room dark', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 0.2);
    const rooms = [room('/a', 0), room('/b', 1)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 2), clock.now);
    const b = sim.rooms.get('/b')!;
    const caio = sim.chars.get('caio')!;
    run(sim, clock, 3);
    expect(b.lightOn).toBe(false);
    expect(b.switchClaim).toBe('caio');
    // still walking to the switch: the status changes twice (the plan is redone)
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'waiting', { waitingFor: 'approve' })], 3), clock.now);
    run(sim, clock, 0.5);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 4), clock.now);
    run(sim, clock, 60, () => b.lightOn && caio.atSpot === caio.homeSpot && !caio.step && !caio.queue.length);
    expect(b.lightOn).toBe(true);
    expect(caio.atSpot).toBe(caio.homeSpot);
  });

  it('departure: whoever just turned on the light and already has to leave turns it off again on the way out', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    run(sim, clock, 0.2);
    const rooms = [room('/a', 0), room('/b', 1)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 2), clock.now);
    const b = sim.rooms.get('/b')!;
    const caio = sim.chars.get('caio')!;
    run(sim, clock, 60, () => caio.step?.t === 'switch');
    expect(caio.step?.t).toBe('switch');
    // the session ends right in the middle of the switch click
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working'), agent('caio', '/b', 'offline')], 3), clock.now);
    run(sim, clock, 20, () => caio.leaving && !b.lightOn);
    expect(b.lightOn).toBe(false);
    // still on the way to the elevator when the light goes off
    expect(sim.chars.has('caio')).toBe(true);
    run(sim, clock, 90, () => !sim.rooms.has('/b'));
    expect(sim.rooms.has('/b')).toBe(false);
  });

  it('departure: the last one turns off the light, goes to the elevator, disappears and the room is dismantled', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0), room('/b', 1)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('caio', '/b', 'working'), agent('davi', '/b', 'idle')]), clock.now);
    run(sim, clock, 0.5);
    // sessions of room /b end: caio goes offline, davi disappears from the snapshot
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working'), agent('caio', '/b', 'offline')], 2), clock.now);
    const b = sim.rooms.get('/b')!;
    expect(b.listed).toBe(false);
    expect(sim.chars.get('caio')!.mode).toBe('leave');
    // davi only leaves after the 3 s debounce
    run(sim, clock, 1);
    expect(sim.chars.get('davi')!.leaving).toBe(false);
    run(sim, clock, 3);
    expect(sim.chars.get('davi')!.leaving).toBe(true);
    // exactly one of them takes charge of the switch
    expect(b.switchClaim).not.toBeNull();
    run(sim, clock, 90, () => !b.lightOn);
    expect(b.lightOn).toBe(false);
    run(sim, clock, 90, () => !sim.chars.has('caio') && !sim.chars.has('davi'));
    expect(sim.chars.has('caio')).toBe(false);
    expect(sim.chars.has('davi')).toBe(false);
    run(sim, clock, 10, () => !sim.rooms.has('/b'));
    expect(sim.rooms.has('/b')).toBe(false);
    // the other room stays lit
    expect(sim.rooms.get('/a')!.lightOn).toBe(true);
  });

  it('a subagent delivers the result to its parent and leaves', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const main = agent('ana', '/a', 'working');
    sim.applySnapshot(snap(rooms, [main]), clock.now);
    run(sim, clock, 0.2);
    const sub = agent('ana:s1', '/a', 'working', { kind: 'sub', parentId: 'ana', name: 'Beto', title: 'Map files' });
    sim.applySnapshot(snap(rooms, [main, sub], 2), clock.now);
    const beto = sim.chars.get('ana:s1')!;
    run(sim, clock, 60, () => beto.atSpot !== null && beto.atSpot === beto.homeSpot && !beto.step && !beto.queue.length);
    expect(beto.homeSpot).not.toBeNull();
    sim.applySnapshot(snap(rooms, [main, { ...sub, status: 'done' }], 3), clock.now);
    expect(beto.mode).toBe('deliver');
    let delivered = false;
    run(sim, clock, 40, () => {
      if (beto.bubbleText?.startsWith('Delivering')) delivered = true;
      return delivered;
    });
    expect(delivered).toBe(true);
    const ana = sim.chars.get('ana')!;
    expect(['check', 'heart']).toContain(ana.icon);
    run(sim, clock, 60, () => !sim.chars.has('ana:s1'));
    expect(sim.chars.has('ana:s1')).toBe(false);
  });

  it('an idle character strolls and comes back to the desk', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { statusSince: T0 })]), clock.now);
    const ana = sim.chars.get('ana')!;
    ana.nextOutingAt = 1;
    let left = false;
    run(sim, clock, 60, () => {
      if (ana.atSpot !== ana.homeSpot) left = true;
      return left && ana.atSpot === ana.homeSpot;
    });
    expect(left).toBe(true);
    // goes back to work immediately when the status changes
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')], 2), clock.now);
    run(sim, clock, 60, () => !!ana.homeSpot && ana.atSpot === ana.homeSpot && !ana.step && !ana.queue.length);
    run(sim, clock, 0.1);
    expect(ana.pose).toBe('type');
  });

  it('whoever dozes at the desk (idle for a long time) wakes up on standing: the "zzz" does not come along', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { statusSince: T0 - 3_600_000 })]), clock.now);
    const ana = sim.chars.get('ana')!;
    run(sim, clock, 60, () => ana.atSpot === ana.homeSpot && ana.icon === 'zzz');
    expect(ana.pose).toBe('sleep');
    expect(ana.icon).toBe('zzz');
    // A gathering (or any plan) takes it out of its place without changing the mode: still "idle for a long time".
    ana.queue.push({ t: 'exit' }, { t: 'act', pose: 'stand', ms: 4000 });
    run(sim, clock, 1.5);
    expect(ana.pose).toBe('stand');
    expect(ana.icon).toBeNull();
    // The once-a-second check doesn't give the "zzz" back to someone standing.
    run(sim, clock, 1.5);
    expect(ana.icon).toBeNull();
  });

  it('fast-forward (hidden tab) teleports to the destinations', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working')]), clock.now);
    sim.applySnapshot(snap([room('/a', 0), room('/b', 1)], [agent('ana', '/a', 'working'), agent('caio', '/b', 'working')], 2), clock.now);
    clock.now += 20_000;
    sim.fastForward(clock.now);
    const caio = sim.chars.get('caio')!;
    expect(caio.atSpot).toBe(caio.homeSpot);
    expect(caio.alpha).toBe(1);
    expect(sim.rooms.get('/b')!.phase).toBe('ready');
    expect(sim.rooms.get('/b')!.lightOn).toBe(true);
  });

  it('faulty snapshots do not break the world', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/inexistente', 'working'), agent('bia', '/a', 'working', { parentId: 'ninguem', kind: 'sub' })]), clock.now);
    run(sim, clock, 5);
    expect(sim.chars.size).toBe(2);
    // room disappears and comes back during dismantling: rebuilds
    sim.applySnapshot(snap([], [], 2), clock.now);
    run(sim, clock, 20);
    sim.applySnapshot(snap([room('/a', 0)], [agent('caio', '/a', 'working')], 3), clock.now);
    run(sim, clock, 5);
    const a = sim.rooms.get('/a');
    expect(a).toBeDefined();
    expect(['building', 'ready']).toContain(a!.phase);
  });

  it('initial load: nobody starts sitting on a corridor/bathroom bench and no room is left empty', () => {
    for (const since of [T0, T0 - 5 * 60_000]) {
      const sim = newSim();
      const clock = { now: T0 };
      const agents: AgentInfo[] = [];
      for (let i = 0; i < 12; i++) agents.push(agent(`ocioso-${String.fromCharCode(97 + i)}${'x'.repeat(i)}`, i % 2 ? '/b' : '/a', 'idle', { statusSince: since }));
      sim.applySnapshot(snap([room('/a', 0), room('/b', 1)], agents), clock.now);
      for (const ch of sim.chars.values()) {
        const at = ch.atSpot ? sim.spots.get(ch.atSpot) : undefined;
        expect(at, `${ch.id} has no place`).toBeDefined();
        expect(at!.kind).not.toBe('bench');
        // whoever just became idle starts at their own desk
        if (since === T0) expect(ch.atSpot).toBe(ch.homeSpot);
      }
      for (const id of ['/a', '/b']) expect([...sim.chars.values()].some((c) => c.roomId === id && c.atSpot === c.homeSpot)).toBe(true);
      // and nobody goes for a stroll in the first seconds
      run(sim, clock, 3);
      if (since === T0) for (const ch of sim.chars.values()) expect(ch.atSpot, ch.id).toBe(ch.homeSpot);
    }
  });

  it('full room: the extras work standing INSIDE the room (instead of wandering around reception)', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const agents: AgentInfo[] = [];
    // more people than even the widest room (4 columns) has desks
    for (let i = 0; i < 46; i++) agents.push(agent(`ag-${i}-${'y'.repeat(i)}`, '/a', 'working'));
    sim.applySnapshot(snap([room('/a', 0)], agents), clock.now);
    run(sim, clock, 25);
    const r = sim.rooms.get('/a')!.layout.rect;
    const inside = (x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    const homeless = [...sim.chars.values()].filter((c) => !c.homeSpot);
    expect(homeless.length).toBeGreaterThan(0);
    const tiles = new Set<string>();
    for (const c of homeless) {
      expect(c.standTile, c.id).not.toBeNull();
      expect(inside(c.standTile!.x, c.standTile!.y)).toBe(true);
      expect(inside(c.tx, c.ty), `${c.id} outside the room at ${c.tx},${c.ty}`).toBe(true);
      const key = `${c.standTile!.x},${c.standTile!.y}`;
      expect(tiles.has(key), `two on the same tile ${key}`).toBe(false);
      tiles.add(key);
    }
    // stopped (not walking in circles) and working on the laptop
    const before = homeless.map((c) => `${c.tx},${c.ty}`);
    run(sim, clock, 15);
    expect(homeless.map((c) => `${c.tx},${c.ty}`)).toEqual(before);
    expect(homeless.every((c) => c.pose === 'read' && c.held === 'laptop')).toBe(true);
    // a place freed up: someone standing sits down
    const seated = [...sim.chars.values()].find((c) => c.homeSpot && c.atSpot === c.homeSpot)!;
    sim.applySnapshot(snap([room('/a', 0)], agents.filter((a) => a.id !== seated.id), 2), clock.now);
    run(sim, clock, 40, () => homeless.some((c) => !!c.homeSpot && c.atSpot === c.homeSpot));
    expect(homeless.some((c) => !!c.homeSpot && c.atSpot === c.homeSpot)).toBe(true);
  });

  it('delegating: talks facing the door with 💬 (the raised hand is only for "needs you")', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const main = agent('ana', '/a', 'working', { activity: { id: 'a1', kind: 'edit', icon: '✏️', text: 'Editing', at: T0 } });
    sim.applySnapshot(snap([room('/a', 0)], [main]), clock.now);
    run(sim, clock, 0.5);
    sim.applySnapshot(snap([room('/a', 0)], [{ ...main, activity: { id: 'a2', kind: 'delegate', icon: '👥', text: 'Delegating', at: T0 } }], 2), clock.now);
    const ana = sim.chars.get('ana')!;
    expect(ana.icon).toBe('chat');
    const poses = new Set<string>();
    run(sim, clock, 3, () => {
      poses.add(ana.pose);
      return false;
    });
    expect(poses.has('talk')).toBe(true);
    expect(poses.has('raise_hand')).toBe(false);
  });

  it('each character has its own pace and lane (people leaving together do not overlap)', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const agents = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'].map((id) => agent(id, '/a', 'working', { seed: id.charCodeAt(0) * 7919 + id.length }));
    sim.applySnapshot(snap([room('/a', 0)], agents), clock.now);
    const chars = [...sim.chars.values()];
    for (const c of chars) {
      expect(c.speedK).toBeGreaterThanOrEqual(0.92);
      expect(c.speedK).toBeLessThanOrEqual(1.08);
      expect(Math.abs(c.lane)).toBeLessThanOrEqual(4);
    }
    expect(new Set(chars.map((c) => c.speedK.toFixed(3))).size).toBeGreaterThan(1);
    expect(new Set(chars.map((c) => c.lane)).size).toBeGreaterThan(1);
  });

  it('edited character: a new seed or parts in the snapshot change the appearance of someone already in the office', () => {
    let calls = 0;
    const spyArt = {
      appearanceFromSeed: (seed: number, opts: { parts?: AppearanceParts } = {}) => {
        calls++;
        return { ...appearance, skin: `#${seed.toString(16).padStart(6, '0')}`, ...opts.parts };
      },
      roomTheme: () => theme,
    } as unknown as ArtModule;
    const sim = new Sim(spyArt, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }));
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working', { seed: 1 })]), clock.now);
    run(sim, clock, 0.2);
    expect(sim.chars.get('ana')!.appearance.skin).toBe('#000001');

    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working', { seed: 2, parts: { hairStyle: 'bob' } })], 2), clock.now);
    const ana = sim.chars.get('ana')!;
    expect(ana.appearance.skin).toBe('#000002');
    expect(ana.appearance.hairStyle).toBe('bob');

    const before = calls;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'idle', { seed: 2, parts: { hairStyle: 'bob' } })], 3), clock.now);
    expect(calls).toBe(before);
  });

  it('edited character: only the parts or only the look changing (same seed) also change the appearance', () => {
    let calls = 0;
    const spyArt = {
      appearanceFromSeed: (seed: number, opts: { look?: 'm' | 'f'; parts?: AppearanceParts } = {}) => {
        calls++;
        return { ...appearance, skin: `#${seed.toString(16).padStart(6, '0')}`, look: opts.look ?? appearance.look, ...opts.parts };
      },
      roomTheme: () => theme,
    } as unknown as ArtModule;
    const sim = new Sim(spyArt, () => ({ ...DEFAULT_WORLD_OPTIONS, liveliness: 'calm' }));
    const clock = { now: T0 };
    let rev = 1;
    const apply = (extra: Partial<AgentInfo>): Character => {
      sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working', { seed: 1, look: 'f', ...extra })], rev++), clock.now);
      return sim.chars.get('ana')!;
    };

    expect(apply({}).appearance.hairStyle).toBe('short');

    // same seed, new parts
    expect(apply({ parts: { hairStyle: 'buzz' } }).appearance.hairStyle).toBe('buzz');

    // same seed, different parts
    expect(apply({ parts: { hairStyle: 'bob' } }).appearance.hairStyle).toBe('bob');

    // same seed, parts removed: back to the fixture's
    expect(apply({ parts: undefined }).appearance.hairStyle).toBe('short');

    // same seed and same parts, only the look differs: regenerates
    apply({ parts: { hairStyle: 'bob' } });
    const before = calls;
    expect(apply({ look: 'm', parts: { hairStyle: 'bob' } }).appearance.look).toBe('m');
    expect(calls).toBe(before + 1);
  });
});

describe('rooms grow and gather in departments', () => {
  /** A room of a given race (theme index = seed % 9, race = index % 3: 0 human, 1 elf, 2 orc). */
  const raceRoom = (id: string, slot: number, race: 'human' | 'elf' | 'orc' | 'undead'): RoomInfo => ({ ...room(id, slot), seed: 1200 + { human: 0, elf: 1, orc: 2, undead: 3 }[race] + slot * 12 });

  it('a room with more people than desks grows, everyone sits, and it shrinks back later', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const four = Array.from({ length: 4 }, (_, i) => agent(`p${i}-${'x'.repeat(i)}`, '/a', 'working'));
    sim.applySnapshot(snap([room('/a', 0)], four), clock.now);
    run(sim, clock, 1);
    const a = sim.rooms.get('/a')!;
    expect(a.span).toBe(1);
    const nine = [...four, ...Array.from({ length: 5 }, (_, i) => agent(`q${i}-${'z'.repeat(i)}`, '/a', 'working'))];
    sim.applySnapshot(snap([room('/a', 0)], nine, 2), clock.now);
    run(sim, clock, 20, () => a.span === 2);
    expect(a.span).toBe(2);
    expect(a.layout.rect.w).toBe(2 * COL_W);
    run(sim, clock, 60, () => [...sim.chars.values()].every((c) => c.homeSpot && a.layout.spots.find((s) => s.id === c.homeSpot)?.kind === 'desk'));
    for (const c of sim.chars.values()) expect(a.layout.spots.find((s) => s.id === c.homeSpot)?.kind, c.id).toBe('desk');
    // the crowd leaves: the room stays wide for a while, then shrinks back
    sim.applySnapshot(snap([room('/a', 0)], [...four, ...nine.slice(4).map((x) => ({ ...x, status: 'offline' as const }))], 3), clock.now);
    run(sim, clock, 20);
    expect(a.span).toBe(2);
    run(sim, clock, 120, () => a.span === 1);
    expect(a.span).toBe(1);
  });

  it('rooms gather in their race corner round the hub: elves top left, orcs top right, undead bottom left, humans bottom right', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [raceRoom('/elf', 0, 'elf'), raceRoom('/hum', 1, 'human'), raceRoom('/orc', 2, 'orc'), raceRoom('/und', 3, 'undead')];
    const people = [agent('ana', '/elf', 'working'), agent('bia', '/hum', 'working'), agent('caio', '/orc', 'working'), agent('edu', '/und', 'working')];
    sim.applySnapshot(snap(rooms, people), clock.now);
    expect(slotWing(sim.rooms.get('/hum')!.slot)).toBe('se');
    expect(slotWing(sim.rooms.get('/orc')!.slot)).toBe('me');
    expect(slotWing(sim.rooms.get('/elf')!.slot)).toBe('mw');
    expect(slotWing(sim.rooms.get('/und')!.slot)).toBe('sw');
    expect(sim.building.shape).toEqual({ ...emptyShape(), mw: 1, me: 1, sw: 1, se: 1 });
    // everyone walks from the elevators to their own desk, across the walkways
    run(sim, clock, 90, () => [...sim.chars.values()].every((c) => c.atSpot && c.atSpot === c.homeSpot));
    for (const id of ['ana', 'bia', 'caio', 'edu']) {
      const c = sim.chars.get(id)!;
      expect(c.atSpot, id).toBe(c.homeSpot);
      expect(inRect(sim.rooms.get(c.roomId)!.layout.rect, c.tx, c.ty), id).toBe(true);
    }
    // a second human room carries on outwards along the hub's row
    sim.applySnapshot(snap([...rooms, raceRoom('/hum2', 3, 'human')], [...people, agent('davi', '/hum2', 'working')], 2), clock.now);
    expect(sim.rooms.get('/hum2')!.slot).toBe(cellSlot(slotColumn(sim.rooms.get('/hum')!.slot) + 1, 'south', 'main'));
  });
});

describe('rooms without gaps', () => {
  const inside = (r: { layout: { rect: { x: number; y: number; w: number; h: number } } }, c: { tx: number; ty: number }) =>
    c.tx >= r.layout.rect.x && c.tx < r.layout.rect.x + r.layout.rect.w && c.ty >= r.layout.rect.y && c.ty < r.layout.rect.y + r.layout.rect.h;

  it('initial load: rooms take the zone cells in server order, even with gaps in its slots', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/c', 8), room('/a', 0), room('/b', 3)], [agent('ana', '/a', 'working'), agent('bia', '/b', 'working'), agent('caio', '/c', 'working')]), clock.now);
    expect(['/a', '/b', '/c'].map((id) => sim.rooms.get(id)!.slot)).toEqual([at(3, 0), at(3, 1), at(3, 2)]);
    expect(sim.building.shape).toEqual(orcPlan(3).shape);
  });

  it('terminal closed: the farthest room moves into the free slot, people walk over and the building shrinks', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0), room('/b', 1), room('/c', 2)];
    const agents = [agent('ana', '/a', 'working'), agent('bia', '/b', 'working'), agent('caio', '/c', 'working'), agent('davi', '/c', 'idle')];
    sim.applySnapshot(snap(rooms, agents), clock.now);
    run(sim, clock, 0.5);
    const c = sim.rooms.get('/c')!;
    const caio = sim.chars.get('caio')!;
    const homeBefore = caio.homeSpot;
    expect(c.slot).toBe(at(3, 2));
    expect(sim.building.shape).toEqual(orcPlan(3).shape);

    // the session of room /b closes: bia leaves and the room is dismantled
    sim.applySnapshot(snap([room('/a', 0), room('/c', 2)], [agents[0], agent('bia', '/b', 'offline'), agents[2], agents[3]], 2), clock.now);
    run(sim, clock, 200, () => !sim.rooms.has('/b'));
    expect(sim.rooms.has('/b')).toBe(false);
    expect(c.slot).toBe(at(3, 2));

    // the slot waits a bit and then room /c moves into it (rebuilt, dark)
    run(sim, clock, 3, () => c.slot === at(2, 1));
    expect(c.slot).toBe(at(2, 1));
    expect(c.phase).toBe('building');
    const ghost = [...sim.rooms.values()].find((r) => r.ghost);
    expect(ghost?.slot).toBe(at(3, 2));
    expect(ghost?.listed).toBe(false);
    // everyone keeps their desk (now in the new room) and walks to it, no teleporting
    expect(caio.homeSpot).toBe(homeBefore);
    let maxStep = 0;
    let px = caio.x;
    let py = caio.y;
    run(sim, clock, 60, () => {
      maxStep = Math.max(maxStep, Math.hypot(caio.x - px, caio.y - py));
      px = caio.x;
      py = caio.y;
      return !sim.rooms.has(ghost!.id) && caio.atSpot === caio.homeSpot && !caio.step && !caio.queue.length;
    });
    expect(maxStep).toBeLessThan(12);
    expect(caio.atSpot).toBe(caio.homeSpot);
    expect(inside(c, caio)).toBe(true);
    expect(c.phase).toBe('ready');
    expect(c.lightOn).toBe(true);
    // the old address emptied, went dark and was dismantled; the building is back to one column of rooms
    expect(sim.rooms.has(ghost!.id)).toBe(false);
    run(sim, clock, 10, () => JSON.stringify(sim.building.shape) === JSON.stringify(orcPlan(2).shape));
    expect(sim.building.shape).toEqual(orcPlan(2).shape);
    // davi (idle, maybe strolling) also has his place in the new room
    expect(c.layout.spots.some((p) => p.id === sim.chars.get('davi')!.homeSpot)).toBe(true);
  });

  it('whoever is leaving does not move: the slot stays until their room disappears', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0), room('/b', 1), room('/c', 2)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working'), agent('bia', '/b', 'working'), agent('caio', '/c', 'working')]), clock.now);
    run(sim, clock, 0.5);
    const c = sim.rooms.get('/c')!;
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'working'), agent('bia', '/b', 'offline'), agent('caio', '/c', 'offline')], 2), clock.now);
    let moved = false;
    run(sim, clock, 240, () => {
      if (c.slot !== at(3, 2) || [...sim.rooms.values()].some((r) => r.ghost)) moved = true;
      return !sim.rooms.has('/b') && !sim.rooms.has('/c');
    });
    expect(moved).toBe(false);
    expect(sim.rooms.has('/c')).toBe(false);
    run(sim, clock, 60, () => JSON.stringify(sim.building.shape) === JSON.stringify(orcPlan(1).shape));
    expect(sim.building.shape).toEqual(orcPlan(1).shape);
  });

  it('opens and closes at random (even in the middle of a move): nobody teleports and no gap is left at the end', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const sim = newSim();
    const clock = { now: T0 };
    const ids = ['/a', '/b', '/c', '/d', '/e', '/f', '/g'];
    const open = new Map<string, number>();
    ids.slice(0, 5).forEach((id, i) => open.set(id, i));
    let nextSlot = 5;
    let rev = 1;
    const agentsOf = (id: string, status: AgentInfo['status']) => [agent(`${id}-1`, id, status), agent(`${id}-2`, id, status === 'offline' ? 'offline' : 'idle')];
    const closed = new Set<string>();
    const push = () => {
      const rs = [...open].map(([id, slot]) => room(id, slot));
      const as = [...open.keys()].flatMap((id) => agentsOf(id, 'working')).concat([...closed].flatMap((id) => agentsOf(id, 'offline')));
      sim.applySnapshot(snap(rs, as, ++rev), clock.now);
    };
    push();
    let maxStep = 0;
    // per character (someone coming back with the same id is another character, coming out of the elevator)
    const last = new WeakMap<object, { x: number; y: number }>();
    const track = () => {
      for (const ch of sim.chars.values()) {
        const p = last.get(ch);
        if (p && ch.visible && !ch.inside && clock.now >= ch.hiddenUntil) maxStep = Math.max(maxStep, Math.hypot(ch.x - p.x, ch.y - p.y));
        last.set(ch, { x: ch.x, y: ch.y });
      }
      return false;
    };
    for (let round = 0; round < 14; round++) {
      const roll = rnd();
      if (roll < 0.55 && open.size > 1) {
        const id = [...open.keys()][Math.floor(rnd() * open.size)];
        open.delete(id);
        closed.add(id);
      } else {
        const id = ids.find((x) => !open.has(x));
        if (id) {
          open.set(id, nextSlot++);
          closed.delete(id);
        }
      }
      push();
      run(sim, clock, 4 + rnd() * 40, track);
    }
    run(sim, clock, 400, () => {
      track();
      const rs = [...sim.rooms.values()];
      const want = new Set([...orcPlan(rs.length).targets.values()].map((t) => t.slot));
      const compact = rs.every((r) => want.has(r.slot));
      return compact && rs.every((r) => r.listed && r.phase === 'ready' && !r.ghost) && [...sim.chars.values()].every((c) => !c.leaving);
    });
    const slots = [...sim.rooms.values()].map((r) => r.slot).sort((a, b) => a - b);
    expect([...sim.rooms.keys()].sort()).toEqual([...open.keys()].sort());
    const plan = orcPlan(open.size);
    expect(slots).toEqual([...plan.targets.values()].map((t) => t.slot).sort((a, b) => a - b));
    expect([...sim.rooms.values()].some((r) => r.ghost)).toBe(false);
    run(sim, clock, 20, () => JSON.stringify(sim.building.shape) === JSON.stringify(plan.shape));
    expect(sim.building.shape).toEqual(plan.shape);
    expect(maxStep).toBeLessThan(12);
  });

  it('a room that opens later takes the first free slot', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0), room('/c', 2)], [agent('ana', '/a', 'working'), agent('caio', '/c', 'working')]), clock.now);
    expect(sim.rooms.get('/c')!.slot).toBe(at(2, 1));
    run(sim, clock, 0.5);
    // the server sends the new room in a high slot; in the building it goes to the next cell
    sim.applySnapshot(snap([room('/a', 0), room('/c', 2), room('/d', 7)], [agent('ana', '/a', 'working'), agent('caio', '/c', 'working'), agent('duda', '/d', 'working')], 2), clock.now);
    expect(sim.rooms.get('/d')!.slot).toBe(at(3, 2));
    expect(sim.rooms.get('/d')!.phase).toBe('building');
  });
});

describe('shell wait', () => {
  const MIN = 60_000;
  const shell = (ageMs: number, extra: Partial<ShellJob> = {}): ShellJob => ({
    id: `b-${ageMs}`,
    label: 'Run the full suite',
    startedAt: T0 - ageMs,
    background: true,
    kind: 'shell',
    ...extra,
  });
  const done = (id: string, error = false): AgentInfo['activity'] => ({ id, kind: 'run', icon: error ? '❌' : '✅', text: 'Shell finished', tool: SHELL_DONE_TOOL, error, at: T0 });

  it('shell status: stays at the desk with the popcorn bucket and does not go for a stroll', () => {
    const sim = newSim();
    const clock = { now: T0 };
    sim.applySnapshot(snap([room('/a', 0)], [agent('ana', '/a', 'shell', { shells: [shell(20_000)] })]), clock.now);
    const ana = sim.chars.get('ana')!;
    expect(ana.mode).toBe('shell');
    expect(ana.shellCount).toBe(1);
    expect(ana.shellLabel).toBe('Run the full suite');
    ana.nextOutingAt = 1;
    run(sim, clock, 60, () => ana.atSpot !== ana.homeSpot);
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ana.pose).toBe('wait');
    expect(ana.held).toBe('popcorn');
    expect(ana.shellStage).toBe('popcorn');
  });

  it('the escalation follows the age of the oldest shell: spins, cobweb/yawn and nap', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'shell', { shells: [shell(4 * MIN), shell(30_000)] })]), clock.now);
    const ana = sim.chars.get('ana')!;
    expect(ana.shellCount).toBe(2);
    run(sim, clock, 0.2);
    expect(ana.shellStage).toBe('restless');
    expect(ana.held).toBe('none');
    const home = sim.spots.get(ana.homeSpot)!;
    const dirs = new Set<string>();
    run(sim, clock, 30, () => {
      dirs.add(ana.dir);
      return false;
    });
    // at least one full spin in the chair
    expect(dirs.size).toBe(4);
    expect(ana.dir).toBe(home.dir);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'shell', { shells: [shell(12 * MIN + (clock.now - T0))] })], 2), clock.now);
    run(sim, clock, 0.1);
    expect(ana.shellStage).toBe('cobweb');
    let yawned = false;
    run(sim, clock, 40, () => {
      if (ana.chatEmoji === '🥱' && ana.pose === 'sleep') yawned = true;
      return yawned;
    });
    expect(yawned).toBe(true);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'shell', { shells: [shell(26 * MIN + (clock.now - T0))] })], 3), clock.now);
    run(sim, clock, 0.1);
    expect(ana.shellStage).toBe('nap');
    expect(ana.pose).toBe('sleep');
  });

  it('strolling when the shell starts: goes back to the desk (leaves the stall normally)', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'idle')]), clock.now);
    const ana = sim.chars.get('ana')!;
    ana.nextOutingAt = 1;
    run(sim, clock, 60, () => ana.atSpot !== ana.homeSpot && !!ana.step && ana.step.t !== 'exit');
    expect(ana.atSpot === ana.homeSpot).toBe(false);
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'shell', { shells: [shell(1000)] })], 2), clock.now);
    expect(ana.mode).toBe('shell');
    let ran = false;
    // the zones lie further from the hub's stalls than the old wings did: the walk back takes a while
    run(sim, clock, 150, () => {
      if (ana.pose === 'run') ran = true;
      return ana.atSpot === ana.homeSpot && !ana.step && !ana.queue.length;
    });
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ran).toBe(false);
    run(sim, clock, 0.1);
    expect(ana.pose).toBe('wait');
  });

  it('long foreground command: typing for the first 10 s, then the same wait', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const fg = shell(0, { id: 'toolu_1', background: false });
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', { shells: [fg] })]), clock.now);
    const ana = sim.chars.get('ana')!;
    run(sim, clock, 5);
    expect(ana.mode).toBe('work');
    expect(ana.pose).toBe('type');
    run(sim, clock, 7);
    expect(ana.mode).toBe('shell');
    expect(ana.pose).toBe('wait');
    expect(ana.atSpot).toBe(ana.homeSpot);
    // the command finished (tool_result): back to typing
    sim.applySnapshot(snap(rooms, [agent('ana', '/a', 'working', { shells: [] })], 2), clock.now);
    run(sim, clock, 0.2);
    expect(ana.mode).toBe('work');
    expect(ana.pose).toBe('type');
  });

  it('shell finished: stands up, celebrates with ⭐ and confetti and goes back to work', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const base = agent('ana', '/a', 'shell', { shells: [shell(2 * MIN)], activity: { id: 'a0', kind: 'run', icon: '💻', text: 'Running', at: T0 } });
    sim.applySnapshot(snap(rooms, [base]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    // the notification arrives and the agent is already back to work in the same snapshot
    sim.applySnapshot(snap(rooms, [{ ...base, status: 'working', shells: [], activity: done('a1') }], 2), clock.now);
    expect(ana.icon).toBe('star');
    expect(sim.effects.some((e) => e.kind === 'confetti' && e.charId === 'ana')).toBe(true);
    const poses = new Set<string>();
    run(sim, clock, 3, () => {
      poses.add(ana.pose);
      return false;
    });
    expect(poses.has('stretch')).toBe(true);
    run(sim, clock, 5, () => ana.atSpot === ana.homeSpot && ana.pose === 'type');
    expect(ana.atSpot).toBe(ana.homeSpot);
    expect(ana.mode).toBe('work');
    expect(ana.pose).toBe('type');
  });

  it('an old shell end does not celebrate on load; a new one behind another activity does', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const old = done('old')!;
    const base = agent('ana', '/a', 'working', { recent: [old], activity: { id: 'a0', kind: 'edit', icon: '✏️', text: 'Editing', at: T0 } });
    sim.applySnapshot(snap(rooms, [base]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    expect(ana.icon).toBeNull();
    expect(sim.effects.length).toBe(0);
    const fresh = { ...done('new')!, at: T0 + 400 };
    const later = { id: 'a2', kind: 'read' as const, icon: '📖', text: 'Reading the output', at: T0 + 450 };
    sim.applySnapshot(snap(rooms, [{ ...base, recent: [old, fresh, later], activity: later }], 2), clock.now);
    expect(ana.icon).toBe('star');
    expect(sim.effects.length).toBe(1);
    // the same snapshot again does not celebrate a second time
    sim.applySnapshot(snap(rooms, [{ ...base, recent: [old, fresh, later], activity: later }], 3), clock.now);
    expect(sim.effects.length).toBe(1);
  });

  it('shell failed: little rain cloud, head down for ~4 s, no confetti', () => {
    const sim = newSim();
    const clock = { now: T0 };
    const rooms = [room('/a', 0)];
    const base = agent('ana', '/a', 'shell', { shells: [shell(2 * MIN), shell(MIN)], activity: { id: 'a0', kind: 'run', icon: '💻', text: 'Running', at: T0 } });
    sim.applySnapshot(snap(rooms, [base]), clock.now);
    run(sim, clock, 0.5);
    const ana = sim.chars.get('ana')!;
    sim.effects.length = 0;
    // one of the two failed; the other keeps running
    sim.applySnapshot(snap(rooms, [{ ...base, shells: [shell(MIN)], activity: done('a1', true) }], 2), clock.now);
    expect(ana.icon).toBe('storm');
    expect(sim.effects.length).toBe(0);
    run(sim, clock, 1);
    expect(ana.pose).toBe('sleep');
    expect(ana.atSpot).toBe(ana.homeSpot);
    run(sim, clock, 4);
    expect(ana.icon).toBeNull();
    expect(ana.mode).toBe('shell');
    expect(ana.shellCount).toBe(1);
    expect(ana.pose).toBe('wait');
  });
});
