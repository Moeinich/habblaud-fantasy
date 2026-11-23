import { describe, expect, it } from 'vitest';
import { CORE_COL0, EAST_COL0, PLAZA_COL, WEST_COLS } from '../constants';
import { packDepartments, type DeptRoom } from './departments';
import { coveredSlots, slotColumn, slotSide, slotWing, WALKWAY_SLOT } from './geometry';

const r = (id: string, race: DeptRoom['race'], order: number, span = 1): DeptRoom => ({ id, race, span, order });

describe('race departments', () => {
  it('humans go west from the core, orcs east from the square, elves to the north strip', () => {
    const plan = packDepartments([r('e1', 'elf', 0), r('h1', 'human', 1), r('o1', 'orc', 2), r('h2', 'human', 3), r('h3', 'human', 4), r('e2', 'elf', 5), r('e3', 'elf', 6)]);
    const at = (id: string) => {
      const t = plan.targets.get(id)!;
      return [slotWing(t.slot), slotColumn(t.slot), slotSide(t.slot)];
    };
    expect(at('h1')).toEqual(['west', CORE_COL0 - 1, 'north']);
    expect(at('h2')).toEqual(['west', CORE_COL0 - 1, 'south']);
    expect(at('h3')).toEqual(['west', CORE_COL0 - 2, 'north']);
    expect(at('o1')).toEqual(['east', EAST_COL0, 'north']);
    // the walkway comes up on the south side of the square's column: the south side starts one column later
    expect(at('e1')).toEqual(['north', PLAZA_COL, 'north']);
    expect(at('e2')).toEqual(['north', PLAZA_COL + 1, 'north']);
    expect(at('e3')).toEqual(['north', PLAZA_COL + 1, 'south']);
    expect(plan.shape).toEqual({ west: 2, east: 1, north: 2, south: 0 });
  });

  it('wide rooms take several cells on their side, never overlap and never cover the walkway', () => {
    const rooms = [r('a', 'orc', 0, 3), r('b', 'orc', 1), r('c', 'orc', 2, 2), r('d', 'human', 3, 4), r('h', 'human', 4, 2), r('e', 'elf', 5, 2), r('f', 'elf', 6, 3)];
    const plan = packDepartments(rooms);
    const cells = new Map<number, string>();
    for (const room of rooms) {
      const t = plan.targets.get(room.id)!;
      for (const c of coveredSlots(t.slot, t.span)) {
        expect(cells.has(c), `${room.id} overlaps ${cells.get(c)}`).toBe(false);
        expect(c).not.toBe(WALKWAY_SLOT);
        cells.set(c, room.id);
      }
    }
    // a wide west room still ends next to the core
    const d = plan.targets.get('d')!;
    expect(slotColumn(d.slot) + d.span - 1).toBe(CORE_COL0 - 1);
  });

  it('humans that do not fit in the west reserve join the far end of the east wing', () => {
    const humans = Array.from({ length: WEST_COLS * 2 + 1 }, (_, i) => r(`h${i}`, 'human', i));
    const plan = packDepartments([r('o', 'orc', -1), ...humans]);
    const last = plan.targets.get(`h${WEST_COLS * 2}`)!;
    expect(slotWing(last.slot)).toBe('east');
  });
});
