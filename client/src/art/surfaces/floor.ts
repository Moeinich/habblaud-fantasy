// Floors generated in 8x8-tile blocks ("chunks") from WORLD coordinates (pure).
// That way wooden planks, marble veins and cement stains continue from one tile to the
// next without seams, and the cache is bounded by the world size (not by the shape of the areas).
import { TILE, type FloorKind } from '../api';
import { mix, parseColor, ramp, shade, type RGBA } from '../core/color';
import { PixelBuf } from '../core/pixbuf';
import { themeRace } from '../theme';

export const CHUNK_TILES = 8;
export const CHUNK_PX = CHUNK_TILES * TILE;

/** Deterministic integer hash of up to 3 coordinates + seed. */
export function h3(a: number, b: number, c = 0, seed = 0): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d) ^ Math.imul(seed | 0, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

function rnd01(a: number, b: number, c = 0, seed = 0): number {
  return h3(a, b, c, seed) / 4294967296;
}

/** Smooth value noise (bilinear) in world coordinates, 0..1. */
function noise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = rnd01(gx, gy, 0, seed);
  const b = rnd01(gx + 1, gy, 0, seed);
  const c = rnd01(gx, gy + 1, 0, seed);
  const d = rnd01(gx + 1, gy + 1, 0, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export interface FloorOpts {
  seed: number;
  tint?: string;
  tint2?: string;
}

/** Generates block (cx, cy) — in chunk units — of a floor type. */
export function floorChunk(kind: FloorKind, cx: number, cy: number, o: FloorOpts): PixelBuf {
  const b = new PixelBuf(CHUNK_PX, CHUNK_PX);
  const x0 = cx * CHUNK_PX;
  const y0 = cy * CHUNK_PX;
  switch (kind) {
    case 'wood':
      paintWood(b, x0, y0, o.seed);
      break;
    case 'concrete':
      paintConcrete(b, x0, y0, o.seed);
      break;
    case 'marble':
      paintMarble(b, x0, y0, o.seed);
      break;
    case 'sidewalk':
      paintSidewalk(b, x0, y0, o.seed);
      break;
    case 'hall':
      paintHall(b, x0, y0, o);
      break;
    default:
      for (let ty = 0; ty < CHUNK_TILES; ty++) {
        for (let tx = 0; tx < CHUNK_TILES; tx++) {
          b.ox = tx * TILE;
          b.oy = ty * TILE;
          paintTile(b, kind, cx * CHUNK_TILES + tx, cy * CHUNK_TILES + ty, o);
        }
      }
      b.ox = 0;
      b.oy = 0;
  }
  return b;
}

// ------------------------------------------------------------------ per-tile floors

function paintTile(b: PixelBuf, kind: FloorKind, tx: number, ty: number, o: FloorOpts): void {
  const r = (i: number) => rnd01(tx, ty, i, o.seed);
  switch (kind) {
    case 'carpet': {
      // Woven straw mat: short fibres in alternating directions (checkered weave) and a few
      // lighter loose stalks.
      // Theme tints only colour the straw lightly (dyed rushes), so it always reads as a hay mat.
      const c1 = o.tint ? mix(o.tint, '#b89a62', 0.6) : '#b89a62';
      const c2 = o.tint2 ? mix(o.tint2, '#a98c56', 0.6) : shade(c1, -0.04);
      const odd = (tx + ty) & 1;
      const base = mix(c1, c2, odd ? 0.6 : 0.1);
      b.rect(0, 0, TILE, TILE, base);
      const dark = shade(base, -0.06);
      const lite = shade(base, 0.05);
      for (let a = 1; a < TILE; a += 2) {
        for (let k = 0; k < TILE; k += 4) {
          const o2 = (a >> 1) & 1 ? 2 : 0;
          if (odd) {
            b.set(k + o2, a, dark);
            b.set(k + o2 + 1, a, dark);
          } else {
            b.set(a, k + o2, dark);
            b.set(a, k + o2 + 1, dark);
          }
        }
      }
      for (let i = 0; i < 3; i++) {
        const x = Math.floor(r(i) * 12) + 1;
        const y = Math.floor(r(i + 9) * 14) + 1;
        b.hline(x, x + 2, y, lite);
      }
      b.hline(0, TILE - 1, TILE - 1, shade(base, -0.1));
      b.vline(TILE - 1, 0, TILE - 1, shade(base, -0.1));
      break;
    }
    case 'tile_check': {
      // Irregular stone slabs (2 to 4 per tile) with earth grout.
      const grout = '#5a4a38';
      b.rect(0, 0, TILE, TILE, grout);
      const split = 5 + Math.floor(r(1) * 6);
      const halves = r(2) < 0.5;
      const stones: [number, number, number, number][] = halves
        ? [[0, 0, split, TILE], [split, 0, TILE - split, 7], [split, 7, TILE - split, TILE - 7]]
        : [[0, 0, TILE, split], [0, split, 9, TILE - split], [9, split, TILE - 9, TILE - split]];
      stones.forEach(([x, y, w, h], i) => {
        const col = mix('#9a948a', '#b4ad9f', r(10 + i));
        b.rect(x, y, w - 1, h - 1, col);
        b.hline(x, x + w - 2, y, shade(col, 0.06));
        b.hline(x, x + w - 2, y + h - 2, shade(col, -0.08));
        b.vline(x + w - 2, y, y + h - 2, shade(col, -0.06));
        if (r(20 + i) < 0.5) b.set(x + 1 + Math.floor(r(30 + i) * Math.max(1, w - 3)), y + 1 + Math.floor(r(40 + i) * Math.max(1, h - 3)), shade(col, -0.1));
      });
      break;
    }
    case 'tile_white': {
      // Dark slate in square plates (bathhouse).
      const col = '#6a6e6a';
      const grout = '#4a4c48';
      b.rect(0, 0, TILE, TILE, col);
      for (let q = 0; q < 2; q++) {
        b.hline(0, TILE - 1, q * 8 + 7, grout);
        b.vline(q * 8 + 7, 0, TILE - 1, grout);
      }
      for (let qy = 0; qy < 2; qy++) for (let qx = 0; qx < 2; qx++) b.hline(qx * 8, qx * 8 + 2, qy * 8, '#7e827c');
      if (r(1) < 0.4) b.set(Math.floor(r(2) * 14), Math.floor(r(3) * 14), '#5e625e');
      break;
    }
    case 'grass': {
      const g = ramp('#5f8f45', 0.05);
      const n = noise(tx * TILE, ty * TILE, 48, o.seed + 5);
      const base = mix(g.dk, g.lt, n);
      b.rect(0, 0, TILE, TILE, base);
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(r(i) * TILE);
        const y = Math.floor(r(i + 20) * TILE);
        const c = r(i + 40) < 0.5 ? shade(base, 0.05) : shade(base, -0.05);
        b.set(x, y, c);
        if (r(i + 60) < 0.5) b.set(x, y - 1, shade(c, 0.03));
      }
      for (let i = 0; i < 2; i++) {
        const x = 2 + Math.floor(r(i + 80) * 12);
        const y = 3 + Math.floor(r(i + 90) * 11);
        b.set(x, y, g.dd);
        b.set(x - 1, y - 1, g.dk);
        b.set(x + 1, y - 1, g.dk);
        b.set(x, y - 2, g.lt);
      }
      if (r(99) < 0.12) {
        const fx = 3 + Math.floor(r(100) * 10);
        const fy = 3 + Math.floor(r(101) * 10);
        const fc = ['#e8e2c0', '#e0b23c', '#c46a8a', '#8a7ab0'][Math.floor(r(102) * 4)];
        b.set(fx, fy, fc);
        b.set(fx + 1, fy, fc);
        b.set(fx, fy - 1, fc);
        b.set(fx + 1, fy + 1, '#d48a2c');
      }
      break;
    }
    case 'jungle': {
      // Undergrowth: deep greens with moss blotches, fern fronds and the odd glowing spore.
      const n = noise(tx * TILE, ty * TILE, 40, o.seed + 6);
      const base = mix('#22462c', '#2f5e36', n);
      b.rect(0, 0, TILE, TILE, base);
      for (let i = 0; i < 16; i++) b.set(Math.floor(r(i) * TILE), Math.floor(r(i + 20) * TILE), r(i + 40) < 0.5 ? shade(base, 0.08) : shade(base, -0.12));
      for (let i = 0; i < 2; i++) {
        // a fern frond: a stem with leaflets
        const x = 3 + Math.floor(r(i + 80) * 10);
        const y = 4 + Math.floor(r(i + 90) * 9);
        const c = r(i + 95) < 0.5 ? '#4f9a4e' : '#5fae5a';
        for (let k = 0; k < 4; k++) {
          b.set(x + k, y - k, '#24482c');
          b.set(x + k, y - k - 1, c);
          b.set(x + k - 1, y - k + 1, c);
        }
      }
      if (r(99) < 0.08) {
        const fx = 3 + Math.floor(r(100) * 10);
        const fy = 3 + Math.floor(r(101) * 10);
        b.set(fx, fy, '#8ff0e0');
        b.set(fx + 1, fy, '#c8fff6');
      }
      break;
    }
    case 'forest_path': {
      // A forest road: packed earth worn by feet, fallen leaves, a root crossing now and then and flat mossy
      // stepping stones.
      const n = noise(tx * TILE, ty * TILE, 36, o.seed + 9);
      const base = mix('#5e4a34', '#735a3e', n);
      b.rect(0, 0, TILE, TILE, base);
      for (let i = 0; i < 12; i++) b.set(Math.floor(r(i) * TILE), Math.floor(r(i + 20) * TILE), r(i + 40) < 0.5 ? shade(base, 0.07) : shade(base, -0.1));
      if (r(60) < 0.3) {
        // a stepping stone
        const sx = 2 + Math.floor(r(61) * 6);
        const sy = 2 + Math.floor(r(62) * 7);
        const sw = 5 + Math.floor(r(63) * 3);
        const sh = 3 + Math.floor(r(64) * 2);
        const c = mix('#7c8070', '#8e927e', r(65));
        b.rect(sx + 1, sy, sw - 2, sh, c);
        b.rect(sx, sy + 1, sw, sh - 2, c);
        b.hline(sx + 1, sx + sw - 2, sy, shade(c, 0.1));
        b.hline(sx + 1, sx + sw - 2, sy + sh, shade(base, -0.18));
        if (r(66) < 0.6) b.rect(sx + 1, sy + 1, 2, 1, '#5f8a4a');
      }
      if (r(70) < 0.22) {
        // a root snaking across
        let y = 3 + Math.floor(r(71) * 10);
        for (let x = 0; x < TILE; x++) {
          if (r(72 + x) < 0.25) y += r(90 + x) < 0.5 ? -1 : 1;
          b.set(x, y, '#3e2c1e');
          b.set(x, y - 1, '#6a5038');
        }
      }
      for (let i = 0; i < 5; i++) {
        // fallen leaves and moss
        const c = ['#9a6a2a', '#b8862e', '#4f7a3e', '#6a8a3a', '#8a4a26'][Math.floor(r(i + 110) * 5)];
        const x = Math.floor(r(i + 120) * (TILE - 1));
        const y = Math.floor(r(i + 130) * (TILE - 1));
        b.set(x, y, c);
        if (r(i + 140) < 0.5) b.set(x + 1, y, c);
      }
      if (r(150) < 0.06) b.set(Math.floor(r(151) * 14) + 1, Math.floor(r(152) * 14) + 1, '#8ff0e0');
      break;
    }
    case 'desert': {
      // Dry badlands: sand in warm ochres, dark cracks, pebbles and dead grass.
      const n = noise(tx * TILE, ty * TILE, 56, o.seed + 7);
      const base = mix('#b48a56', '#c89e66', n);
      b.rect(0, 0, TILE, TILE, base);
      for (let i = 0; i < 14; i++) b.set(Math.floor(r(i) * TILE), Math.floor(r(i + 20) * TILE), r(i + 40) < 0.5 ? shade(base, 0.08) : shade(base, -0.1));
      if (r(70) < 0.35) {
        // a crack wandering across the tile
        let x = Math.floor(r(71) * TILE);
        let y = Math.floor(r(72) * TILE);
        for (let k = 0; k < 9; k++) {
          b.set(x, y, '#7a5a36');
          x += r(73 + k) < 0.5 ? 1 : 0;
          y += r(83 + k) < 0.6 ? 1 : -1;
          if (x >= TILE || y < 0 || y >= TILE) break;
        }
      }
      if (r(90) < 0.25) {
        const x = 2 + Math.floor(r(91) * 12);
        const y = 2 + Math.floor(r(92) * 12);
        b.set(x, y, '#8a7a66');
        b.set(x + 1, y, '#a8987e');
        b.set(x, y + 1, '#5e5040');
      }
      if (r(95) < 0.2) {
        const x = 2 + Math.floor(r(96) * 12);
        const y = 4 + Math.floor(r(97) * 10);
        b.set(x, y, '#8a7038');
        b.set(x - 1, y - 1, '#a08440');
        b.set(x + 1, y - 2, '#a08440');
      }
      break;
    }
    case 'blight': {
      // Dead ground: purple-grey earth, violet mould, withered grey tufts and the odd bone.
      const n = noise(tx * TILE, ty * TILE, 44, o.seed + 8);
      const base = mix('#3e3346', '#4e4058', n);
      b.rect(0, 0, TILE, TILE, base);
      for (let i = 0; i < 14; i++) b.set(Math.floor(r(i) * TILE), Math.floor(r(i + 20) * TILE), r(i + 40) < 0.5 ? shade(base, 0.08) : shade(base, -0.12));
      if (r(60) < 0.3) {
        const x = 2 + Math.floor(r(61) * 12);
        const y = 2 + Math.floor(r(62) * 12);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [1, 1]]) b.set(x + dx, y + dy, '#6a3f86');
      }
      for (let i = 0; i < 2; i++) {
        const x = 2 + Math.floor(r(i + 80) * 12);
        const y = 3 + Math.floor(r(i + 90) * 11);
        b.set(x, y, '#6e6a66');
        b.set(x - 1, y - 1, '#5a5652');
        b.set(x + 1, y - 2, '#7e7a74');
      }
      if (r(99) < 0.06) {
        const x = 3 + Math.floor(r(100) * 9);
        const y = 4 + Math.floor(r(101) * 9);
        b.set(x, y, '#d8d0b8');
        b.set(x + 1, y, '#e8e0c8');
        b.set(x + 2, y, '#d8d0b8');
      }
      if (r(105) < 0.05) b.set(2 + Math.floor(r(106) * 12), 2 + Math.floor(r(107) * 12), '#b07ae0');
      break;
    }
    case 'street': {
      // Packed-dirt road with cart ruts and pebbles.
      const n = noise(tx * TILE, ty * TILE, 64, o.seed + 9);
      const col = mix('#7a6248', '#8a7054', n);
      b.rect(0, 0, TILE, TILE, col);
      for (let i = 0; i < 14; i++) b.set(Math.floor(r(i) * TILE), Math.floor(r(i + 30) * TILE), r(i + 60) < 0.5 ? '#9a8064' : '#64503a');
      if (r(77) < 0.3) b.set(Math.floor(r(78) * TILE), Math.floor(r(79) * TILE), '#a8a296');
      break;
    }
    default:
      b.rect(0, 0, TILE, TILE, '#dcdedf');
  }
}

