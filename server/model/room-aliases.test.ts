import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RoomAliases } from './room-aliases';

const ASSETS = String.raw`C:\Users\x\.habblaud\assets`;
const DASH = String.raw`C:\repos\dash`;

describe('RoomAliases', () => {
  it('default, alias per folder (slashes and case don\'t matter), empty goes back to the default, and it persists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'habblaud-rooms-'));
    try {
      const file = join(dir, 'rooms.json');
      const a = new RoomAliases(file);
      a.setDefault(ASSETS, 'Architect');
      expect(a.get('c:/users/x/.habblaud/assets/')).toBe('Architect');
      expect(a.set(DASH, '  Dash   control  panel ')).toBe('Dash control panel');
      expect(a.set(ASSETS, 'Workshop')).toBe('Workshop');
      const b = new RoomAliases(file);
      b.load();
      expect(b.get('c:/repos/dash')).toBe('Dash control panel');
      b.setDefault(ASSETS, 'Architect');
      expect(b.set(ASSETS, '')).toBe('Architect');
      expect(b.get('/other')).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
