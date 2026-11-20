// Items mounted on the north wall. Drawing coordinates: x = 0 at the left edge of the wall span,
// y = 0 on the skirting line; the wall face runs from y = -32 (top, with the cap down to -28) to 0.
// Warcraft-III-flavoured fantasy: chunky timber, cut stone, blackened iron, gold trim, parchment and cloth.
import { ramp, shade } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { rectAt, wallSheet, type BufFurniture } from '../core/sprite';
import { M, rngOf } from './kit';

// ------------------------------------------------------------------ palette

const IRON = ramp('#4a4a52', 0.09); // blackened iron
const STONE = ramp('#9c968a', 0.07); // grey cut stone
const TIMBER = ramp('#5e4028', 0.08); // dark timber
const PARCH = ramp('#dcc79a', 0.06); // parchment
const HIDE = ramp('#a5845a', 0.06); // tanned hide
const GOLD = M.gold;
const BRONZE = ramp('#c27a3a', 0.08);
const HORDE = ramp('#9c2f25', 0.09);
const ALLY = ramp('#2f4f9c', 0.09);
const TEAL = ramp('#2f6a68', 0.09);
const BONE = '#e8dcc0';
const INK = '#3a2616';

/** Soft shadow cast on the wall (below/right of the object). */
function wallShadow(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  for (let yy = y + 1; yy <= y + h; yy++) b.under(x + w, yy, 'rgba(36,24,14,0.25)');
  for (let xx = x + 1; xx <= x + w; xx++) b.under(xx, y + h, 'rgba(36,24,14,0.25)');
}

/** Iron rivet with a tiny top-left glint. */
function rivet(b: PixelBuf, x: number, y: number): void {
  b.set(x, y, IRON.dd);
  b.set(x, y - 1, IRON.hi);
}

/** Bevelled box: light top/left edge, dark bottom/right edge. */
function bevel(b: PixelBuf, x: number, y: number, w: number, h: number, r: { hi: string; lt: string; base: string; dk: string; dd: string }): void {
  b.rect(x, y, w, h, r.base);
  b.hline(x, x + w - 1, y, r.hi);
  b.vline(x, y + 1, y + h - 1, r.lt);
  b.vline(x + w - 1, y + 1, y + h - 1, r.dk);
  b.hline(x + 1, x + w - 1, y + h - 1, r.dd);
}

/** Timber plank with horizontal grain streaks. */
function plank(b: PixelBuf, x: number, y: number, w: number, h: number, r: { hi: string; lt: string; base: string; dk: string; dd: string }, seed: number): void {
  bevel(b, x, y, w, h, r);
  const rnd = rngOf(seed, 7);
  for (let yy = y + 1; yy < y + h - 1; yy++) {
    let xx = x + 1 + Math.floor(rnd() * 4);
    while (xx < x + w - 3) {
      const len = 2 + Math.floor(rnd() * 5);
      b.hline(xx, Math.min(x + w - 2, xx + len), yy, rnd() < 0.5 ? r.dk : r.lt);
      xx += len + 3 + Math.floor(rnd() * 6);
    }
  }
}

/** L-shaped iron corner bracket. dx/dy point inwards (+1/-1). */
function bracket(b: PixelBuf, x: number, y: number, dx: number, dy: number): void {
  for (let i = 0; i < 4; i++) {
    b.set(x + i * dx, y, IRON.base);
    b.set(x, y + i * dy, IRON.base);
  }
  b.set(x, y, IRON.lt);
  rivet(b, x + dx, y + dy + (dy < 0 ? 0 : 1));
}

/** Small candle flame (2 px tall). */
function flame(b: PixelBuf, x: number, y: number): void {
  b.set(x, y, '#f08a2c');
  b.set(x, y - 1, '#ffd27a');
  b.set(x, y - 2, 'rgba(255,240,180,0.7)');
}

// ------------------------------------------------------------------ quest board / war map

