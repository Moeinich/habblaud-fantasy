// Corridors: the main one runs west to east through the human wing, the core, the square and the orc wing; the
// night-elf wing has its own corridor in the north strip and the undead wing one in the south strip across the
// street, each joined to the square by a covered glass walkway.
// Floors: each wing's corridor is wall-to-wall office carpet in the race's colours (layout/departments.ts), with
// a runner in the race's style and a woven threshold band where the wing begins; the square is paved in stone,
// so the three carpets visibly branch off it. Water coolers, benches and plants line the way.
import { COL_W, CORE_COL0, CORRIDOR_H, CORRIDOR_Y, EAST_COL0, NCORRIDOR_Y, PLAZA_COL, SCORRIDOR_Y } from '../constants';
import { AreaBuilder } from './builder';
import { CORE_CARPET, DEPT_CARPET } from './departments';
import { mainRect, northCorridorRect, southCorridorRect, type Shape } from './geometry';
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
function wingFloor(b: AreaBuilder, race: keyof typeof DEPT_CARPET, x0: number, x1: number, bandAt: 'west' | 'east', seed: number): void {
  if (x1 <= x0) return;
  const c = DEPT_CARPET[race];
  b.floor('hall', x0, 0, x1 - x0, CORRIDOR_H, seed, c.pile, c.motif);
  b.floor('hall', bandAt === 'west' ? x0 + 1.25 : x1 - 1.75, 0, 0.5, CORRIDOR_H, seed + 50, c.band, c.motif);
  if (x1 - x0 > 5) b.rug(x0 + 2.25, 1.95, x1 - x0 - 4.5, 1.1, c.runner, seed + 20, race === 'undead' ? 'crypt' : undefined);
}

