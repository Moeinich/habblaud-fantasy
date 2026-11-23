import { describe, expect, it } from 'vitest';
import { EAST_COL0, PLAZA_COL, WEST_GAP_COL } from '../constants';
import { packDepartments, type DeptRoom } from './departments';
import { ARMS, armCol, armIndex, armLimit, coveredSlots, slotColumn, slotSide, slotStrip, slotWing } from './geometry';

const r = (id: string, race: DeptRoom['race'], order: number, span = 1): DeptRoom => ({ id, race, span, order });

describe('race departments', () => {
  it('each race wraps round the hub in its own corner: elves top left, orcs top right, undead bottom left, humans bottom right', () => {
    const plan = packDepartments([r('e1', 'elf', 0), r('h1', 'human', 1), r('o1', 'orc', 2), r('u1', 'undead', 3)]);
    const at = (id: string) => {
      const t = plan.targets.get(id)!;
      return [slotWing(t.slot), slotColumn(t.slot), slotSide(t.slot)];
    };
    // the first room of a zone stands beside the hub on its own row, past the open gap column: the top zones on the
    // north side of the corridor, the bottom zones on the south side
    expect(at('e1')).toEqual(['mw', WEST_GAP_COL - 1, 'north']);
    expect(at('o1')).toEqual(['me', EAST_COL0, 'north']);
    expect(at('u1')).toEqual(['sw', WEST_GAP_COL - 1, 'south']);
    expect(at('h1')).toEqual(['se', EAST_COL0, 'south']);
    expect(plan.shape).toEqual({ nw: 0, ne: 0, mw: 1, me: 1, sw: 1, se: 1, bw: 0, be: 0 });
  });

  it('a zone starts beside the hub, then wraps up over it and grows outwards on both arms', () => {
    const plan = packDepartments(Array.from({ length: 12 }, (_, i) => r(`o${i}`, 'orc', i)));
    const first = Array.from({ length: 4 }, (_, i) => plan.targets.get(`o${i}`)!.slot);
    // two rooms out along the hub's row, then both sides of the outer row right over the hub
    expect(first.map(slotWing)).toEqual(['me', 'me', 'ne', 'ne']);
    expect(first.map((s) => armIndex(slotWing(s), slotColumn(s)))).toEqual([0, 1, 0, 0]);
    // the side arm leads, the outer row (two sides per column) follows: the zone stays an L
    expect(plan.shape.me).toBeGreaterThanOrEqual(plan.shape.ne);
    expect(plan.shape.ne).toBeGreaterThan(0);
  });

  it('wide rooms take several cells on their side and never overlap', () => {
    const rooms = [r('a', 'orc', 0, 3), r('b', 'orc', 1), r('c', 'orc', 2, 2), r('d', 'human', 3, 4), r('h', 'human', 4, 2), r('e', 'elf', 5, 2), r('f', 'elf', 6, 3), r('u', 'undead', 7, 2)];
    const plan = packDepartments(rooms);
    const cells = new Map<number, string>();
    for (const room of rooms) {
      const t = plan.targets.get(room.id)!;
      for (const c of coveredSlots(t.slot, t.span)) {
        expect(cells.has(c), `${room.id} overlaps ${cells.get(c)}`).toBe(false);
        // never in the square's column (the walkways run down it)
        expect(slotColumn(c)).not.toBe(PLAZA_COL);
        cells.set(c, room.id);
      }
    }
    // a wide west room still ends next to the hub: its last column is its arm's first
    const e = plan.targets.get('e')!;
    const w = slotWing(e.slot);
    expect(slotColumn(e.slot) + e.span - 1).toBe(armCol(w, 0) + (ARMS[w].dir < 0 ? 0 : e.span - 1));
  });

  it('elves that do not fit in the west join the orcs', () => {
    const cells = 2 * (armLimit('nw') + armLimit('mw'));
    const elves = Array.from({ length: cells + 1 }, (_, i) => r(`e${i}`, 'elf', i));
    const plan = packDepartments(elves);
    const last = plan.targets.get(`e${cells}`)!;
    expect(['ne', 'me']).toContain(slotWing(last.slot));
    expect(slotStrip(last.slot)).not.toBe('south');
  });
});
