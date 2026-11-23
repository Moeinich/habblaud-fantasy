// Corridors: every row of the pinwheel (layout/geometry.ts) has one, running west to east through both its arms and
// the hub's paving between them; walkways run down the square's column from each row's corridor to the next.
// Floors: each arm's corridor is wall-to-wall carpet in the race's colours (layout/departments.ts), with a runner in
// the race's style and a woven threshold band where the arm begins; the hub's columns are paved in stone (the core
// keeps its own carpet), so the carpets visibly branch off the middle. Water coolers, benches and plants line the way.
import { BUILDING_H, COL_W, CORE_COL0, CORE_EAST_COL, CORRIDOR_H, EAST_GAP_COL, PLAZA_COL, ROOM_H, WALK_COL, WEST_GAP_COL } from '../constants';
import { AreaBuilder } from './builder';
import { CORE_CARPET, DEPT_CARPET, WING_RACE } from './departments';
import { ARMS, armCol, corridorRect, stripArms, stripIndex, stripY, walkways, type Shape, type Strip, type Wing } from './geometry';
import type { AreaLayout } from './types';

export const CORRIDOR_ID = 'core:corredor';
export const NORTH_CORRIDOR_ID = 'core:corredor-norte';
export const WALKWAY_ID = 'core:passarela';
export const SOUTH_CORRIDOR_ID = 'core:corredor-sul';
export const SOUTH_WALKWAY_ID = 'core:passarela-sul';

/** Walkway columns inside the square's column (local tiles): glass at 6 and 9, walkable 7–8. */
export const WALKWAY_LX = 6;
export const WALKWAY_W = 4;

const TALL = ['ficus', 'palm', 'monstera', 'bonsai'] as const;
const SMALL = ['fern', 'succulent', 'flower'] as const;
const CORE_RUNNER = '#8b9bb0';

/** How far (tiles) two floors reach into each other at a seam. */
const SEAM = 1.5;

/** Glass façade at both ends of a corridor. */
function glassEnds(b: AreaBuilder, w: number): void {
  for (let ly = 0; ly < CORRIDOR_H; ly++) {
    const v = ly === 0 || ly === CORRIDOR_H - 1 ? 'end' : 'v';
    b.furn('glass_partition', 0, ly, v, { order: 0.1 });
    b.furn('glass_partition', w - 1, ly, v, { order: 0.1 });
  }
}

/** Water cooler or a bench (alternating by `k`), plants and a pair of talk spots in one wing column. */
function wingColumn(b: AreaBuilder, lx: number, k: number, group: string, keepTop: boolean, keepBottom: boolean): void {
  if (k % 2 === 0) {
    if (!keepTop) {
      b.furn('water_cooler', lx + 3, 0, undefined, { order: 0.5 });
      b.spot('water', lx + 3, 1, 'up', { dy: -3 });
      b.furn('plant_small', lx + 4, 0, SMALL[k % SMALL.length], { order: 0.5 });
    }
  } else {
    if (!keepTop) {
      const bench = b.furn('bench', lx + 11, 0, undefined, { order: 0.5 });
      for (let i = 0; i < 2; i++) b.seat('bench', 'bench', lx + 11 + i, 0, 'down', undefined, { noFurniture: true, furnitureId: bench });
      b.furn('plant_tall', lx + 13, 0, TALL[k % TALL.length], { order: 0.5 });
    }
    if (!keepBottom) b.furn('plant_small', lx + 12, 4, SMALL[(k + 1) % SMALL.length], { order: 0.5 });
  }
  b.spot('talk', lx + 5, 2, 'right', { group, dx: -1 });
  b.spot('talk', lx + 6, 2, 'left', { group, dx: 1 });
}

/** Carpet, threshold band and runner of one wing stretch (local tiles). */
function wingFloor(b: AreaBuilder, race: keyof typeof DEPT_CARPET, x0: number, x1: number, bandAt: 'west' | 'east', seed: number, y0 = 0, h = CORRIDOR_H): void {
  if (x1 <= x0) return;
  if (race === 'elf') {
    // the elves' road is a forest path: a beaten earth track between strips of jungle floor
    const verge = Math.min(0.6, h / 6);
    b.floor('jungle', x0, y0, x1 - x0, h, seed);
    b.seamFloor('forest_path', x0, y0 + verge, x1 - x0, h / 2 - verge, seed + 1, { axis: 'y', from: y0 + h / 2, to: y0 + verge });
    b.seamFloor('forest_path', x0, y0 + h / 2, x1 - x0, h / 2 - verge, seed + 1, { axis: 'y', from: y0 + h / 2, to: y0 + h - verge });
    return;
  }
  const c = DEPT_CARPET[race];
  b.floor('hall', x0, y0, x1 - x0, h, seed, c.pile, c.motif);
  b.floor('hall', bandAt === 'west' ? x0 + 1.25 : x1 - 1.75, y0, 0.5, h, seed + 50, c.band, c.motif);
  if (x1 - x0 > 5) b.rug(x0 + 2.25, y0 + h / 2 - 0.55, x1 - x0 - 4.5, 1.1, c.runner, seed + 20, race === 'undead' ? 'crypt' : undefined);
}

