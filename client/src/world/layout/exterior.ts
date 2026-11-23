// Exterior: grass, trees, cobbled verges and a dirt road (the 'sidewalk'/'street' floor kinds are painted as
// cobbles and packed earth by art/surfaces/floor.ts); patio/garden in slots without a room.
import type { WallStyle } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { COL_W, CORRIDOR_H, CORRIDOR_Y, ELF_TREE_UP, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, PLAZA_COL, ROOM_H, SCORRIDOR_Y, TILE } from '../constants';
import { biomeMap, biomeProp, cellRace } from './biome';
import { RING_REACH } from './enclosure';
import { WALKWAY_LX, WALKWAY_W } from './corridor';
import { cellRect, extentRect, mainRect, northRect, southRect, stripY, type Cell, type Shape, type Side, type Strip } from './geometry';
import type { ExteriorProp, FloorPatch, TileRect, WallItemPlacement, WallSegment } from './types';

/** A rectangle grown by `x` on both sides, `top` above and `bottom` below (tiles). */
function grow(r: TileRect, x: number, top: number, bottom: number): TileRect {
  return { x: r.x - x, y: r.y - top, w: r.w + 2 * x, h: r.h + top + bottom };
}

export const EXTERIOR_WALL: WallStyle = { base: '#8f897d', trim: '#4e4a40', pattern: 'brick', exterior: true };

export interface ExteriorLayout {
  /** Bounds of the drawn area (tiles). */
  bounds: TileRect;
  floors: FloorPatch[];
  props: ExteriorProp[];
  /** Street lanes (y in px) and direction (+1 = east, -1 = west). */
  lanes: { y: number; dir: 1 | -1 }[];
  /** Top of the dirt road and its height (px); the renderer paints the wheel ruts from these. */
  streetY: number;
  streetH: number;
}

/** Corridor closure and patio of a slot without a room. */
export interface SlotShell {
  slot: number;
  side: Side;
  strip: Strip;
  rect: TileRect;
  walls: WallSegment[];
  windows: WallItemPlacement[];
  floors: FloorPatch[];
  props: ExteriorProp[];
}