// ------------------------------------------------------------------ continuous floors

/** Precomputed colour table (RGBA) for fast writes. */
function rgba(c: string): RGBA {
  return parseColor(c);
}

// Rustic planks, darker and with more tone variation.
const WOOD_TONES = ['#9a6c42', '#8e6239', '#a6784c', '#86603a'] as const;
/** [tone][0 normal, 1 top, 2 bottom, 3 grain, 4 joint, 5 after joint, 6 knot, 7 iron nail]. */
const WOOD: readonly (readonly RGBA[])[] = WOOD_TONES.map((t) =>
  [t, shade(t, 0.03), shade(t, -0.075), shade(t, -0.03), shade(t, -0.1), shade(t, 0.03), shade(t, -0.12), '#3a3a40'].map(rgba),
);

/** Rough planks: 4px tall, 48px long, staggered joints, grain, knots and iron nails at the ends. */
function paintWood(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    const wy = y0 + py;
    const row = Math.floor(wy / 4);
    const iy = wy - row * 4;
    const off = h3(row, 0, 1, seed) % 48;
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px + off;
      const plank = Math.floor(wx / 48);
      const ix = wx - plank * 48;
      const ph = h3(row, plank, 2, seed);
      const t = WOOD[ph % WOOD.length];
      let k = 0;
      if (ix === 0) k = 4;
      else if (iy === 3) k = 2;
      else if (iy === 1 && (ix === 2 || ix === 45)) k = 7;
      else if (iy === 0) k = ix === 1 ? 5 : 1;
      else if (iy === 2 && ix === 10 + ((ph >>> 12) % 20) && (ph >>> 20) % 5 === 0) k = 6;
      else if (iy === 1 + ((ph >>> 5) % 2) && (ix + (ph >>> 8)) % 23 < 7) k = 3;
      else if (ix === 1) k = 5;
      b.put(px, py, t[k]);
    }
  }
}

