import { describe, expect, it } from 'vitest';
import { ptyControllable } from './ptyapi';
import { isRemote, remoteTerminalHint } from './machine';

describe('agents of other machines', () => {
  const remote = { id: 'r:mac-anna:s1', kind: 'main' as const, machine: { id: 'mac-anna', name: 'mac-anna' } };
  it('cannot be taken over or ended from here; the hint names the machine', () => {
    expect(isRemote(remote)).toBe(true);
    expect(isRemote({})).toBe(false);
    expect(ptyControllable(remote)).toBe(false);
    expect(ptyControllable({ id: '.claude:1', kind: 'main' })).toBe(true);
    expect(remoteTerminalHint(remote)).toContain('mac-anna');
  });
});
