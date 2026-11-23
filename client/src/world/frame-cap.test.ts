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

describe('lite mode (a TV on the wall)', () => {
  const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
  const tizen = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 SamsungBrowser/4.0 TV Safari/537.36';
  const webos = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/94.0 Safari/537.36';

  it('on for TV browsers and ?lite=1; ?lite=0 turns it off', () => {
    expect(liteMode('', desktop)).toBe(false);
    expect(liteMode('', tizen)).toBe(true);
    expect(liteMode('', webos)).toBe(true);
    expect(liteMode('?lite=1', desktop)).toBe(true);
    expect(liteMode('?lite', desktop)).toBe(true);
    expect(liteMode('?lite=0', tizen)).toBe(false);
  });

  it('the canvas keeps the screen ratio (1–3), lite mode or not: text stays sharp on a 4K TV', () => {
    expect(canvasPixelRatio(2)).toBe(2);
    expect(canvasPixelRatio(4)).toBe(3);
    expect(canvasPixelRatio(0.5)).toBe(1);
  });
});