// ------------------------------------------------------------------ irregular stones (Voronoi)

/** Voronoi lookup result (jittered grid points): stone id, F1/F2 distances and offset from the stone centre. */
interface Cell {
  id: number;
  f1: number;
  f2: number;
  dx: number;
  dy: number;
}

const cellOut: Cell = { id: 0, f1: 0, f2: 0, dx: 0, dy: 0 };

/** Nearest stone to (wx, wy) on a `size` px grid with jittered centres (jitter 0..1). */
function stoneAt(wx: number, wy: number, size: number, jitter: number, seed: number): Cell {
  const gx = Math.floor(wx / size);
  const gy = Math.floor(wy / size);
  let f1 = 1e9;
  let f2 = 1e9;
  let id = 0;
  let bdx = 0;
  let bdy = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i;
      const cy = gy + j;
      const hh = h3(cx, cy, 11, seed);
      const px = (cx + 0.5 + (((hh & 255) / 255) - 0.5) * jitter) * size;
      const py = (cy + 0.5 + ((((hh >>> 8) & 255) / 255) - 0.5) * jitter) * size;
      const dx = wx - px;
      const dy = wy - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hh;
        bdx = dx;
        bdy = dy;
      } else if (d < f2) f2 = d;
    }
  }
  cellOut.id = id;
  cellOut.f1 = f1;
  cellOut.f2 = f2;
  cellOut.dx = bdx;
  cellOut.dy = bdy;
  return cellOut;
}

