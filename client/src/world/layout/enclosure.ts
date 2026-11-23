// Rounded enclosures of the halls (pure): so the camp isn't a set of plain boxes, each zone of the pinwheel stands
// inside a rounded ring in its race's style, wrapping the zone's L — a stone curtain wall round the humans (and the
// hub), a palisade of sharpened stakes round the orc war camp and a wrought-iron graveyard fence round the undead
// crypts; the elves' is their hollow world tree (render/elf-tree.ts). A ring is the union of a zone's rectangles
// (layout/geometry.ts zoneRects) grown by a margin, with round corners, and gaps where corridors and walkways pass.
// Drawn by render/enclosure.ts.
import type { Race } from '../../../../shared/race';
import { BUILDING_H, COL_W, CORE_COL0, CORE_EAST_COL, CORRIDOR_H, MAIN_Y, PLAZA_COL, ROOM_H } from '../constants';
import { WALKWAY_LX, WALKWAY_W } from './corridor';
import { ARMS, armIndex, hasBottom, hasNorth, hubRect, slotColumn, slotSide, slotStrip, slotWing, stripY, zoneRects, ZONE_ARMS, type Shape, type Strip } from './geometry';
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
  /** The hub's ring (stone, like the humans'). */
  hub?: true;
  /** The rectangles it wraps (tiles); overlapping, so their union has no seams. */
  rects: TileRect[];
  /** Where corridors and walkways pass through (tiles). */
  gaps: TileRect[];
}

/** A corridor's opening through the ring on a zone's west or east edge (tiles). */
function sideGap(strip: Strip, edgeX: number, outward: -1 | 1): TileRect {
  const reach = RING_REACH + 1;
  return { x: outward < 0 ? edgeX - reach : edgeX, y: stripY(strip) + ROOM_H, w: reach, h: CORRIDOR_H };
}

export function hallRings(shape: Shape): HallRing[] {
  const out: HallRing[] = [];
  const reach = RING_REACH + 1;
  for (const race of ['elf', 'orc', 'undead', 'human'] as const) {
    const { block, reach: inner } = zoneRects(shape, race);
    if (!block && !inner) continue;
    const [outer, side] = ZONE_ARMS[race];
    const dir = ARMS[outer].dir;
    // towards the hub: -dir
    const hubward: -1 | 1 = dir < 0 ? 1 : -1;
    const rects: TileRect[] = [];
    const gaps: TileRect[] = [];
    if (block) {
      rects.push(block);
      // row 1's corridor runs between the top and the bottom zone of each side: the ring stays open all along it
      gaps.push({ x: block.x - reach, y: stripY('main') + ROOM_H, w: block.w + 2 * reach, h: CORRIDOR_H });
      void side;
    }
    if (inner) {
      // run the inner part back into the block so their round corners don't notch the union
      const overlap = block ? (RING_RADIUS + RING_MARGIN) : 0;
      rects.push(hubward > 0 ? { ...inner, x: inner.x - overlap, w: inner.w + overlap } : { ...inner, w: inner.w + overlap });
      gaps.push(sideGap(ARMS[outer].strip, hubward > 0 ? inner.x + inner.w : inner.x, hubward));
    }
    out.push({ race, rects, gaps });
  }
  // the hub: the four core halls, open to both sides and to the walkways above and below
  const hub = hubRect();
  const gaps: TileRect[] = [];
  gaps.push(sideGap('main', CORE_COL0 * COL_W, -1));
  gaps.push(sideGap('main', (CORE_EAST_COL + 1) * COL_W, 1));
  const wx = PLAZA_COL * COL_W + WALKWAY_LX - 1;
  if (hasNorth(shape)) gaps.push({ x: wx, y: MAIN_Y - reach, w: WALKWAY_W + 2, h: reach });
  if (hasBottom(shape)) gaps.push({ x: wx, y: MAIN_Y + BUILDING_H, w: WALKWAY_W + 2, h: reach });
  out.push({ race: 'human', hub: true, rects: [hub], gaps });
  return out;
}

