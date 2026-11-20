// Pisos gerados em blocos ("chunks") de 8x8 tiles a partir de coordenadas de MUNDO (puro).
// Assim tábuas de madeira, veios de mármore e manchas do cimento continuam de um tile para o
// outro sem emendas, e o cache fica limitado ao tamanho do mundo (não ao formato das áreas).
import { TILE, type FloorKind } from '../api';
import { mix, parseColor, ramp, shade, type RGBA } from '../core/color';
import { PixelBuf } from '../core/pixbuf';

export const CHUNK_TILES = 8;
export const CHUNK_PX = CHUNK_TILES * TILE;

/** Hash inteiro determinístico de até 3 coordenadas + semente. */
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

/** Ruído de valor suave (bilinear) em coordenadas de mundo, 0..1. */
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

/** Gera o bloco (cx, cy) — em unidades de chunk — de um tipo de piso. */
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

// ------------------------------------------------------------------ pisos por tile

function paintTile(b: PixelBuf, kind: FloorKind, tx: number, ty: number, o: FloorOpts): void {
  const r = (i: number) => rnd01(tx, ty, i, o.seed);
  switch (kind) {
    case 'carpet': {
      // Esteira de palha trançada: fiapos curtos em direções alternadas (xadrez de trama) e algumas
      // hastes soltas mais claras.
      const c1 = o.tint ?? '#b89a62';
      const c2 = o.tint2 ?? shade(c1, -0.04);
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
      // Lajes de pedra irregulares (2 a 4 por tile) com rejunte de terra.
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
      // Ardósia escura em placas quadradas (casa de banhos).
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
    case 'street': {
      // Estrada de terra batida com sulcos de carroça e pedrinhas.
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

// ------------------------------------------------------------------ pisos contínuos

/** Tabela de cores (RGBA) pré-calculada para escrita rápida. */
function rgba(c: string): RGBA {
  return parseColor(c);
}

// Tábuas rústicas, mais escuras e com mais variação de tom.
const WOOD_TONES = ['#9a6c42', '#8e6239', '#a6784c', '#86603a'] as const;
/** [tom][0 normal, 1 topo, 2 base, 3 veio, 4 emenda, 5 após emenda, 6 nó]. */
const WOOD: readonly (readonly RGBA[])[] = WOOD_TONES.map((t) =>
  [t, shade(t, 0.03), shade(t, -0.075), shade(t, -0.03), shade(t, -0.1), shade(t, 0.03), shade(t, -0.12)].map(rgba),
);

/** Tábuas de madeira: 4px de altura, 48px de comprimento, emendas desencontradas, veios e nós. */
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
      else if (iy === 0) k = ix === 1 ? 5 : 1;
      else if (iy === 2 && ix === 10 + ((ph >>> 12) % 20) && (ph >>> 20) % 5 === 0) k = 6;
      else if (iy === 1 + ((ph >>> 5) % 2) && (ix + (ph >>> 8)) % 23 < 7) k = 3;
      else if (ix === 1) k = 5;
      b.put(px, py, t[k]);
    }
  }
}

const LEVELS = 16;
const CONCRETE: readonly RGBA[] = Array.from({ length: LEVELS }, (_, i) => rgba(mix('#7a6650', '#8e7a60', i / (LEVELS - 1))));
const CONCRETE_EDGE: readonly RGBA[] = CONCRETE.map((c) => rgba(shade(`rgb(${c[0]},${c[1]},${c[2]})`, 0.02)));
const CONCRETE_SEAM = rgba('#6e5a46');
const CONCRETE_SPECK = [rgba('#5e4c3a'), rgba('#a09076')] as const;

/** Chão de terra batida em placas de 2x2 tiles (marcas de varrição), com manchas suaves contínuas. */
function paintConcrete(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const sx = wx & 31;
      const sy = wy & 31;
      if (sx === 31 || sy === 31) {
        b.put(px, py, CONCRETE_SEAM);
        continue;
      }
      const sp = h3(wx, wy, 3, seed) % 61;
      if (sp < 2) {
        b.put(px, py, CONCRETE_SPECK[sp]);
        continue;
      }
      const n = noise(wx, wy, 26, seed) * 0.6 + noise(wx, wy, 7, seed + 3) * 0.4;
      const lv = Math.min(LEVELS - 1, Math.floor(n * LEVELS));
      b.put(px, py, sx === 0 || sy === 0 ? CONCRETE_EDGE[lv] : CONCRETE[lv]);
    }
  }
}

const COBBLE_TONES = ['#8f897d', '#9c968a', '#857f74', '#a39d90'] as const;
const COBBLE: readonly (readonly RGBA[])[] = COBBLE_TONES.map((t) => [t, shade(t, 0.07), shade(t, -0.1)].map(rgba));
const COBBLE_GAP = rgba('#4f463a');

/** Calçamento de pedras redondas (paralelepípedos 8x6 desencontrados, cantos arredondados). */
function paintMarble(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const row = Math.floor(wy / 6);
      const off = row & 1 ? 4 : 0;
      const ix = (wx + off) & 7;
      const iy = wy - row * 6;
      const corner = (ix === 0 || ix === 6) && (iy === 0 || iy === 4);
      if (ix === 7 || iy === 5 || corner) {
        b.put(px, py, COBBLE_GAP);
        continue;
      }
      const t = COBBLE[h3((wx + off) >> 3, row, 4, seed) % COBBLE.length];
      b.put(px, py, iy === 0 || ix === 0 ? t[1] : iy === 4 || ix === 6 ? t[2] : t[0]);
    }
  }
}

const WALK_TONES = ['#a8987c', '#9e8e72', '#b2a286'] as const;
/** [tom][0 normal, 1 junta, 2 borda clara, 3 mancha]. */
const WALK: readonly (readonly RGBA[])[] = WALK_TONES.map((t) => [t, '#6e5e48', shade(t, 0.04), shade(t, -0.07)].map(rgba));

/** Caminho de lajes de arenito 16x8 em fileiras desencontradas. */
function paintSidewalk(b: PixelBuf, x0: number, y0: number, seed: number): void {
  for (let py = 0; py < CHUNK_PX; py++) {
    for (let px = 0; px < CHUNK_PX; px++) {
      const wx = x0 + px;
      const wy = y0 + py;
      const row = wy >> 3;
      const off = row & 1 ? 8 : 0;
      const ix = (wx + off) & 15;
      const iy = wy & 7;
      const t = WALK[h3((wx + off) >> 4, row, 5, seed) % WALK.length];
      let k = 0;
      if (iy === 7 || ix === 15) k = 1;
      else if (iy === 0 || ix === 0) k = 2;
      else if (h3(wx, wy, 6, seed) % 41 === 0) k = 3;
      b.put(px, py, t[k]);
    }
  }
}
