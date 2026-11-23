import { describe, expect, it } from 'vitest';
import { GROW_AFTER_MS, SHRINK_AFTER_MS, spanFor, updateSpan } from './span';

describe('room span', () => {
  it('one column per 6 people, capped', () => {
    expect([0, 1, 6, 7, 12, 13, 24, 99].map(spanFor)).toEqual([1, 1, 1, 2, 2, 3, 4, 4]);
  });

  it('grows after a short wait and shrinks only after a long one', () => {
    const T = 1_000_000;
    const s = { wantSpan: 1, overSince: 0, underSince: 0 };
    expect(updateSpan(s, 7, T)).toBe(false);
    expect(updateSpan(s, 7, T + GROW_AFTER_MS)).toBe(true);
    expect(s.wantSpan).toBe(2);
    expect(updateSpan(s, 3, T + GROW_AFTER_MS + 1)).toBe(false);
    // the crowd comes back before the shrink delay: no change, timer reset
    expect(updateSpan(s, 8, T + GROW_AFTER_MS + SHRINK_AFTER_MS / 2)).toBe(false);
    expect(updateSpan(s, 3, T + GROW_AFTER_MS + SHRINK_AFTER_MS)).toBe(false);
    expect(updateSpan(s, 3, T + GROW_AFTER_MS + SHRINK_AFTER_MS * 2)).toBe(true);
    expect(s.wantSpan).toBe(1);
  });
});