export function layoutCorridor(shape: Shape): AreaLayout {
  const r = mainRect(shape);
  const w = r.w;
  const b = new AreaBuilder(CORRIDOR_ID, 'corridor', { x: r.x, y: CORRIDOR_Y, w, h: CORRIDOR_H });
  const lx = (col: number) => col * COL_W - r.x;
  const coreX = lx(CORE_COL0);
  const plazaX = lx(PLAZA_COL);
  const eastX = lx(EAST_COL0);

  // floors: human carpet | core carpet | stone square | orc carpet
  wingFloor(b, 'human', 0, coreX, 'east', 510);
  b.floor('hall', coreX, 0, plazaX - coreX, CORRIDOR_H, 501, CORE_CARPET.pile, CORE_CARPET.motif);
  b.rug(coreX + 2.25, 1.95, plazaX - coreX - 4.5, 1.1, CORE_RUNNER, 502);
  b.floor('tile_check', plazaX, 0, COL_W, CORRIDOR_H, 505);
  wingFloor(b, 'orc', eastX, w, 'west', 530);
  // seams: each floor melts into its neighbour (tufts of carpet over the paving, stones showing through)
  const h = DEPT_CARPET.human;
  const o = DEPT_CARPET.orc;
  if (coreX > 0) b.seamFloor('hall', coreX, 0, SEAM, CORRIDOR_H, 510, { axis: 'x', from: coreX - SEAM / 2, to: coreX + SEAM }, h.pile, h.motif);
  // the elf road's earth runs out of the walkway onto the square's paving
  if (shape.north) {
    b.seamFloor('forest_path', plazaX + WALKWAY_LX, 0, WALKWAY_W, SEAM + 0.5, 561, { axis: 'y', from: 0, to: SEAM + 0.5 });
  }
  // and the undead carpet out of the south walkway
  if (shape.south) {
    const u = DEPT_CARPET.undead;
    const sy = CORRIDOR_H - SEAM - 0.5;
    b.seamFloor('hall', plazaX + WALKWAY_LX - 1, sy, WALKWAY_W + 2, SEAM + 0.5, 580, { axis: 'y', from: CORRIDOR_H, to: sy }, u.pile, u.motif);
  }
  b.seamFloor('hall', plazaX, 0, SEAM, CORRIDOR_H, 501, { axis: 'x', from: plazaX - SEAM / 2, to: plazaX + SEAM }, CORE_CARPET.pile, CORE_CARPET.motif);
  b.seamFloor('hall', eastX - SEAM, 0, SEAM, CORRIDOR_H, 530, { axis: 'x', from: eastX + SEAM / 2, to: eastX - SEAM }, o.pile, o.motif);

  glassEnds(b, w);
  b.walk(1, 0, w - 2, CORRIDOR_H);

  // human wing (k counts outwards from the core)
  for (let col = CORE_COL0 - shape.west, k = shape.west - 1; col < CORE_COL0; col++, k--) wingColumn(b, lx(col), k, `talk:corredor:${col}`, false, false);
  // core
  b.furn('plant_tall', coreX + 2, 4, 'palm', { order: 0.5 });
  b.furn('plant_small', coreX + 13, 4, 'flower', { order: 0.5 });
  const coreBench = b.furn('bench', coreX + COL_W + 2, 0, undefined, { order: 0.5 });
  for (let i = 0; i < 2; i++) b.seat('bench', 'bench', coreX + COL_W + 2 + i, 0, 'down', undefined, { noFurniture: true, furnitureId: coreBench });
  b.furn('plant_tall', coreX + COL_W + 13, 0, 'monstera', { order: 0.5 });
  b.spot('talk', coreX + 5, 2, 'right', { group: 'talk:corredor:nucleo', dx: -1 });
  b.spot('talk', coreX + 6, 2, 'left', { group: 'talk:corredor:nucleo', dx: 1 });
  // the square: benches facing each other on the south side, planters at the corners; the north side stays
  // open where the walkway to the elf wing comes in
  for (const bx of [3, 11]) {
    const bench = b.furn('bench', plazaX + bx, 4, undefined, { order: 0.5 });
    for (let i = 0; i < 2; i++) b.seat('bench', 'bench', plazaX + bx + i, 4, 'up', undefined, { noFurniture: true, furnitureId: bench });
  }
  b.furn('plant_tall', plazaX + 1, 0, 'bonsai', { order: 0.5 });
  b.furn('plant_tall', plazaX + 14, 0, 'ficus', { order: 0.5 });
  b.furn('plant_small', plazaX + 1, 4, 'flower', { order: 0.5 });
  b.furn('plant_small', plazaX + 14, 4, 'flower', { order: 0.5 });
  b.spot('talk', plazaX + 7, 2, 'right', { group: 'talk:corredor:praca', dx: -1 });
  b.spot('talk', plazaX + 8, 2, 'left', { group: 'talk:corredor:praca', dx: 1 });
  // orc wing (k counts outwards from the square)
  for (let col = EAST_COL0, k = 0; col < EAST_COL0 + shape.east; col++, k++) wingColumn(b, lx(col), k, `talk:corredor:${col}`, false, false);
  return b.build();
}

/** Corridor of the north strip (the elf wing), or null when it doesn't exist. */
export function layoutNorthCorridor(shape: Shape): AreaLayout | null {
  const r = northCorridorRect(shape);
  if (!r) return null;
  const b = new AreaBuilder(NORTH_CORRIDOR_ID, 'corridor', r);
  wingFloor(b, 'elf', 0, r.w, 'west', 550);
  glassEnds(b, r.w);
  b.walk(1, 0, r.w - 2, CORRIDOR_H);
  for (let c = 0; c < r.w / COL_W; c++) wingColumn(b, c * COL_W, c + 1, `talk:corredor-norte:${c}`, false, c === 0);
  // the walkway arrives from the south in the square's column: keep its mouth clear
  b.furn('plant_tall', WALKWAY_LX - 1, 4, 'bonsai', { order: 0.5 });
  b.furn('plant_tall', WALKWAY_LX + WALKWAY_W, 4, 'bonsai', { order: 0.5 });
  return b.build();
}

