// Dimensões e ritmos do mundo. Tudo em tiles (TILE px) salvo indicação em contrário.
import { TILE } from '../art/api';

export { TILE };

/** Largura de uma coluna do prédio (uma sala ao norte + uma ao sul). */
export const COL_W = 16;
/** Altura de uma sala: 2 linhas de face da parede norte + 9 de piso + 1 de parede sul. */
export const ROOM_H = 12;
/** Altura do corredor que corta o prédio de leste a oeste. */
export const CORRIDOR_H = 5;
/** Colunas do núcleo (recepção/banheiros e copa/lounge). */
export const CORE_COLS = 2;
/** Height of one strip: a row of rooms, a corridor and another row of rooms. */
export const BUILDING_H = ROOM_H * 2 + CORRIDOR_H;

// The office is a hub with three wings (layout/departments.ts). The core and the square sit in the main strip;
// the human wing grows west along the main corridor, the orc wing east, and the night-elf wing lives in a
// second strip to the north, reached by a covered walkway from the square. Coordinates stay non-negative: the
// west wing has room reserved before the core, and the north strip sits above the main one.
/** Columns reserved west of the core for the human wing. */
export const WEST_COLS = 12;
/** First column of the core. */
export const CORE_COL0 = WEST_COLS;
/** Column of the square, where the three wings meet (just east of the core). */
export const PLAZA_COL = CORE_COL0 + CORE_COLS;
/** First column of the east (orc) wing. */
export const EAST_COL0 = PLAZA_COL + 1;
/** Lawn between the north strip and the main one (tiles). */
export const STRIP_GAP = 10;
/** Top of the north (elf) strip and of its corridor and south rooms. */
export const NSTRIP_Y = 0;
export const NCORRIDOR_Y = NSTRIP_Y + ROOM_H;
export const NSOUTH_Y = NCORRIDOR_Y + CORRIDOR_H;
/** Top of the main strip. */
export const MAIN_Y = NSTRIP_Y + BUILDING_H + STRIP_GAP;

export const NORTH_Y = MAIN_Y;
export const CORRIDOR_Y = MAIN_Y + ROOM_H;
export const SOUTH_Y = CORRIDOR_Y + CORRIDOR_H;
/** Bottom edge of the main strip (the street side). */
export const MAIN_BOTTOM = MAIN_Y + BUILDING_H;
/** How far (tiles) the elf wing's world tree rises above the north strip (render/elf-tree.ts). */
export const ELF_TREE_UP = 21;
/** Top of the south (undead) strip, across a lawn from the main one, and of its corridor and south rooms. */
export const SSTRIP_Y = MAIN_BOTTOM + STRIP_GAP;
export const SCORRIDOR_Y = SSTRIP_Y + ROOM_H;
export const SSOUTH_Y = SCORRIDOR_Y + CORRIDOR_H;
export const SSTRIP_BOTTOM = SSTRIP_Y + BUILDING_H;

/** Primeira coluna (local) da porta de 2 tiles das salas. */
export const DOOR_X = 7;
export const DOOR_W = 2;

/** Margens de área externa ao redor do prédio (tiles). */
export const EXT_WEST = 20;
export const EXT_EAST = 20;
export const EXT_NORTH = 34;
export const EXT_SOUTH = 24;

/** Velocidades em px de mundo por segundo. */
export const WALK_SPEED = 3.2 * TILE;
export const RUN_SPEED = 6 * TILE;

/** Deslocamento dos pés dentro do tile em que o personagem está em pé. */
export const FOOT_DX = TILE / 2;
export const FOOT_DY = 11;

/** Zoom permitido (pixels CSS por pixel de mundo). */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 6;

/** Duração das animações de sala (ms). */
export const BUILD_MS = 2600;
export const DISMANTLE_MS = 2200;
export const DISMANTLE_DELAY_MS = 1500;
/** Uma vaga livre antes da última sala espera isto antes de a sala mais distante se mudar para lá. */
export const COMPACT_DELAY_MS = 1200;
/** Debounce para agentes que somem do snapshot. */
export const MISSING_DEBOUNCE_MS = 3000;