export function whiteboard(): BufFurniture {
  const s = wallSheet(3);
  const b = s.buf;
  const x = 2;
  const y = -27;
  const w = 44;
  const h = 19;
  // Little shingled roof over the board.
  b.rect(x - 3, y - 5, w + 6, 4, TIMBER.dk);
  b.hline(x - 3, x + w + 2, y - 5, TIMBER.hi);
  b.hline(x - 3, x + w + 2, y - 4, TIMBER.lt);
  for (let i = x - 1; i < x + w + 2; i += 4) b.vline(i, y - 4, y - 2, TIMBER.dd);
  b.hline(x - 3, x + w + 2, y - 2, HORDE.base);
  for (let i = x - 2; i < x + w + 2; i += 3) b.set(i, y - 1, HORDE.dk);
  // Bone tusks curling up from the roof ends.
  for (const [tx, d] of [[x - 4, -1], [x + w + 3, 1]] as const) {
    b.set(tx, y - 4, BONE);
    b.set(tx, y - 5, BONE);
    b.set(tx + d, y - 6, BONE);
    b.set(tx + d, y - 7, '#cfc2a0');
  }
  // Heavy timber frame.
  bevel(b, x, y, w, h, TIMBER);
  b.rect(x + 1, y + 1, w - 2, h - 2, TIMBER.dk);
  // Stretched hide war map (darker than the parchment notes drawn on top).
  const mx = x + 2;
  const my = y + 2;
  const mw = w - 4;
  const mh = h - 4;
  b.rect(mx, my, mw, mh, HIDE.base);
  const r = rngOf(3, 11);
  for (let i = 0; i < 40; i++) b.set(mx + Math.floor(r() * mw), my + Math.floor(r() * mh), r() < 0.5 ? HIDE.lt : HIDE.dk);
  // Faint coastline, river and a dotted march route.
  for (let i = 0; i < mw; i++) {
    const cy = my + mh - 4 + Math.round(1.6 * Math.sin(i * 0.45));
    b.set(mx + i, cy, 'rgba(70,90,110,0.45)');
    for (let yy = cy + 1; yy < my + mh; yy++) b.set(mx + i, yy, 'rgba(70,100,130,0.22)');
  }
  b.line(mx + 8, my + 1, mx + 14, my + mh - 4, 'rgba(70,100,130,0.4)');
  for (let i = 0; i < 18; i += 3) b.set(mx + 20 + i, my + 5 + Math.round(Math.sin(i * 0.5) * 2), 'rgba(156,47,37,0.6)');
  // Iron corner brackets.
  bracket(b, x, y, 1, 1);
  bracket(b, x + w - 1, y, -1, 1);
  bracket(b, x, y + h - 1, 1, -1);
  bracket(b, x + w - 1, y + h - 1, -1, -1);
  // Ledge underneath with a scroll, an ink pot + quill and a dagger.
  b.rect(x + 2, y + h, w - 4, 2, TIMBER.base);
  b.hline(x + 2, x + w - 3, y + h, TIMBER.lt);
  b.rect(x + 6, y + h - 2, 7, 2, PARCH.base);
  b.hline(x + 6, x + 12, y + h - 2, PARCH.hi);
  b.set(x + 5, y + h - 2, PARCH.dk);
  b.set(x + 13, y + h - 2, PARCH.dk);
  b.set(x + 9, y + h - 1, HORDE.base);
  b.rect(x + 16, y + h - 2, 2, 2, '#26283a');
  b.line(x + 17, y + h - 2, x + 20, y + h - 6, BONE);
  b.hline(x + w - 14, x + w - 9, y + h - 1, '#b8bcc2');
  b.set(x + w - 9, y + h - 1, '#e6e8ea');
  b.rect(x + w - 17, y + h - 2, 3, 2, M.leather.base);
  b.set(x + w - 14, y + h - 2, GOLD.base);
  b.outline();
  wallShadow(b, x - 3, y - 5, w + 6, h + 7);
  s.rects = { board: rectAt(s, x + 2, y + 2, w - 4, h - 4) };
  return { base: s };
}

// ------------------------------------------------------------------ arched leaded window

export function windowItem(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  // Glass region (transparent: the world paints the sky view first).
  const gx = 4;
  const gy = -26;
  const gw = 24;
  const gh = 16;
  // Stone surround: blocks of alternating size around the opening.
  const ox = gx - 3;
  const oy = gy - 4;
  const ow = gw + 6;
  const oh = gh + 6;
  b.rect(ox, oy, ow, oh, STONE.base);
  b.hline(ox, ox + ow - 1, oy, STONE.hi);
  b.vline(ox, oy, oy + oh - 1, STONE.lt);
  b.vline(ox + ow - 1, oy, oy + oh - 1, STONE.dk);
  for (let yy = oy + 4; yy < oy + oh; yy += 4) {
    b.hline(ox, gx - 1, yy, STONE.dd);
    b.hline(gx + gw, ox + ow - 1, yy, STONE.dd);
  }
  for (let xx = ox + 5; xx < ox + ow; xx += 6) b.vline(xx, oy, oy + 3, STONE.dk);
  // Cut the opening, then fill the arch shoulders back in with stone.
  b.clearRect(gx, gy, gw, gh);
  const arch = [7, 5, 3, 2, 1, 1];
  arch.forEach((inset, i) => {
    b.hline(gx, gx + inset - 1, gy + i, STONE.base);
    b.hline(gx + gw - inset, gx + gw - 1, gy + i, STONE.dk);
    b.set(gx + inset - 1, gy + i, STONE.dd);
    b.set(gx + gw - inset, gy + i, STONE.dd);
  });
  // Keystone.
  b.rect(gx + gw / 2 - 2, oy - 1, 4, 5, STONE.lt);
  b.hline(gx + gw / 2 - 2, gx + gw / 2 + 1, oy - 1, STONE.hi);
  b.vline(gx + gw / 2 + 1, oy, oy + 3, STONE.dk);
  // Stone sill with a strip of ivy.
  b.rect(ox - 2, gy + gh + 1, ow + 4, 3, STONE.lt);
  b.hline(ox - 2, ox + ow + 1, gy + gh + 1, STONE.hi);
  b.hline(ox - 2, ox + ow + 1, gy + gh + 3, STONE.dd);
  b.rect(gx, gy + gh, gw, 1, STONE.dk);
  const leaf = M.leaf;
  for (const [lx, len] of [[ox - 1, 4], [ox + 1, 2], [ox + ow - 2, 5], [ox + ow, 3]] as const) {
    for (let i = 0; i < len; i++) b.set(lx + (i % 2), gy + gh + 2 + i, i % 2 ? leaf.dk : leaf.lt);
  }
  b.outline();
  // Inside the glass, drawn after the outline so the bars stay thin and the view stays readable.
  // Iron mullion and a single transom at the arch springing line.
  b.vline(gx + gw / 2, gy + 1, gy + gh - 1, IRON.base);
  b.vline(gx + gw / 2 - 1, gy + 1, gy + gh - 1, IRON.dd);
  b.hline(gx, gx + gw - 1, gy + 6, IRON.dd);
  // Faint diamond leading.
  const lead = 'rgba(30,30,40,0.22)';
  for (let k = -gh; k < gw; k += 6) {
    b.line(gx + k, gy + gh - 1, gx + k + gh - 1, gy, lead);
    b.line(gx + k, gy, gx + k + gh - 1, gy + gh - 1, lead);
  }
  // Glass glints.
  for (const off of [2, 15]) b.line(gx + off + 5, gy + 2, gx + off, gy + gh - 2, 'rgba(255,255,255,0.2)');
  wallShadow(b, ox - 2, oy - 1, ow + 4, oh + 3);
  s.rects = { glass: rectAt(s, gx, gy, gw, gh) };
  return { base: s };
}

