// Building geometry (pure): the pinwheel of halls round the hub — rows, cells ("slots"), arms, zones and the shape.
//
// Four rows (strips), each a row of rooms north of a corridor and a row south of it:
//   north  (row 0)  elves west of the square, orcs east of it            (the top zones' outer rows)
//   main   (row 1)  elves/undead | gap | core | square | core | gap | orcs/humans   (the hub: the four core halls)
//   south  (row 2)  undead west of the square, humans east of it        (the bottom zones' outer rows)
// Each race's zone is an L in its corner: a side arm on row 1 starting past the hub's open gap column (the top zones
// on the north side of its corridor, the bottom zones on the south side), and an outer arm (row 0 or 2) starting
// right next to the square, so it reaches in over (or under) the hub. Both grow outwards. (The fourth strip type,
// 'bottom', is never built.) A walkway runs down the square's column (PLAZA_COL) from each row's corridor to the next.
//
// A slot is one room-sized cell: slot = row * ROW_BASE + col * 2 + (south side ? 1 : 0). In every row, slot + 2 is
// the cell one column further east on the same side, so a room anchored at `slot` spanning `span` columns covers
// slot, slot + 2, ... (its anchor is its westmost cell).
import type { Race } from '../../../../shared/race';
import {
  BSTRIP_Y,
  SSTRIP_BOTTOM,
  BUILDING_H,
  COL_W,
  CORE_COL0,
  CORE_EAST_COL,
  CORRIDOR_H,
  EAST_COL0,
  EAST_GAP_COL,
  MAIN_Y,
  NSTRIP_Y,
  PLAZA_COL,
  ROOM_H,
  MAIN_BOTTOM,
  SSTRIP_Y,
  TILE,
  WEST_GAP_COL,
} from '../constants';
import type { TileRect } from './types';

export type Side = 'north' | 'south';
export type Strip = 'north' | 'main' | 'south' | 'bottom';
/** An arm: row (n/m/s/b) and direction (w/e). */
export type Wing = 'nw' | 'ne' | 'mw' | 'me' | 'sw' | 'se' | 'bw' | 'be';

export const STRIPS: readonly Strip[] = ['north', 'main', 'south', 'bottom'];
const ROW_BASE = 10_000;

export interface Arm {
  strip: Strip;
  /** -1 grows west, +1 east. */
  dir: -1 | 1;
  /** Innermost column (next to the hub). */
  start: number;
  race: Race;
  /** The zone's outer row (rows 0 and 2), which reaches in over / under the hub. */
  outer: boolean;
  /** Row 1's arms take only one side of it (the top zones the north side, the bottom zones the south side). */
  side?: Side;
  /** How far its first cell is from the hub (the packing fills the nearest lanes first). */
  dist: number;
}

export const ARMS: Readonly<Record<Wing, Arm>> = {
  nw: { strip: 'north', dir: -1, start: PLAZA_COL - 1, race: 'elf', outer: true, dist: 2 },
  mw: { strip: 'main', dir: -1, start: WEST_GAP_COL - 1, race: 'elf', outer: false, dist: 0, side: 'north' },
  ne: { strip: 'north', dir: 1, start: PLAZA_COL + 1, race: 'orc', outer: true, dist: 2 },
  me: { strip: 'main', dir: 1, start: EAST_COL0, race: 'orc', outer: false, dist: 0, side: 'north' },
  sw: { strip: 'main', dir: -1, start: WEST_GAP_COL - 1, race: 'undead', outer: false, dist: 0, side: 'south' },
  bw: { strip: 'south', dir: -1, start: PLAZA_COL - 1, race: 'undead', outer: true, dist: 2 },
  se: { strip: 'main', dir: 1, start: EAST_COL0, race: 'human', outer: false, dist: 0, side: 'south' },
  be: { strip: 'south', dir: 1, start: PLAZA_COL + 1, race: 'human', outer: true, dist: 2 },
};
export const WINGS = Object.keys(ARMS) as Wing[];

/** The two arms of each race's zone: [outer, side]. */
export const ZONE_ARMS: Readonly<Record<Race, readonly [Wing, Wing]>> = { elf: ['nw', 'mw'], orc: ['ne', 'me'], undead: ['bw', 'sw'], human: ['be', 'se'] };

/** How many columns an arm can take (the west ones stop at the edge of the map). */
export function armLimit(w: Wing): number {
  const a = ARMS[w];
  return a.dir < 0 ? a.start + 1 : 1000;
}

