// Layout de uma sala de projeto (16x12 tiles com paredes próprias).
//
//   linhas 0–1  face da parede norte (salas ao sul: com a passagem da porta)
//   linhas 2–10 piso (interior 14x9: colunas 1–14)
//   linha 11    parede sul (salas ao norte: com a porta para o corredor)
//
// Ilha de 6 lugares face a face (3 desk ao sul, de costas para a câmera; 3 desk_back ao norte,
// de frente), quadro kanban, placa com o nome e decoração. Para as salas não ficarem idênticas,
// a semente da sala escolhe: o lado da ilha (layout espelhado), o tipo de canto de reunião
// (mesa retangular, mesinhas redondas ou recanto com poltronas), os "cantos" da parte de baixo
// (descanso, impressão, verde, mesa de pé) e a coluna de apoio junto à parede.
//
// A busy room spans several columns (`span`): the first 16 tiles are always the module above, and each extra
// column adds an annex to the east with another 6-desk island, two standing spots and its own door, with no
// partition wall in between. Annex spots are created after all of the base module's, so the base spot ids
// stay the same when a room grows or shrinks (people keep their desks).
import { FURNITURE, type Dir, type FurnitureKind, type RoomTheme, type WallStyle } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { raceOfSeed, type Race } from '../../../../shared/race';
import { DOOR_W, DOOR_X, TILE } from '../constants';
import { AreaBuilder, type SpotOpts } from './builder';
import { COL_W } from '../constants';
import { openToRing } from './enclosure';
import { MAX_SPAN, roomRect, slotSide, slotWing } from './geometry';
import type { AreaLayout, SpotDef, SpotKind } from './types';

export interface RoomInput {
  id: string;
  slot: number;
  seed: number;
  /** Columns the room spans (1 = a single 16-tile module). */
  span?: number;
  /**
   * Sides that open onto a neighbouring project room of the same wing: no partition wall there, so the wing reads
   * as one open-plan hall with a department per project (sim.ts relayout decides).
   */
  open?: { west?: boolean; east?: boolean };
}

const PLANTS_TALL = ['palm', 'ficus', 'monstera', 'bonsai'] as const;
const PLANTS_SMALL = ['fern', 'succulent', 'flower'] as const;
/**
 * Wall posters by race: the race banner shows up twice as often as the neutral notices, and a room never hangs
 * another race's banner ('code' = Alliance, 'coffee' = Horde, 'moon' = night-elf).
 */
const POSTERS: Readonly<Record<Race, readonly string[]>> = {
  human: ['code', 'code', 'rocket', 'cat', 'bug', 'ship_it'],
  elf: ['moon', 'moon', 'rocket', 'cat', 'bug', 'ship_it'],
  orc: ['coffee', 'coffee', 'rocket', 'cat', 'bug', 'ship_it'],
  undead: ['coffee', 'coffee', 'rocket', 'cat', 'bug', 'ship_it'],
};
const BEANBAGS = ['red', 'blue', 'yellow', 'green'] as const;

/** Canto de reunião (assentos extras para subagentes). */
export type MeetingStyle = 'table' | 'round' | 'lounge';
/** Canto da parte de baixo da sala (linhas 9–10). */
export type CornerStyle = 'rest' | 'print' | 'green' | 'standdesk' | 'stands';

/** Variações sorteadas pela semente (exportado para testes). */
export interface RoomVariant {
  mirror: boolean;
  meeting: MeetingStyle;
  left: CornerStyle;
  right: CornerStyle;
}

/** Variação de uma cor hex (clareia/escurece) — usado para tapetes e detalhes. */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Sorteio das variações da sala (determinístico pela semente). */
export function roomVariant(seed: number): RoomVariant {
  const rng = mulberry32((seed ^ 0x7a11) >>> 0);
  const mirror = rng() < 0.5;
  const m = rng();
  const meeting: MeetingStyle = m < 0.45 ? 'table' : m < 0.78 ? 'round' : 'lounge';
  const lefts: CornerStyle[] = ['rest', 'print', 'green'];
  const rights: CornerStyle[] = ['standdesk', 'stands', 'green'];
  const left = lefts[Math.floor(rng() * lefts.length) % lefts.length];
  let right = rights[Math.floor(rng() * rights.length) % rights.length];
  if (right === left) right = 'stands';
  return { mirror, meeting, left, right };
}

