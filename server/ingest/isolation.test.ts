// Habblaud World never receives agents of other machines (server/ingest/isolation.ts).
//
// The real BuildingUplink runs against the fake world server (server/test/fake-world.ts) with an office that holds a
// local session AND sessions of two other machines (through the real IngestSource). The packet that reaches the world
// carries only the local agent. A second check pins the wiring in server/index.ts: the uplink gets `localAgents(...)`
// and its tokens come from the local-only "My day" tracker.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { IngestEvent } from '../../shared/ingest';
import type { OfficeSnapshot } from '../../shared/types';
import { VISIBILITY_DEFAULTS, type Player } from '../../shared/world/protocol';
import { worldSocketUrl } from '../config';
import { setQuiet } from '../log';
import { NameStore } from '../model/names';
import { Office } from '../model/office';
import { startFakeWorld } from '../test/fake-world';
import { tempDir } from '../test/fixtures';
import { WorldSettingsStore } from '../world/settings';
import { BuildingUplink } from '../world/uplink';
import { localAgents, localSnapshot } from './isolation';
import { IngestSource } from './source';

setQuiet(true);

const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

const PLAYER: Player = {
  name: 'Ana Pixel',
  look: 'f',
  parts: {},
  traits: ['games', 'cafeina'],
  intro: 'coffee',
  visibility: { ...VISIBILITY_DEFAULTS },
  updatedAt: '2026-10-15T12:00:00Z',
};

async function waitFor(cond: () => boolean, what: string, ms = 3_000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > until) throw new Error(`waiting for: ${what}`);
    await new Promise((ok) => setTimeout(ok, 5));
  }
}

function officeWithRemoteAgents() {
  const office = new Office({ names: new NameStore(null), version: 't', startedAt: 0, accounts: () => [], sources: () => [], accountName: () => undefined });
  office.addMain({ id: '.claude:101', account: '.claude', sessionId: 'local-session', cwd: '/Users/pi/local-project', role: 'Agente principal', startedAt: 1, status: 'working' });
  const ingest = new IngestSource({ office });
  let n = 0;
  const ev = (machine: string, event: IngestEvent['event'], over: Partial<IngestEvent> = {}): [{ id: string; name: string }, IngestEvent] => [
    { id: machine, name: machine },
    { v: 1, id: `evt-${String(++n).padStart(6, '0')}`, at: Date.now() + n, event, account: '.claude', session_id: `remote-session-${machine}`, cwd: `/Users/remote/secret-${machine}`, ...over },
  ];
  for (const m of ['mac-anna', 'mac-bo']) {
    ingest.apply(...ev(m, 'SessionStart'));
    ingest.apply(...ev(m, 'UserPromptSubmit', { prompt: 'remote work' }));
    ingest.apply(...ev(m, 'PreToolUse', { tool_name: 'Agent', tool_use_id: `toolu_${m}`, tool_input: { description: 'remote sub' } }));
    ingest.apply(...ev(m, 'SubagentStart', { agent_id: `agent-${m}`, agent_type: 'Explore' }));
  }
  return office;
}

describe('World isolation', () => {
  it('the uplink packet holds only this machine’s agents, never those of other machines', async () => {
    const office = officeWithRemoteAgents();
    expect(office.list().filter((a) => a.machine)).toHaveLength(4);

    const world = await startFakeWorld();
    closers.push(world.close);
    const tmp = tempDir();
    closers.push(tmp.cleanup);
    const token = randomBytes(32).toString('base64url');
    const email = 'pi@example.com';
    world.accounts.set(email, { email, password: 'x', verified: true, access: 'approved', code: '123456', player: PLAYER, locale: 'en' });
    world.devices.set(token, { email, deviceId: 'dev_1' });
    const store = new WorldSettingsStore(join(tmp.dir, 'world.json'));
    store.save({ deviceId: 'dev_1', token, email, access: 'approved', player: PLAYER });
    const uplink = new BuildingUplink({
      url: worldSocketUrl(world.base),
      version: '1.0.0',
      build: () => ({ commit: 'a'.repeat(40), dirty: false }) as never,
      locale: () => 'en',
      store,
      canAct: () => true,
      // The same view server/index.ts passes.
      agents: () => localAgents(office.list()),
      tokens: () => ({ day: 1_000, week: 2_000 }),
      lastFile: null,
      timing: { debounceMs: 20, minGapMs: 50, pingMs: 10_000, backoffMinMs: 20, backoffMaxMs: 80, welcomeTimeoutMs: 1_000, observeMs: 20 },
      random: () => 0.5,
    });
    closers.push(() => uplink.stop());
    uplink.start();
    await waitFor(() => world.ws.uplinks.length >= 1, 'first uplink');
    const packet = world.ws.uplinks[0].uplink;
    const agents = packet.floors.flatMap((f) => f.agents);
    expect(packet.floors).toHaveLength(1);
    expect(agents).toHaveLength(1);
    const wire = JSON.stringify(world.ws.uplinks);
    for (const leak of ['mac-anna', 'mac-bo', 'secret-', 'remote', 'Explore', 'r:']) expect(wire, leak).not.toContain(leak);
  });

  it('the "My day" view for World drops other machines’ agents, rooms and accounts', () => {
    const office = officeWithRemoteAgents();
    const snap: OfficeSnapshot = office.commit().snapshot;
    snap.accounts = [
      { id: '.claude', short: 'C', name: 'C', color: '#000', configDir: '/x', sessions: 1, usageStatus: 'ok' },
      { id: 'r:mac-anna:.claude', short: 'MA', name: 'mac-anna', color: '#000', configDir: '', sessions: 1, usageStatus: 'ok', machine: { id: 'mac-anna', name: 'mac-anna' } },
    ];
    const local = localSnapshot(snap);
    expect(local.agents.map((a) => a.id)).toEqual(['.claude:101']);
    expect(local.rooms).toHaveLength(1);
    expect(local.accounts.map((a) => a.id)).toEqual(['.claude']);
  });

  it('server/index.ts wires World only to the local views', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'index.ts'), 'utf8');
    const uplinkBlock = src.slice(src.indexOf('new BuildingUplink({'), src.indexOf('new BuildingUplink({') + 2_000);
    expect(uplinkBlock).toMatch(/agents: \(\) => localAgents\(office\.list\(\)\)/);
    expect(uplinkBlock).not.toMatch(/agents: \(\) => office\.list\(\)/);
    expect(src).toMatch(/new BuildingTokens\(\{ stats: localStats \?\? stats \}\)/);
    expect(src).toMatch(/snapshot: \(\) => localSnapshot\(hub\.current\(\)\)/);
    // The local tracker exists whenever ingest and World are both on.
    expect(src).toMatch(/const localStats = config\.ingest && world \?/);
  });
});
