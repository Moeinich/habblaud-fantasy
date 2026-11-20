// The appearance draw lives in shared/appearance-flat.ts; this module only re-exports it (the 20-seed regression is
// in shared/appearance-flat.test.ts).
import { describe, expect, it } from 'vitest';
import * as shared from '../../../../shared/appearance-flat';
import { appearanceFromSeed, SKINS } from './appearance';

describe('client/src/art/character/appearance', () => {
  it('re-exports the draw and the skin tones from shared/appearance-flat', () => {
    expect(appearanceFromSeed).toBe(shared.appearanceFromSeed);
    expect(SKINS).toBe(shared.SKINS);
  });
});