// ------------------------------------------------------------------ astrolabe dial (clock)

export function clock(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const cx = 8;
  const cy = -21.5;
  // Sun rays behind the dial.
  for (const [dx, dy] of [[0, -9], [7, -6], [9, 0], [7, 6], [-7, -6], [-9, 0], [-7, 6]] as const) {
    b.line(cx, cy, cx + dx, cy + dy, GOLD.dk);
  }
  // Bronze ring, iron rim and parchment face.
  b.ellipse(cx, cy, 7, 7, BRONZE.dk);
  b.ellipse(cx, cy, 6.5, 6.5, BRONZE.base);
  b.ellipse(cx - 0.5, cy - 0.5, 6, 6, BRONZE.lt);
  b.ellipse(cx, cy, 5.2, 5.2, PARCH.base);
  b.ellipse(cx - 1, cy - 1, 3, 3, PARCH.hi);
  // Hour ticks (gold at the quarters).
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const px = Math.floor(cx + Math.sin(a) * 4.6);
    const py = Math.floor(cy - Math.cos(a) * 4.6);
    b.set(px, py, k % 3 === 0 ? HORDE.dk : PARCH.dd);
  }
  // Rivets on the ring.
  for (const [dx, dy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]] as const) b.set(Math.floor(cx + dx), Math.floor(cy + dy), IRON.dd);
  // Tiny hourglass hanging below.
  const hx = 7;
  const hy = -13;
  b.vline(hx + 1, hy - 1, hy, IRON.base);
  b.hline(hx - 1, hx + 3, hy + 1, TIMBER.base);
  b.hline(hx - 1, hx + 3, hy + 6, TIMBER.base);
  b.set(hx, hy + 2, '#cfe4ec');
  b.set(hx + 2, hy + 2, '#cfe4ec');
  b.set(hx + 1, hy + 2, '#e8c070');
  b.set(hx + 1, hy + 3, '#e8c070');
  b.set(hx + 1, hy + 4, '#cfe4ec');
  b.hline(hx, hx + 2, hy + 5, '#e8c070');
  b.outline();
  wallShadow(b, 0, -31, 16, 25);
  s.rects = { face: rectAt(s, 3, -27, 10, 10) };
  return { base: s };
}

// ------------------------------------------------------------------ banners and notices

/** Cloth banner on a pole: swallowtail (V) or ragged bottom, trimmed edge. */
function clothBanner(b: PixelBuf, x: number, y: number, w: number, h: number, c: { hi: string; lt: string; base: string; dk: string; dd: string }, trim: string, ragged: boolean, finial: string): void {
  // Pole with finials.
  b.hline(x - 2, x + w + 1, y - 1, TIMBER.base);
  b.set(x - 2, y - 2, TIMBER.lt);
  b.set(x - 3, y - 1, finial);
  b.set(x + w + 2, y - 1, finial);
  b.set(x - 3, y - 2, finial);
  b.set(x + w + 2, y - 2, finial);
  b.rect(x, y, w, h - 3, c.base);
  if (ragged) {
    // Torn bottom edge: uneven teeth.
    const teeth = [3, 1, 2, 0, 3, 2, 1, 3, 0, 2, 1, 3];
    for (let i = 0; i < w; i++) b.vline(x + i, y + h - 3, y + h - 4 + teeth[i % teeth.length], c.base);
  } else {
    // Swallowtail.
    for (let i = 0; i < 3; i++) {
      b.hline(x, x + w / 2 - 2 - i, y + h - 3 + i, c.base);
      b.hline(x + w / 2 + 1 + i, x + w - 1, y + h - 3 + i, c.base);
    }
  }
  b.vline(x, y, y + h - 2, c.lt);
  b.vline(x + w - 1, y, y + h - 2, c.dk);
  b.hline(x, x + w - 1, y, trim);
  b.hline(x, x + w - 1, y + 1, shade(trim, -0.2));
  // Fold shading.
  b.vline(x + Math.floor(w / 3), y + 2, y + h - 5, c.lt);
  b.vline(x + Math.floor((2 * w) / 3), y + 2, y + h - 5, c.dk);
}

/** Parchment notice nailed to the wall, slightly curled at the corners. */
function parchment(b: PixelBuf, x: number, y: number, w: number, h: number, seed: number): void {
  b.rect(x, y, w, h, PARCH.base);
  b.hline(x, x + w - 1, y, PARCH.hi);
  b.vline(x + w - 1, y + 1, y + h - 1, PARCH.dk);
  b.hline(x + 1, x + w - 1, y + h - 1, PARCH.dk);
  b.clear(x + w - 1, y + h - 1);
  b.set(x + w - 2, y + h - 2, PARCH.dd);
  const r = rngOf(seed, 13);
  for (let i = 0; i < 6; i++) b.set(x + 1 + Math.floor(r() * (w - 2)), y + 1 + Math.floor(r() * (h - 2)), PARCH.lt);
  rivet(b, x + Math.floor(w / 2), y + 1);
}

