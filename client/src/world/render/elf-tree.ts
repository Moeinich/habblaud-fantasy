// The world tree of the night-elf wing (DOM canvases, cached per wing width): the elf offices stand in the hollow
// heart of one huge tree. A rounded ring of living trunk wraps the whole wing; its back (north) wall rises high
// behind the offices as the inside of the trunk — furrowed bark with glowing runes and roots running down onto
// the floor — and its rim carries a crown of jungle leaves all the way round. Between the offices and the ring
// lies the hollow's floor of heartwood, with growth rings and glowing mushrooms. A gap in the front of the ring
// lets the walkway in. Drawn after people and furniture (render/renderer.ts drawElfTree): the ring, wall, floor and
// crown never cover the offices themselves; only a veil of hanging vines does, and that one is see-through.
import { hash32 } from '../../../../shared/hash';
import { BUILDING_H, ELF_TREE_UP, TILE } from '../constants';
import { WALKWAY_LX, WALKWAY_W } from '../layout/corridor';

export interface TreeSprite {
  /** Ring, inner wall, heartwood floor and crown (drawn opaque; nothing over the offices). */
  solid: HTMLCanvasElement;
  /** Vines hanging over the offices (drawn see-through). */
  veil: HTMLCanvasElement;
  /** Offset (px) of both canvases from the wing's top-left corner. */
  ox: number;
  oy: number;
}

/** How far the tree rises above the north strip (tiles), for the camera. */
export const CROWN_UP = ELF_TREE_UP;

type RGB = readonly [number, number, number];
const LEAF: readonly RGB[] = [
  [24, 58, 46],
  [34, 84, 60],
  [52, 116, 74],
  [86, 158, 94],
];
const BARK: readonly RGB[] = [
  [40, 29, 31],
  [64, 48, 45],
  [92, 71, 59],
  [124, 98, 77],
];
const HEART: readonly RGB[] = [
  [120, 84, 56],
  [142, 102, 68],
  [164, 122, 84],
];
const MOSS: readonly RGB[] = [
  [52, 92, 58],
  [74, 124, 70],
];
const GLOW: RGB = [143, 240, 224];
const GLOW_HI: RGB = [220, 255, 248];

class Pix {
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  }
  put(x: number, y: number, c: RGB): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }
  filled(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.data[(y * this.w + x) * 4 + 3] > 0;
  }
  canvas(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    c.getContext('2d')!.putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return c;
  }
}

const cache = new Map<string, TreeSprite>();

/** Rounded-rectangle "superellipse" exponent of the ring: round corners, nearly straight sides. */
const N = 6;

