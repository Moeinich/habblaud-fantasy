// Departments (pure): project rooms are grouped by race into the four zones of the pinwheel round the hub
// (layout/geometry.ts) — night elves top left, orcs top right, undead bottom left, humans bottom right. A zone is an
// L of two arms (the outer row, which reaches in over the hub, and the side row beside the hub), each with a north
// and a south side: four lanes. Rooms keep their arrival order; each goes to the lane where it ends up nearest the
// hub, so a zone first wraps round the hub and then grows outwards. A room that spans several columns takes that
// many cells of its lane. West zones are bounded by the map's edge; whoever doesn't fit there joins the zone on
// the other side of the same half (elves -> orcs, undead -> humans). Each zone's corridors get the race's carpet.
import type { Race } from '../../../../shared/race';
import { ARMS, armCol, armLimit, emptyShape, cellSlot, ZONE_ARMS, type Shape, type Side, type Wing } from './geometry';

/** Race that lives in each arm. */
export const WING_RACE: Readonly<Record<Wing, Race>> = { nw: 'elf', mw: 'elf', nwr: 'elf', ne: 'orc', me: 'orc', ner: 'orc', sw: 'undead', bw: 'undead', bwr: 'undead', se: 'human', be: 'human', ber: 'human' };

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
  /** Columns each arm needs once every room is in place. */
  shape: Shape;
}

const byOrder = (a: DeptRoom, b: DeptRoom) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Where the zone across the same half sends whoever doesn't fit (the west zones are bounded). */
const SPILL: Partial<Record<Race, Race>> = { elf: 'orc', undead: 'human' };

/** Target placement of every room, zone by zone. */
export function packDepartments(rooms: readonly DeptRoom[]): DeptPlan {
  const targets = new Map<string, Placement>();
  const shape = emptyShape();
  const fill = new Map<string, number>();
  const spilled: Record<Race, DeptRoom[]> = { elf: [], orc: [], undead: [], human: [] };
  for (const race of ['elf', 'undead', 'orc', 'human'] as const) {
    const queue = [...rooms.filter((r) => r.race === race), ...spilled[race]].sort(byOrder);
    for (const r of queue) {
      const span = Math.max(1, r.span);
      let best: { w: Wing; side: Side; reach: number } | null = null;
      // (the outer rows' columns over the hub stay free: the rows sit flush, so rooms there would press against the
      // core halls)
      for (const w of ZONE_ARMS[race]) {
        const dist = ARMS[w].dist;
        // the outer row's side nearest the hub's row first (right above / below the side arm)
        const near: Side = ARMS[w].strip === 'north' ? 'south' : 'north';
        for (const side of ARMS[w].side ? [ARMS[w].side] : [near, near === 'north' ? ('south' as const) : ('north' as const)]) {
          const f = fill.get(`${w}${side}`) ?? 0;
          if (f + span > armLimit(w)) continue;
          const reach = dist + f + span;
          if (!best || reach < best.reach) best = { w, side, reach };
        }
      }
      if (!best) {
        const to = SPILL[race];
        if (to) spilled[to].push(r);
        continue;
      }
      const key = `${best.w}${best.side}`;
      const f = fill.get(key) ?? 0;
      const col = ARMS[best.w].dir < 0 ? armCol(best.w, f + span - 1) : armCol(best.w, f);
      targets.set(r.id, { slot: cellSlot(col, best.side, ARMS[best.w].strip), span });
      fill.set(key, f + span);
      shape[best.w] = Math.max(shape[best.w], f + span);
    }
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