/** Palette [base, light, shadow, blemish] for each stone tone. */
function stonePal(tones: readonly string[]): readonly (readonly RGBA[])[] {
  return tones.map((t) => [t, shade(t, 0.09), shade(t, -0.12), shade(t, -0.05)].map(rgba));
}

const DIRT_LEVELS = 12;
/** Packed earth: graded tones for the noise, plus pebbles and straw wisps. */
const DIRT: readonly RGBA[] = Array.from({ length: DIRT_LEVELS }, (_, i) => rgba(mix('#6a5038', '#86694a', i / (DIRT_LEVELS - 1))));
const DIRT_DARK = rgba('#54402c');
const DIRT_PEBBLE = [rgba('#a39a8a'), rgba('#7c7468')] as const;
const STRAW = [rgba('#d2b064'), rgba('#b08e48')] as const;

function dirtAt(wx: number, wy: number, seed: number): RGBA {
  const n = noise(wx, wy, 22, seed) * 0.65 + noise(wx, wy, 6, seed + 3) * 0.35;
  return DIRT[Math.min(DIRT_LEVELS - 1, Math.floor(n * DIRT_LEVELS))];
}

/** Scattered straw wisps: short horizontal/diagonal strokes, at most one per 8px cell. */
function strawAt(wx: number, wy: number, seed: number, rarity: number): RGBA | null {
  const cx = wx >> 3;
  const cy = wy >> 3;
  const hh = h3(cx, cy, 21, seed);
  if (hh % rarity !== 0) return null;
  const sx = (cx << 3) + ((hh >>> 4) & 7);
  const sy = (cy << 3) + ((hh >>> 8) & 7);
  const dir = (hh >>> 12) % 3; // 0 horizontal, 1 diagonal \, 2 diagonal /
  for (let k = 0; k < 4; k++) {
    const px = sx + k;
    const py = dir === 0 ? sy : dir === 1 ? sy + (k >> 1) : sy - (k >> 1);
    if (px === wx && py === wy) return STRAW[k & 1];
  }
  return null;
}

