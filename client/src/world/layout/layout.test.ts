import { describe, expect, it } from 'vitest';
import { FURNITURE, TILE, type FurnitureKind, type RoomTheme } from '../../art/api';
import { COL_W, CORE_COL0, CORRIDOR_H, CORRIDOR_Y, EAST_COL0, MAIN_BOTTOM, NORTH_Y, PLAZA_COL, ROOM_H, SOUTH_Y } from '../constants';
import { assembleBuilding, coreAreas } from './building';
import { cellSlot, cellsOf, coveredSlots, mainRect, NORTH_SLOT0, shapeOf, slotColumn, slotRect, slotSide, slotStrip, slotWing, stripY, WALKWAY_SLOT } from './geometry';
import { layoutProjectRoom, roomVariant } from './room';
import { layoutExterior, slotShell } from './exterior';
import { RECEPTION_ID } from './core';
import type { AreaLayout } from './types';

const theme: RoomTheme = {
  carpet: '#4f6d8f',
  carpet2: '#486685',
  wall: { base: '#e6e2da', trim: '#9a8f80', pattern: 'plain' },
  accent: '#3f7fd8',
  deskVariant: 'wood',
  chairVariant: 'black',
};

function roomsFor(slots: number[]): AreaLayout[] {
  return slots.map((slot) => layoutProjectRoom({ id: `/proj/${slot}`, slot, seed: 1000 + slot * 77 }, theme));
}

describe('slot mapping', () => {
  it('east wing from the square, west wing from the core outwards, north strip from the square', () => {
    expect(slotColumn(0)).toBe(EAST_COL0);
    expect(slotColumn(1)).toBe(EAST_COL0);
    expect(slotColumn(2)).toBe(EAST_COL0 + 1);
    expect(slotColumn(7)).toBe(EAST_COL0 + 3);
    expect(slotColumn(-1)).toBe(CORE_COL0 - 1);
    expect(slotColumn(-2)).toBe(CORE_COL0 - 1);
    expect(slotColumn(-3)).toBe(CORE_COL0 - 2);
    expect(slotColumn(NORTH_SLOT0)).toBe(PLAZA_COL);
    expect(slotSide(0)).toBe('north');
    expect(slotSide(1)).toBe('south');
    expect(slotSide(-1)).toBe('north');
    expect(slotSide(-2)).toBe('south');
    expect(slotSide(NORTH_SLOT0 + 3)).toBe('south');
    expect([0, 1, -1, -4, NORTH_SLOT0 + 5].map(slotWing)).toEqual(['east', 'east', 'west', 'west', 'north']);
    for (const slot of [0, 1, 9, -1, -2, -7, NORTH_SLOT0, NORTH_SLOT0 + 5]) expect(cellSlot(slotColumn(slot), slotSide(slot), slotStrip(slot))).toBe(slot);
    // slot + 2 is always one column further east
    for (const slot of [0, -3, NORTH_SLOT0 + 1]) expect(slotColumn(slot + 2)).toBe(slotColumn(slot) + 1);
  });

  it('room rectangles respect the corridor of their strip', () => {
    const a = slotRect(0);
    const b = slotRect(1);
    expect(a).toEqual({ x: EAST_COL0 * COL_W, y: NORTH_Y, w: COL_W, h: 12 });
    expect(b.y).toBe(SOUTH_Y);
    expect(a.y + a.h).toBe(CORRIDOR_Y);
    expect(b.y + b.h).toBe(MAIN_BOTTOM);
    const n = slotRect(NORTH_SLOT0 + 2);
    expect(n.y + n.h + CORRIDOR_H).toBe(slotRect(NORTH_SLOT0 + 3).y);
  });

  it('shape: how far each wing reaches (at least one east column)', () => {
    expect(shapeOf([])).toEqual({ west: 0, east: 1, north: 0, south: 0 });
    expect(shapeOf([0, 1])).toEqual({ west: 0, east: 1, north: 0, south: 0 });
    expect(shapeOf([5])).toEqual({ west: 0, east: 3, north: 0, south: 0 });
    expect(shapeOf([-3, -1])).toEqual({ west: 2, east: 1, north: 0, south: 0 });
    expect(shapeOf([NORTH_SLOT0 + 2])).toEqual({ west: 0, east: 1, north: 2, south: 0 });
  });
});

