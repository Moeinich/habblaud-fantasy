// Departments (pure): project rooms are grouped by race into four wings that branch off the square next to the
// core — the human wing runs west along the main corridor, the orc wing east, the night-elf wing has its own
// strip to the north (reached by a covered walkway from the square) and the undead have theirs to the south,
// across the street (a walkway crosses it). Inside a wing, rooms keep their arrival
// order and fill the north and south sides of the wing's corridor evenly, starting next to the square; a room
// that spans several columns takes that many cells on its side. Each wing's corridor gets the race's carpet.
import type { Race } from '../../../../shared/race';
import { CORE_COL0, EAST_COL0, PLAZA_COL, WEST_COLS } from '../constants';
import { cellSlot, SOUTH_COLS, type Shape, type Side, type Wing } from './geometry';

/** Race that lives in each wing. */
export const WING_RACE: Readonly<Record<Wing, Race>> = { west: 'human', east: 'orc', north: 'elf', south: 'undead' };
export const RACE_WING: Readonly<Record<Race, Wing>> = { human: 'west', orc: 'east', elf: 'north', undead: 'south' };

export interface DeptRoom {
  id: string;
  race: Race;
  span: number;
  /** Arrival order (lower first). */
  order: number;
}

export interface Placement {
  slot: number;
  span: number;
}

export interface DeptPlan {
  targets: Map<string, Placement>;
  /** Columns each wing needs once every room is in place. */
  shape: Shape;
}

const byOrder = (a: DeptRoom, b: DeptRoom) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Target placement of every room, wing by wing. */
export function packDepartments(rooms: readonly DeptRoom[]): DeptPlan {
  const targets = new Map<string, Placement>();
  const shape: Shape = { west: 0, east: 1, north: 0, south: 0 };
  const of = (race: Race) => rooms.filter((r) => r.race === race).sort(byOrder);

  // west: from the core outwards; whatever doesn't fit in the reserve joins the east wing at its far end
  const fill: Record<Side, number> = { north: 0, south: 0 };
  const spill: DeptRoom[] = [];
  for (const r of of('human')) {
    const span = Math.max(1, r.span);
    const side: Side = fill.north <= fill.south ? 'north' : 'south';
    if (fill[side] + span > WEST_COLS) {
      spill.push(r);
      continue;
    }
    targets.set(r.id, { slot: cellSlot(CORE_COL0 - fill[side] - span, side), span });
    fill[side] += span;
    shape.west = Math.max(shape.west, fill[side]);
  }

  // east: from the square outwards
  fill.north = 0;
  fill.south = 0;
  for (const r of [...of('orc'), ...spill]) {
    const span = Math.max(1, r.span);
    const side: Side = fill.north <= fill.south ? 'north' : 'south';
    targets.set(r.id, { slot: cellSlot(EAST_COL0 + fill[side], side), span });
    fill[side] += span;
    shape.east = Math.max(shape.east, fill[side]);
  }

  // south strip: the undead, from the walkway's column westwards; whoever doesn't fit joins the elves
  fill.north = 0;
  fill.south = 0;
  const spillNorth: DeptRoom[] = [];
  for (const r of of('undead')) {
    const span = Math.max(1, r.span);
    const side: Side = fill.north <= fill.south ? 'north' : 'south';
    if (fill[side] + span > SOUTH_COLS) {
      spillNorth.push(r);
      continue;
    }
    targets.set(r.id, { slot: cellSlot(PLAZA_COL - fill[side] - span, side, 'south'), span });
    fill[side] += span;
    shape.south = Math.max(shape.south, fill[side]);
  }

  // north strip, from the square's column eastwards: the south side starts one column later (the walkway comes up there)
  fill.north = 0;
  fill.south = 1;
  for (const r of [...of('elf'), ...spillNorth]) {
    const span = Math.max(1, r.span);
    const side: Side = fill.north <= fill.south ? 'north' : 'south';
    targets.set(r.id, { slot: cellSlot(PLAZA_COL + fill[side], side, 'north'), span });
    fill[side] += span;
    shape.north = Math.max(shape.north, fill[side]);
  }
  return { targets, shape };
}

/** Corridor carpet per wing: [pile, woven motif, runner (also picks the rug look), threshold band]. */
export const DEPT_CARPET: Readonly<Record<Race, { pile: string; motif: string; runner: string; band: string }>> = {
  human: { pile: '#34405a', motif: '#8a7438', runner: '#3d5a8c', band: '#c8a040' },
  orc: { pile: '#4a3226', motif: '#7a5a34', runner: '#9c4a30', band: '#a8742c' },
  elf: { pile: '#3a2e46', motif: '#4c7a72', runner: '#74407e', band: '#5ab4a8' },
  undead: { pile: '#2a2230', motif: '#5a3a72', runner: '#3e2650', band: '#e07a2a' },
};

/** Carpet of the core columns. */
export const CORE_CARPET = { pile: '#3e3a40', motif: '#6a5a44' };