export function layoutProjectRoom(room: RoomInput, theme: RoomTheme): AreaLayout {
  const span = Math.max(1, Math.min(MAX_SPAN, Math.floor(room.span ?? 1)));
  const W = span * COL_W;
  const rect = roomRect(room.slot, span);
  const side = slotSide(room.slot);
  const rng = mulberry32(room.seed ^ 0x5eed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
  const v = roomVariant(room.seed);
  const posters = POSTERS[raceOfSeed(room.seed)];
  const b = new AreaBuilder(room.id, 'room', rect);
  const area = b.area;
  area.side = side;
  const wall: WallStyle = theme.wall;
  const north = side === 'north';
  /** One door per column (the annexes get their own, so people don't cross the whole room). */
  const doors = Array.from({ length: span }, (_, k) => ({ lx: k * COL_W + DOOR_X, w: DOOR_W }));

  // ---- espelhamento (coordenadas locais pensadas com a ilha à esquerda)
  const mir = v.mirror;
  const fx = (lx: number, w = 1) => (mir ? 16 - lx - w : lx);
  const fdir = (d: Dir): Dir => (mir && (d === 'left' || d === 'right') ? (d === 'left' ? 'right' : 'left') : d);
  const fdx = (dx: number | undefined) => (dx === undefined ? undefined : mir ? -dx : dx);
  const furn = (kind: FurnitureKind, lx: number, ly: number, variant?: string, o: { dx?: number; dy?: number; order?: number; seat?: string } = {}) =>
    b.furn(kind, fx(lx, FURNITURE[kind].footprint.w), ly, variant, { ...o, dx: fdx(o.dx) });
  const spot = (kind: SpotKind, lx: number, ly: number, dir: Dir, o: SpotOpts = {}): SpotDef => b.spot(kind, fx(lx), ly, fdir(dir), { ...o, dx: fdx(o.dx) });
  /** Assento; `dirVariant` = a variante do móvel é a própria direção (poltrona, cadeira de café). */
  const seat = (kind: SpotKind, fk: FurnitureKind, lx: number, ly: number, dir: Dir, variant?: string, o: SpotOpts & { order?: number } = {}, dirVariant = false): SpotDef =>
    b.seat(kind, fk, fx(lx), ly, fdir(dir), dirVariant ? fdir(dir) : variant, { ...o, dx: fdx(o.dx) });
  const wallItem = (kind: FurnitureKind, cx: number, variant?: string, o: { ly?: number; on?: 'face' | 'south'; order?: number } = {}) => b.wall(kind, mir ? 16 - cx : cx, variant, o);
  const rug = (lx: number, ly: number, w: number, h: number, color: string, seed: number) => b.rug(fx(lx, w), ly, w, h, color, seed);

  // ---- piso: porcelanato claro (o banheiro é que usa azulejo); leve tom do tema dá identidade
  b.floor('marble', 0, 0, W, 12, room.seed);
  area.floorTint = theme.carpet;
  // tapete na cor do tema sob a ilha (identidade da sala)
  rug(1.5, 3.25, 7, 5.5, theme.carpet, room.seed);
  // tapetinho na entrada
  rug(DOOR_X - 0.25, north ? 9.5 : 2, DOOR_W + 0.5, 1.25, shade(theme.carpet2, -0.1), room.seed + 1);

  // ---- paredes (an open side runs the walls on into the neighbour's, with no partition in between)
  const openW = !!room.open?.west;
  const openE = !!room.open?.east;
  const wx0 = openW ? 0 : 0.5;
  const ww = W - wx0 - (openE ? 0 : 0.5);
  if (north) {
    b.face(wx0, ww, wall);
    b.south(wx0, ww, 11, wall, doors);
  } else {
    b.face(wx0, ww, wall, doors);
    b.south(wx0, ww, 11, { ...wall, exterior: true });
    // batente na passagem da porta (a face da parede norte mostra o vão)
    b.wall('door_frame', DOOR_X + DOOR_W / 2, undefined, { order: 0.05 });
  }
  if (!openW) b.cap(0, 0, 0.5, 12, wall);
  if (!openE) b.cap(W - 0.5, 0, 0.5, 12, wall);

  // ---- caminhabilidade
  b.walk(openW ? 0 : 1, 2, W - (openW ? 0 : 1) - (openE ? 0 : 1), 9);
  area.door = north ? { x: rect.x + DOOR_X, y: rect.y + 11, w: DOOR_W, h: 1 } : { x: rect.x + DOOR_X, y: rect.y, w: DOOR_W, h: 2 };
  for (const d of doors) b.walk(d.lx, area.door.y - rect.y, d.w, area.door.h);

  // ---- itens de parede
  const signCx = north ? 8 : 10.5;
  area.signId = wallItem('sign', signCx, undefined, { order: 0.95 });
  if (north) {
    wallItem('whiteboard', 4.5, undefined, { order: 0.6 });
    wallItem('clock', 10, undefined, { order: 0.7 });
    wallItem('poster', 11.1, pick(posters), { order: 0.5 });
    wallItem('window', 12.75, undefined, { order: 0.4 });
    // interruptor ao lado da porta, na mureta (por dentro)
    wallItem('light_switch', DOOR_X - 0.5, 'on', { ly: 12, on: 'south', order: 0.8 });
    spot('switch', DOOR_X - 1, 10, 'down', { dy: -1 });
  } else {
    wallItem('whiteboard', 2.5, undefined, { order: 0.6 });
    wallItem('light_switch', DOOR_X - 0.5, 'on', { order: 0.8 });
    wallItem('clock', 12.3, undefined, { order: 0.7 });
    wallItem('poster', 13.35, pick(posters), { order: 0.5 });
    spot('switch', DOOR_X - 1, 2, 'up', { dy: -3 });
  }
  spot('whiteboard', north ? 4 : 2, 2, 'up', { dx: 8, dy: 2 });

  // ---- ilha de trabalho 3x2 face a face (colunas 2–7, linhas 4–7)
  const deskV = theme.deskVariant;
  const chairV = theme.chairVariant;
  const ranks = [2, 0, 4];
  for (let i = 0; i < 3; i++) {
    const lx = 2 + i * 2;
    const back = furn('desk_back', lx, 5, deskV, { order: 0.35 + i * 0.05, seat: `N${i}` });
    const front = furn('desk', lx, 6, deskV, { order: 0.4 + i * 0.05, seat: `S${i}` });
    seat('desk', 'office_chair_front', lx, 4, 'down', chairV, { dx: TILE / 2, deskId: back, rank: ranks[i] + 1, side: 'N', order: 0.55 + i * 0.03 });
    seat('desk', 'office_chair', lx, 7, 'up', chairV, { dx: TILE / 2, deskId: front, rank: ranks[i], side: 'S', order: 0.6 + i * 0.03 });
  }
  furn('trash_bin', 9, 6, undefined, { order: 0.7 });

  // ---- canto de reunião (assentos extras para subagentes: banquetas ou poltronas)
  if (v.meeting === 'table') {
    furn('meeting_table', 10, 5, undefined, { order: 0.45 });
    seat('stool', 'stool', 10, 4, 'down', undefined, { order: 0.65 });
    seat('stool', 'stool', 12, 4, 'down', undefined, { order: 0.66 });
    seat('stool', 'stool', 10, 7, 'up', undefined, { order: 0.67 });
    seat('stool', 'stool', 12, 7, 'up', undefined, { order: 0.68 });
  } else if (v.meeting === 'round') {
    // duas mesinhas redondas com duas banquetas cada (em diagonal, para circular entre elas)
    furn('cafe_table', 11, 4, undefined, { order: 0.45 });
    seat('stool', 'stool', 10, 4, 'right', undefined, { order: 0.65 });
    seat('stool', 'stool', 12, 4, 'left', undefined, { order: 0.66 });
    furn('cafe_table', 11, 7, undefined, { order: 0.46 });
    seat('stool', 'stool', 10, 7, 'right', undefined, { order: 0.67 });
    seat('stool', 'stool', 12, 7, 'left', undefined, { order: 0.68 });
    furn('plant_small', 12, 5, pick(PLANTS_SMALL), { order: 0.47 });
  } else {
    // recanto com poltronas e puffs em volta de uma mesa de centro (sem mesa de reunião)
    rug(9.6, 3.7, 4.8, 4.6, shade(theme.carpet2, 0.25), room.seed + 2);
    furn('coffee_table', 10, 5, undefined, { order: 0.45 });
    seat('nook', 'armchair', 9, 5, 'right', undefined, { order: 0.65 }, true);
    seat('nook', 'armchair', 12, 5, 'left', undefined, { order: 0.66 }, true);
    seat('nook', 'beanbag', 10, 7, 'up', pick(BEANBAGS), { order: 0.67 });
    seat('nook', 'beanbag', 11, 7, 'up', pick(BEANBAGS), { order: 0.68 });
    seat('nook', 'beanbag', 11, 3, 'down', pick(BEANBAGS), { order: 0.69 });
  }

  // ---- apoio: estante na parede norte (sem cobrir quadro, placa ou janela) e coluna junto à parede
  const tall = pick(PLANTS_TALL);
  const shelfX = north ? 1 : 4;
  furn('bookshelf', shelfX, 2, undefined, { order: 0.25 });
  spot('shelf', shelfX, 3, 'up', { dx: 8, dy: -2 });
  furn('plant_tall', 14, 2, tall, { order: 0.2 });
  if (north) spot('window', 12, 2, 'up', { dx: 12, dy: 1 });
  else furn('plant_small', 1, 2, pick(PLANTS_SMALL), { order: 0.22 });
  const column = Math.floor(rng() * 3);
  if (column === 0) {
    furn('binder_shelf', 14, 4, undefined, { order: 0.3 });
    furn('printer', 14, 6, undefined, { order: 0.32 });
    furn('floor_lamp', 14, 8, undefined, { order: 0.34 });
  } else if (column === 1) {
    furn('binder_shelf', 14, 4, undefined, { order: 0.3 });
    furn('binder_shelf', 14, 5, undefined, { order: 0.31 });
    furn('floor_lamp', 14, 8, undefined, { order: 0.34 });
  } else {
    furn('floor_lamp', 14, 4, undefined, { order: 0.3 });
    furn('filing_cabinet', 14, 6, undefined, { order: 0.32 });
    furn('plant_tall', 14, 8, pick(PLANTS_TALL), { order: 0.34 });
  }

  // ---- cantos da parte de baixo (linhas 9–10; a passagem da porta, colunas 6–9, fica livre)
  corner(v.left, 'left');
  corner(v.right, 'right');

  function corner(style: CornerStyle, where: 'left' | 'right'): void {
    // a zona da esquerda ocupa as colunas 1–5; a da direita, 10–14
    const x0 = where === 'left' ? 1 : 10;
    const o = 0.2 + (where === 'left' ? 0 : 0.05);
    switch (style) {
      case 'rest': {
        // canto de descanso: tapete, dois puffs (também servem de lugar extra) e plantas
        rug(x0 + 0.5, 8.85, 4, 2, shade(theme.carpet, 0.35), room.seed + 3);
        seat('nook', 'beanbag', x0 + 1, 10, 'up', pick(BEANBAGS), { order: o + 0.4 });
        seat('nook', 'beanbag', x0 + 3, 10, 'up', pick(BEANBAGS), { order: o + 0.41 });
        furn('plant_small', x0 + 2, 10, pick(PLANTS_SMALL), { order: o });
        furn('plant_tall', where === 'left' ? x0 : x0 + 4, 10, pick(PLANTS_TALL), { order: o + 0.01 });
        return;
      }
      case 'print': {
        // estação de impressão com estante de pastas e arquivo
        furn('printer', x0, 10, undefined, { order: o });
        furn('binder_shelf', x0 + 1, 10, undefined, { order: o + 0.01 });
        furn('binder_shelf', x0 + 2, 10, undefined, { order: o + 0.02 });
        furn('filing_cabinet', x0 + 3, 10, undefined, { order: o + 0.03 });
        furn('trash_bin', x0 + 4, 10, undefined, { order: o + 0.04 });
        return;
      }
      case 'green': {
        // cantinho verde com luminária e uma poltrona de leitura
        furn('plant_tall', x0, 10, pick(PLANTS_TALL), { order: o });
        furn('floor_lamp', x0 + 1, 10, undefined, { order: o + 0.01 });
        seat('nook', 'armchair', x0 + 2, 10, 'up', undefined, { order: o + 0.4 }, true);
        furn('plant_small', x0 + 3, 10, pick(PLANTS_SMALL), { order: o + 0.02 });
        furn('plant_tall', x0 + 4, 10, pick(PLANTS_TALL), { order: o + 0.03 });
        return;
      }
      case 'standdesk': {
        // mesa de pé com notebook (lugar de trabalho em pé, de frente para a câmera)
        furn('cafe_table', x0 + 2, 10, undefined, { order: o });
        spot('stand', x0 + 2, 9, 'down', { dy: -1 });
        furn('plant_small', x0 + 4, 10, pick(PLANTS_SMALL), { order: o + 0.01 });
        furn('trash_bin', x0, 10, undefined, { order: o + 0.02 });
        return;
      }
      case 'stands': {
        // pontos em pé junto ao quadro móvel/estante baixa
        furn('filing_cabinet', x0 + 4, 10, undefined, { order: o });
        furn('plant_small', x0, 10, pick(PLANTS_SMALL), { order: o + 0.01 });
        spot('stand', x0 + 1, 9, 'up', { dy: -2 });
        spot('stand', x0 + 2, 9, 'up', { dy: -2 });
        return;
      }
    }
  }

  // pontos em pé (subagentes sem lugar sentado trabalham aqui; também servem de conversa)
  spot('stand', 9, 3, 'left');
  spot('stand', 1, 7, 'right');
  spot('stand', 13, 9, 'up', { dy: -2 });

  // ---- annexes (one per extra column), never mirrored
  for (let k = 1; k < span; k++) annex(k);

  function annex(k: number): void {
    const ox = k * COL_W;
    const o = 0.3 + k * 0.02;
    b.rug(ox + 2.5, 3.25, 7, 5.5, theme.carpet, room.seed + 10 + k);
    if (!north) b.wall('door_frame', ox + DOOR_X + DOOR_W / 2, undefined, { order: 0.05 });
    b.wall('poster', ox + 3, pick(posters), { order: 0.5 });
    b.wall(north ? 'window' : 'clock', ox + 12.5, undefined, { order: 0.45 });
    const annexRanks = [2, 0, 4];
    for (let i = 0; i < 3; i++) {
      const lx = ox + 3 + i * 2;
      const back = b.furn('desk_back', lx, 5, deskV, { order: o + 0.05 + i * 0.05, seat: `N${k * 3 + i}` });
      const front = b.furn('desk', lx, 6, deskV, { order: o + 0.1 + i * 0.05, seat: `S${k * 3 + i}` });
      b.seat('desk', 'office_chair_front', lx, 4, 'down', chairV, { dx: TILE / 2, deskId: back, rank: k * 6 + annexRanks[i] + 1, side: 'N', order: o + 0.25 + i * 0.03 });
      b.seat('desk', 'office_chair', lx, 7, 'up', chairV, { dx: TILE / 2, deskId: front, rank: k * 6 + annexRanks[i], side: 'S', order: o + 0.3 + i * 0.03 });
    }
    b.furn('plant_tall', ox + 14, 2, pick(PLANTS_TALL), { order: o });
    b.furn('filing_cabinet', ox + 13, 4, undefined, { order: o + 0.01 });
    b.furn('floor_lamp', ox + 13, 7, undefined, { order: o + 0.02 });
    b.furn('plant_small', ox + 1, 10, pick(PLANTS_SMALL), { order: o + 0.03 });
    b.furn('binder_shelf', ox + 12, 10, undefined, { order: o + 0.04 });
    b.furn('plant_tall', ox + 14, 10, pick(PLANTS_TALL), { order: o + 0.05 });
    b.spot('stand', ox + 11, 5, 'left');
    b.spot('stand', ox + 11, 7, 'left');
  }

  // ---- sombreamento quando a luz está apagada (salas ao norte: a mureta sul fica clara)
  const p = { x: rect.x * TILE, y: rect.y * TILE, w: rect.w * TILE, h: rect.h * TILE };
  area.shade = north ? { x: p.x, y: p.y, w: p.w, h: p.h - TILE } : { x: p.x, y: p.y, w: p.w, h: p.h };
  // undead rooms lay grave-cloth runners whatever their colour
  if (raceOfSeed(room.seed) === 'undead') for (const r of area.rugs) r.style = 'crypt';
  // where two departments meet, a tall plant at each end of the seam marks the border and leaves the middle open (last, so
  // the other furniture and spot ids don't depend on the neighbours)
  if (openE) {
    b.furn('plant_tall', W - 1, 2, PLANTS_TALL[(room.seed >>> 3) % PLANTS_TALL.length], { order: 0.2 });
    b.furn('plant_tall', W - 1, 10, PLANTS_TALL[(room.seed >>> 5) % PLANTS_TALL.length], { order: 0.2 });
  }
  // every wing but the elves' (their hollow tree) stands inside a rounded ring that is its outer wall
  if (slotWing(room.slot) !== 'north') openToRing(area, side);
  return b.build();
}