export function poster(variant: string | undefined): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const v = variant ?? 'code';
  switch (v) {
    case 'coffee': {
      // Horde war banner: blood-red, ragged hem, tusked skull.
      const x = 2;
      const y = -29;
      clothBanner(b, x, y, 12, 18, HORDE, '#2a2226', true, BONE);
      const ix = x + 3;
      const iy = y + 4;
      b.rect(ix, iy, 6, 4, BONE);
      b.rect(ix + 1, iy + 4, 4, 2, BONE);
      b.set(ix + 1, iy + 1, '#1c1418');
      b.set(ix + 4, iy + 1, '#1c1418');
      b.set(ix + 1, iy + 2, '#1c1418');
      b.set(ix + 4, iy + 2, '#1c1418');
      b.set(ix + 2, iy + 5, '#1c1418');
      b.set(ix + 3, iy + 5, '#1c1418');
      // Tusks.
      b.set(ix, iy + 5, BONE);
      b.set(ix - 1, iy + 4, BONE);
      b.set(ix + 5, iy + 5, BONE);
      b.set(ix + 6, iy + 4, BONE);
      // Black slash behind.
      b.line(x + 1, y + 11, x + 10, y + 2, 'rgba(28,20,24,0.55)');
      break;
    }
    case 'rocket': {
      // Goblin WANTED poster: red header, green face with big ears, gold coin reward.
      const x = 2;
      const y = -29;
      parchment(b, x, y, 12, 16, 1);
      b.rect(x + 1, y + 2, 10, 2, HORDE.base);
      for (let i = 0; i < 5; i++) b.set(x + 2 + i * 2, y + 2, PARCH.hi);
      const fx = x + 4;
      const fy = y + 6;
      b.rect(fx, fy, 4, 4, '#6aa84a');
      b.set(fx - 1, fy + 1, '#6aa84a');
      b.set(fx - 2, fy, '#6aa84a');
      b.set(fx + 4, fy + 1, '#6aa84a');
      b.set(fx + 5, fy, '#6aa84a');
      b.set(fx + 1, fy + 1, '#f2e24a');
      b.set(fx + 2, fy + 1, '#f2e24a');
      b.hline(fx + 1, fx + 2, fy + 3, '#2f4a24');
      b.rect(x + 8, y + 11, 3, 3, GOLD.base);
      b.set(x + 8, y + 11, GOLD.hi);
      b.set(x + 9, y + 12, GOLD.dk);
      b.hline(x + 2, x + 6, y + 12, INK);
      b.hline(x + 2, x + 5, y + 14, INK);
      break;
    }
    case 'cat': {
      // Quest notice: parchment with a big golden "!" and a red wax seal.
      const x = 3;
      const y = -29;
      parchment(b, x, y, 10, 15, 2);
      b.rect(x + 4, y + 3, 2, 6, GOLD.base);
      b.vline(x + 4, y + 3, y + 8, GOLD.hi);
      b.set(x + 5, y + 8, GOLD.dk);
      b.rect(x + 4, y + 10, 2, 2, GOLD.base);
      b.set(x + 4, y + 10, GOLD.hi);
      b.hline(x + 1, x + 2, y + 5, INK);
      b.hline(x + 7, x + 8, y + 5, INK);
      b.hline(x + 1, x + 2, y + 7, INK);
      b.hline(x + 7, x + 8, y + 7, INK);
      b.rect(x + 7, y + 12, 3, 3, HORDE.lt);
      b.set(x + 8, y + 13, HORDE.dd);
      b.set(x + 7, y + 15, HORDE.dk);
      b.set(x + 9, y + 15, HORDE.dk);
      break;
    }
    case 'bug': {
      // Bounty notice: a big black spider crossed out in red.
      const x = 2;
      const y = -28;
      parchment(b, x, y, 12, 14, 3);
      b.hline(x + 2, x + 9, y + 2, INK);
      const sx = x + 6;
      const sy = y + 7;
      b.rect(sx - 1, sy - 1, 3, 3, '#1c1418');
      b.rect(sx, sy + 2, 2, 2, '#1c1418');
      for (const d of [-1, 1]) {
        b.line(sx + d * 2, sy - 1, sx + d * 4, sy - 3, '#1c1418');
        b.line(sx + d * 2, sy, sx + d * 4, sy, '#1c1418');
        b.line(sx + d * 2, sy + 1, sx + d * 4, sy + 3, '#1c1418');
      }
      b.set(sx - 1, sy - 1, '#d03a2a');
      b.set(sx + 1, sy - 1, '#d03a2a');
      b.line(x + 1, y + 3, x + 10, y + 12, 'rgba(184,40,30,0.85)');
      b.line(x + 10, y + 3, x + 1, y + 12, 'rgba(184,40,30,0.85)');
      break;
    }
    case 'ship_it': {
      // Dwarven/goblin harbour pennant: teal swallowtail with a gold anchor, rope-tied.
      const x = 2;
      const y = -29;
      clothBanner(b, x, y, 12, 18, TEAL, GOLD.base, false, BRONZE.lt);
      const ax = x + 6;
      const ay = y + 4;
      b.vline(ax, ay, ay + 8, GOLD.base);
      b.vline(ax - 1, ay + 1, ay + 7, GOLD.hi);
      b.hline(ax - 3, ax + 2, ay + 2, GOLD.base);
      b.set(ax - 1, ay - 1, GOLD.lt);
      b.set(ax, ay - 1, GOLD.lt);
      b.hline(ax - 3, ax + 2, ay + 8, GOLD.dk);
      b.set(ax - 4, ay + 7, GOLD.base);
      b.set(ax + 3, ay + 7, GOLD.base);
      // Rope lashing on the pole.
      for (const rx of [x + 1, x + 10]) {
        b.set(rx, y - 2, '#c9a45a');
        b.set(rx, y, '#a8824a');
      }
      break;
    }
    default: {
      // Alliance banner: royal blue swallowtail with gold border and a lion-head shield.
      const x = 2;
      const y = -29;
      clothBanner(b, x, y, 12, 18, ALLY, GOLD.base, false, GOLD.lt);
      b.vline(x + 1, y + 2, y + 13, GOLD.dk);
      b.vline(x + 10, y + 2, y + 13, GOLD.dk);
      const ix = x + 3;
      const iy = y + 4;
      // Shield.
      b.rect(ix, iy, 6, 5, GOLD.base);
      b.hline(ix + 1, ix + 4, iy + 5, GOLD.base);
      b.hline(ix + 2, ix + 3, iy + 6, GOLD.dk);
      b.hline(ix, ix + 5, iy, GOLD.hi);
      // Lion head (very simple): mane + face.
      b.rect(ix + 1, iy + 1, 4, 4, '#b8742a');
      b.rect(ix + 2, iy + 2, 2, 2, '#f2d27a');
      b.set(ix + 2, iy + 2, '#3a2616');
      b.set(ix + 3, iy + 2, '#3a2616');
      break;
    }
  }
  b.outline();
  wallShadow(b, 0, -31, 16, 20);
  return { base: s };
}

