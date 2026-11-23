// How hard the world canvas works: frame rate and pixel count.
import { describe, expect, it } from 'vitest';
import { canvasPixelRatio, fpsFromUrl, liteMode } from './index';

describe('frame cap', () => {
  it('?fps= sets the full rate (10–144); anything else is 60', () => {
    expect(fpsFromUrl('')).toBe(60);
    expect(fpsFromUrl('?fps=24')).toBe(24);
    expect(fpsFromUrl('?fps=500')).toBe(144);
    expect(fpsFromUrl('?fps=2')).toBe(60);
    expect(fpsFromUrl('?fps=abc')).toBe(60);
  });
});

describe('lite mode', () => {
  it('off unless asked for with ?lite=1, TV browsers included', () => {
    expect(liteMode('')).toBe(false);
    expect(liteMode('?lite=1')).toBe(true);
    expect(liteMode('?lite')).toBe(true);
    expect(liteMode('?lite=0')).toBe(false);
  });

  it('the canvas keeps the screen ratio (1–3), lite mode or not: text stays sharp on a 4K TV', () => {
    expect(canvasPixelRatio(2)).toBe(2);
    expect(canvasPixelRatio(4)).toBe(3);
    expect(canvasPixelRatio(0.5)).toBe(1);
  });
});
