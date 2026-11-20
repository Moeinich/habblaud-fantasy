// Agents of other machines from hook events (server/ingest/source.ts): ids per machine, ordering of async events,
// subagents, /clear, idle timeout, GitHub effects and the release of permission requests answered on the machine.
import { describe, expect, it } from 'vitest';
import type { IngestEvent } from '../../shared/ingest';
import type { MachineRef } from '../../shared/types';
import { setQuiet } from '../log';
import { Office } from '../model/office';
import { NameStore } from '../model/names';
import { CLEAR_SWITCH_MS, IDLE_CLOSE_MS, IngestSource } from './source';

setQuiet(true);

const MAC_A: MachineRef = { id: 'mac-a', name: 'mac-a' };
const MAC_B: MachineRef = { id: 'mac-b', name: 'mac-b' };
const SID = '11111111-2222-3333-4444-555555555555';

function setup() {
  let now = 1_700_000_000_000;
  const clock = { now: () => now, advance: (ms: number) => (now += ms) };
  const office = new Office({ names: new NameStore(null), version: 't', startedAt: 0, accounts: () => [], sources: () => [], accountName: () => undefined, now: clock.now });
  const answered: Array<[string, string | undefined]> = [];
  const source = new IngestSource({ office, now: clock.now, onAnsweredElsewhere: (a, t) => answered.push([a, t]) });
  let n = 0;
  const ev = (event: IngestEvent['event'], over: Partial<IngestEvent> = {}): IngestEvent => ({
    v: 1,
    id: `evt-${String(++n).padStart(6, '0')}`,
    at: clock.now() + n,
    event,
    account: '.claude',
    session_id: SID,
    cwd: '/Users/ana/shop',
    ...over,
  });
  return { office, source, clock, ev, answered };
}

