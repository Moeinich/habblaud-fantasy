import { describe, expect, it } from 'vitest';
import { isTraitId, TRAIT_IDS, TRAITS, traitsClash } from './traits';

describe('traits', () => {
  it('TRAITS in the order of TRAIT_IDS (personaFor draws depend on it)', () => {
    expect(Object.keys(TRAITS)).toEqual([...TRAIT_IDS]);
    for (const id of TRAIT_IDS) expect(TRAITS[id].id).toBe(id);
  });

  it('pairs that clash, in both directions', () => {
    expect(traitsClash('timidez', 'piadas')).toBe(true);
    expect(traitsClash('piadas', 'timidez')).toBe(true);
    expect(traitsClash('calma', 'competicao')).toBe(true);
    expect(traitsClash('games', 'leitura')).toBe(false);
  });

  it('isTraitId', () => {
    expect(isTraitId('sonecas')).toBe(true);
    expect(isTraitId('soneca')).toBe(false);
    expect(isTraitId(1)).toBe(false);
  });
});
