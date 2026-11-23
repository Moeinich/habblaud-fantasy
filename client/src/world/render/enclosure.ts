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
import { RING_MARGIN, RING_RADIUS, RING_WIDTH, type HallRing } from '../layout/enclosure';
import { tintFloor } from './scene';

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

/** A room seed whose theme belongs to `race`, for the floor and wall style of its hall. */
function raceSeed(race: Race): number {
  for (let s = 0; ; s++) if (themeRace(s) === race) return s;
}

export function ringSprite(ring: HallRing, art: ArtModule): RingSprite {
  const race = ring.race === 'elf' ? 'human' : ring.race;
  const key = `${race}|${ring.rect.x},${ring.rect.y},${ring.rect.w},${ring.rect.h}|${ring.gaps.map((g) => `${g.x},${g.y},${g.w},${g.h}`).join(';')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const T = TILE;
  const st = STYLE[race];
  const pad = Math.ceil((RING_MARGIN + RING_WIDTH) * T) + 2 * T;
  const wx0 = ring.rect.x * T - pad;
  const wy0 = ring.rect.y * T - pad;
  const w = ring.rect.w * T + 2 * pad;
  const h = ring.rect.h * T + 2 * pad;
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
  // inner rounded rectangle: the building grown by the margin, with round corners
  const cx = w / 2;
  const cy = h / 2;
  const hw = (ring.rect.w / 2 + RING_MARGIN) * T;
  const hh = (ring.rect.h / 2 + RING_MARGIN) * T;
  const r = RING_RADIUS * T;
  const rw = RING_WIDTH * T;
  /** Distance outside the inner rounded rectangle (negative inside). */
  const dist = (x: number, y: number) => {
    const qx = Math.abs(x - cx) - (hw - r);
    const qy = Math.abs(y - cy) - (hh - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const rx0 = pad;
  const ry0 = pad;
  const rx1 = pad + ring.rect.w * T;
  const ry1 = pad + ring.rect.h * T;
  const inRect = (x: number, y: number) => x >= rx0 && x < rx1 && y >= ry0 && y < ry1;
  const seed = raceSeed(race);
  const theme = roomTheme(seed);

  // the floor inside the ring: the rooms' own floor, running out to the wall
  const floor = document.createElement('canvas');
  floor.width = w;
  floor.height = h;
  const fctx = floor.getContext('2d')!;
  fctx.save();
  fctx.translate(-wx0, -wy0);
  art.drawFloor(fctx, 'marble', wx0, wy0, w, h, { seed });
  tintFloor(fctx, { x: wx0, y: wy0, w, h }, theme.carpet);
  fctx.restore();
  const fimg = fctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dist(x + 0.5, y + 0.5) > 0 || inRect(x, y)) fimg.data[(y * w + x) * 4 + 3] = 0;
  fctx.putImageData(fimg, 0, 0);

  // the back wall: a wall face along the north of the ring, down to where the rooms' floor begins
  cctx.save();
  cctx.translate(-wx0, -wy0);
  for (let x = 0; x < w; x++) {
    let yIn = -1;
    for (let y = 0; y < cy; y++) {
      if (dist(x + 0.5, y + 0.5) <= 0) {
        yIn = y;
        break;
      }
    }
    if (yIn < 0 || yIn >= ry0 + 2 * T) continue;
    art.drawWallFace(cctx, wx0 + x, wy0 + yIn, 1, theme.wall);
  }
  cctx.restore();
  // nothing of it inside the rooms below their old back wall
  cctx.clearRect(rx0, ry0 + 2 * T, rx1 - rx0, ry1 - ry0 - 2 * T);
  const img = cctx.getImageData(0, 0, w, h);
  const data = img.data;

  // the rim
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = dist(x + 0.5, y + 0.5);
      if (d <= 0 || d > rw) continue;
      const u = d / rw;
      const n = hash32(`${race}${x >> 1},${y >> 1}`) % 7;
      put(x, y, u < 0.15 || u > 0.85 ? st.rim[0] : n === 0 ? st.rim[2] : st.rim[1]);
    }
  }
  // the front face where the ring drops to the ground (its southern half)
  for (let x = 0; x < w; x++) {
    let yb = -1;
    for (let y = h - 1; y > cy; y--) {
      const d = dist(x + 0.5, y + 0.5);
      if (d > 0 && d <= rw) {
        yb = y;
        break;
      }
    }
    if (yb < 0) continue;
    for (let k = 1; k <= 8; k++) put(x, yb + k, k > 6 ? st.face[0] : (x + (k > 3 ? 4 : 0)) % 8 === 0 ? st.face[0] : st.face[1]);
  }
  // the wall on the rim: features every few px along the centre line of the ring
  const path: [number, number][] = [];
  const chw = hw + rw / 2;
  const chh = hh + rw / 2;
  const cr = r + rw / 2;
  const step = 1;
  const corners: [number, number, number][] = [
    [cx + chw - cr, cy - chh + cr, -Math.PI / 2],
    [cx + chw - cr, cy + chh - cr, 0],
    [cx - chw + cr, cy + chh - cr, Math.PI / 2],
    [cx - chw + cr, cy - chh + cr, Math.PI],
  ];
  // top edge, then each corner and the next edge, clockwise
  for (let x = cx - chw + cr; x < cx + chw - cr; x += step) path.push([x, cy - chh]);
  for (const [i, [ox, oy, a0]] of corners.entries()) {
    for (let a = a0; a < a0 + Math.PI / 2; a += step / cr) path.push([ox + Math.cos(a) * cr, oy + Math.sin(a) * cr]);
    if (i === 0) for (let y = cy - chh + cr; y < cy + chh - cr; y += step) path.push([cx + chw, y]);
    if (i === 1) for (let x = cx + chw - cr; x > cx - chw + cr; x -= step) path.push([x, cy + chh]);
    if (i === 2) for (let y = cy + chh - cr; y > cy - chh + cr; y -= step) path.push([cx - chw, y]);
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
  // Built by reading pixels back, which leaves a canvas in CPU memory: the ring is drawn on every frame, so it goes
  // into a fresh canvas the GPU can keep as a texture instead of uploading it again each time.
  const s = { canvas: freshCopy(canvas), floor, x: wx0, y: wy0 };
  cache.set(key, s);
  return s;
}

function freshCopy(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')?.drawImage(src, 0, 0);
  return c;
}