// ------------------------------------------------------------------ tapestry

export function painting(seed: number): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const x = 3;
  const y = -27;
  const w = 26;
  const h = 17;
  const r = rngOf(seed, 41);
  const warm = r() < 0.5;
  const cloth = warm ? HORDE : ALLY;
  // Rod with gold finials.
  b.hline(x - 3, x + w + 2, y - 1, TIMBER.base);
  b.hline(x - 3, x + w + 2, y - 2, TIMBER.lt);
  b.rect(x - 5, y - 3, 2, 3, GOLD.base);
  b.rect(x + w + 3, y - 3, 2, 3, GOLD.base);
  b.set(x - 5, y - 3, GOLD.hi);
  b.set(x + w + 3, y - 3, GOLD.hi);
  // Cloth with a woven border.
  b.rect(x, y, w, h, cloth.base);
  b.vline(x, y, y + h - 1, cloth.lt);
  b.vline(x + w - 1, y, y + h - 1, cloth.dk);
  for (let i = 0; i < w; i += 2) {
    b.set(x + i, y + h - 1, GOLD.dk);
    b.set(x + i + 1, y, GOLD.lt);
  }
  // Tassel fringe along the bottom.
  for (let i = 1; i < w - 1; i += 3) {
    b.vline(x + i, y + h, y + h + 1, GOLD.base);
    b.set(x + i, y + h + 2, GOLD.dk);
  }
  const ax = x + 2;
  const ay = y + 2;
  const aw = w - 4;
  const ah = h - 4;
  // Woven scene: sky, sun, hills, a keep on the hill, river.
  const skyA = warm ? '#e8b878' : '#a8c8d8';
  for (let i = 0; i < ah; i++) b.hline(ax, ax + aw - 1, ay + i, shade(skyA, -i * 0.015));
  b.ellipse(ax + 4, ay + 3, 2, 2, warm ? '#fff2c2' : '#fffbe6');
  const mt = warm ? '#7a5a6a' : '#5a6f90';
  for (let i = 0; i < aw; i++) {
    const hh = Math.round(3 + 2.2 * Math.sin(i * 0.5 + seed) + 1.2 * Math.sin(i * 1.3));
    b.vline(ax + i, ay + ah - 4 - hh, ay + ah - 4, mt);
    b.set(ax + i, ay + ah - 4 - hh, shade(mt, 0.15));
  }
  // Keep with a pennant.
  const kx = ax + 13 + Math.floor(r() * 4);
  const ky = ay + ah - 9;
  b.rect(kx, ky, 4, 6, STONE.lt);
  b.rect(kx - 2, ky + 2, 2, 4, STONE.base);
  b.set(kx, ky - 1, STONE.lt);
  b.set(kx + 2, ky - 1, STONE.lt);
  b.set(kx + 1, ky + 3, '#2a2226');
  b.vline(kx + 3, ky - 4, ky - 1, TIMBER.dk);
  b.hline(kx + 4, kx + 5, ky - 4, cloth.lt);
  b.rect(ax, ay + ah - 4, aw, 4, warm ? '#5f7a3a' : '#4f7d3a');
  b.line(ax + 2, ay + ah - 1, ax + 9, ay + ah - 3, '#5a8ab0');
  // Weave texture: faint checker over the whole scene.
  for (let yy = 0; yy < ah; yy++) for (let xx = (yy % 2); xx < aw; xx += 2) b.set(ax + xx, ay + yy, 'rgba(40,24,14,0.08)');
  b.outline();
  wallShadow(b, x - 5, y - 3, w + 10, h + 6);
  s.rects = { art: rectAt(s, ax, ay, aw, ah) };
  return { base: s };
}

// ------------------------------------------------------------------ scrying pool (wall TV)

