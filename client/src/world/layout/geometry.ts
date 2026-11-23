// Building geometry: cells ("slots") of the four wings, rectangles and the shape of the building. Pure.
//
// Three strips: the main one (human wing west of the core, orc wing east of the square), the north strip (elf
// wing, from the square's column eastwards, reached by a covered walkway north from the square) and the south
// strip across the street (undead wing, from the square's column westwards, reached by a walkway south).
//
// A slot is one room-sized cell, on the north or south side of a corridor:
//   - east (orc) wing, main strip:   slot >= 0           column EAST_COL0 + floor(slot / 2)
//   - west (human) wing, main strip: slot < 0            column CORE_COL0 - 1 - floor((-slot - 1) / 2)
//   - north strip, east (elf):       slot >= NORTH_SLOT0 column PLAZA_COL + floor((slot - NORTH_SLOT0) / 2)
//   - south strip (undead):          slot <= SOUTH_SLOT0 column PLAZA_COL - 1 - floor((SOUTH_SLOT0 - slot) / 2)
// In every wing, slot + 2 is the cell one column further east on the same side, so a room anchored at `slot`
// spanning `span` columns covers slot, slot + 2, ... (its anchor is its westmost cell).
import {
  BUILDING_H,
  COL_W,
  CORE_COL0,
  CORRIDOR_H,
  EAST_COL0,
  MAIN_BOTTOM,
  MAIN_Y,
  NORTH_Y,
  NSOUTH_Y,
  NSTRIP_Y,
  PLAZA_COL,
  ROOM_H,
  SCORRIDOR_Y,
  SOUTH_Y,
  SSOUTH_Y,
  SSTRIP_BOTTOM,
  SSTRIP_Y,
  TILE,
  WEST_COLS,
} from '../constants';
import type { TileRect } from './types';

export type Side = 'north' | 'south';
export type Strip = 'main' | 'north' | 'south';
export type Wing = 'west' | 'east' | 'north' | 'south';

/** First slot of the north strip (elf), and of the south strip (undead, counting down). */
export const NORTH_SLOT0 = 100_000;
export const SOUTH_SLOT0 = -100_000;

export function slotWing(slot: number): Wing {
  return slot >= NORTH_SLOT0 ? 'north' : slot <= SOUTH_SLOT0 ? 'south' : slot < 0 ? 'west' : 'east';
}

export function slotStrip(slot: number): Strip {
  return slot >= NORTH_SLOT0 ? 'north' : slot <= SOUTH_SLOT0 ? 'south' : 'main';
}

/** Building column of a slot. */
export function slotColumn(slot: number): number {
  if (slot >= NORTH_SLOT0) return PLAZA_COL + Math.floor((slot - NORTH_SLOT0) / 2);
  if (slot <= SOUTH_SLOT0) return PLAZA_COL - 1 - Math.floor((SOUTH_SLOT0 - slot) / 2);
  if (slot < 0) return CORE_COL0 - 1 - Math.floor((-slot - 1) / 2);
  return EAST_COL0 + Math.floor(slot / 2);
}

export function slotSide(slot: number): Side {
  const n = slot <= SOUTH_SLOT0 ? SOUTH_SLOT0 - slot : slot < 0 ? -slot - 1 : slot >= NORTH_SLOT0 ? slot - NORTH_SLOT0 : slot;
  return n % 2 === 0 ? 'north' : 'south';
}

/** Slot of a cell (inverse of slotColumn / slotSide / slotStrip). */
export function cellSlot(col: number, side: Side, strip: Strip = 'main'): number {
  const bit = side === 'north' ? 0 : 1;
  if (strip === 'north') return NORTH_SLOT0 + (col - PLAZA_COL) * 2 + bit;
  if (strip === 'south') return SOUTH_SLOT0 - ((PLAZA_COL - 1 - col) * 2 + bit);
  if (col < CORE_COL0) return -((CORE_COL0 - 1 - col) * 2 + bit + 1);
  return (col - EAST_COL0) * 2 + bit;
}

/** The north strip's south cell at the square is the covered walkway, never a room. */
export const WALKWAY_SLOT = cellSlot(PLAZA_COL, 'south', 'north');

/** Rectangle (tiles) of one cell. */
export function cellRect(col: number, side: Side, strip: Strip = 'main'): TileRect {
  const y = strip === 'north' ? (side === 'north' ? NSTRIP_Y : NSOUTH_Y) : strip === 'south' ? (side === 'north' ? SSTRIP_Y : SSOUTH_Y) : side === 'north' ? NORTH_Y : SOUTH_Y;
  return { x: col * COL_W, y, w: COL_W, h: ROOM_H };
}

export function slotRect(slot: number): TileRect {
  return cellRect(slotColumn(slot), slotSide(slot), slotStrip(slot));
}

/** Top of the strip a slot is in. */
export function stripY(strip: Strip): number {
  return strip === 'north' ? NSTRIP_Y : strip === 'south' ? SSTRIP_Y : MAIN_Y;
}

/** Largest number of columns a project room can span. */
export const MAX_SPAN = 4;

/**
 * Rectangle of a room anchored at `slot` that spans `span` columns eastwards on the same side of the corridor
 * (a busy room grows into the neighbouring cells).
 */
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

/** How far each wing reaches, in columns (`north`: the elf strip, `south`: the undead strip; 0 = no such strip). */
export interface Shape {
  west: number;
  east: number;
  north: number;
  south: number;
}

/** Westmost reach of the south strip, in columns west of the square's column. */
export const SOUTH_COLS = PLAZA_COL - 1;

