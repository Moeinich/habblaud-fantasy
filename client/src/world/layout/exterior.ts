// Exterior: grass, trees, cobbled verges and a dirt road (the 'sidewalk'/'street' floor kinds are painted as
// cobbles and packed earth by art/surfaces/floor.ts); patio/garden in slots without a room.
import type { WallStyle } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { COL_W, CORRIDOR_H, CORRIDOR_Y, CORE_COL0, CORE_EAST_COL, EAST_GAP_COL, ELF_TREE_UP, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, ROOM_H, TILE, WALK_COL, WEST_GAP_COL } from '../constants';
import { biomeMap, biomeProp, cellRace } from './biome';
import { hallRings, ringBounds, RING_REACH } from './enclosure';
import { WALKWAY_LX, WALKWAY_W } from './corridor';
import { cellRect, cellSlot, cellsOf, colX, extentRect, hasStrip, mainRect, stripCols, stripRect, STRIPS, stripY, walkways, WINGS, type Cell, type Shape, type Side, type Strip } from './geometry';
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
  let bounds: TileRect = { x: ext.x - EXT_WEST, y: ext.y - EXT_NORTH, w: ext.w + EXT_WEST + EXT_EAST, h: ext.h + EXT_NORTH + EXT_SOUTH };
  // the land runs on to the edge of a widescreen view (a TV) round the camp, in whichever direction it is short of
  // 16:9, so the races' grounds reach the edge of the screen instead of stopping at a plain backdrop
  const ASPECT = 16 / 9;
  if (bounds.w < bounds.h * ASPECT * 1.1) {
    const grow = Math.ceil((bounds.h * ASPECT * 1.1 - bounds.w) / 2);
    bounds = { ...bounds, x: bounds.x - grow, w: bounds.w + 2 * grow };
  } else if (bounds.h < (bounds.w / ASPECT) * 1.1) {
    const grow = Math.ceil(((bounds.w / ASPECT) * 1.1 - bounds.h) / 2);
    bounds = { ...bounds, y: bounds.y - grow, h: bounds.h + 2 * grow };
  }
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const rng = mulberry32(0xc0de + WINGS.reduce((a, w, i) => a + shape[w] * (7 + i * 131), 0));
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
  const keepClear: TileRect[] = STRIPS.map((st) => stripRect(shape, st))
    .filter((r): r is TileRect => !!r)
    .map((r) => grow(r, RING_REACH + 1, RING_REACH + 1, RING_REACH + 1));
  for (const ring of hallRings(shape)) keepClear.push(grow(ringBounds(ring), 1, 1, 1));
  // the elves' world tree: its roots spread round the zone and its crown rises far above it
  for (const r of hallRings(shape).find((h) => h.race === 'elf')?.rects ?? []) keepClear.push({ x: r.x - 9, y: r.y - ELF_TREE_UP - 1, w: r.w + 18, h: r.h + ELF_TREE_UP + 7 });
  keepClear.push({ x: colX(WALK_COL) + 3, y: ext.y, w: COL_W - 6, h: ext.h });
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

/** Outer wall and plain ground of an empty cell (no terrace of its own: the shared ones are the hub's). */
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
  const W = rect.w * TILE;
  const T = (n: number) => n * TILE;
  const seed = () => Math.floor(rng() * 1e9);

  // an empty cell is just the zone's own ground (the shared terraces are the hub's halls): the wall closing off the
  // corridor, and a couple of plants of the land
  if (side === 'north') {
    // façade with windows closing off the corridor (rows 10–11)
    const fy = (corridorY - 2) * TILE;
    walls.push({ kind: 'face', x: x0, y: fy, w: W, style: EXTERIOR_WALL });
    [3, 8, 13].forEach((cx, i) =>
      windows.push({ id: `shell:${slot}:janela${i}`, kind: 'window', cx: x0 + cx * TILE, baseY: corridorY * TILE, on: 'face', order: 0 }),
    );
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: fy, w: TILE / 2, h: 2 * TILE, style: EXTERIOR_WALL });
    if (cell.first) walls.push({ kind: 'cap', x: x0, y: fy, w: TILE / 2, h: 2 * TILE, style: EXTERIOR_WALL });
    props.push({ kind: rng() < 0.5 ? 'pine' : 'tree', x: x0 + T(4) + 4, y: T(rect.y + 5), seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(11), y: T(rect.y + 7) + 4, seed: seed(), slot });
  } else {
    // low outer wall closing off the corridor
    walls.push({ kind: 'south', x: x0, y: southY * TILE, w: W, style: EXTERIOR_WALL });
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: southY * TILE, w: TILE / 2, h: TILE, style: EXTERIOR_WALL });
    if (cell.first) walls.push({ kind: 'cap', x: x0, y: southY * TILE, w: TILE / 2, h: TILE, style: EXTERIOR_WALL });
    props.push({ kind: 'bush', x: x0 + T(5), y: T(rect.y + 4) + 4, seed: seed(), slot });
    props.push({ kind: rng() < 0.5 ? 'pine' : 'tree', x: x0 + T(11) + 4, y: T(rect.y + 7), seed: seed(), slot });
  }
  const race = cellRace(strip, col, side);
  return { slot, side, strip, rect, walls, windows, floors, props: props.map((p) => biomeProp(race, p)) };
}