/** Corridor floor: trodden packed earth, no seams, with pebbles, dark marks and straw. */
function paintConcrete(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const st = strawAt(wx, wy, seed, 14);
      if (st) {
        b.put(px, py, st);
        continue;
      }
      const sp = h3(wx, wy, 3, seed) % 131;
      if (sp < 2) {
        b.put(px, py, DIRT_PEBBLE[sp]);
        continue;
      }
      if (sp < 4 || h3(wx, wy - 1, 3, seed) % 131 < 2) {
        b.put(px, py, DIRT_DARK);
        continue;
      }
      b.put(px, py, dirtAt(wx, wy, seed));
    }
  }
}

const HORDE_STONE = stonePal(['#6e665c', '#7a7064', '#625a52', '#746454']);
const ALLY_STONE = stonePal(['#a8a294', '#9c968a', '#b2ac9e', '#949aa0']);
const ALLY_GAP = rgba('#5e5850');

/**
 * Floor of project rooms and the Great Hall ('marble'). The room theme (via the seed) picks the race:
 * orc = rough flagstones sunk in dirt and straw; human = neat cut-stone slabs; elf = polished moonwood planks
 * with moss and fallen leaves; undead = cold slate crypt slabs, cracked, with a violet glow in the seams
 * and the odd bone.
 */