export function tv(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const x = 1;
  const y = -27;
  const w = 30;
  const h = 18;
  // Carved dark-timber frame with gold trim and rune studs.
  b.rect(x - 1, y - 1, w + 2, h + 2, TIMBER.dk);
  bevel(b, x, y, w, h, TIMBER);
  b.hline(x + 1, x + w - 2, y + 1, GOLD.dk);
  b.hline(x + 1, x + w - 2, y + h - 2, GOLD.dk);
  // Scrying surface (dynamic.ts paints the vision into rects.tv).
  b.rect(x + 1, y + 1, w - 2, h - 3, '#1a1e3a');
  b.ellipse(x + w / 2, y + h / 2 - 1, 8, 4, '#2a2f5a');
  b.ellipse(x + w / 2, y + h / 2 - 1, 4, 2, '#3c4a8a');
  // Glowing crystal crowning the frame.
  const cx = x + w / 2;
  b.rect(cx - 3, y - 3, 6, 3, GOLD.base);
  b.hline(cx - 3, cx + 2, y - 3, GOLD.hi);
  b.rect(cx - 1, y - 6, 2, 4, '#8a6ae0');
  b.set(cx - 1, y - 6, '#d8c8ff');
  b.set(cx - 1, y - 5, '#b8a0ff');
  b.set(cx, y - 7, '#b8a0ff');
  // Gold corner caps and rune studs on the bottom rail.
  for (const [px, py] of [[x - 1, y - 1], [x + w - 1, y - 1], [x - 1, y + h - 1], [x + w - 1, y + h - 1]] as const) {
    b.rect(px, py, 2, 2, GOLD.base);
    b.set(px, py, GOLD.hi);
  }
  for (let i = 5; i < w - 4; i += 5) b.set(x + i, y + h - 1, '#7fd6e0');
  // Candles on the side brackets.
  for (const px of [x - 2, x + w + 1]) {
    b.rect(px - 1, y + 9, 3, 1, IRON.base);
    b.rect(px, y + 6, 1, 3, '#efe6cc');
    flame(b, px, y + 5);
  }
  b.outline();
  wallShadow(b, x - 3, y - 7, w + 6, h + 8);
  s.rects = { tv: rectAt(s, x + 1, y + 1, w - 2, h - 3) };
  return { base: s };
}

// ------------------------------------------------------------------ torch sconce (light switch)

export function lightSwitch(variant: string | undefined): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const on = (variant ?? 'on') === 'on';
  // Iron wall plate with a ring holder.
  b.rect(6, -15, 5, 5, IRON.base);
  b.hline(6, 10, -15, IRON.lt);
  b.hline(6, 10, -11, IRON.dd);
  rivet(b, 7, -13);
  rivet(b, 9, -13);
  b.hline(6, 10, -20, IRON.base);
  b.vline(8, -20, -15, IRON.dk);
  // Torch shaft, wrapped head.
  b.rect(8, -22, 2, 10, TIMBER.base);
  b.vline(8, -22, -13, TIMBER.lt);
  b.rect(7, -25, 4, 3, on ? '#5a3a24' : '#2e2622');
  b.hline(7, 10, -24, on ? '#7a5030' : '#3a302a');
  if (on) {
    // Big flickering flame.
    b.rect(7, -28, 4, 3, '#e8661e');
    b.rect(8, -30, 2, 2, '#f6a83a');
    b.set(8, -31, '#ffd27a');
    b.rect(8, -27, 2, 2, '#ffe9a0');
    b.set(9, -32, 'rgba(255,230,150,0.6)');
  } else {
    // Cold embers and a wisp of smoke.
    b.set(8, -25, '#7a3a20');
    b.set(9, -26, 'rgba(120,120,130,0.5)');
    b.set(8, -28, 'rgba(120,120,130,0.4)');
    b.set(9, -30, 'rgba(120,120,130,0.3)');
  }
  b.outline();
  wallShadow(b, 5, -25, 7, 15);
  return { base: s };
}

// ------------------------------------------------------------------ rope lift with portcullis (elevator)

export function elevator(state: number): BufFurniture {
  // Timber gatehouse: pulley wheel, a rope lift in the shaft and an iron portcullis that rises 5 px per state.
  const s = wallSheet(2, 2);
  const b = s.buf;
  const st = Math.max(0, Math.min(4, Math.round(state)));
  const lit = st > 0;
  // Posts and lintel.
  plank(b, 0, -28, 32, 5, TIMBER, 5);
  bevel(b, 0, -24, 3, 24, TIMBER);
  bevel(b, 29, -24, 3, 24, TIMBER);
  for (const py of [-20, -10]) {
    b.hline(0, 2, py, IRON.base);
    b.hline(29, 31, py, IRON.base);
    rivet(b, 1, py + 1);
    rivet(b, 30, py + 1);
  }
  // Bone tusks curling from the posts (Great Hall).
  b.line(-1, -6, -2, -10, BONE);
  b.set(-2, -11, BONE);
  b.line(32, -6, 33, -10, BONE);
  b.set(33, -11, BONE);
  // Red cloth over the lintel.
  b.rect(4, -24, 24, 2, HORDE.base);
  for (let i = 4; i < 28; i += 4) b.set(i + 2, -22, HORDE.dk);
  // Pulley wheel with a status lantern in its hub.
  b.ellipse(16, -27, 3.5, 2.5, IRON.base);
  b.ellipse(16, -27, 2, 1.5, IRON.dk);
  b.set(16, -27, lit ? '#ffd27a' : '#6a645a');
  b.set(15, -27, lit ? '#f08a2c' : '#4a4640');
  // Shaft interior.
  const ix = 3;
  const iy = -22;
  const iw = 26;
  const ih = 22;
  b.rect(ix, iy, iw, ih, '#2a1e16');
  for (let yy = iy + 3; yy < iy + ih; yy += 4) b.hline(ix, ix + iw - 1, yy, '#33261c');
  // Ropes and lift platform.
  b.vline(ix + 5, iy, iy + ih - 6, '#c9a45a');
  b.vline(ix + iw - 6, iy, iy + ih - 6, '#c9a45a');
  b.rect(ix + 2, iy + ih - 6, iw - 4, 2, M.oak.base);
  b.hline(ix + 2, ix + iw - 3, iy + ih - 6, M.oak.lt);
  // Wall torch inside the shaft.
  b.rect(ix + 12, iy + 6, 2, 3, TIMBER.lt);
  if (lit) {
    b.rect(ix + 12, iy + 4, 2, 2, '#f6a83a');
    b.set(ix + 12, iy + 3, '#ffd27a');
    b.ellipse(ix + 13, iy + 6, 5, 4, 'rgba(255,170,80,0.15)');
  } else b.set(ix + 12, iy + 5, '#5a3a24');
  b.rect(ix, iy + ih - 2, iw, 2, TIMBER.dk);
  // Portcullis: iron grid with spiked bottom.
  const gateBot = iy + ih - 1 - st * 5;
  if (gateBot > iy) {
    for (let gx = ix + 1; gx < ix + iw; gx += 4) {
      b.vline(gx, iy, gateBot, IRON.base);
      b.vline(gx + 1, iy, gateBot, IRON.dd);
      b.set(gx, gateBot + 1, IRON.lt);
    }
    for (let gy = gateBot - 2; gy >= iy; gy -= 5) {
      b.hline(ix, ix + iw - 1, gy, IRON.lt);
      b.hline(ix, ix + iw - 1, gy + 1, IRON.dd);
    }
  }
  // Lever on the right post.
  b.rect(29, -15, 2, 4, IRON.base);
  b.line(30, -15, lit ? 33 : 32, lit ? -18 : -13, TIMBER.lt);
  b.set(lit ? 33 : 32, lit ? -18 : -13, lit ? GOLD.base : HORDE.base);
  b.outline();
  return { base: s };
}