/** Slot of a cell outside the zones (hub, gap and walkway columns): never holds a room. */
export function hubShellSlot(col: number, side: Side, strip: Strip): number {
  return -1_000_000 - cellSlot(col, side, strip);
}

/**
 * Patios of the cells outside the four zones: the gap columns between the hub and the zones and the square's cells
 * on row 2 are gardens; in the square's column the walls open onto the walkways between the rows.
 */
export function plazaShells(shape: Shape): SlotShell[] {
  const out: SlotShell[] = [];
  const T = (n: number) => n * TILE;
  const garden = (col: number, side: Side, strip: Strip) => {
    const [x0, x1] = stripCols(shape, strip);
    const sh = slotShell({ slot: hubShellSlot(col, side, strip), col, side, strip, first: col === x0, last: col === x1 - 1 });
    out.push(sh);
  };
  /** A cell left as lawn: only the wall closing off the corridor and a few plants either side of the path. */
  const lawn = (col: number, side: Side, strip: Strip) => {
    const [x0, x1] = stripCols(shape, strip);
    const sh = slotShell({ slot: hubShellSlot(col, side, strip), col, side, strip, first: col === x0, last: col === x1 - 1 });
    const rx = sh.rect.x * TILE;
    const ry = sh.rect.y * TILE;
    sh.floors = [];
    sh.windows = [];
    sh.props = sh.props.filter((p) => p.kind === 'flowers' || p.kind === 'bush');
    // keep the plants in the middle of the cell (the rings' walls run down its edges)
    const cw = sh.rect.w * TILE;
    sh.props = sh.props.filter((p) => p.x - rx > cw * 0.3 && p.x - rx < cw * 0.7 && p.y - ry >= 0);
    out.push(sh);
  };
  /** The square's column where a walkway leaves the row through this side's wall. */
  const walkwayCell = (strip: Strip, side: Side) => {
    const col = WALK_COL;
    const slot = hubShellSlot(col, side, strip);
    const rect = cellRect(col, side, strip);
    const x0 = rect.x * TILE;
    const corridorY = stripY(strip) + ROOM_H;
    const walkway = [{ x: x0 + T(WALKWAY_LX), w: T(WALKWAY_W) }];
    const [c0, c1] = stripCols(shape, strip);
    const walls: WallSegment[] =
      side === 'north'
        ? [{ kind: 'face', x: x0, y: (corridorY - 2) * TILE, w: COL_W * TILE, style: EXTERIOR_WALL, doorways: walkway }]
        : [{ kind: 'south', x: x0, y: (corridorY + CORRIDOR_H) * TILE, w: COL_W * TILE, style: EXTERIOR_WALL, doorways: walkway }];
    const capY = side === 'north' ? (corridorY - 2) * TILE : (corridorY + CORRIDOR_H) * TILE;
    const capH = side === 'north' ? 2 * TILE : TILE;
    if (col === c0) walls.push({ kind: 'cap', x: x0, y: capY, w: TILE / 2, h: capH, style: EXTERIOR_WALL });
    if (col === c1 - 1) walls.push({ kind: 'cap', x: x0 + COL_W * TILE - TILE / 2, y: capY, w: TILE / 2, h: capH, style: EXTERIOR_WALL });
    // flower beds and bushes on both sides of the path
    const py = side === 'north' ? rect.y + 8 : rect.y + 3;
    const race = cellRace(strip, col, side);
    const props: ExteriorProp[] = [2, 3.5, 12.5, 14].map((cx, i) => ({ kind: i % 2 ? 'flowers' : 'bush', x: x0 + T(cx), y: T(py), seed: 90 + i + slot, slot }));
    out.push({ slot, side, strip, rect, walls, windows: [], floors: [], props: props.map((p) => biomeProp(race, p)) });
  };
  const zoned = new Set(cellsOf(shape).map((c) => c.slot));
  for (const strip of STRIPS) {
    if (!hasStrip(shape, strip)) continue;
    const [c0, c1] = stripCols(shape, strip);
    for (let col = c0; col < c1; col++) {
      if (strip === 'main' ? col === CORE_COL0 || col === CORE_EAST_COL : col === WALK_COL) continue;
      for (const side of ['north', 'south'] as const) {
        if (zoned.has(cellSlot(col, side, strip))) continue;
        // the open gap columns either side of the hub: just lawn between the rings; any other free cell (row 1's
        // side of a zone that has no rooms there yet) is a garden
        if (col >= WEST_GAP_COL && col <= EAST_GAP_COL) lawn(col, side, strip);
        else garden(col, side, strip);
      }
    }
    // the walkway's column on the outer rows (on row 1 the walkways go through the halls)
    if (strip !== 'main')
    for (const side of ['north', 'south'] as const) {
      const below = walkways(shape).some(([a]) => a === strip);
      const above = walkways(shape).some(([, b]) => b === strip);
      if ((side === 'north' && above) || (side === 'south' && below)) walkwayCell(strip, side);
      else lawn(WALK_COL, side, strip);
    }
  }
  return out;
}