describe('building layout', () => {
  const slots = [0, 1, 2, 3, 4, 7, -1, -2, -3, NORTH_SLOT0, NORTH_SLOT0 + 2, NORTH_SLOT0 + 3];
  const rooms = roomsFor(slots);
  const shape = shapeOf(slots);
  const b = assembleBuilding(shape, rooms);
  const reception = coreAreas().find((a) => a.id === RECEPTION_ID)!;
  const elevator = reception.spots.find((s) => s.kind === 'elevator')!;
  const reach = b.grid.reachableFrom(elevator.tx, elevator.ty);
  const reachable = (x: number, y: number) => reach[y * b.grid.w + x] === 1;

  it('has two elevators with walkable approach tiles', () => {
    const elevators = reception.spots.filter((s) => s.kind === 'elevator');
    expect(elevators).toHaveLength(2);
    for (const e of elevators) expect(b.grid.walkable(e.tx, e.ty)).toBe(true);
  });

  it('every spot can be reached from the elevators', () => {
    const unreachable = b.spots.filter((s) => !reachable(s.tx, s.ty)).map((s) => s.id);
    expect(unreachable).toEqual([]);
  });

  it('the doors connect each room to the corridor', () => {
    for (const room of rooms) {
      const door = room.door!;
      expect(door).toBeDefined();
      for (let x = door.x; x < door.x + door.w; x++) {
        for (let y = door.y; y < door.y + door.h; y++) expect(b.grid.walkable(x, y)).toBe(true);
        // corridor tile right outside the door
        const outside = room.side === 'north' ? door.y + door.h : door.y - 1;
        const cy = room.rect.y < CORRIDOR_Y - ROOM_H ? stripY('north') + ROOM_H : CORRIDOR_Y;
        expect(outside >= cy && outside < cy + CORRIDOR_H).toBe(true);
        expect(reachable(x, outside)).toBe(true);
      }
      // the whole interior (except furniture) is reachable
      const r = room.rect;
      for (let y = r.y + 2; y < r.y + 11; y++)
        for (let x = r.x + 1; x < r.x + 15; x++) if (b.grid.walkable(x, y)) expect(reachable(x, y)).toBe(true);
    }
  });

  it('each room has 6 desks, at least 4 extra seats, a light switch and a board', () => {
    for (const room of rooms) {
      const desks = room.spots.filter((s) => s.kind === 'desk');
      expect(desks).toHaveLength(6);
      expect(new Set(desks.map((d) => d.rank))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
      expect(desks.filter((d) => d.side === 'N')).toHaveLength(3);
      expect(room.spots.filter((s) => s.kind === 'stool' || s.kind === 'nook').length).toBeGreaterThanOrEqual(4);
      expect(room.spots.filter((s) => s.kind === 'stand').length).toBeGreaterThanOrEqual(3);
      expect(room.spots.filter((s) => s.kind === 'switch')).toHaveLength(1);
      expect(room.wallItems.some((w) => w.kind === 'whiteboard')).toBe(true);
      expect(room.wallItems.some((w) => w.kind === 'sign')).toBe(true);
      expect(room.wallItems.some((w) => w.kind === 'light_switch')).toBe(true);
      for (const d of desks) expect(room.furniture.some((f) => f.id === d.deskId)).toBe(true);
    }
  });

  it('blocking furniture does not overlap and stays inside the area', () => {
    for (const area of [...b.core, b.corridor, ...rooms]) {
      const used = new Map<string, string>();
      for (const f of area.furniture) {
        const def = FURNITURE[f.kind];
        expect(def.mount).toBe('floor');
        for (let y = f.ty; y < f.ty + def.footprint.h; y++) {
          for (let x = f.tx; x < f.tx + def.footprint.w; x++) {
            expect(x >= area.rect.x && x < area.rect.x + area.rect.w && y >= area.rect.y && y < area.rect.y + area.rect.h).toBe(true);
            const key = `${x},${y}`;
            if (def.blocks) {
              expect(used.get(key), `${f.id} sobre ${used.get(key)}`).toBeUndefined();
              used.set(key, f.id);
            }
          }
        }
      }
      for (const w of area.wallItems) expect(FURNITURE[w.kind].mount).toBe('wall');
    }
  });

  it('spots have unique ids', () => {
    const ids = b.spots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('talk and ping-pong spots come in pairs', () => {
    const groups = new Map<string, number>();
    for (const s of b.spots) if (s.group && (s.kind === 'talk' || s.kind === 'pingpong')) groups.set(s.group, (groups.get(s.group) ?? 0) + 1);
    for (const [, n] of groups) expect(n).toBe(2);
  });

  it('the corridor alternates water coolers and benches in project columns, without too many plants', () => {
    const cols = shape.west + shape.east;
    const coolers = b.corridor.furniture.filter((f) => f.kind === 'water_cooler');
    expect(coolers.length).toBeGreaterThanOrEqual(Math.floor(cols / 2));
    const benches = b.corridor.furniture.filter((f) => f.kind === 'bench');
    expect(benches.length).toBeGreaterThanOrEqual(Math.floor(cols / 2));
    const plants = b.corridor.furniture.filter((f) => f.kind === 'plant_tall' || f.kind === 'plant_small');
    expect(plants.length).toBeLessThanOrEqual((cols + 3) * 2);
  });

  it('the exterior and the patios cover the building', () => {
    const ext = layoutExterior(shape);
    const m = mainRect(shape);
    expect(ext.bounds.x).toBeLessThan(m.x);
    expect(ext.bounds.x + ext.bounds.w).toBeGreaterThan(m.x + m.w);
    expect(ext.bounds.y).toBeLessThan(0);
    const cells = cellsOf(shape);
    expect(cells.some((c) => c.slot === WALKWAY_SLOT)).toBe(false);
    const cell = cells.find((c) => c.slot === 5)!;
    const shell = slotShell(cell);
    expect(shell.walls.length).toBeGreaterThan(0);
    expect(shell.props.every((p) => p.slot === 5)).toBe(true);
  });
});

/** Tall floor furniture that hides whatever hangs on the wall right behind it. */
const TALL_FLOOR = new Set<FurnitureKind>(['plant_tall', 'bookshelf', 'binder_shelf', 'fridge', 'vending_machine', 'arcade', 'water_cooler', 'floor_lamp', 'toilet_stall']);
const WALL_DECOR = new Set<FurnitureKind>(['painting', 'poster', 'window', 'tv', 'whiteboard', 'sign', 'clock', 'mirror', 'door_frame']);

/** Decorative wall items with a tall piece of furniture standing in front of them (ids). */
function hiddenWallItems(area: AreaLayout): string[] {
  const out: string[] = [];
  for (const w of area.wallItems) {
    if (w.on !== 'face' || !WALL_DECOR.has(w.kind)) continue;
    const half = (FURNITURE[w.kind].footprint.w * TILE) / 2 - 2;
    const wy = w.baseY / TILE;
    for (const f of area.furniture) {
      if (!TALL_FLOOR.has(f.kind) || f.ty !== wy) continue;
      const fx0 = f.tx * TILE + (f.dx ?? 0);
      const fx1 = fx0 + FURNITURE[f.kind].footprint.w * TILE;
      if (fx0 < w.cx + half && fx1 > w.cx - half) out.push(`${w.id} behind ${f.id}`);
    }
  }
  return out;
}

describe('project room variations', () => {
  const seeds = Array.from({ length: 90 }, (_, i) => (i * 7919 + 13) >>> 0);

  it('every variation is valid: no overlap, everything reachable, enough seats', () => {
    for (const slot of [0, 1]) {
      for (const seed of seeds) {
        const room = layoutProjectRoom({ id: `/v/${seed}`, slot, seed }, theme);
        const b = assembleBuilding(shapeOf([slot]), [room]);
        const used = new Map<string, string>();
        for (const f of room.furniture) {
          const def = FURNITURE[f.kind];
          for (let y = f.ty; y < f.ty + def.footprint.h; y++)
            for (let x = f.tx; x < f.tx + def.footprint.w; x++) {
              expect(x >= room.rect.x + 1 && x < room.rect.x + 15 && y >= room.rect.y + 2 && y < room.rect.y + 11, `${f.id} off the floor`).toBe(true);
              if (!def.blocks) continue;
              expect(used.get(`${x},${y}`), `${f.id} sobre ${used.get(`${x},${y}`)}`).toBeUndefined();
              used.set(`${x},${y}`, f.id);
            }
        }
        const door = room.door!;
        const reach = b.grid.reachableFrom(door.x, door.y);
        for (const sp of room.spots) expect(reach[sp.ty * b.grid.w + sp.tx], `${sp.id} unreachable (seed ${seed})`).toBe(1);
        const r = room.rect;
        for (let y = r.y + 2; y < r.y + 11; y++)
          for (let x = r.x + 1; x < r.x + 15; x++) if (b.grid.walkable(x, y)) expect(reach[y * b.grid.w + x], `tile ${x},${y} isolado (semente ${seed})`).toBe(1);
        expect(room.spots.filter((sp) => sp.kind === 'desk')).toHaveLength(6);
        expect(room.spots.filter((sp) => sp.kind === 'stool' || sp.kind === 'nook').length).toBeGreaterThanOrEqual(4);
        // usable spots must not land on blocking furniture
        for (const sp of room.spots) expect(b.grid.walkable(sp.tx, sp.ty), `${sp.id} on furniture`).toBe(true);
        expect(hiddenWallItems(room)).toEqual([]);
      }
    }
  });

  it('rooms are not all the same: mirroring, meeting corner and corners vary', () => {
    const vs = seeds.map(roomVariant);
    expect(new Set(vs.map((v) => v.mirror)).size).toBe(2);
    expect(new Set(vs.map((v) => v.meeting)).size).toBe(3);
    expect(new Set(vs.map((v) => v.left)).size).toBeGreaterThan(1);
    expect(new Set(vs.map((v) => v.right)).size).toBeGreaterThan(1);
    // the floor is porcelain (tiles are for the restroom) with a light room tint
    const room = layoutProjectRoom({ id: '/v/x', slot: 0, seed: 42 }, theme);
    expect(room.floors.every((f) => f.kind !== 'tile_white')).toBe(true);
    expect(room.floorTint).toBe(theme.carpet);
  });
});

describe('wall items', () => {
  it('boards, windows, TV, plates and mirrors are not behind tall furniture', () => {
    for (const area of [...coreAreas(), ...roomsFor([0, 1, 2, 3, 4, 7])]) expect(hiddenWallItems(area), area.id).toEqual([]);
  });

  it('passages in wall faces have a door frame', () => {
    const restroom = coreAreas().find((a) => a.kind === 'restroom')!;
    expect(restroom.wallItems.some((w) => w.kind === 'door_frame')).toBe(true);
    for (const room of roomsFor([1, 3, 7])) expect(room.wallItems.some((w) => w.kind === 'door_frame'), room.id).toBe(true);
  });
});

describe('rooms that span several columns', () => {
  it('each extra column adds 6 desks and a door; the base spots keep their ids', () => {
    for (const seed of [3, 1000, 4242, 77777]) {
      const one = layoutProjectRoom({ id: '/w', slot: 2, seed }, theme);
      for (const span of [2, 3, 4]) {
        const wide = layoutProjectRoom({ id: '/w', slot: 2, seed, span }, theme);
        expect(wide.rect.w).toBe(span * COL_W);
        expect(wide.spots.filter((s) => s.kind === 'desk')).toHaveLength(6 * span);
        expect(new Set(wide.spots.filter((s) => s.kind === 'desk').map((s) => s.rank)).size).toBe(6 * span);
        expect(wide.spots.slice(0, one.spots.length).map((s) => s.id)).toEqual(one.spots.map((s) => s.id));
        for (const s of wide.spots) expect(s.tx >= wide.rect.x && s.tx < wide.rect.x + wide.rect.w).toBe(true);
        // every desk can be reached from the corridor
        const b = assembleBuilding(shapeOf(coveredSlots(2, span)), [wide]);
        const start = { x: wide.rect.x + 1, y: CORRIDOR_Y + 2 };
        const seen = new Set<number>([start.y * b.grid.w + start.x]);
        const queue = [start];
        while (queue.length) {
          const p = queue.shift()!;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const x = p.x + dx;
            const y = p.y + dy;
            const k = y * b.grid.w + x;
            if (seen.has(k) || !b.grid.walkable(x, y)) continue;
            seen.add(k);
            queue.push({ x, y });
          }
        }
        for (const d of wide.spots.filter((s) => s.kind === 'desk')) expect(seen.has(d.ty * b.grid.w + d.tx), `${seed}/${span} ${d.id}`).toBe(true);
      }
    }
  });
});

describe('open-plan halls', () => {
  it('an open side drops the partition cap and lets people walk to the edge', () => {
    const closed = layoutProjectRoom({ id: '/h/a', slot: 0, seed: 5 }, theme);
    const open = layoutProjectRoom({ id: '/h/a', slot: 0, seed: 5, open: { west: true, east: true } }, theme);
    expect(closed.walls.filter((w) => w.kind === 'cap')).toHaveLength(2);
    expect(open.walls.filter((w) => w.kind === 'cap')).toHaveLength(0);
    const r = open.rect;
    const walk = (x: number) => open.walkable.some((a) => x >= a.x && x < a.x + a.w && 5 >= a.y - r.y && 5 < a.y - r.y + a.h);
    expect(walk(r.x)).toBe(true);
    expect(walk(r.x + r.w - 1)).toBe(true);
    // base spots keep their ids, so people keep their desks when a neighbour arrives
    expect(open.spots.map((s) => s.id).slice(0, closed.spots.length)).toEqual(closed.spots.map((s) => s.id));
  });
});