export function layoutExterior(shape: Shape): ExteriorLayout {
  const ext = extentRect(shape);
  const main = mainRect(shape);
  const north = northRect(shape);
  const southStrip = southRect(shape);
  const bounds: TileRect = { x: ext.x - EXT_WEST, y: ext.y - EXT_NORTH, w: ext.w + EXT_WEST + EXT_EAST, h: ext.h + EXT_NORTH + EXT_SOUTH };
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const rng = mulberry32(0xc0de + shape.west * 131 + shape.east * 7 + shape.north * 977);
  const rs = () => Math.floor(rng() * 1e9);

  floors.push({ kind: 'grass', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 11 });
  // the land round each wing takes on its race (layout/biome.ts)
  const lands = biomeMap(shape);
  floors.push(...lands.floors(bounds));
  // stone landing at the glass entrance at the west end of the main corridor
  const wx = main.x;
  floors.push({ kind: 'sidewalk', x: px(wx - 3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 15 });

  // the countryside: trees, bushes and stones scattered densely over everything that isn't built on, kept clear
  // of the halls, their rings and the walkways (each prop then turns into its land's kind, layout/biome.ts)
  const keepClear: TileRect[] = [main, ...(southStrip ? [southStrip] : [])].map((r) => grow(r, RING_REACH + 1, RING_REACH + 1, RING_REACH + 1));
  if (north) keepClear.push({ x: north.x - 9, y: north.y - ELF_TREE_UP - 1, w: north.w + 18, h: north.h + ELF_TREE_UP + 7 });
  keepClear.push({ x: PLAZA_COL * COL_W + 3, y: ext.y, w: COL_W - 6, h: ext.h });
  keepClear.push({ x: wx - 6, y: CORRIDOR_Y - 2, w: 6, h: CORRIDOR_H + 4 });
  const clear = (tx: number, ty: number) => !keepClear.some((r) => tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h);
  for (let y = bounds.y + 1; y < bounds.y + bounds.h - 1; y += 3) {
    for (let x = bounds.x + 1 + ((y / 3) % 2) * 1.5; x < bounds.x + bounds.w - 1; x += 3) {
      const tx = Math.round(x + (rng() - 0.5) * 2);
      const ty = Math.round(y + (rng() - 0.5) * 2);
      const roll = rng();
      if (!clear(tx, ty) || roll < 0.2) continue;
      const kind: ExteriorProp['kind'] = roll < 0.55 ? 'tree' : roll < 0.7 ? 'pine' : roll < 0.88 ? 'bush' : roll < 0.95 ? 'flowers' : 'rock';
      props.push({ kind, x: px(tx) + Math.floor(rng() * 8), y: px(ty) + Math.floor(rng() * 8), seed: rs() });
    }
  }
  props.push({ kind: 'bench', x: px(wx - 4), y: px(CORRIDOR_Y + 3) + 6, seed: 1 });
  // brand totem at the main entrance (west)
  props.push({ kind: 'totem', x: px(wx - 3) + 6, y: px(CORRIDOR_Y + 1), seed: 2 });

  // no road any more: nothing drives here
  return {
    bounds,
    floors,
    props: props.map((p) => biomeProp(lands.at(p.x / TILE, p.y / TILE), p)),
    lanes: [],
    streetY: 0,
    streetH: 0,
  };
}

/** Outer wall + garden of an empty slot: wooden deck with tables and parasols, flower beds and a path. */
export function slotShell(cell: Cell): SlotShell {
  const { slot, col, side, strip } = cell;
  const lastColumn = cell.last;
  const rect = cellRect(col, side, strip);
  const corridorY = stripY(strip) + ROOM_H;
  const southY = corridorY + CORRIDOR_H;
  const x0 = rect.x * TILE;
  const rng = mulberry32(0x9a7d + slot * 31);
  const walls: WallSegment[] = [];
  const windows: WallItemPlacement[] = [];
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const W = COL_W * TILE;
  const T = (n: number) => n * TILE;
  const seed = () => Math.floor(rng() * 1e9);
  /** Wooden deck with a stone border (local tiles). */
  const deck = (lx: number, ly: number, w: number, h: number) => {
    floors.push({ kind: 'sidewalk', x: x0 + T(lx), y: T(rect.y + ly), w: T(w), h: T(h), seed: slot + 7 });
    floors.push({ kind: 'wood', x: x0 + T(lx) + 4, y: T(rect.y + ly) + 4, w: T(w) - 8, h: T(h) - 8, seed: slot + 8 });
  };

  if (side === 'north') {
    // façade with windows closing off the corridor (rows 10–11)
    const fy = (corridorY - 2) * TILE;
    walls.push({ kind: 'face', x: x0, y: fy, w: W, style: EXTERIOR_WALL });
    [3, 8, 13].forEach((cx, i) =>
      windows.push({ id: `shell:${slot}:janela${i}`, kind: 'window', cx: x0 + cx * TILE, baseY: corridorY * TILE, on: 'face', order: 0 }),
    );
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: fy, w: TILE / 2, h: 2 * TILE, style: EXTERIOR_WALL });
    if (cell.first) walls.push({ kind: 'cap', x: x0, y: fy, w: TILE / 2, h: 2 * TILE, style: EXTERIOR_WALL });
    // path from the lawn to the deck, deck in the middle and flower beds under the windows
    floors.push({ kind: 'sidewalk', x: x0 + T(7), y: T(rect.y), w: T(2), h: T(3), seed: slot });
    deck(3, 3, 10, 5);
    props.push({ kind: 'parasol', x: x0 + T(5.5), y: T(rect.y + 6) + 4, seed: seed(), slot });
    props.push({ kind: 'parasol', x: x0 + T(10.5), y: T(rect.y + 6) + 4, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(3.5), y: T(rect.y + 3) + 6, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(12.5), y: T(rect.y + 3) + 6, seed: seed(), slot });
    for (const cx of [3, 8, 13]) props.push({ kind: 'flowers', x: x0 + T(cx), y: T(rect.y + 9) + 12, seed: slot * 3 + cx, slot });
    props.push({ kind: 'tree', x: x0 + T(1) + 4, y: T(rect.y + 3), seed: seed(), slot });
    props.push({ kind: rng() < 0.5 ? 'pine' : 'tree', x: x0 + T(15) - 4, y: T(rect.y + 3) + 6, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(1) + 8, y: T(rect.y + 8), seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(15) - 8, y: T(rect.y + 8), seed: seed(), slot });
  } else {
    // low outer wall closing off the corridor (row 17) and a garden below, joined to the street's sidewalk
    walls.push({ kind: 'south', x: x0, y: southY * TILE, w: W, style: EXTERIOR_WALL });
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: southY * TILE, w: TILE / 2, h: TILE, style: EXTERIOR_WALL });
    if (cell.first) walls.push({ kind: 'cap', x: x0, y: southY * TILE, w: TILE / 2, h: TILE, style: EXTERIOR_WALL });
    floors.push({ kind: 'sidewalk', x: x0 + T(7), y: T(rect.y + 1), w: T(2), h: T(rect.h - 1), seed: slot });
    // stretch between the façade and the sidewalk: only exists while the slot is empty (the hedge closes it)
    deck(3, 3.5, 10, 5);
    props.push({ kind: 'parasol', x: x0 + T(5.5), y: T(rect.y + 6.5) + 4, seed: seed(), slot });
    props.push({ kind: 'parasol', x: x0 + T(10.5), y: T(rect.y + 6.5) + 4, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(3.5), y: T(rect.y + 4) + 4, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(12.5), y: T(rect.y + 4) + 4, seed: seed(), slot });
    for (const cx of [3, 13]) props.push({ kind: 'flowers', x: x0 + T(cx), y: T(rect.y + 2), seed: slot * 3 + cx, slot });
    props.push({ kind: 'bench', x: x0 + T(4), y: T(rect.y + 10) + 6, seed: slot, slot });
    props.push({ kind: 'bench', x: x0 + T(12), y: T(rect.y + 10) + 6, seed: slot + 1, slot });
    props.push({ kind: 'tree', x: x0 + T(1) + 6, y: T(rect.y + 11), seed: seed(), slot });
    props.push({ kind: rng() < 0.5 ? 'pine' : 'tree', x: x0 + T(15) - 6, y: T(rect.y + 11) + 4, seed: seed(), slot });
    props.push({ kind: 'rock', x: x0 + T(14), y: T(rect.y + 2) + 4, seed: slot + 3, slot });
  }
  const race = cellRace(strip, col);
  return { slot, side, strip, rect, walls, windows, floors, props: props.map((p) => biomeProp(race, p)) };
}