/** Shape of the building for a set of covered cells (at least one east column, like before). */
export function shapeOf(slots: Iterable<number>): Shape {
  const s: Shape = { west: 0, east: 1, north: 0, south: 0 };
  for (const slot of slots) {
    const col = slotColumn(slot);
    const wing = slotWing(slot);
    if (wing === 'west') s.west = Math.min(WEST_COLS, Math.max(s.west, CORE_COL0 - col));
    else if (wing === 'east') s.east = Math.max(s.east, col - EAST_COL0 + 1);
    else if (wing === 'south') s.south = Math.min(SOUTH_COLS, Math.max(s.south, PLAZA_COL - col));
    else s.north = Math.max(s.north, col - PLAZA_COL + 1);
  }
  return s;
}

export function shapeKey(s: Shape): string {
  return `${s.west}|${s.east}|${s.north}|${s.south}`;
}

/** Whether there is a north (elf) strip. */
export function hasNorth(s: Shape): boolean {
  return s.north > 0;
}

/** Whether there is a south (undead) strip. */
export function hasSouth(s: Shape): boolean {
  return s.south > 0;
}

/** Main strip (tiles): from the west end of the human wing to the east end of the orc wing. */
export function mainRect(s: Shape): TileRect {
  const x0 = (CORE_COL0 - s.west) * COL_W;
  return { x: x0, y: MAIN_Y, w: (EAST_COL0 + s.east) * COL_W - x0, h: BUILDING_H };
}

/** North strip (tiles), from the square's column eastwards, or null. */
export function northRect(s: Shape): TileRect | null {
  return hasNorth(s) ? { x: PLAZA_COL * COL_W, y: NSTRIP_Y, w: s.north * COL_W, h: BUILDING_H } : null;
}

/** South strip (tiles), from the square's column (where its walkway arrives) westwards, or null. */
export function southRect(s: Shape): TileRect | null {
  return hasSouth(s) ? { x: (PLAZA_COL - s.south) * COL_W, y: SSTRIP_Y, w: (s.south + 1) * COL_W, h: BUILDING_H } : null;
}

/** Everything that is built (tiles): the strips and the walkways between them. */
export function extentRect(s: Shape): TileRect {
  const rs = [mainRect(s), northRect(s), southRect(s)].filter((r): r is TileRect => !!r);
  const x0 = Math.min(...rs.map((r) => r.x));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y0 = Math.min(...rs.map((r) => r.y));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Size of the walk grid: always from (0, 0), so the west reserve and the north strip fit. */
export function gridSize(s: Shape): { w: number; h: number } {
  return { w: (EAST_COL0 + s.east) * COL_W, h: hasSouth(s) ? SSTRIP_BOTTOM : MAIN_BOTTOM };
}

/** Corridor of the south strip (tiles), or null. */
export function southCorridorRect(s: Shape): TileRect | null {
  const r = southRect(s);
  return r ? { x: r.x, y: SCORRIDOR_Y, w: r.w, h: CORRIDOR_H } : null;
}

/** Corridor of the north strip (tiles), or null. */
export function northCorridorRect(s: Shape): TileRect | null {
  const n = northRect(s);
  return n ? { x: n.x, y: NSTRIP_Y + ROOM_H, w: n.w, h: CORRIDOR_H } : null;
}

/** Whether a tile is inside the building of this shape (either strip or the walkway). */
export function insideShape(s: Shape, tx: number, ty: number): boolean {
  if (inRect(mainRect(s), tx, ty)) return true;
  const inPlazaCol = tx >= PLAZA_COL * COL_W && tx < (PLAZA_COL + 1) * COL_W;
  const n = northRect(s);
  if (n && (inRect(n, tx, ty) || (inPlazaCol && ty >= n.y + n.h && ty < MAIN_Y))) return true;
  const so = southRect(s);
  return !!so && (inRect(so, tx, ty) || (inPlazaCol && ty >= MAIN_BOTTOM && ty < so.y));
}

/** One project cell of the building, for the patios of empty cells. */
export interface Cell {
  slot: number;
  col: number;
  side: Side;
  strip: Strip;
  /** West / east end of its strip (the façade gets a corner cap there). */
  first: boolean;
  last: boolean;
}

/** All project cells of the building (west and east wings, north and south strips), the walkway cell excluded. */
export function cellsOf(s: Shape): Cell[] {
  const out: Cell[] = [];
  const westEnd = CORE_COL0 - s.west;
  const eastEnd = EAST_COL0 + s.east - 1;
  for (const side of ['north', 'south'] as const) {
    for (let col = westEnd; col < CORE_COL0; col++) out.push({ slot: cellSlot(col, side), col, side, strip: 'main', first: col === westEnd, last: false });
    for (let col = EAST_COL0; col <= eastEnd; col++) out.push({ slot: cellSlot(col, side), col, side, strip: 'main', first: false, last: col === eastEnd });
    for (let col = PLAZA_COL; col < PLAZA_COL + s.north; col++) {
      const slot = cellSlot(col, side, 'north');
      if (slot === WALKWAY_SLOT) continue;
      out.push({ slot, col, side, strip: 'north', first: col === PLAZA_COL, last: col === PLAZA_COL + s.north - 1 });
    }
    for (let col = PLAZA_COL - s.south; col < PLAZA_COL; col++) out.push({ slot: cellSlot(col, side, 'south'), col, side, strip: 'south', first: col === PLAZA_COL - s.south, last: false });
  }
  return out;
}

export function rectPx(r: TileRect): { x: number; y: number; w: number; h: number } {
  return { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE };
}

export function inRect(r: TileRect, tx: number, ty: number): boolean {
  return tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h;
}