/** Column of an arm's k-th cell counting outwards from the hub. */
export function armCol(w: Wing, k: number): number {
  return ARMS[w].start + ARMS[w].dir * k;
}

export function stripIndex(strip: Strip): number {
  return STRIPS.indexOf(strip);
}

export function slotStrip(slot: number): Strip {
  return STRIPS[Math.max(0, Math.min(3, Math.floor(slot / ROW_BASE)))];
}

/** Building column of a slot. */
export function slotColumn(slot: number): number {
  return Math.floor((slot % ROW_BASE) / 2);
}

export function slotSide(slot: number): Side {
  return slot % 2 === 0 ? 'north' : 'south';
}

/** Arm a slot belongs to (by its row and which side of the square it is on). */
export function slotWing(slot: number): Wing {
  const strip = slotStrip(slot);
  const east = slotColumn(slot) > PLAZA_COL;
  const row = strip === 'north' ? 'n' : strip === 'main' ? (slotSide(slot) === 'north' ? 'm' : 's') : 'b';
  return `${row}${east ? 'e' : 'w'}` as Wing;
}

/** Slot of a cell (inverse of slotColumn / slotSide / slotStrip). */
export function cellSlot(col: number, side: Side, strip: Strip = 'main'): number {
  return stripIndex(strip) * ROW_BASE + col * 2 + (side === 'north' ? 0 : 1);
}

/** Top of a row. */
export function stripY(strip: Strip): number {
  return strip === 'north' ? NSTRIP_Y : strip === 'main' ? MAIN_Y : strip === 'south' ? SSTRIP_Y : BSTRIP_Y;
}

/** Rectangle (tiles) of one cell. */
export function cellRect(col: number, side: Side, strip: Strip = 'main'): TileRect {
  const y = stripY(strip) + (side === 'north' ? 0 : ROOM_H + CORRIDOR_H);
  return { x: col * COL_W, y, w: COL_W, h: ROOM_H };
}

export function slotRect(slot: number): TileRect {
  return cellRect(slotColumn(slot), slotSide(slot), slotStrip(slot));
}

/** Largest number of columns a project room can span. */
export const MAX_SPAN = 4;

/** Rectangle of a room anchored at `slot` that spans `span` columns eastwards on the same side of the corridor. */
export function roomRect(slot: number, span = 1): TileRect {
  const r = slotRect(slot);
  return { ...r, w: Math.max(1, span) * COL_W };
}

/** Slots (cells) covered by a room anchored at `slot` spanning `span` columns: slot, slot+2, slot+4... */
export function coveredSlots(slot: number, span = 1): number[] {
  const out: number[] = [];
  for (let k = 0; k < Math.max(1, span); k++) out.push(slot + k * 2);
  return out;
}

/** How far each arm reaches, in columns from its start (0 = nothing built there yet). */
export type Shape = Record<Wing, number>;

export function emptyShape(): Shape {
  return { nw: 0, ne: 0, mw: 0, me: 0, sw: 0, se: 0, bw: 0, be: 0 };
}

/** k of a column in an arm (negative = on the hub's side of its start). */
export function armIndex(w: Wing, col: number): number {
  return (col - ARMS[w].start) * ARMS[w].dir;
}

/** Shape of the building for a set of covered cells. */
export function shapeOf(slots: Iterable<number>): Shape {
  const s = emptyShape();
  for (const slot of slots) {
    const w = slotWing(slot);
    const k = armIndex(w, slotColumn(slot));
    if (k >= 0) s[w] = Math.min(armLimit(w), Math.max(s[w], k + 1));
  }
  return s;
}

export function shapeKey(s: Shape): string {
  return WINGS.map((w) => s[w]).join('|');
}

/**
 * Whether a row stands: the hub's row always, the others as soon as either zone of their half has a room (a zone's
 * outline always takes both its rows).
 */
export function hasStrip(s: Shape, strip: Strip): boolean {
  if (strip === 'north') return s.nw + s.mw + s.ne + s.me > 0;
  if (strip === 'south') return s.bw + s.sw + s.be + s.se > 0;
  // three rows: the fourth is never built
  return strip === 'main';
}

/** Whether there is a top row (elves and orcs) / a bottom row (undead and humans). */
export function hasNorth(s: Shape): boolean {
  return hasStrip(s, 'north');
}
export function hasBottom(s: Shape): boolean {
  return hasStrip(s, 'south');
}