function paintMarble(b: PixelBuf, x0: number, y0: number, seed: number): void {
  const race = themeRace(seed);
  if (race === 'orc') paintRoughFlags(b, x0, y0, seed);
  else if (race === 'elf') paintMoonwood(b, x0, y0, seed);
  else if (race === 'undead') paintCrypt(b, x0, y0, seed);
  else paintAshlar(b, x0, y0, seed);
}

// Elf moonwood: violet-brown heartwood planks, a silvery sheen on each plank's top edge.
const MOON_TONES = ['#6c5a62', '#66545e', '#726068', '#62525a'] as const;
/** [tone][0 normal, 1 top sheen, 2 bottom, 3 grain, 4 joint, 5 ring (knot)]. */
const MOONWOOD: readonly (readonly RGBA[])[] = MOON_TONES.map((t) =>
  [t, mix(t, '#c4ccd8', 0.22), shade(t, -0.1), shade(t, -0.04), shade(t, -0.2), shade(t, -0.13)].map(rgba),
);
const MOSS = [rgba('#5a7a4c'), rgba('#4c6c44'), rgba('#6a8a56')] as const;
/** Fallen leaves: teal-green, autumn gold and a violet petal. [body, light] */
const FALLEN = [
  [rgba('#4f9a78'), rgba('#7ac8a0')],
  [rgba('#c89a48'), rgba('#e8c070')],
  [rgba('#9a72c0'), rgba('#c8a8f0')],
] as const;

/** A small fallen leaf (5x3 lozenge with a midrib) at most one per 16px cell, rare. */
function fallenLeafAt(wx: number, wy: number, seed: number): RGBA | null {
  const cx = wx >> 4;
  const cy = wy >> 4;
  const hh = h3(cx, cy, 31, seed);
  if (hh % 9 !== 0) return null;
  const lx = (cx << 4) + 3 + ((hh >>> 4) % 9);
  const ly = (cy << 4) + 3 + ((hh >>> 8) % 9);
  const dx = wx - lx;
  const dy = wy - ly;
  const flip = (hh >>> 12) & 1 ? 1 : -1;
  // lozenge tilted along the diagonal
  const u = dx;
  const v = dy - flip * Math.round(dx / 2);
  if (Math.abs(u) > 2 || Math.abs(v) > (Math.abs(u) === 2 ? 0 : 1)) return null;
  const pal = FALLEN[(hh >>> 16) % FALLEN.length];
  return v === 0 ? pal[1] : pal[0];
}

/**
 * Elf: polished moonwood planks (5px tall, 40px long, staggered), silvery sheen on the top edge, gentle grain
 * and knots, soft moss creeping in irregular patches and a few fallen leaves. Kept low-contrast so desks and
 * people stay readable on top.
 */