/**
 * One side of a corridor's carpet: one race's, or on row 1, where a top and a bottom zone share the corridor, a
 * lane of each — the upper zone's carpet along its doors, the lower zone's along theirs.
 */
function sideFloor(b: AreaBuilder, shape: Shape, arms: Wing[], x0: number, x1: number, bandAt: 'west' | 'east', seed: number): void {
  const upper = arms.find((w) => ARMS[w].side === 'north');
  const lower = arms.find((w) => ARMS[w].side === 'south');
  if (upper && lower && shape[upper] && shape[lower]) {
    const half = CORRIDOR_H / 2;
    wingFloor(b, WING_RACE[upper], x0, x1, bandAt, seed, 0, half);
    wingFloor(b, WING_RACE[lower], x0, x1, bandAt, seed + 7, half, half);
    return;
  }
  const used = arms.find((w) => shape[w]) ?? arms[0];
  wingFloor(b, WING_RACE[used], x0, x1, bandAt, seed);
}

/** Corridor ids per row. */
export const BOTTOM_CORRIDOR_ID = 'core:corredor-fundo';
export const BOTTOM_WALKWAY_ID = 'core:passarela-fundo';
const ROW_CORRIDOR: Record<Strip, string> = { north: NORTH_CORRIDOR_ID, main: CORRIDOR_ID, south: SOUTH_CORRIDOR_ID, bottom: BOTTOM_CORRIDOR_ID };
/** Walkway ids by the row they start from (going down). */
const WALKWAY_FROM: Record<Strip, string> = { north: WALKWAY_ID, main: SOUTH_WALKWAY_ID, south: BOTTOM_WALKWAY_ID, bottom: '' };

/**
 * One row's corridor: the race's carpet along each arm (with its threshold band at the hub end), stone paving across
 * the hub's gap columns, the core and the square, glass at both far ends. Water coolers, benches and plants line the
 * arms; the mouths of the walkways down the square's column stay clear.
 */
function layoutRow(shape: Shape, strip: Strip): AreaLayout | null {
  const r = corridorRect(shape, strip);
  if (!r) return null;
  const b = new AreaBuilder(ROW_CORRIDOR[strip], 'corridor', r);
  const lx = (col: number) => col * COL_W - r.x;
  const [west, east] = stripArms(strip);
  const middle = strip === 'main';
  // stone paving only where the hub is (the core halls and the square's column): from its edge outwards every road
  // carries the carpet of the race it leads to
  const pave0 = middle ? CORE_COL0 : WALK_COL;
  const pave1 = (middle ? CORE_EAST_COL : WALK_COL) + 1;
  const longest = (arms: Wing[]) => arms.reduce((a, b) => (shape[b] > shape[a] ? b : a));
  const wr = WING_RACE[longest(west)];
  const er = WING_RACE[longest(east)];
  const x0 = 0;
  const x1 = r.w;
  // floors: west carpet | paving (and the core's carpet in row 1) | east carpet, melting into each other
  sideFloor(b, shape, west, x0, lx(pave0), 'east', 510 + stripIndex(strip) * 40);
  b.floor('tile_check', lx(pave0), 0, lx(pave1) - lx(pave0), CORRIDOR_H, 505 + stripIndex(strip));
  if (strip === 'main') {
    for (const col of [CORE_COL0, CORE_EAST_COL]) {
      b.floor('hall', lx(col), 0, COL_W, CORRIDOR_H, 501, CORE_CARPET.pile, CORE_CARPET.motif);
      b.rug(lx(col) + 2.25, 1.95, COL_W - 4.5, 1.1, CORE_RUNNER, 502);
    }
  }
  sideFloor(b, shape, east, lx(pave1), x1, 'west', 530 + stripIndex(strip) * 40);
  const w = DEPT_CARPET[wr];
  const e = DEPT_CARPET[er];
  if (lx(pave0) > x0) b.seamFloor('hall', lx(pave0), 0, SEAM, CORRIDOR_H, 511, { axis: 'x', from: lx(pave0) - SEAM / 2, to: lx(pave0) + SEAM }, w.pile, w.motif);
  if (lx(pave1) < x1) b.seamFloor('hall', lx(pave1) - SEAM, 0, SEAM, CORRIDOR_H, 531, { axis: 'x', from: lx(pave1) + SEAM / 2, to: lx(pave1) - SEAM }, e.pile, e.motif);

  glassEnds(b, r.w);
  b.walk(1, 0, r.w - 2, CORRIDOR_H);

  // the arms (k counts outwards from the hub)
  const up = walkways(shape).some(([, lo]) => lo === strip);
  const down = walkways(shape).some(([hi]) => hi === strip);
  const dressed = new Set<number>();
  for (const w of [...west, ...east]) {
    for (let k = 0; k < shape[w]; k++) {
      const col = armCol(w, k);
      if (dressed.has(col) || col * COL_W < r.x || (col + 1) * COL_W > r.x + r.w) continue;
      dressed.add(col);
      wingColumn(b, lx(col), Math.abs(col - PLAZA_COL), `talk:${ROW_CORRIDOR[strip]}:${col}`, false, false);
    }
  }
  // the walkway's column on the outer rows: planters at its corners, the walkway's mouth kept clear (on row 1 the
  // walkways go through the halls)
  const px = lx(WALK_COL);
  if (strip !== 'main') {
  if (!up) {
    b.furn('plant_tall', px + 2, 0, 'bonsai', { order: 0.5 });
    b.furn('plant_small', px + 13, 0, 'flower', { order: 0.5 });
  } else {
    b.furn('plant_tall', px + WALKWAY_LX - 1, 0, 'bonsai', { order: 0.5 });
    b.furn('plant_tall', px + WALKWAY_LX + WALKWAY_W, 0, 'bonsai', { order: 0.5 });
  }
  if (!down) {
    b.furn('plant_small', px + 2, 4, 'flower', { order: 0.5 });
    b.furn('plant_tall', px + 13, 4, 'ficus', { order: 0.5 });
  } else {
    b.furn('plant_small', px + WALKWAY_LX - 1, 4, 'flower', { order: 0.5 });
    b.furn('plant_small', px + WALKWAY_LX + WALKWAY_W, 4, 'flower', { order: 0.5 });
  }
  b.spot('talk', px + 3, 2, 'right', { group: `talk:${ROW_CORRIDOR[strip]}:square`, dx: -1 });
  b.spot('talk', px + 4, 2, 'left', { group: `talk:${ROW_CORRIDOR[strip]}:square`, dx: 1 });
  }
  if (strip === 'main') {
    for (const col of [CORE_COL0, CORE_EAST_COL]) {
      const cx = lx(col);
      const bench = b.furn('bench', cx + 2, 0, undefined, { order: 0.5 });
      for (let i = 0; i < 2; i++) b.seat('bench', 'bench', cx + 2 + i, 0, 'down', undefined, { noFurniture: true, furnitureId: bench });
      b.furn('plant_tall', cx + 13, 0, col === CORE_COL0 ? 'palm' : 'monstera', { order: 0.5 });
      b.furn('plant_small', cx + 13, 4, 'flower', { order: 0.5 });
      b.spot('talk', cx + 7, 2, 'right', { group: `talk:corredor:core${col}`, dx: -1 });
      b.spot('talk', cx + 8, 2, 'left', { group: `talk:corredor:core${col}`, dx: 1 });
    }
  }
  return b.build();
}

