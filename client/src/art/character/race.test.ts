// Characters are drawn as the race of their room (shared/race.ts): human, night elf or orc.
import { describe, expect, it } from 'vitest';
import { ACCESSORIES } from '../../../../shared/appearance';
import { RACES, type Race } from '../../../../shared/race';
import type { Appearance, Dir } from '../api';
import { parseColor, ramp } from '../core/color';
import { SKINS, appearanceFromSeed } from './appearance';
import { elfSkin, orcSkin, raceSkin, renderCharacter } from './render';

/** A plain appearance: bald (nothing covers the face or the ears), no facial hair, no accessory. */
function plain(skin: string): Appearance {
  return { ...appearanceFromSeed(5, { look: 'f' }), skin, hairStyle: 'bald', facialHair: 'none', accessory: 'none', lanyard: null };
}

function rgb(buf: { w: number; data: Uint8ClampedArray }, x: number, y: number): [number, number, number, number] {
  const i = (y * buf.w + x) * 4;
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2], buf.data[i + 3]];
}

function hex(c: readonly number[]): string {
  return `#${c
    .slice(0, 3)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Cheek pixel of the front view (head grid column 2, row 8), standing frame 0. */
const CHEEK: [number, number] = [7, 15];
/** Template tusk pixel (head grid column 4, row 8). */
const TUSK_AT: [number, number] = [9, 15];

function front(a: Appearance, race?: Race, dir: Dir = 'down') {
  return renderCharacter({ appearance: a, dir, pose: 'stand', frame: 0, race }).buf;
}

/** Leftmost column (rows 8..14, the ears' band) holding one of the race's skin tones. */
function leftmostSkin(a: Appearance, race: Race): number {
  const r = ramp(raceSkin(a.skin, race), 0.07);
  const tones = new Set([r.hi, r.lt, r.base, r.dk, r.dd].map((c) => c.toLowerCase()));
  const buf = front(a, race);
  let min = Infinity;
  for (let y = 8; y <= 14; y++) {
    for (let x = 0; x < buf.w; x++) if (tones.has(hex(rgb(buf, x, y)))) min = Math.min(min, x);
  }
  return min;
}

describe('races', () => {
  it('humans keep the appearance skin tone (never green)', () => {
    for (const skin of SKINS) {
      const [r, g, b, al] = rgb(front(plain(skin), 'human'), ...CHEEK);
      expect(al).toBe(255);
      expect(hex([r, g, b])).toBe(skin);
      expect(r).toBeGreaterThan(g);
    }
  });

  it('race defaults to human', () => {
    const a = plain(SKINS[3]);
    expect(Array.from(front(a).data)).toEqual(Array.from(front(a, 'human').data));
  });

  it('orcs are green and elves violet, keeping the light -> dark order', () => {
    let lastOrc = Infinity;
    let lastElf = Infinity;
    for (const skin of SKINS) {
      const [or, og, ob] = rgb(front(plain(skin), 'orc'), ...CHEEK);
      expect(hex([or, og, ob])).toBe(orcSkin(skin));
      expect(og).toBeGreaterThan(or);
      expect(og).toBeGreaterThan(ob);
      const [er, eg, eb] = rgb(front(plain(skin), 'elf'), ...CHEEK);
      expect(hex([er, eg, eb])).toBe(elfSkin(skin));
      expect(eb).toBeGreaterThan(eg);
      expect(er).toBeGreaterThan(eg);
      const lo = parseColor(orcSkin(skin));
      const le = parseColor(elfSkin(skin));
      const lumO = lo[0] + lo[1] + lo[2];
      const lumE = le[0] + le[1] + le[2];
      expect(lumO).toBeLessThanOrEqual(lastOrc);
      expect(lumE).toBeLessThanOrEqual(lastElf);
      lastOrc = lumO;
      lastElf = lumE;
    }
  });

  it('only orcs have tusks', () => {
    const a = plain(SKINS[2]);
    expect(hex(rgb(front(a, 'orc'), ...TUSK_AT))).toBe('#efe6c6');
    expect(hex(rgb(front(a, 'human'), ...TUSK_AT))).toBe(a.skin);
    expect(hex(rgb(front(a, 'elf'), ...TUSK_AT))).toBe(elfSkin(a.skin));
    // With a beard the tusks are drawn over it, still only for orcs.
    const bearded: Appearance = { ...a, look: 'm', facialHair: 'beard' };
    expect(hex(rgb(front(bearded, 'orc'), 9, 16))).toBe('#c9bc95');
    expect(hex(rgb(front(bearded, 'human'), 9, 16))).not.toBe('#c9bc95');
  });

  it('elf ears stick out well past the head; human ears stay close to it', () => {
    for (const skin of [SKINS[0], SKINS[4], SKINS[7]]) {
      const a = plain(skin);
      const elf = leftmostSkin(a, 'elf');
      const orc = leftmostSkin(a, 'orc');
      const human = leftmostSkin(a, 'human');
      expect(elf).toBeLessThanOrEqual(2);
      expect(elf).toBeLessThan(orc);
      expect(orc).toBeLessThan(human);
      expect(human).toBeGreaterThanOrEqual(4);
    }
  });

  it('elf ears are drawn over long hair and stay inside the avatar crop (x 2..21)', () => {
    const a: Appearance = { ...plain(SKINS[1]), hairStyle: 'long' };
    for (const dir of ['down', 'up'] as const) {
      const buf = front(a, 'elf', dir);
      const tip = elfSkin(a.skin);
      const r = ramp(tip, 0.07);
      const tones = new Set([r.hi, r.lt, r.base, r.dk, r.dd].map((c) => c.toLowerCase()));
      let left = Infinity;
      let right = -Infinity;
      for (let y = 6; y <= 14; y++) {
        for (let x = 0; x < buf.w; x++) {
          if (!tones.has(hex(rgb(buf, x, y)))) continue;
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
      expect(left).toBe(2);
      expect(right).toBe(21);
    }
  });

  it('elves have glowing pale eyes', () => {
    const buf = front(plain(SKINS[5]), 'elf');
    // Eye pixels of the front view: head grid columns 4 and 9, rows 6-7.
    for (const [x, y] of [[9, 13], [14, 13], [9, 14], [14, 14]] as const) {
      const [r, g, b] = rgb(buf, x, y);
      expect(Math.min(r, g, b)).toBeGreaterThan(130);
      expect(b).toBeGreaterThanOrEqual(r);
    }
  });

  it('every race renders every accessory in every view at the same size and anchor', () => {
    for (const race of RACES) {
      for (const accessory of ACCESSORIES) {
        for (const dir of ['down', 'up', 'left', 'right'] as const) {
          const s = renderCharacter({ appearance: { ...plain(SKINS[3]), accessory }, dir, pose: 'walk', frame: 1, race });
          expect([s.buf.w, s.buf.h, s.ax, s.ay]).toEqual([24, 34, 12, 31]);
          expect(s.buf.bounds()).not.toBeNull();
        }
      }
    }
  });
});
