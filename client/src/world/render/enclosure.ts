// Drawing of the rounded hall enclosures (layout/enclosure.ts), cached per ring. The ring is the hall's outer
// wall: inside it the rooms' own floor runs on out to it (`floor`, painted into the static ground layer), its back
// is a proper wall face in the wing's wall style (where the rooms' lifted decorations hang), and on its rim stands
// the race's wall — stone merlons, sharpened stakes with the odd skull, or iron railings between lantern posts —
// with the front face where the ring drops to the ground in the south.
import type { ArtModule } from '../../art/api';
import { roomTheme, themeRace } from '../../art/theme';
import { hash32 } from '../../../../shared/hash';
import type { Race } from '../../../../shared/race';
import { TILE } from '../constants';
import { ringBounds, RING_MARGIN, RING_RADIUS, RING_WIDTH, type HallRing } from '../layout/enclosure';
import { ringDecor, ringGate, type DecorSpot } from './ring-decor';

export interface RingSprite {
  /** Wall: back face, rim and the race's wall on it (drawn over people and furniture; covers no floor). */
  canvas: HTMLCanvasElement;
  /** The rooms' floor running out to the ring (drawn in the ground layer). */
  floor: HTMLCanvasElement;
  /** World px of the canvas's top-left corner. */
  x: number;
  y: number;
}

type RGB = readonly [number, number, number];
const hexRGB = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

interface Style {
  rim: RGB[]; // dark edge, base, light
  face: RGB[]; // dark, base
}
const STYLE: Record<Exclude<Race, 'elf'>, Style> = {
  human: { rim: ['#4a4640', '#8a857c', '#a8a296'].map(hexRGB), face: ['#4a4640', '#6e6a64'].map(hexRGB) },
  orc: { rim: ['#3a2a1e', '#6e5236', '#8a6a44'].map(hexRGB), face: ['#2e2018', '#4a3422'].map(hexRGB) },
  undead: { rim: ['#221e28', '#3e3846', '#56505e'].map(hexRGB), face: ['#1a161e', '#2e2a34'].map(hexRGB) },
};

const cache = new Map<string, RingSprite>();

/** Spacing of the props along the rim (px). */
const RIM_STEP = { human: 48, orc: 44, undead: 48 } as const;

/** Ground of the yard inside each ring. */
const YARD = { human: 'grass', orc: 'desert', undead: 'blight' } as const;

/** A room seed whose theme belongs to `race`, for the floor and wall style of its hall. */
function raceSeed(race: Race): number {
  for (let s = 0; ; s++) if (themeRace(s) === race) return s;
}

