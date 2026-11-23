// The world tree of the night elves' zone (DOM canvases, cached per outline): the elf offices stand in the hollow
// heart of one huge tree. A low rounded ring of living trunk wraps the zone's L, its rim carrying jungle leaves all
// the way round. Inside, the jungle floor runs on, with
// roots breaking through along the foot of the trunk and glowing mushrooms among them. Gaps in the ring let the
// corridors out. Drawn after people and furniture (render/renderer.ts drawElfTree): the ring, wall, floor and
// crown never cover the offices themselves; only a veil of hanging vines does, and that one is see-through.
import { hash32 } from '../../../../shared/hash';
import { ELF_TREE_UP, TILE } from '../constants';
import type { TileRect } from '../layout/types';

export interface TreeSprite {
  /** Ring, inner wall, roots and crown (drawn opaque; nothing over the offices). */
  solid: HTMLCanvasElement;
  /** Vines hanging over the offices (drawn see-through). */
  veil: HTMLCanvasElement;
  /** World px of both canvases' top-left corner. */
  x: number;
  y: number;
  /** Where the veil may show (world px): the rows of offices below their back wall. */
  clips: { x: number; y: number; w: number; h: number }[];
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

/** A rectangle in px. */
interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The tree round the elves' zone: `rects` are the zone's outline (tiles, overlapping: the L of its two rows), `rows`
 * the bands of its two rows of offices (tiles) and `gaps` where the corridors leave through the trunk (tiles).
 */
export function worldTree(rects: readonly TileRect[], rows: readonly TileRect[], gaps: readonly TileRect[], seed = 7): TreeSprite {
  const key = `${[...rects, ...rows, ...gaps].map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';')}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const T = TILE;
  const M = 1.5 * T; // the hollow's margin round the offices
  const CR = 4 * T; // its corner radius
  const R = 2.5 * T; // ring thickness
  // the trunk no longer rises into a tall wall behind the offices: the ring stays low all the way round
  const WALL = 0;
  const CROWN = 2 * T; // leaves above the rim
  const pad = 3 * T;
  const bx0 = Math.min(...rects.map((r) => r.x)) * T;
  const by0 = Math.min(...rects.map((r) => r.y)) * T;
  const bx1 = Math.max(...rects.map((r) => r.x + r.w)) * T;
  const by1 = Math.max(...rects.map((r) => r.y + r.h)) * T;
  // canvas origin in world px
  const ox = bx0 - M - R - pad;
  const oy = by0 - WALL - R - CROWN - T;
  const cw = Math.ceil(bx1 + M + R + pad - ox);
  const ch = Math.ceil(by1 + M + R + 2 * T - oy);
  const solid = new Pix(cw, ch);
  const veil = new Pix(cw, ch);
  const rnd = (k: number) => hash32(`${seed}:${k}`) / 4294967296;
  const box = (r: TileRect) => {
    const x0 = r.x * T - ox;
    const y0 = r.y * T - oy;
    return { x0, y0, x1: x0 + r.w * T, y1: y0 + r.h * T, cx: x0 + (r.w * T) / 2, cy: y0 + (r.h * T) / 2, hw: (r.w * T) / 2 + M, hh: (r.h * T) / 2 + M };
  };
  const boxes = rects.map(box);
  const wing = rows.map(box);
  const holes = gaps.map(box);
  const K = 3 * T;
  /** Distance outside the hollow (negative inside): the zone's rectangles, rounded and blended into one. */
  const sdf = (x: number, y: number) => {
    let d = Infinity;
    for (const b of boxes) {
      const qx = Math.abs(x - b.cx) - (b.hw - CR);
      const qy = Math.abs(y - b.cy) - (b.hh - CR);
      const e = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CR;
      if (d === Infinity) d = e;
      else {
        const k = Math.max(K - Math.abs(d - e), 0) / K;
        d = Math.min(d, e) - k * k * K * 0.25;
      }
    }
    return d;
  };
  const dmap = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) dmap[y * cw + x] = sdf(x + 0.5, y + 0.5);
  const D = (x: number, y: number) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    return ix < 0 || iy < 0 || ix >= cw || iy >= ch ? Infinity : dmap[iy * cw + ix];
  };
  const inWing = (x: number, y: number) => wing.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1);
  // a corridor's way out through the trunk (with half a tile of dark edge either side)
  const inGap = (x: number, y: number) => holes.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 - 0.5 * T && y < b.y1 + 0.5 * T);
  /** Top edge of the hollow at a column (canvas y), or null where the hollow doesn't reach. */
  const tops: (number | null)[] = [];
  for (let x = 0; x < cw; x++) {
    let t: number | null = null;
    for (let y = 0; y < ch; y++)
      if (dmap[y * cw + x] <= 0) {
        t = y;
        break;
      }
    tops.push(t);
  }
  const hollowTop = (x: number) => tops[Math.round(x)] ?? null;
  const hx0 = bx0 - M - ox;
  const hx1 = bx1 + M - ox;
  /** How high the ring is lifted at a column: the full wall in the middle, dropping to nothing at the ends. */
  const lift = (x: number) => {
    const u = (x - (hx0 + hx1) / 2) / ((hx1 - hx0) / 2);
    return Math.abs(u) >= 1 ? 0 : WALL * Math.sqrt(1 - u * u);
  };

  // ---- the hollow's floor is the jungle's own ground (the biome underneath); only along the foot of the trunk do
  // its roots break through, with glowing mushrooms among them
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const d = dmap[y * cw + x];
      if (d > 0 || inWing(x, y) || inGap(x, y)) continue;
      // a ragged band of roots, wider here and there
      const band = (0.35 + 0.45 * ((hash32(`r${x >> 3},${y >> 3}`) % 100) / 100)) * T;
      if (-d > band) continue;
      const n = hash32(`h${x >> 1},${y >> 1}`) % 11;
      solid.put(x, y, n === 0 ? HEART[2] : n < 4 ? HEART[0] : HEART[1]);
    }
  }
  for (let i = 0, put = 0; i < 1200 && put < 90; i++) {
    const x = Math.round(rnd(i + 50) * cw);
    const y = Math.round(rnd(i + 51) * ch);
    const d = D(x, y);
    if (d > -0.4 * T || d < -1.6 * T || inWing(x, y) || inGap(x, y)) continue;
    put++;
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
    const yIn = hollowTop(x);
    if (yIn === null) continue;
    const l = lift(x);
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
  // the rim all the way round (the back of it — above the hollow — lifted onto the wall)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const d = dmap[y * cw + x];
      if (d <= 0 || d > R || inGap(x, y)) continue;
      const yIn = tops[x];
      const back = yIn !== null && y < yIn;
      solid.put(x, back ? y - lift(x) : y, barkAt(x, y, d / R));
    }
  }
  // the outer face of the front of the ring, dropping to the ground: below the lowest stretch of rim in each column
  for (let x = 0; x < cw; x++) {
    let yOut: number | null = null;
    for (let y = ch - 1; y > 0; y--)
      if (dmap[y * cw + x] <= R) {
        yOut = y + 1;
        break;
      }
    if (yOut === null) continue;
    for (let y = yOut; y < yOut + T; y++) {
      if (inGap(x, y - T)) continue;
      const fur = (x % 7 + 7) % 7;
      solid.put(x, y, y > yOut + T - 3 ? BARK[0] : fur === 0 ? BARK[0] : BARK[1]);
    }
  }
  // the gaps' dark edges
  for (const g of holes) {
    for (let x = Math.floor(g.x0); x < g.x1; x++) {
      for (const y of [Math.floor(g.y0 - 0.5 * T) - 1, Math.ceil(g.y1 + 0.5 * T)]) {
        const d = D(x, y);
        if (d > 0 && d <= R) solid.put(x, y, BARK[0]);
      }
    }
  }

  // ---- roots running down the inner wall onto the floor
  const W = hx1 - hx0;
  for (let i = 0; i < Math.round(W / 70); i++) {
    const x0 = hx0 + rnd(i + 200) * W;
    const yIn = hollowTop(x0);
    if (yIn === null) continue;
    let x = x0;
    for (let y = Math.floor(yIn - lift(x0) * 0.5); y < yIn + T * 0.8; y++) {
      x += Math.sin(y * 0.15 + i) * 0.6;
      if (inWing(Math.round(x), y)) break;
      for (let d = -2; d <= 2; d++) solid.put(x + d, y, d === -2 ? BARK[3] : d === 2 ? BARK[0] : BARK[2]);
    }
  }
  // ---- the crown: jungle leaves heaped along the rim, tallest at the back
  const clump = (bx: number, by: number, r: number) => {
    for (let dy = -Math.ceil(r); dy <= r; dy++) {
      for (let dx = -Math.ceil(r); dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = Math.round(bx + dx);
        const y = Math.round(by + dy);
        if (inWing(x, y) || inGap(x, y)) continue;
        const q = hash32(`${x >> 1},${y >> 1}`) & 7;
        const lit = -dx - dy;
        let tone = dy > r * 0.45 ? 0 : lit > r * 0.7 ? 3 : lit > 0 ? 2 : 1;
        if (q === 0 && tone > 0) tone--;
        else if (q === 7 && tone < 3) tone++;
        solid.put(x, y, LEAF[tone]);
      }
    }
  };
  // points along the outer edge of the rim: the top and bottom of every few columns, the ends of every few rows
  type Edge = { x: number; y: number; side: 'back' | 'front' | 'west' | 'east' };
  const edge: Edge[] = [];
  for (let x = 2; x < cw; x += 4) {
    let t = -1;
    let b = -1;
    for (let y = 0; y < ch; y++) if (dmap[y * cw + x] <= R) (t < 0 ? (t = y) : 0, (b = y));
    if (t < 0) continue;
    const back = tops[x] !== null;
    edge.push({ x, y: t, side: back ? 'back' : 'west' }, { x, y: b, side: 'front' });
  }
  for (let y = 2; y < ch; y += 4) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < cw; x++) if (dmap[y * cw + x] <= R) (l < 0 ? (l = x) : 0, (r = x));
    if (l < 0) continue;
    edge.push({ x: l, y, side: 'west' }, { x: r, y, side: 'east' });
  }
  for (const [i, e] of edge.entries()) {
    if (inGap(e.x, e.y)) continue;
    const back = e.side === 'back';
    const ey = back ? e.y - lift(e.x) : e.y;
    const k = i * 31 + 7;
    const size = T * (0.9 + rnd(k) * 0.5);
    if (rnd(k + 9) < 0.35) continue;
    clump(e.x + (rnd(k + 1) - 0.5) * T, ey, size);
  }
  for (let i = 0; i < Math.round(cw / 5); i++) {
    const x = Math.round(rnd(i + 900) * cw);
    const y = Math.round(rnd(i + 901) * ch);
    if (inWing(x, y) || !solid.filled(x, y) || solid.data[(y * cw + x) * 4 + 1] < 54 || solid.data[(y * cw + x) * 4 + 1] > 170) continue;
    if (solid.data[(y * cw + x) * 4] > 100) continue; // only on leaves
    solid.put(x, y, GLOW_HI);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) solid.put(x + dx, y + dy, GLOW);
  }

  // ---- the veil over the offices: vines and leaves trailing down from the wall over each row
  for (const b of wing) {
    for (let x = Math.round(b.x0) + 6; x < b.x1 - 6; x += 9 + Math.round(rnd(x + 700) * 12)) {
      const len = Math.round(T * (1.2 + rnd(x + 701) * 3.5));
      for (let j = 0; j < len; j++) {
        const vx = x + Math.round(Math.sin((j + x) * 0.3));
        veil.put(vx, b.y0 + j, j % 6 === 5 ? LEAF[3] : LEAF[1]);
        if (j % 5 === 2) veil.put(vx + (j % 10 === 2 ? 1 : -1), b.y0 + j, LEAF[2]);
      }
      if (rnd(x + 702) < 0.35) veil.put(x, b.y0 + len, GLOW_HI);
    }
  }

  // ---- elf dressing round the outside of the trunk: moon lanterns hanging from the front of the crown, clusters
  // of glowing mushrooms at its foot and owls keeping watch on the back of the crown
  const fill = (x: number, y: number, w: number, h: number, c: RGB) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) solid.put(Math.round(x) + i, Math.round(y) + j, c);
  };
  const lantern = (x: number, y: number) => {
    fill(x, y, 1, 5, [58, 46, 40]);
    fill(x - 2, y + 5, 5, 1, [90, 74, 106]);
    fill(x - 2, y + 6, 5, 5, [191, 232, 255]);
    fill(x - 1, y + 7, 3, 3, GLOW_HI);
    fill(x - 2, y + 6, 1, 5, [90, 74, 106]);
    fill(x + 2, y + 6, 1, 5, [90, 74, 106]);
    fill(x - 1, y + 11, 3, 1, [90, 74, 106]);
  };
  const mushrooms = (x: number, y: number, k: number) => {
    for (const [dx, h, w] of [[-4, 4, 5], [1, 6, 7], [6, 3, 4]] as const) {
      if (rnd(k + dx) < 0.25) continue;
      fill(x + dx, y - h, 1, h, [232, 224, 208]);
      fill(x + dx - (w >> 1), y - h - 2, w, 2, [160, 112, 224]);
      fill(x + dx - (w >> 1) + 1, y - h - 3, w - 2, 1, [216, 176, 255]);
      solid.put(x + dx, y - h - 2, GLOW_HI);
    }
  };
  const owl = (x: number, y: number) => {
    fill(x - 2, y - 7, 5, 7, [110, 82, 58]);
    fill(x - 2, y - 7, 1, 1, [70, 52, 38]);
    fill(x + 2, y - 7, 1, 1, [70, 52, 38]);
    fill(x - 1, y - 3, 3, 3, [176, 150, 110]);
    solid.put(x - 1, y - 5, [255, 214, 90]);
    solid.put(x + 1, y - 5, [255, 214, 90]);
    solid.put(x, y - 4, [220, 170, 60]);
  };
  for (const [i, e] of edge.entries()) {
    if (i % 12 !== 5) continue;
    const k = i * 997;
    if (inGap(e.x, e.y) || inGap(e.x, e.y + 1.5 * T) || inGap(e.x, e.y - 1.5 * T)) continue;
    if (e.side === 'front') {
      // the front: a lantern under the leaves, mushrooms on the ground in front of the trunk
      if (rnd(k) < 0.6) lantern(e.x + (rnd(k + 1) - 0.5) * T, e.y - 4);
      if (rnd(k + 2) < 0.7) mushrooms(e.x + (rnd(k + 3) - 0.5) * 2 * T, e.y + 1.2 * T, k);
    } else if (e.side === 'back' && rnd(k + 4) < 0.35) {
      owl(e.x, e.y - 4);
    } else if ((e.side === 'west' || e.side === 'east') && rnd(k + 5) < 0.6) {
      mushrooms(e.x + (e.side === 'west' ? -0.8 : 0.8) * T, e.y + T, k);
    }
  }

  const clips: PxRect[] = wing.map((b) => ({ x: b.x0 + ox, y: b.y0 + oy + 2 * T, w: b.x1 - b.x0, h: b.y1 - b.y0 - 2 * T }));
  const out = { solid: solid.canvas(), veil: veil.canvas(), x: ox, y: oy, clips };
  cache.set(key, out);
  return out;
}
