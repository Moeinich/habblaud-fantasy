// How many columns a project room should span (pure). A room has 6 desks per column; it grows when more
// people belong to it than it has desks and shrinks back once the crowd is gone. Growing waits a moment (a
// burst of subagents that finishes right away shouldn't rebuild the room); shrinking waits much longer, so a
// room doesn't flap while subagents come and go.
import { MAX_SPAN } from '../layout/geometry';

export const DESKS_PER_COLUMN = 6;
export const GROW_AFTER_MS = 3000;
export const SHRINK_AFTER_MS = 60_000;

/** Columns needed for `people` (1..MAX_SPAN). */
export function spanFor(people: number): number {
  return Math.max(1, Math.min(MAX_SPAN, Math.ceil(people / DESKS_PER_COLUMN)));
}

export interface SpanState {
  wantSpan: number;
  overSince: number;
  underSince: number;
}

/** Updates `s` in place for the current head count; returns true when `wantSpan` changed. */
export function updateSpan(s: SpanState, people: number, now: number): boolean {
  const need = spanFor(people);
  if (need > s.wantSpan) {
    s.underSince = 0;
    if (!s.overSince) s.overSince = now;
    if (now - s.overSince >= GROW_AFTER_MS) {
      s.wantSpan = need;
      s.overSince = 0;
      return true;
    }
    return false;
  }
  s.overSince = 0;
  if (need < s.wantSpan) {
    if (!s.underSince) s.underSince = now;
    if (now - s.underSince >= SHRINK_AFTER_MS) {
      s.wantSpan = need;
      s.underSince = 0;
      return true;
    }
    return false;
  }
  s.underSince = 0;
  return false;
}