/** Patio slots of the square: never hold a room (so `roomInSlot` is always empty for them). */
export const PLAZA_NORTH_SLOT = -1_000_001;
export const PLAZA_SOUTH_SLOT = -1_000_002;
export const WALKWAY_SHELL_SLOT = -1_000_003;
export const SOUTH_WALKWAY_SHELL_SLOT = -1_000_004;
export const SOUTH_PLAZA_SLOT = -1_000_005;

/**
 * Patios of the square's column: on the south side a garden like any empty cell (the square's terrace); on the
 * north side the façade opens onto the covered walkway to the elf wing (flower beds on both sides of it); and
 * where the walkway reaches the north strip, the low wall of the elf corridor opens too.
 */
export function plazaShells(shape: Shape): SlotShell[] {
  const out: SlotShell[] = [];
  const rect = cellRect(PLAZA_COL, 'north');
  const x0 = rect.x * TILE;
  const T = (n: number) => n * TILE;
  const walkX = x0 + T(WALKWAY_LX);
  const walkway = [{ x: walkX, w: T(WALKWAY_W) }];
  if (!shape.south) out.push(slotShell({ slot: PLAZA_SOUTH_SLOT, col: PLAZA_COL, side: 'south', strip: 'main', first: false, last: false }));
  else {
    // the square's terrace opens onto the walkway across the street to the undead wing
    const sr = cellRect(PLAZA_COL, 'south');
    const sy = (CORRIDOR_Y + CORRIDOR_H) * TILE;
    out.push({
      slot: PLAZA_SOUTH_SLOT,
      side: 'south',
      strip: 'main',
      rect: sr,
      walls: [{ kind: 'south', x: x0, y: sy, w: COL_W * TILE, style: EXTERIOR_WALL, doorways: walkway }],
      windows: [],
      floors: [],
      props: [2, 3.5, 12.5, 14].map((cx, i) => ({ kind: i % 2 ? 'flowers' : 'bush', x: x0 + T(cx), y: T(sr.y + 3), seed: 95 + i, slot: PLAZA_SOUTH_SLOT })),
    });
    // where it reaches the south strip, the façade of the undead corridor opens; the cell below is a garden
    const nr = cellRect(PLAZA_COL, 'north', 'south');
    const fy = (SCORRIDOR_Y - 2) * TILE;
    out.push({
      slot: SOUTH_WALKWAY_SHELL_SLOT,
      side: 'north',
      strip: 'south',
      rect: nr,
      walls: [
        { kind: 'face', x: x0, y: fy, w: COL_W * TILE, style: EXTERIOR_WALL, doorways: walkway },
        { kind: 'cap', x: x0 + COL_W * TILE - TILE / 2, y: fy, w: TILE / 2, h: 2 * TILE, style: EXTERIOR_WALL },
      ],
      windows: [],
      floors: [],
      props: [2.5, 4, 12, 13.5].map((cx, i) => ({ kind: i % 2 ? 'flowers' : 'pine', x: x0 + T(cx), y: T(nr.y + 8), seed: 97 + i, slot: SOUTH_WALKWAY_SHELL_SLOT })),
    });
    out.push(slotShell({ slot: SOUTH_PLAZA_SLOT, col: PLAZA_COL, side: 'south', strip: 'south', first: false, last: true }));
  }
  const fy = (CORRIDOR_Y - 2) * TILE;
  const open = shape.north ? walkway : undefined;
  const north: SlotShell = {
    slot: PLAZA_NORTH_SLOT,
    side: 'north',
    strip: 'main',
    rect,
    walls: [{ kind: 'face', x: x0, y: fy, w: COL_W * TILE, style: EXTERIOR_WALL, doorways: open }],
    windows: [3, 12].map((cx, i) => ({ id: `shell:${PLAZA_NORTH_SLOT}:janela${i}`, kind: 'window' as const, cx: x0 + cx * TILE, baseY: CORRIDOR_Y * TILE, on: 'face' as const, order: 0 })),
    floors: [],
    props: [],
  };
  for (const cx of [1.5, 3, 4.5, 11.5, 13, 14.5]) north.props.push({ kind: cx === 3 || cx === 13 ? 'bush' : 'flowers', x: x0 + T(cx), y: T(rect.y + 9) + 12, seed: Math.round(cx * 13), slot: PLAZA_NORTH_SLOT });
  north.props.push({ kind: 'tree', x: x0 + T(2) + 4, y: T(rect.y + 4), seed: 71, slot: PLAZA_NORTH_SLOT });
  north.props.push({ kind: 'pine', x: x0 + T(14) - 4, y: T(rect.y + 4) + 6, seed: 72, slot: PLAZA_NORTH_SLOT });
  if (!shape.north) {
    // no elf wing yet: a plain patio with a deck
    north.floors.push({ kind: 'sidewalk', x: x0 + T(4), y: T(rect.y + 4), w: T(8), h: T(4), seed: 77 });
    north.floors.push({ kind: 'wood', x: x0 + T(4) + 4, y: T(rect.y + 4) + 4, w: T(8) - 8, h: T(4) - 8, seed: 78 });
  }
  out.push(north);
  if (shape.north) {
    const wr = cellRect(PLAZA_COL, 'south', 'north');
    const sy = (stripY('north') + ROOM_H + CORRIDOR_H) * TILE;
    out.push({
      slot: WALKWAY_SHELL_SLOT,
      side: 'south',
      strip: 'north',
      rect: wr,
      walls: [{ kind: 'south', x: wr.x * TILE, y: sy, w: COL_W * TILE, style: EXTERIOR_WALL, doorways: [{ x: walkX, w: T(WALKWAY_W) }] }, { kind: 'cap', x: wr.x * TILE, y: sy, w: TILE / 2, h: TILE, style: EXTERIOR_WALL }],
      windows: [],
      floors: [],
      props: [2.5, 4, 12, 13.5].map((cx, i) => ({ kind: i % 2 ? 'flowers' : 'bush', x: wr.x * TILE + T(cx), y: T(wr.y + 4), seed: 90 + i, slot: WALKWAY_SHELL_SLOT })),
    });
  }
  return out;
}