/** Bounding box of a ring's rectangles (tiles). */
export function ringBounds(ring: HallRing): TileRect {
  const x0 = Math.min(...ring.rects.map((r) => r.x));
  const y0 = Math.min(...ring.rects.map((r) => r.y));
  const x1 = Math.max(...ring.rects.map((r) => r.x + r.w));
  const y1 = Math.max(...ring.rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Which sides of a project room's cell face its zone's ring (so the room opens onto it): the far side of the outer
 * row (the top of row 0, the bottom of row 2), plus its hub-side edge over the two columns that reach in over (or
 * under) the hub. Row 1's rooms face the lawn and the shared corridor and keep their walls. The elves' tree has no
 * such openings (its back wall rises behind the rooms' own).
 */
export function ringSides(slot: number): { north: boolean; south: boolean } {
  const wing = slotWing(slot);
  const arm = ARMS[wing];
  if (arm.race === 'elf') return { north: false, south: false };
  if (!arm.outer) return { north: false, south: false };
  const top = slotStrip(slot) === 'north';
  const inReach = armIndex(wing, slotColumn(slot)) < 2;
  return { north: top || inReach, south: !top || inReach };
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

// ---------------------------------------------------------------------------------------------------- spread
// Inside a ring the rooms' floor doesn't stop in a straight line: on the sides that face the yard (west, east and
// south; the north side runs under the ring's back wall) it ends in a rounded, wobbly edge that bites in and spills
// out by up to a tile, with loose slabs scattered beyond it, so the halls read as grown rather than boxed.

/** Room sides that spread into the yard (only those on the ring's own edge). */
export interface Spread {
  w: boolean;
  e: boolean;
  s: boolean;
  /** Where corridors pass (tiles): the edge stays straight near them. */
  gaps: TileRect[];
}

/** How far the floor canvas reaches beyond a spreading side (tiles). */
export const SPREAD_REACH = RING_MARGIN;
/** Corner rounding, wobble and the band of loose slabs (tiles). */
const SPREAD_ROUND = 1.5;
const SPREAD_WOBBLE = 0.9;
const SPREAD_SLABS = 0.9;

/**
 * Which sides of `rect` spread, or null when it isn't inside a ring (the corridors...). The west and east sides spread
 * where no other area (`others`: rooms, the core, corridors) borders them, e.g. at a zone's outer end or next to an
 * empty plot; the south side where the room sits on the ring's lower edge (not over the lawn between a zone's rows,
 * where the room keeps its wall).
 */
export function spreadSides(rect: TileRect, rings: readonly HallRing[], others: readonly TileRect[] = []): Spread | null {
  const inside = (r: TileRect) => rect.x >= r.x && rect.y >= r.y && rect.x + rect.w <= r.x + r.w && rect.y + rect.h <= r.y + r.h;
  const ring = rings.find((r) => r.rects.some(inside));
  if (!ring) return null;
  const overlapsY = (o: TileRect) => o.y < rect.y + rect.h && o.y + o.h > rect.y;
  const overlapsX = (o: TileRect) => o.x < rect.x + rect.w && o.x + o.w > rect.x;
  const free = (touch: (o: TileRect) => boolean) => !others.some((o) => o !== rect && touch(o));
  const s: Spread = {
    w: free((o) => o.x + o.w === rect.x && overlapsY(o)),
    e: free((o) => o.x === rect.x + rect.w && overlapsY(o)),
    s: ring.rects.some((r) => inside(r) && r.y + r.h === rect.y + rect.h) && free((o) => o.y === rect.y + rect.h && overlapsX(o)),
    gaps: ring.gaps,
  };
  return s.w || s.e || s.s ? s : null;
}

export function spreadKey(s: Spread | null): string {
  return s ? `${s.w ? 'w' : ''}${s.e ? 'e' : ''}${s.s ? 's' : ''}` : '';
}

/** Integer hash of a lattice point → [-1, 1]. */
function lattice(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** Smooth value noise in [-1, 1] on a `cell`-px lattice (world px, so neighbouring rooms line up). */
export function valueNoise(x: number, y: number, cell: number, salt: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  let fx = x / cell - gx;
  let fy = y / cell - gy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = lattice(gx, gy, salt);
  const b = lattice(gx + 1, gy, salt);
  const c = lattice(gx, gy + 1, salt);
  const d = lattice(gx + 1, gy + 1, salt);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Is world px (x, y) on the room's floor? 'edge' = on it, at its rim (drawn a shade darker); 'slab' = a loose slab
 * out in the yard; null = yard. `rect` in tiles.
 */
export function spreadFloorAt(rect: TileRect, s: Spread, x: number, y: number): 'in' | 'edge' | 'slab' | null {
  const T = TILE;
  const R = SPREAD_ROUND * T;
  const far = 1e6;
  const rx0 = rect.x * T;
  const ry0 = rect.y * T;
  const rx1 = (rect.x + rect.w) * T;
  const ry1 = (rect.y + rect.h) * T;
  // near a corridor gap the edge stays put (the walkway runs straight in)
  let calm = 1;
  for (const g of s.gaps) {
    const dx = Math.max(g.x * T - x, 0, x - (g.x + g.w) * T);
    const dy = Math.max(g.y * T - y, 0, y - (g.y + g.h) * T);
    calm = Math.min(calm, Math.max(0, Math.min(1, (Math.hypot(dx, dy) - 0.5 * T) / (1.5 * T))));
  }
  const d = (px: number, py: number): number => {
    const ax0 = s.w ? rx0 + R : rx0 - far;
    const ax1 = s.e ? rx1 - R : rx1 + far;
    const ay0 = ry0 - far;
    const ay1 = s.s ? ry1 - R : ry1 + far;
    // outside a side that doesn't spread: never floor (the canvas doesn't reach there anyway)
    if ((!s.w && px < rx0) || (!s.e && px >= rx1) || (!s.s && py >= ry1)) return far;
    const qx = Math.max(ax0 - px, px - ax1);
    const qy = Math.max(ay0 - py, py - ay1);
    const sdf = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
    const wob = (valueNoise(px, py, 2.25 * T, 11) * 0.7 + valueNoise(px, py, 0.8 * T, 12) * 0.3) * SPREAD_WOBBLE * T * calm;
    return sdf - wob;
  };
  const v = d(x, y);
  if (v < 0) return v > -2.5 ? 'edge' : 'in';
  // loose slabs: chunky 4-px-ish blocks of floor a little way out
  if (calm > 0.5 && v < SPREAD_SLABS * T && valueNoise(x, y, 0.45 * T, 13) > 0.42) return 'slab';
  return null;
}
