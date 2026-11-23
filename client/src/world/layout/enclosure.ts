// Rounded enclosures of the halls (pure): so the office isn't a set of plain boxes, each hall stands inside a
// rounded ring in its race's style — a stone curtain wall round the human wing and the core, a palisade of
// sharpened stakes round the orc war camp, and a wrought-iron graveyard fence round the undead crypts (the elves
// have their hollow tree, render/elf-tree.ts). The ring is a rounded rectangle a little outside the building, with
// gaps where the corridors and walkways pass. Drawn by render/enclosure.ts.
import type { Race } from '../../../../shared/race';
import { BUILDING_H, COL_W, CORE_COL0, CORE_COLS, CORRIDOR_H, CORRIDOR_Y, EAST_COL0, MAIN_Y, PLAZA_COL } from '../constants';
import { WALKWAY_LX, WALKWAY_W } from './corridor';
import { southRect, type Shape } from './geometry';
import { TILE } from '../constants';
import type { AreaLayout, TileRect } from './types';

/** Gap between the building and the ring, the ring's corner radius and its thickness (tiles). */
export const RING_MARGIN = 2;
export const RING_RADIUS = 6;
export const RING_WIDTH = 1.25;
/** How far (tiles) a ring and its fence reach beyond the building on every side. */
export const RING_REACH = RING_MARGIN + RING_WIDTH + 1;

export interface HallRing {
  race: Race;
  /** The building it wraps (tiles). */
  rect: TileRect;
  /** Where corridors and walkways pass through (tiles). */
  gaps: TileRect[];
}

export function hallRings(shape: Shape): HallRing[] {
  const out: HallRing[] = [];
  const reach = RING_REACH + 1;
  const side = (x: number) => ({ x, y: CORRIDOR_Y, w: reach, h: CORRIDOR_H });
  // the human wing and the core: the main entrance to the west, the square to the east
  const hx = (CORE_COL0 - shape.west) * COL_W;
  const hw = (shape.west + CORE_COLS) * COL_W;
  out.push({ race: 'human', rect: { x: hx, y: MAIN_Y, w: hw, h: BUILDING_H }, gaps: [side(hx - reach), side(hx + hw)] });
  // the orc wing: open to the square
  const ox = EAST_COL0 * COL_W;
  out.push({ race: 'orc', rect: { x: ox, y: MAIN_Y, w: shape.east * COL_W, h: BUILDING_H }, gaps: [side(ox - reach)] });
  // the undead wing: open where the walkway comes down
  const s = southRect(shape);
  if (s) out.push({ race: 'undead', rect: s, gaps: [{ x: PLAZA_COL * COL_W + WALKWAY_LX - 1, y: s.y - reach, w: WALKWAY_W + 2, h: reach }] });
  return out;
}

/**
 * Opens a room of a ringed hall onto its ring: the outer wall goes (the back wall of a north-side room, the low
 * outer wall of a south-side room) and the decorations that hung on the back wall move up onto the ring, which
 * is now the building's outer wall, so the rooms and the land inside the ring read as one hall.
 */
export function openToRing(area: AreaLayout, side: 'north' | 'south'): void {
  const top = area.rect.y * TILE;
  const bottom = (area.rect.y + area.rect.h - 1) * TILE;
  if (side === 'north') {
    area.walls = area.walls.filter((w) => !(w.kind === 'face' && w.y === top));
    for (const it of area.wallItems) if (it.on === 'face' && it.baseY === top + 2 * TILE) it.baseY = top;
  } else area.walls = area.walls.filter((w) => !(w.kind === 'south' && w.y === bottom));
}