describe('IngestSource', () => {
  it('the same session id on two machines gives two agents, rooms and accounts', () => {
    const { office, source, ev } = setup();
    source.apply(MAC_A, ev('SessionStart', { source: 'startup' }));
    source.apply(MAC_B, ev('SessionStart', { source: 'startup' }));
    const mains = office.list().filter((a) => a.kind === 'main');
    expect(mains.map((a) => a.id).sort()).toEqual([`r:mac-a:${SID}`, `r:mac-b:${SID}`]);
    expect(mains.map((a) => a.account).sort()).toEqual(['r:mac-a:.claude', 'r:mac-b:.claude']);
    expect(new Set(mains.map((a) => a.roomId)).size).toBe(2);
    expect(mains.find((a) => a.id === `r:mac-a:${SID}`)!.machine).toEqual(MAC_A);
    const snap = office.commit().snapshot;
    expect(snap.rooms.every((r) => r.machine)).toBe(true);
  });

  it('status follows the newest event, even when async hooks arrive out of order', () => {
    const { office, source, ev } = setup();
    const id = `r:mac-a:${SID}`;
    source.apply(MAC_A, ev('SessionStart'));
    const prompt = ev('UserPromptSubmit', { prompt: 'Fix the checkout' });
    const late = ev('PostToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_1' });
    const stop = ev('Stop');
    source.apply(MAC_A, prompt);
    source.apply(MAC_A, stop);
    expect(office.get(id)!.status).toBe('idle');
    source.apply(MAC_A, late);
    expect(office.get(id)!.status).toBe('idle');
  });

  it('a duplicate event id is ignored', () => {
    const { office, source, ev } = setup();
    source.apply(MAC_A, ev('SessionStart'));
    const e = ev('PreToolUse', { tool_name: 'Read', tool_use_id: 'toolu_1', tool_input: { file_path: '/x/app.ts' } });
    expect(source.apply(MAC_A, e)).toBe(true);
    expect(source.apply(MAC_A, e)).toBe(false);
    expect(office.get(`r:mac-a:${SID}`)!.stats.toolCalls).toBe(1);
  });

  it('activities, prompt title, tasks and the waiting notification', () => {
    const { office, source, ev } = setup();
    const id = `r:mac-a:${SID}`;
    source.apply(MAC_A, ev('SessionStart'));
    source.apply(MAC_A, ev('UserPromptSubmit', { prompt: 'Fix the checkout totals' }));
    source.apply(MAC_A, ev('PreToolUse', { tool_name: 'Edit', tool_use_id: 'toolu_2', tool_input: { file_path: '/Users/ana/shop/cart.ts' } }));
    source.apply(MAC_A, ev('PreToolUse', { tool_name: 'TodoWrite', tool_use_id: 'toolu_3', tool_input: { todos: [{ content: 'Fix totals', status: 'in_progress', activeForm: 'Fixing totals' }] } }));
    let a = office.get(id)!;
    expect(a.status).toBe('working');
    expect(a.title).toBe('Fix the checkout totals');
    expect(a.tasks).toEqual([{ id: '1', title: 'Fix totals', status: 'in_progress', activeForm: 'Fixing totals' }]);
    expect(a.recent.some((x) => x.tool === 'Edit' && x.text.includes('cart.ts'))).toBe(true);
    source.apply(MAC_A, ev('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }));
    a = office.get(id)!;
    expect(a.status).toBe('waiting');
  });

  it('subagents: created with the Agent call description, finished on SubagentStop', () => {
    const { office, source, ev } = setup();
    source.apply(MAC_A, ev('SessionStart'));
    source.apply(MAC_A, ev('PreToolUse', { tool_name: 'Agent', tool_use_id: 'toolu_4', tool_input: { description: 'Explore the cart', prompt: '...' } }));
    source.apply(MAC_A, ev('SubagentStart', { agent_id: 'agent-1', agent_type: 'Explore' }));
    const subId = `r:mac-a:${SID}:agent-1`;
    const sub = office.get(subId)!;
    expect(sub).toMatchObject({ kind: 'sub', parentId: `r:mac-a:${SID}`, role: 'Explore', title: 'Explore the cart', machine: MAC_A });
    source.apply(MAC_A, ev('PreToolUse', { agent_id: 'agent-1', tool_name: 'Grep', tool_use_id: 'toolu_5', tool_input: { pattern: 'total' } }));
    expect(office.get(subId)!.recent.some((x) => x.tool === 'Grep')).toBe(true);
    source.apply(MAC_A, ev('SubagentStop', { agent_id: 'agent-1', agent_type: 'Explore' }));
    expect(office.get(subId)!.status).toBe('done');
  });

  it('a merged PR starts the party in the remote room', () => {
    const { office, source, ev } = setup();
    source.apply(MAC_A, ev('SessionStart'));
    source.apply(MAC_A, ev('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_6', tool_input: { command: 'gh pr merge 42 --squash' } }));
    source.apply(MAC_A, ev('PostToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_6', tool_response: { stdout: '✓ Squashed and merged pull request acme/shop#42 (Fix totals)', stderr: '' } }));
    const room = office.commit().snapshot.rooms.find((r) => r.machine?.id === 'mac-a')!;
    expect(room.effect?.kind).toBe('party');
  });

  it('red CI from a failed `gh run watch --exit-status` raises the alarm', () => {
    const { office, source, ev } = setup();
    source.apply(MAC_A, ev('SessionStart'));
    source.apply(MAC_A, ev('PreToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_7', tool_input: { command: 'gh run watch 123 --exit-status' } }));
    source.apply(MAC_A, ev('PostToolUseFailure', { tool_name: 'Bash', tool_use_id: 'toolu_7', error: "X main CI · 123\nRun CI (123) completed with 'failure'\nExit code 1" }));
    const room = office.commit().snapshot.rooms.find((r) => r.machine?.id === 'mac-a')!;
    expect(room.effect?.kind).toBe('alarm');
  });

  it('/clear: the same character continues with the new session', () => {
    const { office, source, ev, clock } = setup();
    source.apply(MAC_A, ev('SessionStart'));
    const name = office.get(`r:mac-a:${SID}`)!.name;
    source.apply(MAC_A, ev('SessionEnd', { reason: 'clear' }));
    const NEW = '99999999-2222-3333-4444-555555555555';
    clock.advance(500);
    source.apply(MAC_A, ev('SessionStart', { source: 'clear', session_id: NEW }));
    const mains = office.list().filter((a) => a.kind === 'main' && a.status !== 'offline');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toMatchObject({ id: `r:mac-a:${SID}`, sessionId: `r:mac-a:${NEW}`, name });
    clock.advance(CLEAR_SWITCH_MS + 1);
    source.tick();
    expect(office.get(`r:mac-a:${SID}`)!.status).not.toBe('offline');
  });

  it('SessionEnd closes; a session with no event for 12 h leaves too', () => {
    const { office, source, ev, clock } = setup();
    source.apply(MAC_A, ev('SessionStart'));
    source.apply(MAC_A, ev('SessionEnd', { reason: 'prompt_input_exit' }));
    expect(office.get(`r:mac-a:${SID}`)!.status).toBe('offline');
    source.apply(MAC_B, ev('SessionStart'));
    clock.advance(IDLE_CLOSE_MS + 1);
    source.tick();
    expect(office.get(`r:mac-b:${SID}`)!.status).toBe('offline');
  });

  it('a tool that ran, or the end of the turn, releases requests answered on the machine', () => {
    const { source, ev, answered } = setup();
    source.apply(MAC_A, ev('SessionStart'));
    source.apply(MAC_A, ev('PostToolUse', { tool_name: 'Bash', tool_use_id: 'toolu_8' }));
    source.apply(MAC_A, ev('Stop'));
    expect(answered).toEqual([
      [`r:mac-a:${SID}`, 'Bash'],
      [`r:mac-a:${SID}`, undefined],
    ]);
  });

  it('an event without cwd for an unknown session is not placed', () => {
    const { office, source, ev } = setup();
    expect(source.apply(MAC_A, ev('PreToolUse', { cwd: undefined }))).toBe(false);
    expect(office.list()).toHaveLength(0);
  });
});
