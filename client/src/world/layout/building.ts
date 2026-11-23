// Montagem do prédio: núcleo + corredor + salas de projeto -> grade de caminhabilidade e spots.
import { FURNITURE } from '../../art/api';
import { BLOCKED, FREE, SEAT, WalkGrid } from '../path/grid';
import { furnitureBlocks, furnitureIsSeat } from './builder';
import { MAIN_Y } from '../constants';
import { openToRing } from './enclosure';
import { layoutCafe, layoutLounge, layoutReception, layoutRestroom } from './core';
import { layoutCorridor, layoutNorthCorridor, layoutSouthCorridor, layoutSouthWalkway, layoutWalkway } from './corridor';
import { extentRect, gridSize, shapeKey, type Shape } from './geometry';
import type { AreaLayout, SpotDef, TileRect } from './types';

export interface BuildingLayout {
  /** How far each wing reaches (layout/geometry.ts). */
  shape: Shape;
  /** shapeKey(shape): changes whenever the outline of the building changes. */
  key: string;
  /** Everything that is built, in tiles (both strips and the walkway). */
  rect: TileRect;
  core: AreaLayout[];
  corridor: AreaLayout;
  /** The elf and undead wings' corridors and the walkways to them (only while those wings exist). */
  extra: AreaLayout[];
  rooms: AreaLayout[];
  grid: WalkGrid;
  spots: SpotDef[];
}

let coreCache: AreaLayout[] | null = null;

/** Áreas fixas do núcleo (calculadas uma vez). */
export function coreAreas(): AreaLayout[] {
  if (!coreCache) {
    coreCache = [layoutReception(), layoutRestroom(), layoutCafe(), layoutLounge()];
    // the core stands inside the human wing's ring (layout/enclosure.ts) too
    for (const a of coreCache) openToRing(a, a.rect.y === MAIN_Y ? 'north' : 'south');
  }
  return coreCache;
}

/** Marca na grade as células caminháveis de uma área, os bloqueios e os assentos. */
export function paintArea(grid: WalkGrid, area: AreaLayout): void {
  for (const r of area.walkable) grid.fill(r.x, r.y, r.w, r.h, FREE);
  for (const r of area.blocked ?? []) grid.fill(r.x, r.y, r.w, r.h, BLOCKED);
  for (const f of area.furniture) {
    const def = FURNITURE[f.kind];
    if (def.mount !== 'floor') continue;
    const { w, h } = def.footprint;
    if (furnitureBlocks(f.kind)) grid.fill(f.tx, f.ty, w, h, BLOCKED);
    else if (furnitureIsSeat(f.kind)) {
      for (let y = f.ty; y < f.ty + h; y++) for (let x = f.tx; x < f.tx + w; x++) if (grid.get(x, y) === FREE) grid.set(x, y, SEAT);
    }
  }
}

export function buildWalkGrid(shape: Shape, areas: readonly AreaLayout[], version = 0): WalkGrid {
  const { w, h } = gridSize(shape);
  const grid = new WalkGrid(w, h, version);
  for (const a of areas) paintArea(grid, a);
  return grid;
}

export function assembleBuilding(shape: Shape, rooms: readonly AreaLayout[], version = 0): BuildingLayout {
  const core = coreAreas();
  const corridor = layoutCorridor(shape);
  const extra = [layoutNorthCorridor(shape), layoutWalkway(shape), layoutSouthCorridor(shape), layoutSouthWalkway(shape)].filter((a): a is AreaLayout => !!a);
  const all = [...core, corridor, ...extra, ...rooms];
  const grid = buildWalkGrid(shape, all, version);
  const spots: SpotDef[] = [];
  for (const a of all) spots.push(...a.spots);
  return { shape, key: shapeKey(shape), rect: extentRect(shape), core, corridor, extra, rooms: [...rooms], grid, spots };
}