export function worldTree(wingWpx: number, seed = 7): TreeSprite {
  const key = `${wingWpx}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const T = TILE;
  const W = wingWpx;
  const H = BUILDING_H * T;
  // hollow's half width: just wide enough that the wing's corners stay inside the rounded ring
  // (|x/A|^N + |y/B|^N <= 1 at the corners, with B below), so the trunk hugs the offices on the sides
  const A = W / 2 / (1 - ((H / 2) / (H / 2 + 1.5 * T)) ** N) ** (1 / N) + 0.5 * T;
  const B = H / 2 + 1.5 * T; // hollow's half height
  const R = 2.5 * T; // ring thickness
  const WALL = 10 * T; // how high the back wall rises
  const CROWN = 7 * T; // leaves above the rim
  const pad = 3 * T;
  const left = A + R + pad; // canvas x of the hollow's centre
  const top = WALL + R + CROWN + T; // canvas y of the wing's top edge
  const cw = Math.ceil(left * 2);
  const ch = Math.ceil(top + H / 2 + B + R + 2 * T);
  const cx = left;
  const cy = top + H / 2;
  const solid = new Pix(cw, ch);
  const veil = new Pix(cw, ch);
  const rnd = (k: number) => hash32(`${seed}:${k}`) / 4294967296;
  const sup = (dx: number, dy: number, a: number, b: number) => Math.abs(dx / a) ** N + Math.abs(dy / b) ** N;
  /** Top edge of the hollow at a column (canvas y), or null beyond its sides. */
  const hollowTop = (dx: number) => (Math.abs(dx) >= A ? null : cy - B * (1 - Math.abs(dx / A) ** N) ** (1 / N));
  /** How high the ring is lifted at a column: the full wall in the middle, dropping to nothing at the sides. */
  const lift = (dx: number) => (Math.abs(dx) >= A ? 0 : WALL * Math.sqrt(1 - (dx / A) ** 2));
  const wingX0 = cx - W / 2;
  const walkX0 = wingX0 + (WALKWAY_LX - 0.5) * T;
  const walkX1 = wingX0 + (WALKWAY_LX + WALKWAY_W + 0.5) * T;
  const inWing = (x: number, y: number) => x >= wingX0 && x < wingX0 + W && y >= top && y < top + H;

  // ---- the hollow's floor: heartwood with growth rings, roots and glowing mushrooms (around the offices)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const f = sup(dx, dy, A, B);
      if (f > 1 || inWing(x, y)) continue;
      if (y > top + H && x >= walkX0 && x < walkX1) continue;
      const ring = Math.floor(f ** 0.5 * 14 + Math.sin(x * 0.05) * 0.3);
      const n = hash32(`h${x >> 1},${y >> 1}`) % 11;
      solid.put(x, y, ring % 3 === 0 && n > 2 ? HEART[0] : n === 0 ? HEART[2] : HEART[1]);
    }
  }
  for (let i = 0; i < 70; i++) {
    const a = rnd(i + 50) * Math.PI * 2;
    const r = 0.86 + rnd(i + 51) * 0.12;
    const x = Math.round(cx + Math.cos(a) * A * r);
    const y = Math.round(cy + Math.sin(a) * B * r);
    if (!solid.filled(x, y) || inWing(x, y)) continue;
    solid.put(x, y, GLOW_HI);
    solid.put(x - 1, y + 1, GLOW);
    solid.put(x + 1, y + 1, GLOW);
    solid.put(x, y + 1, [210, 200, 220]);
  }

  // ---- the ring of trunk: its rim seen from above, lifted at the back into a tall inner wall
  const barkAt = (x: number, y: number, u: number) => {
    // u: 0 at the inner edge, 1 at the outer edge of the rim
    const n = hash32(`b${x >> 1},${y >> 1}`) % 9;
    if (u < 0.08 || u > 0.92) return BARK[0];
    if (n === 0) return MOSS[(x + y) & 1];
    return u < 0.35 ? BARK[3] : u < 0.7 ? BARK[2] : BARK[1];
  };
  // inner wall first (behind everything else of the ring)
  for (let x = 0; x < cw; x++) {
    const dx = x - cx;
    const yIn = hollowTop(dx);
    if (yIn === null) continue;
    const l = lift(dx);
    if (l < 1) continue;
    for (let y = Math.floor(yIn - l); y < yIn; y++) {
      if (inWing(x, y)) continue;
      const t = (yIn - y) / l; // 0 at the floor, 1 at the rim
      const fur = ((x + Math.round(Math.sin(y * 0.06 + x * 0.01) * 3)) % 9 + 9) % 9;
      let c = fur === 0 ? BARK[0] : fur < 3 ? BARK[2] : BARK[1];
      if (t < 0.12) c = BARK[0]; // shadow where the wall meets the floor
      else if (hash32(`w${x >> 1},${y >> 1}`) % 19 === 0) c = MOSS[0];
      solid.put(x, y, c);
    }
  }
  // the rim all the way round (the back of it lifted onto the wall)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const f = sup(dx, dy, A, B);
      const g = sup(dx, dy, A + R, B + R);
      if (f <= 1 || g > 1) continue;
      if (dy > 0 && x >= walkX0 && x < walkX1) continue; // the walkway's gap in the front
      // how far between the inner and the outer edge this pixel lies (0..1)
      const uu = Math.min(1, Math.max(0, (f ** (1 / N) - 1) / ((A + R) / A - 1)));
      const yy = dy < 0 ? y - lift(dx) : y;
      solid.put(x, yy, barkAt(x, y, uu));
    }
  }
  // the outer face of the front of the ring, dropping to the ground
  for (let x = 0; x < cw; x++) {
    const dx = x - cx;
    if (Math.abs(dx) >= A + R) continue;
    if (x >= walkX0 && x < walkX1) continue;
    const yOut = cy + (B + R) * (1 - Math.abs(dx / (A + R)) ** N) ** (1 / N);
    for (let y = Math.floor(yOut); y < yOut + T; y++) {
      const fur = (x % 7 + 7) % 7;
      solid.put(x, y, y > yOut + T - 3 ? BARK[0] : fur === 0 ? BARK[0] : BARK[1]);
    }
  }
  // the gap's dark edges
  for (const gx of [walkX0 - 1, walkX1]) {
    const dx = gx - cx;
    const y0 = cy + B * (1 - Math.abs(dx / A) ** N) ** (1 / N);
    const y1 = cy + (B + R) * (1 - Math.abs(dx / (A + R)) ** N) ** (1 / N) + T;
    for (let y = Math.floor(y0); y < y1; y++) solid.put(gx, y, BARK[0]);
  }

  // ---- roots running down the inner wall onto the heartwood
  for (let i = 0; i < Math.round(W / 70); i++) {
    const x0 = cx + (rnd(i + 200) - 0.5) * W * 1.1;
    const yIn = hollowTop(x0 - cx);
    if (yIn === null) continue;
    let x = x0;
    for (let y = Math.floor(yIn - lift(x0 - cx) * 0.5); y < yIn + T * 0.8; y++) {
      x += Math.sin(y * 0.15 + i) * 0.6;
      if (inWing(Math.round(x), y)) break;
      for (let d = -2; d <= 2; d++) solid.put(x + d, y, d === -2 ? BARK[3] : d === 2 ? BARK[0] : BARK[2]);
    }
  }
  // glowing runes on the inner wall
  for (let i = 0; i < 9; i++) {
    const x = cx + (rnd(i + 300) - 0.5) * W * 0.9;
    const yIn = hollowTop(x - cx);
    if (yIn === null) continue;
    const y = yIn - lift(x - cx) * (0.35 + rnd(i + 301) * 0.4);
    for (let j = 0; j < 7; j++) solid.put(x + (j % 3 === 1 ? 1 : 0), y + j, j === 3 ? GLOW_HI : GLOW);
  }

  // ---- the crown: jungle leaves heaped along the rim, tallest at the back
  const clump = (bx: number, by: number, r: number) => {
    for (let dy = -Math.ceil(r); dy <= r; dy++) {
      for (let dx = -Math.ceil(r); dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = Math.round(bx + dx);
        const y = Math.round(by + dy);
        if (inWing(x, y)) continue;
        const q = hash32(`${x >> 1},${y >> 1}`) & 7;
        const lit = -dx - dy;
        let tone = dy > r * 0.45 ? 0 : lit > r * 0.7 ? 3 : lit > 0 ? 2 : 1;
        if (q === 0 && tone > 0) tone--;
        else if (q === 7 && tone < 3) tone++;
        solid.put(x, y, LEAF[tone]);
      }
    }
  };
  for (let a = 0; a < Math.PI * 2; a += 0.035) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // a point on the outer rim (superellipse via sign-power)
    const ex = cx + (A + R) * Math.sign(ca) * Math.abs(ca) ** (2 / N);
    const ey0 = cy + (B + R) * Math.sign(sa) * Math.abs(sa) ** (2 / N);
    const back = sa < 0;
    const ey = back ? ey0 - lift(ex - cx) : ey0;
    if (!back && ex >= walkX0 - T && ex < walkX1 + T) continue;
    const k = Math.round(a * 1000);
    const size = back ? T * (1.2 + (CROWN / T) * 0.25 * (-sa)) : T * (0.9 + rnd(k) * 0.5);
    clump(ex + (rnd(k + 1) - 0.5) * T, ey - (back ? size * 0.6 : 0), size);
    if (back && rnd(k + 2) < 0.5) clump(ex + (rnd(k + 3) - 0.5) * 2 * T, ey - size * 1.4, size * 0.8);
  }
  for (let i = 0; i < Math.round(cw / 5); i++) {
    const x = Math.round(rnd(i + 900) * cw);
    const y = Math.round(rnd(i + 901) * ch);
    if (inWing(x, y) || !solid.filled(x, y) || solid.data[(y * cw + x) * 4 + 1] < 54 || solid.data[(y * cw + x) * 4 + 1] > 170) continue;
    if (solid.data[(y * cw + x) * 4] > 100) continue; // only on leaves
    solid.put(x, y, GLOW_HI);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) solid.put(x + dx, y + dy, GLOW);
  }

  // ---- the veil over the offices: vines and leaves trailing down from the wall
  for (let x = Math.round(wingX0) + 6; x < wingX0 + W - 6; x += 9 + Math.round(rnd(x + 700) * 12)) {
    const len = Math.round(T * (1.2 + rnd(x + 701) * 3.5));
    for (let j = 0; j < len; j++) {
      const vx = x + Math.round(Math.sin((j + x) * 0.3));
      veil.put(vx, top + j, j % 6 === 5 ? LEAF[3] : LEAF[1]);
      if (j % 5 === 2) veil.put(vx + (j % 10 === 2 ? 1 : -1), top + j, LEAF[2]);
    }
    if (rnd(x + 702) < 0.35) veil.put(x, top + len, GLOW_HI);
  }

  const s = { solid: solid.canvas(), veil: veil.canvas(), ox: -(cx - W / 2), oy: -top };
  cache.set(key, s);
  return s;
}