export function ringSprite(ring: HallRing, art: ArtModule): RingSprite {
  const race = ring.race === 'elf' ? 'human' : ring.race;
  const key = `${race}|${ring.rects.map((g) => `${g.x},${g.y},${g.w},${g.h}`).join(';')}|${ring.gaps.map((g) => `${g.x},${g.y},${g.w},${g.h}`).join(';')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const T = TILE;
  const st = STYLE[race];
  const bounds = ringBounds(ring);
  const pad = Math.ceil((RING_MARGIN + RING_WIDTH) * T) + 2 * T;
  const wx0 = bounds.x * T - pad;
  const wy0 = bounds.y * T - pad;
  const w = bounds.w * T + 2 * pad;
  const h = bounds.h * T + 2 * pad;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const cctx = canvas.getContext('2d')!;
  const put = (x: number, y: number, c: RGB) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (inGap(x, y)) return;
    const i = (y * w + x) * 4;
    data[i] = c[0];
    data[i + 1] = c[1];
    data[i + 2] = c[2];
    data[i + 3] = 255;
  };
  const gaps = ring.gaps.map((g) => ({ x0: g.x * T - wx0, y0: g.y * T - wy0, x1: (g.x + g.w) * T - wx0, y1: (g.y + g.h) * T - wy0 }));
  function inGap(x: number, y: number): boolean {
    return gaps.some((g) => x >= g.x0 && x < g.x1 && y >= g.y0 && y < g.y1);
  }
  const r = RING_RADIUS * T;
  const rw = RING_WIDTH * T;
  // each wrapped rectangle in canvas px: the building (x0..x1, y0..y1) and its inner rounded outline (grown by the margin)
  const boxes = ring.rects.map((q) => {
    const x0 = q.x * T - wx0;
    const y0 = q.y * T - wy0;
    const x1 = x0 + q.w * T;
    const y1 = y0 + q.h * T;
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hw: (q.w / 2 + RING_MARGIN) * T, hh: (q.h / 2 + RING_MARGIN) * T };
  });
  type Box = (typeof boxes)[number];
  const boxDist = (b: Box, x: number, y: number) => {
    const qx = Math.abs(x - b.cx) - (b.hw - r);
    const qy = Math.abs(y - b.cy) - (b.hh - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  // the union of the rounded rectangles, blended so the inner corners where they meet are rounded too
  const K = 3 * T;
  /** Distance outside the ring's inner outline (negative inside). */
  const dist = (x: number, y: number) => {
    let d = Infinity;
    for (const b of boxes) {
      const e = boxDist(b, x, y);
      if (d === Infinity) d = e;
      else {
        const k = Math.max(K - Math.abs(d - e), 0) / K;
        d = Math.min(d, e) - k * k * K * 0.25;
      }
    }
    return d;
  };
  const seed = raceSeed(race);
  const theme = roomTheme(seed);

  // the yard inside the ring: the race's own ground (a grassy bailey, a sandy war camp, blighted earth), which the
  // rooms' floor spreads into (layout/enclosure.ts spreadFloorAt); a little darker in the wall's shadow
  const floor = document.createElement('canvas');
  floor.width = w;
  floor.height = h;
  const fctx = floor.getContext('2d')!;
  fctx.save();
  fctx.translate(-wx0, -wy0);
  art.drawFloor(fctx, YARD[race], wx0, wy0, w, h, { seed });
  fctx.restore();
  const fimg = fctx.getImageData(0, 0, w, h);
  const dmap = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const d = dist(x + 0.5, y + 0.5);
      dmap[y * w + x] = d;
      if (d > 0) {
        fimg.data[i + 3] = 0;
        continue;
      }
      const shade = Math.max(0, 1 + d / (0.9 * T)) * 0.28;
      if (shade > 0) for (let c = 0; c < 3; c++) fimg.data[i + c] = Math.round(fimg.data[i + c] * (1 - shade));
    }
  fctx.putImageData(fimg, 0, 0);
  const D = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    return ix < 0 || iy < 0 || ix >= w || iy >= h ? Infinity : dmap[iy * w + ix];
  };

  // the back wall: a wall face along the north of the ring, down to where the rooms' floor begins (the top of the
  // highest rectangle in that column)
  cctx.save();
  cctx.translate(-wx0, -wy0);
  for (let x = 0; x < w; x++) {
    let top = Infinity;
    for (const b of boxes) if (x >= b.x0 - RING_MARGIN * T && x < b.x1 + RING_MARGIN * T) top = Math.min(top, b.y0);
    if (top === Infinity) top = Math.min(...boxes.map((b) => b.y0));
    let yIn = -1;
    for (let y = 0; y < h; y++) {
      if (D(x, y) <= 0) {
        yIn = y;
        break;
      }
    }
    if (yIn < 0 || yIn >= top + 2 * T) continue;
    // no wall across a way in (a walkway from the north), nor over a corridor the ring stays open along
    if (gaps.some((g) => x >= g.x0 && x < g.x1 && g.y0 < yIn + 2 * T + 1 && g.y1 > yIn - 3 * T)) continue;
    art.drawWallFace(cctx, wx0 + x, wy0 + yIn, 1, theme.wall);
  }
  cctx.restore();
  // nothing of it inside the rooms below their old back wall
  for (const b of boxes) cctx.clearRect(b.x0, b.y0 + 2 * T, b.x1 - b.x0, b.y1 - b.y0 - 2 * T);
  const img = cctx.getImageData(0, 0, w, h);
  const data = img.data;

  // the rim
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dmap[y * w + x];
      if (d <= 0 || d > rw) continue;
      const u = d / rw;
      const n = hash32(`${race}${x >> 1},${y >> 1}`) % 7;
      put(x, y, u < 0.15 || u > 0.85 ? st.rim[0] : n === 0 ? st.rim[2] : st.rim[1]);
    }
  }
  // the front face where the ring drops to the ground: below the lowest stretch of rim in every column
  const faceAt: number[] = [];
  for (let x = 0; x < w; x++) {
    let yb = -1;
    for (let y = h - 1; y > 0; y--) {
      const d = dmap[y * w + x];
      if (d > 0 && d <= rw) {
        yb = y;
        break;
      }
    }
    faceAt.push(yb);
    if (yb < 0) continue;
    for (let k = 1; k <= 8; k++) put(x, yb + k, k > 6 ? st.face[0] : (x + (k > 3 ? 4 : 0)) % 8 === 0 ? st.face[0] : st.face[1]);
  }
  // the wall on the rim: features every few px along the centre line of the ring — each rectangle's own centre line
  // (edges and round corners), kept where it is the outline of the whole ring
  const path: [number, number][] = [];
  const corners: [number, number][] = [];
  const cr = r + rw / 2;
  const onLine = (x: number, y: number) => Math.abs(D(x, y) - rw / 2) < 1.2;
  for (const b of boxes) {
    const chw = b.hw + rw / 2;
    const chh = b.hh + rw / 2;
    const { cx, cy } = b;
    const cs: [number, number, number][] = [
      [cx + chw - cr, cy - chh + cr, -Math.PI / 2],
      [cx + chw - cr, cy + chh - cr, 0],
      [cx - chw + cr, cy + chh - cr, Math.PI / 2],
      [cx - chw + cr, cy - chh + cr, Math.PI],
    ];
    const pts: [number, number][] = [];
    for (let x = cx - chw + cr; x < cx + chw - cr; x += 1) pts.push([x, cy - chh]);
    for (const [i, [ox, oy, a0]] of cs.entries()) {
      for (let a = a0; a < a0 + Math.PI / 2; a += 1 / cr) pts.push([ox + Math.cos(a) * cr, oy + Math.sin(a) * cr]);
      if (i === 0) for (let y = cy - chh + cr; y < cy + chh - cr; y += 1) pts.push([cx + chw, y]);
      if (i === 1) for (let x = cx + chw - cr; x > cx - chw + cr; x -= 1) pts.push([x, cy + chh]);
      if (i === 2) for (let y = cy + chh - cr; y > cy - chh + cr; y -= 1) pts.push([cx - chw, y]);
      const a = a0 + Math.PI / 4;
      const kx = ox + Math.cos(a) * cr;
      const ky = oy + Math.sin(a) * cr;
      if (onLine(kx, ky)) corners.push([kx, ky]);
    }
    for (const p of pts) if (onLine(p[0], p[1])) path.push(p);
  }
  // draw back to front, so features further south overlap the ones behind them
  const order = path.map((p, i) => ({ p, i })).sort((a, b) => a.p[1] - b.p[1]);
  for (const { p, i } of order) {
    const [x, y] = p;
    if (race === 'human') {
      // a crenellated wall: merlons with gaps between them
      if (i % 12 < 7) {
        for (let dy = 0; dy < 6; dy++) for (let dx = -2; dx <= 2; dx++) put(x + dx, y - 3 - dy, dy === 5 ? st.rim[2] : dx === 2 ? st.rim[0] : st.rim[1]);
      }
    } else if (race === 'orc') {
      // sharpened stakes, with a horned skull now and then
      if (i % 5 === 0) {
        const tall = 11 + (hash32(`s${i}`) % 4);
        for (let dy = 0; dy < tall; dy++) {
          const tip = dy >= tall - 3;
          const half = tip ? (tall - dy - 1) * 0.6 : 1.5;
          for (let dx = -Math.floor(half); dx <= Math.ceil(half); dx++) put(x + dx, y - dy, tip ? [200, 160, 112] : dx < 0 ? [138, 100, 64] : dx > 0 ? [74, 50, 32] : [106, 74, 48]);
        }
      }
      if (i % 90 === 45) {
        for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy * 2 <= 9) put(x + dx, y - 14 + dy, [226, 218, 196]);
        put(x - 1, y - 14, [40, 30, 30]);
        put(x + 1, y - 14, [40, 30, 30]);
        put(x - 4, y - 16, [226, 218, 196]);
        put(x + 4, y - 16, [226, 218, 196]);
      }
    } else {
      // iron railings with spear tips between stone posts carrying violet lanterns
      if (i % 40 === 0) {
        for (let dy = 0; dy < 14; dy++) for (let dx = -2; dx <= 2; dx++) put(x + dx, y - dy, dy === 13 ? st.rim[2] : dx === -2 ? st.rim[2] : dx === 2 ? st.rim[0] : st.rim[1]);
        put(x, y - 16, [176, 122, 224]);
        put(x, y - 15, [120, 80, 170]);
      } else if (i % 4 === 0) {
        for (let dy = 0; dy < 11; dy++) put(x, y - dy, [30, 26, 36]);
        put(x, y - 11, [96, 88, 110]);
      }
      if (i % 4 !== 2) {
        put(x, y - 3, [30, 26, 36]);
        put(x, y - 8, [30, 26, 36]);
      }
    }
  }
  cctx.putImageData(img, 0, 0);

  // the race's dressing: towers/tusks/gargoyles on the corners, props along the rim, hangings on the outer face
  // and clutter along the yard just inside the wall (render/ring-decor.ts), drawn back to front
  const decor: { x: number; y: number; spot: DecorSpot; n: number }[] = [];
  const clear = (x: number, y: number, m: number) => !inGap(x, y) && !inGap(x - m, y) && !inGap(x + m, y) && !inGap(x, y - m) && !inGap(x, y + m);
  const near = (x: number, y: number, m: number) => decor.some((d) => Math.abs(d.x - x) < m && Math.abs(d.y - y) < m);
  for (const [x, y] of corners) if (!near(x, y, 24)) decor.push({ x, y, spot: 'corner', n: decor.length });
  const S = RIM_STEP[race];
  let n = 0;
  for (let k = 0; k < path.length; k += S) {
    const [x, y] = path[k];
    if (clear(x, y, 10) && !near(x, y, 20)) decor.push({ x, y, spot: 'rim', n: n++ });
  }
  // hangings on the outer face in the south (the face the camp looks at)
  n = 0;
  for (let x = 16; x < w - 8; x += 48) {
    const yb = faceAt[Math.round(x)];
    if (yb < 0) continue;
    // only along straight stretches
    if (Math.abs(faceAt[Math.round(x) - 12] - yb) > 1 || Math.abs(faceAt[Math.round(x) + 12] - yb) > 1) continue;
    if (clear(x, yb, 8)) decor.push({ x, y: yb, spot: 'face', n: n++ });
  }
  // clutter just inside the wall: down the sides (below the back wall) and along the south
  n = 0;
  const atInset = (x: number, y: number, inset: number) => Math.abs(D(x, y) + inset) < 2;
  for (const b of boxes) {
    for (let y = b.y0 + 3 * T; y < b.cy + b.hh - r; y += 34) {
      for (const [side, x] of [[0, b.cx - b.hw + 8], [1, b.cx + b.hw - 8]] as const) {
        const jy = y + (hash32(`${race}y${side}${y}`) % 12);
        if (atInset(x, jy, 8) && clear(x, jy, 14)) decor.push({ x, y: jy, spot: 'yard', n: n++ });
      }
    }
    for (let x = b.cx - b.hw + r; x < b.cx + b.hw - r; x += 38) {
      const jx = x + (hash32(`${race}x${x}`) % 14);
      const y = b.cy + b.hh - 3;
      if (atInset(jx, y, 3) && clear(jx, y, 14)) decor.push({ x: jx, y, spot: 'yard', n: n++ });
    }
  }
  decor.sort((a, b) => a.y - b.y);
  for (const d of decor) ringDecor(cctx, race, d.spot, Math.round(d.x), Math.round(d.y), d.n, bounds.x * 31 + bounds.y);
  // a gate at every way in: posts on the rim either side, with an arch over a way in from the north or south
  for (const g of gaps) {
    const gx = (g.x0 + g.x1) / 2;
    const gy = (g.y0 + g.y1) / 2;
    const side = boxes.find((b) => gy > b.y0 - RING_MARGIN * T && gy < b.y1 + RING_MARGIN * T && (gx < b.x0 || gx > b.x1));
    if (side) {
      const x = gx < side.cx ? side.cx - side.hw - rw / 2 : side.cx + side.hw + rw / 2;
      ringGate(cctx, race, Math.round(x), Math.round(x), Math.round(g.y0 - 3), false);
      ringGate(cctx, race, Math.round(x), Math.round(x), Math.round(g.y1 + 6), false);
    } else {
      const b = boxes.find((q) => gx > q.x0 && gx < q.x1) ?? boxes[0];
      const y = gy < b.cy ? b.cy - b.hh - rw / 2 : b.cy + b.hh + rw / 2;
      ringGate(cctx, race, g.x0 - 4, g.x1 + 4, Math.round(y), true);
    }
  }

  // Built by reading pixels back, which leaves a canvas in CPU memory: the ring is drawn on every frame, so it goes
  // into a fresh canvas the GPU can keep as a texture instead of uploading it again each time.
  const out = { canvas: freshCopy(canvas), floor, x: wx0, y: wy0 };
  cache.set(key, out);
  return out;
}

function freshCopy(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')?.drawImage(src, 0, 0);
  return c;
}