export function layoutCorridor(shape: Shape): AreaLayout {
  return layoutRow(shape, 'main')!;
}

/** The other rows' corridors (top, square, bottom), or null where a row isn't built. */
export function layoutNorthCorridor(shape: Shape): AreaLayout | null {
  return layoutRow(shape, 'north');
}
export function layoutSouthCorridor(shape: Shape): AreaLayout | null {
  return layoutRow(shape, 'south');
}
export function layoutBottomCorridor(shape: Shape): AreaLayout | null {
  return layoutRow(shape, 'bottom');
}

/**
 * The walkways down the square's column, from one row's corridor to the next. The one up to the elves and orcs is a
 * forest road (worn earth, ferns and broad leaves); the others are paved paths lined with flowers.
 */
export function layoutWalkways(shape: Shape): AreaLayout[] {
  const out: AreaLayout[] = [];
  for (const [hi, lo] of walkways(shape)) {
    // from the upper row's corridor to the lower one's, except through the hub's row: there it ends at the Great
    // Hall's open back / starts at the Bathhouse's (people walk through the hall)
    const y0 = hi === 'main' ? stripY('main') + BUILDING_H : stripY(hi) + ROOM_H + CORRIDOR_H;
    const y1 = lo === 'main' ? stripY('main') : stripY(lo) + ROOM_H;
    const h = y1 - y0;
    const b = new AreaBuilder(WALKWAY_FROM[hi], 'corridor', { x: WALK_COL * COL_W + WALKWAY_LX, y: y0, w: WALKWAY_W, h });
    {
      b.floor('grass', 0, 0, WALKWAY_W, h, 580 + stripIndex(hi));
      b.floor('tile_check', 0.6, 0, WALKWAY_W - 1.2, h, 582 + stripIndex(hi));
      for (let ly = 0; ly < h; ly += 3) {
        b.furn('plant_small', 0, ly, ly % 2 ? 'flower' : 'succulent', { order: 0.1 });
        b.furn('plant_small', WALKWAY_W - 1, Math.min(h - 1, ly + 1), ly % 2 ? 'succulent' : 'flower', { order: 0.1 });
      }
    }
    b.walk(1, 0, WALKWAY_W - 2, h);
    out.push(b.build());
  }
  return out;
}
