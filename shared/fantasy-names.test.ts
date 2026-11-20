// Fantasy names: one pool per race, deterministic, no repeats, a numeric suffix when a pool runs out.
import { describe, expect, it } from 'vitest';
import { FANTASY_NAME_POOLS, isFantasyName, pickFantasyName } from './fantasy-names';
import { RACES } from './race';

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

describe('FANTASY_NAME_POOLS', () => {
  const all = RACES.flatMap((r) => FANTASY_NAME_POOLS[r].map((p) => p.name));

  it('about 50 female and 50 male names per race, short first names', () => {
    for (const race of RACES) {
      const pool = FANTASY_NAME_POOLS[race];
      expect(pool.filter((p) => p.look === 'f').length, race).toBeGreaterThanOrEqual(50);
      expect(pool.filter((p) => p.look === 'm').length, race).toBeGreaterThanOrEqual(50);
      for (const p of pool) expect(p.name, p.name).toMatch(/^[A-Z][a-z]{1,13}$/);
    }
  });

  it('unique across every pool, without near-duplicates', () => {
    expect(new Set(all.map((n) => n.toLowerCase())).size).toBe(all.length);
    const close: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].toLowerCase();
        const b = all[j].toLowerCase();
        const d = distance(a, b);
        if (d <= 1 || (d === 2 && a.length >= 7 && b.length >= 7)) close.push(`${all[i]}/${all[j]}`);
      }
    }
    expect(close).toEqual([]);
  });

  it('no canon Warcraft characters', () => {
    const canon = ['Thrall', 'Jaina', 'Tyrande', 'Arthas', 'Garrosh', 'Durotan', 'Orgrim', 'Draka', 'Anduin', 'Varian', 'Uther', 'Malfurion', 'Illidan', 'Maiev', 'Shandris', 'Sylvanas', 'Khadgar', 'Medivh', 'Rexxar', 'Saurfang', 'Grom', 'Aggra', 'Garona', 'Turalyon', 'Alleria', 'Thalyssra', 'Lunara'];
    for (const n of canon) expect(all, n).not.toContain(n);
  });
});

describe('pickFantasyName', () => {
  it('deterministic per id, from the pool of the race', () => {
    for (const race of RACES) {
      const a = pickFantasyName('sess-1', race, new Set());
      expect(pickFantasyName('sess-1', race, new Set())).toEqual(a);
      expect(FANTASY_NAME_POOLS[race]).toContainEqual(a);
    }
  });

  it('skips the names in use and adds a suffix when the pool runs out', () => {
    const used = new Set<string>();
    const pool = FANTASY_NAME_POOLS.orc;
    for (let i = 0; i < pool.length; i++) {
      const p = pickFantasyName(`id-${i}`, 'orc', used);
      expect(used.has(p.name)).toBe(false);
      used.add(p.name);
    }
    expect(used.size).toBe(pool.length);
    const extra = pickFantasyName('id-x', 'orc', used);
    expect(extra.name).toMatch(/^[A-Z][a-z]+ 2$/);
    expect(isFantasyName(extra.name)).toBe(true);
  });

  it('isFantasyName: pool names (with or without the suffix) only', () => {
    expect(isFantasyName('Aldric')).toBe(true);
    expect(isFantasyName('Ushka 3')).toBe(true);
    expect(isFantasyName('Marina')).toBe(false);
    expect(isFantasyName('aldric')).toBe(false);
  });
});
