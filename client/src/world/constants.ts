// World dimensions and timings. Everything is in tiles (TILE px) unless stated otherwise.
import { TILE } from '../art/api';

export { TILE };

/** Width of one building column (one room to the north + one to the south). */
export const COL_W = 16;
/** Height of a room: 2 rows of north wall face + 9 of floor + 1 of south wall. */
export const ROOM_H = 12;
/** Height of the corridor that crosses the building from east to west. */
export const CORRIDOR_H = 5;
/** Core columns (reception/restrooms and kitchen/lounge). */
export const CORE_COLS = 2;
/** Height of one strip: a row of rooms, a corridor and another row of rooms. */
export const BUILDING_H = ROOM_H * 2 + CORRIDOR_H;

// The camp is a pinwheel round a hub (layout/geometry.ts, layout/departments.ts). Four rows of halls, each a strip
// of rooms either side of a corridor: the hub (the core halls, then the town square below them) takes the middle of
// rows 1 and 2, and each race holds one corner as an L — the night elves top left, the orcs top right, the undead
// bottom left and the humans bottom right. An L is a side arm in the row next to the hub and a top or bottom arm
// in the outer row; both grow outwards, away from the middle. The hub is the four core halls side by side; the
// walkways between the rows run through the west halls (in at the Great Hall's back, out at the Bathhouse's).
// Coordinates stay non-negative: the west arms have room reserved before the hub.
/** The middle of the hub: the first column east of it (everything from here on is the east half). */
export const PLAZA_COL = 16;
/** The hub's west core column (reception over the bathhouse) and east one (mess hall over the tavern), side by side. */
export const CORE_COL0 = PLAZA_COL - 1;
export const CORE_EAST_COL = PLAZA_COL;
/** Column the walkways between the rows run down (through the west halls). */
export const WALK_COL = CORE_COL0;
/** Open columns between the hub and the side arms (the corridors cross them outdoors). */
export const WEST_GAP_COL = CORE_COL0 - 1;
export const EAST_GAP_COL = CORE_EAST_COL + 1;
/** First column of the arms east of the hub. */
export const EAST_COL0 = EAST_GAP_COL + 1;
/** Width (tiles) of the two gap columns: just room for a zone's wall and the hub's side by side. */
export const GAP_W = 8;
/** Columns the west side arms can take (the outer rows can take two more). */
export const WEST_COLS = WEST_GAP_COL;
/** Lawn between two rows (tiles): none, the rows sit flush so a zone's two rows form one block. */
export const STRIP_GAP = 0;
/** Row 0 (top: elves and orcs). */
export const NSTRIP_Y = 0;
export const NCORRIDOR_Y = NSTRIP_Y + ROOM_H;
export const NSOUTH_Y = NCORRIDOR_Y + CORRIDOR_H;
/** Row 1 (the core halls between the elves' and the orcs' side arms). */
export const MAIN_Y = NSTRIP_Y + BUILDING_H + STRIP_GAP;
export const NORTH_Y = MAIN_Y;
export const CORRIDOR_Y = MAIN_Y + ROOM_H;
export const SOUTH_Y = CORRIDOR_Y + CORRIDOR_H;
export const MAIN_BOTTOM = MAIN_Y + BUILDING_H;
/** How far (tiles) the elf wing's world tree rises above row 0 (render/elf-tree.ts). */
export const ELF_TREE_UP = 21;
/** Row 2 (the town square between the undead's and the humans' side arms). */
export const SSTRIP_Y = MAIN_BOTTOM + STRIP_GAP;
export const SCORRIDOR_Y = SSTRIP_Y + ROOM_H;
export const SSOUTH_Y = SCORRIDOR_Y + CORRIDOR_H;
export const SSTRIP_BOTTOM = SSTRIP_Y + BUILDING_H;
/** Row 3 (bottom: undead and humans). */
export const BSTRIP_Y = SSTRIP_BOTTOM + STRIP_GAP;
export const BCORRIDOR_Y = BSTRIP_Y + ROOM_H;
export const BSOUTH_Y = BCORRIDOR_Y + CORRIDOR_H;
export const BSTRIP_BOTTOM = BSTRIP_Y + BUILDING_H;

/** First (local) column of the rooms' 2-tile door. */
export const DOOR_X = 7;
export const DOOR_W = 2;

/** Outdoor margins around the building (tiles). */
export const EXT_WEST = 20;
export const EXT_EAST = 20;
export const EXT_NORTH = 34;
export const EXT_SOUTH = 24;

/** Speeds in world px per second. */
export const WALK_SPEED = 3.2 * TILE;
export const RUN_SPEED = 6 * TILE;

/** Offset of the feet within the tile the character is standing on. */
export const FOOT_DX = TILE / 2;
export const FOOT_DY = 11;

/** Allowed zoom (CSS pixels per world pixel). */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;

/** Duration of the room animations (ms). */
export const BUILD_MS = 2600;
export const DISMANTLE_MS = 2200;
export const DISMANTLE_DELAY_MS = 1500;
/** A free slot before the last room waits this long before the farthest room moves into it. */
export const COMPACT_DELAY_MS = 1200;
/** Debounce for agents that disappear from the snapshot. */
export const MISSING_DEBOUNCE_MS = 3000;
