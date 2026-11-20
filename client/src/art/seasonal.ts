// Procedural seasonal decorations (winter feast + Halloween), same scale as the office furniture.
import { PixelBuf } from './core/pixbuf';
import type { BufSprite } from './core/sprite';

export type SeasonalProp = 'tree' | 'gift' | 'pumpkin' | 'ghost' | 'wreath' | 'bat';

export function renderSeasonalProp(kind: SeasonalProp): BufSprite {
  const b = new PixelBuf(40, 64);
  const rect = (x: number, y: number, w: number, h: number, c: string) => b.rect(x, y, w, h, c);
  if (kind === 'tree') {
    // Winter-feast pine: layered dark boughs dusted with snow, hung with glowing lanterns and red war-banner
    // ribbons, a carved rune lantern on top; a mead keg and a rope-tied supply bundle at its foot.
    b.shadow(20, 59, 17, 3, '#252c39', 0.22);
    rect(17, 49, 6, 9, '#6a4a30');
    b.vline(17, 49, 57, '#8a6239');
    for (let row = 0; row < 4; row++) {
      const y = 13 + row * 8;
      const half = 6 + row * 3;
      rect(20 - half, y, half * 2 + 1, 9, '#1f4a3a');
      rect(22 - half, y, half * 2 - 4, 6, '#2e6448');
      rect(22 - half, y + 1, half - 1, 3, '#3f7c52');
      // jagged bough tips
      for (let x = 20 - half; x <= 20 + half; x += 3) b.set(x, y + 9, '#1f4a3a');
      // snow on the upper edge of each tier
      b.hline(21 - half, 19, y, '#e8eef2');
      b.hline(23 - half, 17, y + 1, '#c8d4dc');
    }
    // red war-banner ribbon swagged across the tiers
    for (const [y0, x0, x1] of [[22, 13, 27], [30, 10, 30], [38, 7, 33]] as const) {
      for (let x = x0; x <= x1; x++) {
        const sag = Math.round(Math.sin(((x - x0) / (x1 - x0)) * Math.PI) * 3);
        b.set(x, y0 + sag, '#9c2f25');
        b.set(x, y0 + sag + 1, '#6e1f18');
      }
    }
    // banner tails hanging from the lowest swag
    rect(7, 38, 2, 5, '#9c2f25');
    b.set(7, 43, '#9c2f25');
    rect(32, 38, 2, 5, '#9c2f25');
    b.set(33, 43, '#9c2f25');
    // rune lantern finial (iron frame, warm glow) instead of a star
    rect(18, 3, 5, 2, '#3a3a40');
    rect(17, 5, 7, 7, '#3a3a40');
    rect(18, 6, 5, 5, '#ffc45d');
    b.vline(20, 6, 10, '#c9762c');
    b.set(19, 8, '#c9762c');
    b.set(21, 8, '#c9762c');
    b.hline(17, 23, 12, '#3a3a40');
    // small hanging lanterns
    for (const [x, y] of [[15, 25], [25, 27], [12, 34], [26, 35], [9, 44], [20, 45], [30, 45]]) {
      b.set(x + 1, y - 1, '#3a3a40');
      rect(x, y, 3, 3, '#ffb53d');
      b.set(x + 1, y + 1, '#fff0be');
      b.hline(x, x + 2, y + 3, '#3a3a40');
    }
    // mead keg (left) and rope-tied bundle (right)
    rect(2, 50, 11, 10, '#8a6239');
    rect(3, 50, 3, 10, '#a8784a');
    b.hline(2, 12, 52, '#3a3a40');
    b.hline(2, 12, 57, '#3a3a40');
    rect(6, 54, 3, 2, '#5a3e24');
    rect(26, 52, 11, 8, '#b08a5a');
    rect(26, 52, 11, 2, '#c9a46e');
    b.vline(31, 51, 59, '#e6dcc4');
    b.hline(26, 36, 55, '#e6dcc4');
    rect(30, 49, 3, 3, '#e6dcc4');
  } else if (kind === 'gift') {
    // Feast supplies: an iron-banded crate tied with rope, with a small mead keg leaning on it.
    b.shadow(20, 59, 11, 2, '#252c39', 0.2);
    rect(9, 47, 16, 13, '#8a6239');
    rect(9, 47, 16, 3, '#a8784a');
    b.hline(9, 24, 50, '#5e3f27');
    b.vline(10, 47, 59, '#5e3f27');
    b.vline(23, 47, 59, '#5e3f27');
    b.hline(9, 24, 54, '#6e4a2c');
    // rope cross with a knot
    b.vline(16, 46, 59, '#e6dcc4');
    b.vline(17, 46, 59, '#c9b483');
    b.hline(9, 24, 53, '#e6dcc4');
    rect(15, 44, 4, 3, '#e6dcc4');
    b.set(14, 43, '#c9b483');
    b.set(19, 43, '#c9b483');
    // keg
    rect(24, 51, 8, 9, '#9a6c42');
    rect(25, 51, 2, 9, '#b8875a');
    b.hline(24, 31, 53, '#3a3a40');
    b.hline(24, 31, 57, '#3a3a40');
    b.set(30, 55, '#e0b23c');
  } else if (kind === 'pumpkin') {
    b.shadow(20, 59, 11, 2, '#252c39', 0.2);
    rect(18, 41, 3, 6, '#557342');
    rect(11, 46, 18, 14, '#c56832');
    rect(8, 49, 24, 8, '#e18b39');
    rect(13, 46, 4, 13, '#f0a647');
    rect(23, 47, 3, 12, '#f0a647');
    rect(12, 50, 4, 3, '#523347');
    rect(24, 50, 4, 3, '#523347');
    rect(17, 56, 7, 2, '#523347');
    b.set(13, 51, '#ffd680');
    b.set(25, 51, '#ffd680');
    b.hline(18, 22, 56, '#ffd680');
  } else if (kind === 'ghost') {
    rect(15, 39, 10, 3, '#e0dae9');
    rect(12, 42, 16, 15, '#e0dae9');
    rect(14, 41, 11, 15, '#fff4ed');
    rect(10, 47, 4, 4, '#e0dae9');
    rect(26, 47, 4, 4, '#e0dae9');
    for (const x of [12, 18, 24]) rect(x, 56, 4, 3, '#e0dae9');
    rect(16, 46, 2, 3, '#574563');
    rect(23, 46, 2, 3, '#574563');
    rect(19, 51, 3, 2, '#574563');
  } else if (kind === 'wreath') {
    rect(12, 39, 16, 4, '#347653');
    rect(10, 43, 5, 10, '#245644');
    rect(25, 43, 5, 10, '#347653');
    rect(13, 53, 15, 4, '#245644');
    for (const [x, y] of [[14, 41], [26, 47], [12, 50], [23, 54]]) rect(x, y, 2, 2, '#e45c58');
    rect(15, 55, 4, 4, '#c93945');
    rect(21, 55, 4, 4, '#c93945');
    rect(19, 54, 2, 4, '#f07368');
  } else {
    rect(18, 51, 5, 6, '#47344f');
    rect(10, 50, 9, 4, '#47344f');
    rect(22, 50, 9, 4, '#47344f');
    rect(7, 48, 4, 4, '#47344f');
    rect(30, 48, 4, 4, '#47344f');
    rect(13, 53, 3, 3, '#47344f');
    rect(25, 53, 3, 3, '#47344f');
    b.set(19, 52, '#f5b95f');
    b.set(21, 52, '#f5b95f');
  }
  b.outline();
  return { buf: b, ax: 20, ay: 60 };
}