function paintMoonwood(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    const wy = y0 + py;
    const row = Math.floor(wy / 5);
    const iy = wy - row * 5;
    const off = h3(row, 0, 5, seed) % 40;
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const leaf = fallenLeafAt(wx, wy, seed);
      if (leaf) {
        b.put(px, py, leaf);
        continue;
      }
      const sx = wx + off;
      const plank = Math.floor(sx / 40);
      const ix = sx - plank * 40;
      const ph = h3(row, plank, 6, seed);
      const t = MOONWOOD[ph % MOONWOOD.length];
      // moss: soft noise patches, only on a few planks' edges and joints so it reads as creeping growth
      const m = noise(wx, wy, 18, seed + 41) * 0.7 + noise(wx, wy, 5, seed + 43) * 0.3;
      if (m > 0.79 && (iy === 4 || iy === 0 || ix < 3 || m > 0.85)) {
        b.put(px, py, MOSS[h3(wx, wy, 8, seed) % (m > 0.85 ? 3 : 2)]);
        continue;
      }
      let k = 0;
      if (ix === 0) k = 4;
      else if (iy === 4) k = 2;
      else if (iy === 0) k = 1;
      else if (iy === 2 && Math.abs(ix - (8 + ((ph >>> 12) % 24))) === 1 && (ph >>> 20) % 4 === 0) k = 5;
      else if (iy === 1 + ((ph >>> 5) % 3) && (ix + (ph >>> 8)) % 19 < 8) k = 3;
      b.put(px, py, t[k]);
    }
  }
}

/** Horde: irregular flagstones (Voronoi ~14px) with wide dirt gaps, some missing (bare dirt + straw). */
function paintRoughFlags(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const c = stoneAt(wx, wy, 14, 0.8, seed);
      const gap = c.f2 - c.f1;
      const missing = c.id % 7 === 0;
      if (gap < 2.2 || missing) {
        const st = strawAt(wx, wy, seed, missing ? 3 : 7);
        b.put(px, py, st ?? (gap < 1 && !missing ? DIRT_DARK : dirtAt(wx, wy, seed)));
        continue;
      }
      const t = HORDE_STONE[(c.id >>> 16) % HORDE_STONE.length];
      let k = 0;
      if (gap < 3.4) k = c.dx + c.dy < 0 ? 1 : 2;
      else if (h3(wx, wy, 7, seed) % 23 === 0) k = 3;
      b.put(px, py, t[k]);
    }
  }
}

/** Alliance: 16x16 ashlar slabs staggered by half a slab per row, light/dark bevel and thin cracks. */
function paintAshlar(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const row = wy >> 4;
      const off = row & 1 ? 8 : 0;
      const ix = (wx + off) & 15;
      const iy = wy & 15;
      if (ix === 15 || iy === 15) {
        b.put(px, py, ALLY_GAP);
        continue;
      }
      const ph = h3((wx + off) >> 4, row, 4, seed);
      const t = ALLY_STONE[ph % ALLY_STONE.length];
      let k = 0;
      if (iy === 0 || ix === 0) k = 1;
      else if (iy === 14 || ix === 14) k = 2;
      else if ((ph >>> 8) % 4 === 0 && ix === iy + ((ph >>> 12) % 5) - 2 && iy > 3 && iy < 11) k = 3;
      else if (h3(wx, wy, 6, seed) % 53 === 0) k = 3;
      b.put(px, py, t[k]);
    }
  }
}

const COBBLE = stonePal(['#8a8478', '#958f82', '#827c70', '#9a9486', '#8a8070']);

/** Round cobbles set in dirt (outdoor verge, garden paths and deck borders). */
function paintSidewalk(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const c = stoneAt(wx, wy, 8, 0.6, seed);
      const gap = c.f2 - c.f1;
      if (gap < 1.3 || c.f1 > 5.2) {
        b.put(px, py, gap < 0.6 ? DIRT_DARK : dirtAt(wx, wy, seed));
        continue;
      }
      const t = COBBLE[(c.id >>> 16) % COBBLE.length];
      let k = 0;
      if (gap < 2.3 || c.f1 > 4.2) k = c.dx + c.dy < 0 ? 1 : 2;
      else if (c.dx < -1 && c.dy < -1 && c.f1 < 2) k = 1;
      b.put(px, py, t[k]);
    }
  }
}

/**
 * Corridor: wall-to-wall low-pile office carpet. `tint` is the pile colour (the department's), `tint2` the
 * colour of a small woven diamond repeated every 16px on a half-drop grid. Fine speckle keeps it from looking
 * flat; contrast stays low so people and furniture read clearly on top.
 */
