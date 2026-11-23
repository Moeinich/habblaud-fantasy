import { describe, expect, it } from 'vitest';
import { knownOpaque, opaqueBox, rememberOpaque } from './opaque';

describe('opaque box', () => {
  it('bounds the pixels above alpha 16; an empty or faint image keeps its full size', () => {
    const w = 6;
    const h = 5;
    const data = new Uint8ClampedArray(w * h * 4);
    const set = (x: number, y: number, a: number) => (data[(y * w + x) * 4 + 3] = a);
    expect(opaqueBox(data, w, h)).toEqual({ x: 0, y: 0, w, h });
    set(0, 0, 10); // faint: ignored
    expect(opaqueBox(data, w, h)).toEqual({ x: 0, y: 0, w, h });
    set(2, 1, 255);
    set(4, 3, 200);
    expect(opaqueBox(data, w, h)).toEqual({ x: 2, y: 1, w: 3, h: 3 });
  });

  it('remembers a box per canvas', () => {
    const c = {};
    expect(knownOpaque(c)).toBeUndefined();
    rememberOpaque(c, { x: 1, y: 2, w: 3, h: 4 });
    expect(knownOpaque(c)).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
});