// ------------------------------------------------------------------ stone arch (door frame)

export function doorFrame(): BufFurniture {
  const s = wallSheet(2, 3);
  const b = s.buf;
  // Quoined jambs: alternating long/short blocks.
  for (let i = 0; i < 7; i++) {
    const yy = -28 + i * 4;
    const long = i % 2 === 0;
    for (const [jx, dir] of [[-2, 1], [31, -1]] as const) {
      const bw = long ? 4 : 3;
      const bx = dir > 0 ? jx - (long ? 1 : 0) : jx;
      bevel(b, bx, yy, bw, 4, i % 3 === 1 ? ramp(shade(STONE.base, -0.04), 0.07) : STONE);
    }
  }
  // Arch voussoirs filling the top corners of the opening, with a keystone.
  const top = -27;
  const span = 30;
  const rad = 15;
  for (let dy = 0; dy < 8; dy++) {
    const yy = top + dy;
    const half = Math.sqrt(Math.max(0, rad * rad - (rad - dy * 1.9) ** 2));
    const inset = Math.max(0, Math.round(rad - half));
    if (inset <= 0) continue;
    b.hline(1, 1 + inset - 1, yy, dy % 2 ? STONE.base : STONE.lt);
    b.hline(1 + span - inset, span, yy, dy % 2 ? STONE.dk : STONE.base);
    b.set(1 + inset - 1, yy, STONE.dd);
    b.set(1 + span - inset, yy, STONE.dd);
  }
  b.rect(-3, -31, 38, 4, STONE.base);
  b.hline(-3, 34, -31, STONE.hi);
  for (let xx = 1; xx < 34; xx += 5) b.vline(xx, -30, -28, STONE.dd);
  b.rect(13, -32, 6, 7, STONE.lt);
  b.hline(13, 18, -32, STONE.hi);
  b.vline(18, -31, -26, STONE.dk);
  b.hline(14, 17, -26, STONE.dd);
  b.set(15, -29, HORDE.base);
  b.set(16, -29, HORDE.base);
  b.outline();
  return { base: s };
}

// ------------------------------------------------------------------ carved hanging sign

export function sign(): BufFurniture {
  const s = wallSheet(3);
  const b = s.buf;
  const x = 3;
  const y = -28;
  const w = 42;
  const h = 11;
  // Iron bracket bar with chains.
  b.hline(x + 1, x + w - 2, y - 4, IRON.base);
  b.hline(x + 1, x + w - 2, y - 5, IRON.lt);
  // Curled scroll ends on the bracket bar.
  for (const [ex, d] of [[x, -1], [x + w - 1, 1]] as const) {
    b.set(ex, y - 5, IRON.base);
    b.set(ex + d, y - 5, IRON.base);
    b.set(ex + d, y - 6, IRON.lt);
    b.set(ex, y - 6, IRON.dk);
  }
  for (const cx of [x + 5, x + w - 6]) {
    b.set(cx, y - 3, IRON.lt);
    b.set(cx, y - 2, IRON.dk);
    b.set(cx, y - 1, IRON.lt);
  }
  // Board with pointed (shield-cut) ends.
  const fr = M.walnut;
  b.rect(x, y, w, h, fr.base);
  for (let i = 0; i < 3; i++) {
    b.vline(x - 1 - i, y + 2 + i, y + h - 3 - i, fr.base);
    b.vline(x + w + i, y + 2 + i, y + h - 3 - i, fr.dk);
  }
  b.hline(x, x + w - 1, y, fr.lt);
  b.hline(x, x + w - 1, y + h - 1, fr.dd);
  // Light carved face, kept calm so the room name stays legible.
  b.rect(x + 2, y + 1, w - 4, h - 2, '#d9b88e');
  b.hline(x + 2, x + w - 3, y + 1, '#e8cca2');
  b.hline(x + 2, x + w - 3, y + h - 2, '#b98a55');
  b.vline(x + 2, y + 1, y + h - 2, '#e8cca2');
  b.vline(x + w - 3, y + 1, y + h - 2, '#b98a55');
  // Gold studs at the pointed ends.
  b.set(x - 1, y + h / 2 - 1, GOLD.base);
  b.set(x + w, y + h / 2 - 1, GOLD.base);
  rivet(b, x + 1, y + 3);
  rivet(b, x + w - 2, y + 3);
  rivet(b, x + 1, y + h - 3);
  rivet(b, x + w - 2, y + h - 3);
  b.outline();
  wallShadow(b, x - 4, y - 1, w + 8, h + 2);
  s.rects = { sign: rectAt(s, x + 4, y + 2, w - 8, h - 4) };
  return { base: s };
}