/** The arms of a row: [west ones, east ones] (row 1 has two each side: one per side of its corridor). */
export function stripArms(strip: Strip): [Wing[], Wing[]] {
  const arms = WINGS.filter((w) => ARMS[w].strip === strip);
  return [arms.filter((w) => ARMS[w].dir < 0), arms.filter((w) => ARMS[w].dir > 0)];
}

/** Columns a row spans: [first, last + 1). */
export function stripCols(s: Shape, strip: Strip): [number, number] {
  const [ws, es] = stripArms(strip);
  const middle = strip === 'main';
  let x0 = middle ? WEST_GAP_COL : PLAZA_COL;
  let x1 = (middle ? EAST_GAP_COL : PLAZA_COL) + 1;
  // the zone outlines (zoneRects) square both of a zone's arms off at the outer end: so does the row
  for (const w of ws) {
    const z = zoneOuterCol(s, ARMS[w].race);
    if (z !== null) x0 = Math.min(x0, z);
    if (s[w]) x0 = Math.min(x0, armCol(w, s[w] - 1));
  }
  for (const e of es) {
    const z = zoneOuterCol(s, ARMS[e].race);
    if (z !== null) x1 = Math.max(x1, z + 1);
    if (s[e]) x1 = Math.max(x1, armCol(e, s[e] - 1) + 1);
  }
  return [x0, x1];
}

/** A row (tiles), or null when it isn't built. */
export function stripRect(s: Shape, strip: Strip): TileRect | null {
  if (!hasStrip(s, strip)) return null;
  const [x0, x1] = stripCols(s, strip);
  return { x: x0 * COL_W, y: stripY(strip), w: (x1 - x0) * COL_W, h: BUILDING_H };
}

/** Row 1, with the core (always built). */
export function mainRect(s: Shape): TileRect {
  return stripRect(s, 'main')!;
}
export function northRect(s: Shape): TileRect | null {
  return stripRect(s, 'north');
}
export function southRect(s: Shape): TileRect | null {
  return stripRect(s, 'south');
}
export function bottomRect(s: Shape): TileRect | null {
  return stripRect(s, 'bottom');
}

/** A row's corridor (tiles), or null. */
export function corridorRect(s: Shape, strip: Strip): TileRect | null {
  const r = stripRect(s, strip);
  return r ? { x: r.x, y: stripY(strip) + ROOM_H, w: r.w, h: CORRIDOR_H } : null;
}
export function northCorridorRect(s: Shape): TileRect | null {
  return corridorRect(s, 'north');
}
export function southCorridorRect(s: Shape): TileRect | null {
  return corridorRect(s, 'south');
}
export function bottomCorridorRect(s: Shape): TileRect | null {
  return corridorRect(s, 'bottom');
}

/** The hub (tiles): the four core halls and the square's column between them, on row 1. */
export function hubRect(): TileRect {
  return { x: CORE_COL0 * COL_W, y: MAIN_Y, w: (CORE_EAST_COL - CORE_COL0 + 1) * COL_W, h: BUILDING_H };
}

/**
 * Outermost column of a zone's block (both its rows squared off), or null when the zone has no block: the side arm
 * and the outer arm beyond its two hub columns end at the same column.
 */
function zoneOuterCol(s: Shape, race: Race): number | null {
  const [outer, side] = ZONE_ARMS[race];
  const dir = ARMS[outer].dir;
  const ends: number[] = [];
  if (s[side]) ends.push(armCol(side, s[side] - 1));
  if (s[outer] > (ARMS[outer].outer ? 2 : 0)) ends.push(armCol(outer, s[outer] - 1));
  if (!ends.length) return null;
  return dir < 0 ? Math.min(...ends) : Math.max(...ends);
}

/**
 * Outline of a race's zone (tiles): `block` covers its outer row and its side of row 1 (and the lawn between them)
 * from the hub's gap column out to the zone's end; `reach` is the outer row's two columns over / under the hub.
 * Either can be null. Row 1's corridor lies between the top and the bottom zones' blocks, in neither.
 */
