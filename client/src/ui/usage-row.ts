// Do the usage cards fit on the same row as the other top-bar items (brand, counters, buttons)?
// Pure (no DOM): tested in ui/usage-row.test.ts. UsageCards (ui/usage.ts) measures the DOM and applies the result:
// when they don't fit, the bar gets a second row just for them.

export interface UsageRowInput {
  /** Usable bar width (without padding). */
  barWidth: number;
  /** Widths of the other visible bar items. */
  others: number[];
  /** Gap between bar items. */
  gap: number;
  /** Gap between cards. */
  cardGap: number;
  /** Minimum width of each card (the smallest it accepts before losing content). */
  cards: number[];
}

export function usageRowFits(i: UsageRowInput): boolean {
  if (i.cards.length === 0) return true;
  // One gap between each bar item: the other items plus the queue of cards.
  const used = i.others.reduce((sum, w) => sum + w, 0) + i.gap * i.others.length;
  const need = i.cards.reduce((sum, w) => sum + w, 0) + i.cardGap * (i.cards.length - 1);
  return need <= i.barWidth - used;
}