function paintHall(b: PixelBuf, x0: number, y0: number, o: FloorOpts): void {
  const base = o.tint ?? '#3e4658';
  const motif = o.tint2 ?? shade(base, 0.18);
  const pile = [rgba(base), rgba(shade(base, 0.04)), rgba(shade(base, -0.05)), rgba(shade(base, -0.09))];
  const mot = rgba(motif);
  const motDark = rgba(shade(motif, -0.18));
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const row = wy >> 4;
      const ix = ((wx + (row & 1 ? 8 : 0)) & 15) - 8;
      const iy = (wy & 15) - 8;
      const d = Math.abs(ix) + Math.abs(iy);
      if (d === 2) {
        b.put(px, py, mot);
        continue;
      }
      if (d === 0) {
        b.put(px, py, motDark);
        continue;
      }
      const n = noise(wx, wy, 10, o.seed) * 0.5 + rnd01(wx, wy, 11, o.seed) * 0.5;
      b.put(px, py, pile[n < 0.2 ? 3 : n < 0.42 ? 2 : n > 0.8 ? 1 : 0]);
    }
  }
}

/**
 * Seam mask for FloorFade: whether the pixel (wx, wy) of the top floor survives at progress `t` (0 = fully the
 * top floor, 1 = fully the floor underneath). Blotches of 2px pixels from two octaves of noise, so tufts of one
 * floor reach into the other and stray bits are left behind, like worn edges.
 */
export function seamKeeps(wx: number, wy: number, t: number, seed: number): boolean {
  if (t <= 0) return true;
  if (t >= 1) return false;
  const qx = wx >> 1;
  const qy = wy >> 1;
  const n = noise(qx, qy, 5, seed + 71) * 0.65 + noise(qx, qy, 2, seed + 73) * 0.2 + rnd01(qx, qy, 75, seed) * 0.15;
  return n > 0.12 + t * 0.76;
}

const CRYPT_STONE = stonePal(['#55525c', '#4c4a54', '#5c5864', '#504c58']);
const CRYPT_GAP = rgba('#26242c');
const CRYPT_MOSS = [rgba('#5a3a80'), rgba('#7a4ab0'), rgba('#b07ae0')] as const;
const CRYPT_BONE = [rgba('#d8d0b6'), rgba('#a8a08a')] as const;

/**
 * Undead: large cold slate slabs (Voronoi ~18px) with thin dark seams; a faint violet grave-glow creeps along
 * some seams, slabs carry hairline cracks, and here and there a small bone lies on the floor.
 */
function paintCrypt(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      // a small bone (3x1 with knobbed ends), at most one per 32px cell, rare
      const cx = wx >> 5;
      const cy = wy >> 5;
      const bh = h3(cx, cy, 41, seed);
      if (bh % 5 === 0) {
        const bx = (cx << 5) + 6 + ((bh >>> 4) % 20);
        const by = (cy << 5) + 6 + ((bh >>> 9) % 20);
        const dx = wx - bx;
        if ((wy === by && dx >= 0 && dx <= 3) || ((dx === 0 || dx === 3) && wy === by + 1)) {
          b.put(px, py, CRYPT_BONE[wy === by ? 0 : 1]);
          continue;
        }
      }
      const c = stoneAt(wx, wy, 18, 0.7, seed);
      const gap = c.f2 - c.f1;
      if (gap < 1.4) {
        const m = noise(wx, wy, 16, seed + 51);
        b.put(px, py, m > 0.66 ? CRYPT_MOSS[m > 0.8 ? 2 : h3(wx, wy, 9, seed) & 1] : CRYPT_GAP);
        continue;
      }
      const t = CRYPT_STONE[(c.id >>> 16) % CRYPT_STONE.length];
      let k = 0;
      if (gap < 2.6) k = c.dx + c.dy < 0 ? 1 : 2;
      else if ((c.id >>> 8) % 3 === 0 && Math.abs(c.dx - c.dy * 0.6) < 0.5 && c.f1 < 7) k = 2;
      else if (h3(wx, wy, 7, seed) % 29 === 0) k = 3;
      b.put(px, py, t[k]);
    }
  }
}