export function zoneRects(s: Shape, race: Race): { block: TileRect | null; reach: TileRect | null } {
  const [outer, side] = ZONE_ARMS[race];
  const a = ARMS[outer];
  const top = a.strip === 'north';
  // the top zones down to row 1's corridor; the bottom zones from below it
  const y0 = top ? stripY('north') : stripY('main') + ROOM_H + CORRIDOR_H;
  const h = (top ? stripY('main') + ROOM_H : stripY('south') + BUILDING_H) - y0;
  const end = zoneOuterCol(s, race);
  let block: TileRect | null = null;
  if (end !== null) {
    const x0 = a.dir < 0 ? end : EAST_COL0;
    const x1 = a.dir < 0 ? WEST_GAP_COL : end + 1;
    block = { x: x0 * COL_W, y: y0, w: (x1 - x0) * COL_W, h };
  }
  const reach: TileRect | null = a.outer && (s[outer] || s[side]) ? { x: (a.dir < 0 ? WEST_GAP_COL : PLAZA_COL + 1) * COL_W, y: stripY(a.strip), w: 2 * COL_W, h: BUILDING_H } : null;
  return { block, reach };
}

/** Walkways down the square's column between two rows' corridors: [upper row, lower row]. */
export function walkways(s: Shape): [Strip, Strip][] {
  const out: [Strip, Strip][] = [];
  if (hasNorth(s)) out.push(['north', 'main']);
  if (hasBottom(s)) out.push(['main', 'south']);
  return out;
}

/** Everything that is built (tiles): the rows and the walkways between them. */
export function extentRect(s: Shape): TileRect {
  const rs = STRIPS.map((st) => stripRect(s, st)).filter((r): r is TileRect => !!r);
  const x0 = Math.min(...rs.map((r) => r.x));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y0 = Math.min(...rs.map((r) => r.y));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Size of the walk grid: always from (0, 0). */
export function gridSize(s: Shape): { w: number; h: number } {
  const x1 = Math.max(...STRIPS.map((st) => (hasStrip(s, st) ? stripCols(s, st)[1] : 0)));
  return { w: x1 * COL_W, h: hasBottom(s) ? SSTRIP_BOTTOM : MAIN_BOTTOM };
}

/** Whether a tile is inside the building of this shape (a row, or a walkway between two). */
export function insideShape(s: Shape, tx: number, ty: number): boolean {
  for (const st of STRIPS) {
    const r = stripRect(s, st);
    if (r && inRect(r, tx, ty)) return true;
  }
  const inPlazaCol = tx >= PLAZA_COL * COL_W && tx < (PLAZA_COL + 1) * COL_W;
  return inPlazaCol && walkways(s).some(([a, b]) => ty >= stripY(a) + BUILDING_H && ty < stripY(b));
}

/** One project cell of a zone, for the patios of empty cells. */
export interface Cell {
  slot: number;
  col: number;
  side: Side;
  strip: Strip;
  /** Outer end of its zone (the façade gets a corner cap there). */
  first: boolean;
  last: boolean;
}

/** Every cell inside a zone's outline (rooms or patios), for all four zones. */
export function cellsOf(s: Shape): Cell[] {
  const out: Cell[] = [];
  const seen = new Set<number>();
  const add = (col: number, side: Side, strip: Strip, first: boolean, last: boolean) => {
    const slot = cellSlot(col, side, strip);
    if (seen.has(slot)) return;
    seen.add(slot);
    out.push({ slot, col, side, strip, first, last });
  };
  for (const race of ['elf', 'orc', 'undead', 'human'] as const) {
    const { block, reach } = zoneRects(s, race);
    const [outer, side] = ZONE_ARMS[race];
    const west = ARMS[outer].dir < 0;
    if (block) {
      const c0 = block.x / COL_W;
      const c1 = c0 + block.w / COL_W;
      for (let col = c0; col < c1; col++)
        for (const [strip, sides] of [
          [ARMS[outer].strip, ['north', 'south']],
          [ARMS[side].strip, [ARMS[side].side!]],
        ] as const)
          for (const sd of sides) add(col, sd, strip, west && col === c0, !west && col === c1 - 1);
    }
    if (reach) {
      const c0 = reach.x / COL_W;
      for (let col = c0; col < c0 + 2; col++) for (const sd of ['north', 'south'] as const) add(col, sd, ARMS[outer].strip, false, false);
    }
  }
  return out;
}

export function rectPx(r: TileRect): { x: number; y: number; w: number; h: number } {
  return { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE };
}

export function inRect(r: TileRect, tx: number, ty: number): boolean {
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h;
}