/** Corridor of the south strip (the undead wing), or null; its east end is the square's column. */
export function layoutSouthCorridor(shape: Shape): AreaLayout | null {
  const r = southCorridorRect(shape);
  if (!r) return null;
  const b = new AreaBuilder(SOUTH_CORRIDOR_ID, 'corridor', r);
  const plazaX = PLAZA_COL * COL_W - r.x;
  wingFloor(b, 'undead', 0, r.w, 'east', 570);
  glassEnds(b, r.w);
  b.walk(1, 0, r.w - 2, CORRIDOR_H);
  for (let c = 0; c < r.w / COL_W; c++) {
    const lx = c * COL_W;
    wingColumn(b, lx, (plazaX - lx) / COL_W + 1, `talk:corredor-sul:${c}`, lx === plazaX, false);
  }
  // the walkway arrives from the north in the square's column: keep its mouth clear
  b.furn('plant_tall', plazaX + WALKWAY_LX - 1, 0, 'bonsai', { order: 0.5 });
  b.furn('plant_tall', plazaX + WALKWAY_LX + WALKWAY_W, 0, 'bonsai', { order: 0.5 });
  return b.build();
}

/** The forest road from the square up to the elf corridor, or null. */
export function layoutWalkway(shape: Shape): AreaLayout | null {
  if (!shape.north) return null;
  const y0 = NCORRIDOR_Y + CORRIDOR_H;
  const h = CORRIDOR_Y - y0;
  const b = new AreaBuilder(WALKWAY_ID, 'corridor', { x: PLAZA_COL * COL_W + WALKWAY_LX, y: y0, w: WALKWAY_W, h });
  // a forest road up to the elves: a mossy verge, the worn earth path down the middle (ragged on both sides) and
  // ferns and broad leaves along it instead of glass
  b.floor('jungle', 0, 0, WALKWAY_W, h, 560);
  const mid = WALKWAY_W / 2;
  b.seamFloor('forest_path', 0.3, 0, mid - 0.3, h, 561, { axis: 'x', from: mid, to: 0.3 });
  b.seamFloor('forest_path', mid, 0, mid - 0.3, h, 561, { axis: 'x', from: mid, to: WALKWAY_W - 0.3 });
  for (let ly = 0; ly < h; ly += 2) {
    const k = ly / 2;
    b.furn(k % 3 === 1 ? 'plant_tall' : 'plant_small', 0, ly, k % 3 === 1 ? 'monstera' : 'fern', { order: 0.1 });
    b.furn((k + 1) % 3 === 1 ? 'plant_tall' : 'plant_small', WALKWAY_W - 1, ly + 1 < h ? ly + 1 : ly, (k + 1) % 3 === 1 ? 'monstera' : 'fern', { order: 0.1 });
  }
  b.walk(1, 0, WALKWAY_W - 2, h);
  return b.build();
}

/** Covered glass walkway from the square down across the street to the undead corridor, or null. */
export function layoutSouthWalkway(shape: Shape): AreaLayout | null {
  if (!shape.south) return null;
  const y0 = CORRIDOR_Y + CORRIDOR_H;
  const h = SCORRIDOR_Y - y0;
  const b = new AreaBuilder(SOUTH_WALKWAY_ID, 'corridor', { x: PLAZA_COL * COL_W + WALKWAY_LX, y: y0, w: WALKWAY_W, h });
  const c = DEPT_CARPET.undead;
  b.floor('hall', 0, 0, WALKWAY_W, h, 580, c.pile, c.motif);
  b.rug(1.2, 0.5, WALKWAY_W - 2.4, h - 1, c.runner, 581, 'crypt');
  for (let ly = 0; ly < h; ly++) {
    b.furn('glass_partition', 0, ly, 'v', { order: 0.1 });
    b.furn('glass_partition', WALKWAY_W - 1, ly, 'v', { order: 0.1 });
  }
  b.walk(1, 0, WALKWAY_W - 2, h);
  return b.build();
}
