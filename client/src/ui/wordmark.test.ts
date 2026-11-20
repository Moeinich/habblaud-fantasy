import { describe, expect, it } from 'vitest';
import { WORDMARK_ROWS, wordmarkSvg } from './icons';
import { wordmarkRows, wordmarkSplit, wordmarkSupports } from './wordmark';

describe('wordmark', () => {
  it('draws "Habblaud" exactly like the hand-drawn logo', () => {
    expect(wordmarkRows('Habblaud')).toEqual([...WORDMARK_ROWS]);
  });

  it('draws any brand in the same font, with mixed case', () => {
    const rows = wordmarkRows('SWIFTc');
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
    // "SWIFT" parchment, "c" gold.
    const width = rows[0].length;
    const gold = rows.flatMap((r) => [...r].map((ch, x) => (ch === 't' ? x : -1))).filter((x) => x >= 0);
    expect(Math.min(...gold)).toBe(width - 4);
    expect(rows.join('')).toContain('c');
  });

  it('grows two rows for descenders and keeps the shadow under every pixel', () => {
    const rows = wordmarkRows('Agency');
    expect(rows).toHaveLength(10);
    for (let y = 1; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const inkAbove = rows[y - 1][x] === 'c' || rows[y - 1][x] === 't';
        if (rows[y][x] === '.' ) expect(inkAbove).toBe(false);
        if (rows[y][x] === 's') expect(inkAbove).toBe(true);
      }
    }
  });

  it('splits parchment and gold at a sensible place', () => {
    expect(wordmarkSplit('Habblaud')).toBe(3);
    expect(wordmarkSplit('SWIFTc')).toBe(5);
    expect(wordmarkSplit('SwiftCode')).toBe(5);
    expect(wordmarkSplit('Acme Labs')).toBe(4);
    expect(wordmarkSplit('X')).toBe(1);
  });

  it('has every letter and digit, and falls back for accents', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') expect(wordmarkSupports(ch), ch).toBe(true);
    expect(wordmarkSupports('é')).toBe(true);
    expect(wordmarkRows('é')).toEqual(wordmarkRows('e'));
  });

  it('sizes the SVG from the grid', () => {
    expect(wordmarkSvg('Habblaud')).toContain('style="--wm-w:45;--wm-h:8"');
    expect(wordmarkSvg('A very long brand name!')).toContain('ui-wordmark is-long');
  });
});