// ------------------------------------------------------------------ polished bronze mirror

export function mirror(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const x = 2;
  const y = -28;
  const w = 12;
  const h = 14;
  // Gilded frame with a crest on top and a little bottom scroll.
  bevel(b, x, y, w, h, GOLD);
  b.rect(x + 4, y - 3, 4, 3, GOLD.base);
  b.hline(x + 4, x + 7, y - 3, GOLD.hi);
  b.set(x + 5, y - 4, GOLD.lt);
  b.set(x + 6, y - 4, GOLD.lt);
  b.set(x + 5, y - 2, ALLY.lt);
  b.set(x + 6, y - 2, ALLY.base);
  b.rect(x + 3, y + h, 6, 1, GOLD.dk);
  // Polished bronze face: warm gradient + glints (the world can draw a reflection into rects.glass).
  for (let i = 0; i < h - 2; i++) b.hline(x + 1, x + w - 2, y + 1 + i, shade('#d8a060', -i * 0.025));
  b.line(x + 7, y + 1, x + 2, y + h - 3, 'rgba(255,240,200,0.6)');
  b.line(x + 9, y + 2, x + 5, y + h - 2, 'rgba(255,240,200,0.3)');
  b.outline();
  wallShadow(b, x - 1, y - 4, w + 2, h + 5);
  s.rects = { glass: rectAt(s, x + 1, y + 1, w - 2, h - 2) };
  return { base: s };
}

// ------------------------------------------------------------------ weapon and jar rack

export function shelfWall(seed: number): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const r = rngOf(seed, 51);
  const shelf = (y: number) => {
    plank(b, 0, y, 32, 2, M.oak, seed + y);
    for (const x of [3, 27]) {
      b.rect(x, y + 2, 2, 1, IRON.base);
      b.set(x + 1, y + 3, IRON.dk);
    }
  };
  shelf(-19);
  shelf(-9);
  // Top shelf: potion jars, a skull with a candle and a rolled scroll.
  const potions = ['#c0392b', '#3d63b8', '#7fd65a', '#b05ad0', '#e0b23c'];
  let x = 2;
  for (let i = 0; i < 3; i++) {
    const c = potions[Math.floor(r() * potions.length)];
    const tall = r() < 0.5;
    const ph = tall ? 6 : 4;
    b.rect(x, -19 - ph, 3, ph, c);
    b.vline(x, -19 - ph, -20, shade(c, 0.2));
    b.set(x + 1, -19 - ph + 1, 'rgba(255,255,255,0.6)');
    b.set(x + 1, -20 - ph, '#efe6cc');
    b.set(x + 1, -21 - ph, M.leather.base);
    x += 4;
  }
  // Skull + candle.
  b.rect(16, -23, 5, 4, BONE);
  b.hline(17, 19, -24, BONE);
  b.set(17, -22, '#2a1d14');
  b.set(19, -22, '#2a1d14');
  b.set(18, -20, '#c8b898');
  b.rect(18, -27, 1, 3, '#efe6cc');
  flame(b, 18, -28);
  // Scroll.
  b.rect(23, -21, 6, 2, PARCH.base);
  b.hline(23, 28, -21, PARCH.hi);
  b.set(25, -20, HORDE.base);
  // Bottom shelf: seed picks weapons, tomes or tankards.
  const v = seed % 3;
  if (v === 0) {
    // Sword and axe laid on pegs.
    b.hline(3, 15, -12, '#b8bcc2');
    b.hline(3, 14, -11, '#8f949a');
    b.set(2, -12, '#e6e8ea');
    b.vline(16, -14, -10, GOLD.base);
    b.hline(17, 19, -12, M.leather.base);
    b.set(20, -12, GOLD.base);
    b.hline(21, 29, -11, TIMBER.lt);
    b.rect(25, -15, 3, 4, '#8f949a');
    b.vline(24, -14, -12, '#b8bcc2');
    b.set(27, -15, '#e6e8ea');
  } else if (v === 1) {
    // Tomes and a glowing goblin jar.
    const covers = [HORDE.base, ALLY.base, TEAL.base, M.leather.base];
    for (let i = 0; i < 4; i++) {
      const c = covers[(i + seed) % covers.length];
      b.rect(3 + i * 3, -16 + (i % 2), 3, 7 - (i % 2), c);
      b.vline(3 + i * 3, -16 + (i % 2), -10, shade(c, 0.15));
      b.set(4 + i * 3, -14, GOLD.base);
    }
    b.rect(17, -12, 6, 3, '#6b4a2b');
    b.hline(17, 22, -12, '#8a6239');
    b.rect(24, -16, 5, 7, '#2a3a2a');
    b.rect(25, -15, 3, 5, '#7fd65a');
    b.set(25, -15, '#c8f0a0');
    b.hline(24, 28, -17, BRONZE.base);
  } else {
    // Tankards with foam and a small iron-banded chest.
    for (const tx of [3, 9]) {
      b.rect(tx, -14, 4, 5, M.oak.base);
      b.vline(tx, -14, -10, M.oak.lt);
      b.hline(tx, tx + 3, -12, IRON.base);
      b.hline(tx, tx + 3, -15, '#f4ecd8');
      b.set(tx + 4, -13, M.oak.dk);
      b.set(tx + 4, -11, M.oak.dk);
    }
    b.rect(17, -14, 10, 5, M.oak.dk);
    b.hline(17, 26, -14, M.oak.lt);
    b.vline(19, -14, -10, IRON.base);
    b.vline(24, -14, -10, IRON.base);
    b.set(21, -12, GOLD.base);
    b.set(22, -12, GOLD.base);
  }
  b.outline();
  return { base: s };
}
