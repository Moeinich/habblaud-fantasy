// Visual representation of the areas: static caches (floor, walls, fixed wall items) and lists of
// dynamic furniture/items ready to be drawn each frame.
import { FURNITURE, TILE, type ArtModule, type FurnitureKind, type FurnitureSprites, type Sprite } from '../../art/api';
import { hash32 } from '../../../../shared/hash';
import type { AreaLayout, TileRect, WallItemPlacement, WallSegment } from '../layout/types';
import type { RoomState } from '../sim/room-state';
import type { WallArtAsset, WorldAssets } from '../assets';
import type { SeasonalTheme } from '../api';
import { decorateRaceWall } from './race-decor';
import { raceOfSeed } from '../../../../shared/race';
import { areaTheme, decorateSeasonalRug, decorateSeasonalWall, seasonalRugColor, seasonalWallStyle } from './seasonal';
import { knownOpaque, opaqueBox } from '../../art/core/opaque';
import { SPREAD_REACH, spreadFloorAt, spreadKey, type Spread } from '../layout/enclosure';

/**
 * Room above a room's own rectangle in its cached wall layer (items that stick out above the top of the
 * face, decorations lifted onto a hall's ring).
 */
export const WALL_MARGIN = 48;

/** Wall items redrawn every frame (the rest goes into the cache). */
const DYNAMIC_WALL: ReadonlySet<FurnitureKind> = new Set<FurnitureKind>(['window', 'clock', 'whiteboard', 'tv', 'elevator', 'light_switch', 'sign', 'mirror']);

export interface FurnVis {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  seed: number;
  /** Anchor in the world (bottom centre of the footprint + offset). */
  ax: number;
  ay: number;
  order: number;
  areaId: string;
  /** Desk: spot of the seat whose activity shows on the screen. */
  seatSpot?: string;
  /** Sprites per state (resolved on demand). */
  states: (FurnitureSprites | null | undefined)[];
  /** Undead room: the piece is drawn in bone and grave violet (art `bone` option). */
  bone?: boolean;
}

export interface WallVis {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  seed: number;
  cx: number;
  baseY: number;
  on: 'face' | 'south';
  order: number;
  areaId: string;
}

export interface AreaVis {
  id: string;
  layout: AreaLayout;
  room?: RoomState;
  px: { x: number; y: number; w: number; h: number };
  floor: HTMLCanvasElement;
  /** Where `floor` is drawn (world px): the room's rect, grown on the sides that spread into a ring's yard. */
  fpx: { x: number; y: number; w: number; h: number };
  /** spreadKey() of the sides it was built with. */
  spread: string;
  walls: HTMLCanvasElement;
  furniture: FurnVis[];
  wallItems: WallVis[];
  sign?: WallVis;
  version: number;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Sprites of a piece of furniture, tolerant of art failures (stub, unknown variant...). */
export function furnitureSprites(art: ArtModule, f: { kind: FurnitureKind; variant?: string; seed: number; states: (FurnitureSprites | null | undefined)[]; bone?: boolean }, state = 0): FurnitureSprites | null {
  const hit = f.states[state];
  if (hit !== undefined) return hit;
  let s: FurnitureSprites | null = null;
  try {
    s = art.furnitureSprites(f.kind, f.variant, state, { seed: f.seed, bone: f.bone }) ?? null;
    if (s && !s.base?.canvas) s = null;
  } catch {
    s = null;
  }
  f.states[state] = s;
  return s;
}

const opaqueCache = new WeakMap<HTMLCanvasElement, { x: number; y: number; w: number; h: number }>();

/** Bounding box of a canvas's opaque pixels (cached per canvas). */
export function opaqueBounds(c: HTMLCanvasElement): { x: number; y: number; w: number; h: number } {
  const hit = opaqueCache.get(c) ?? knownOpaque(c);
  if (hit) return hit;
  let box = { x: 0, y: 0, w: c.width, h: c.height };
  try {
    // (rare: the art notes its sprites' box when it makes them, see art/core/opaque.ts)
    const ctx = c.getContext('2d');
    if (ctx && c.width > 0 && c.height > 0) box = opaqueBox(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  } catch {
    // "tainted" or unavailable canvas: use the full size
  }
  opaqueCache.set(c, box);
  return box;
}

/** Draw position of a wall item (top-left corner, world px). */
export function wallItemOrigin(w: WallVis, s: Sprite): { x: number; y: number } {
  if (w.on === 'south') {
    // on the low wall: centre the opaque content just below the top of the south wall
    const b = opaqueBounds(s.canvas);
    const top = w.baseY - TILE;
    return { x: Math.round(w.cx - (b.x + b.w / 2)), y: Math.round(top + 9 - (b.y + b.h / 2)) };
  }
  return { x: Math.round(w.cx - s.ax), y: Math.round(w.baseY - s.ay) };
}

export function wallSprites(art: ArtModule, kind: FurnitureKind, variant: string | undefined, state: number, seed: number): FurnitureSprites | null {
  try {
    const s = art.furnitureSprites(kind, variant, state, { seed });
    return s && s.base?.canvas ? s : null;
  } catch {
    return null;
  }
}

function drawWallSegment(art: ArtModule, ctx: CanvasRenderingContext2D, w: WallSegment): void {
  try {
    if (w.kind === 'face') art.drawWallFace(ctx, w.x, w.y, w.w, w.style, w.doorways ? { doorways: w.doorways } : undefined);
    else if (w.kind === 'south') art.drawSouthWall(ctx, w.x, w.y, w.w, w.style, w.doorways ? { doorways: w.doorways } : undefined);
    else art.drawWallTop(ctx, w.x, w.y, w.w, w.h, w.style);
  } catch {
    ctx.fillStyle = w.style.base;
    ctx.fillRect(w.x, w.y, w.w, w.kind === 'face' ? 2 * TILE : w.kind === 'south' ? TILE : w.h);
  }
}

/** Top (px above the baseboard) of paintings and posters on the wall face (just below the cap). */
const WALL_ART_TOP = 28;

/**
 * AI-generated art for a painting/poster: only the size that fits the spot (2-tile paintings never
 * get the wide paintings); posters prefer the same variant as the procedural one. Pure.
 */
export function pickWallArt(assets: WorldAssets | null, kind: 'painting' | 'poster', tiles: number, variant: string | undefined, seed: number): WallArtAsset | null {
  if (!assets) return null;
  let pool = assets.wallArt.filter((a) => a.kind === kind && a.tiles === tiles);
  if (kind === 'poster' && variant) {
    const same = pool.filter((a) => a.variant === variant);
    if (same.length) pool = same;
  }
  if (!pool.length) return null;
  return pool[(seed >>> 0) % pool.length];
}

/**
 * Draws the ready-made art (with its own frame/outline) in place of the procedural item, at native
 * size and whole pixels. Returns false if the asset has no ready-made version (unframed painting).
 */
function drawWallArtAsset(ctx: CanvasRenderingContext2D, item: WallVis, a: WallArtAsset): boolean {
  const img = a.framed ?? (a.kind === 'poster' ? a : null);
  if (!img) return false;
  const x = Math.round(item.cx - img.w / 2);
  const y = item.baseY - WALL_ART_TOP;
  // soft shadow on the wall (right and below), like the procedural items
  ctx.fillStyle = 'rgba(30,34,52,0.16)';
  ctx.fillRect(x + img.w, y + 1, 1, img.h);
  ctx.fillRect(x + 1, y + img.h, img.w, 1);
  ctx.drawImage(img.img, x, y);
  return true;
}

/** Painting without a ready-made frame: central crop at native size inside the procedural frame. */
function drawRawPainting(ctx: CanvasRenderingContext2D, s: Sprite, ox: number, oy: number, a: WallArtAsset): void {
  let r = s.rects?.art;
  if (!r) {
    const b = opaqueBounds(s.canvas);
    r = { x: b.x + 2, y: b.y + 2, w: b.w - 4, h: b.h - 4 };
  }
  if (r.w <= 2 || r.h <= 2) return;
  const sw = Math.min(a.w, r.w);
  const sh = Math.min(a.h, r.h);
  const sx = Math.floor((a.w - sw) / 2);
  const sy = Math.floor((a.h - sh) / 2);
  ctx.drawImage(a.img, sx, sy, sw, sh, ox + r.x + Math.floor((r.w - sw) / 2), oy + r.y + Math.floor((r.h - sh) / 2), sw, sh);
}

/** The room's light tint over the floor (multiply: keeps the grain and the grout). */
export function tintFloor(ctx: CanvasRenderingContext2D, px: { x: number; y: number; w: number; h: number }, color: string): void {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return;
  const n = parseInt(m[1], 16);
  // mixes 10% of the colour with white: just a hint of colour
  const k = 0.1;
  const ch = (v: number) => Math.round(255 + (v - 255) * k);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  ctx.fillRect(px.x, px.y, px.w, px.h);
  ctx.restore();
}

export function buildAreaVis(
  art: ArtModule,
  layout: AreaLayout,
  room: RoomState | undefined,
  assets: WorldAssets | null,
  seasonTheme: SeasonalTheme = 'none',
  spread: Spread | null = null,
): AreaVis {
  const theme = areaTheme(seasonTheme, room);
  const r = layout.rect;
  const px = { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE };
  const reach = SPREAD_REACH * TILE;
  const fpx = spread
    ? {
        x: px.x - (spread.w ? reach : 0),
        y: px.y,
        w: px.w + (spread.w ? reach : 0) + (spread.e ? reach : 0),
        h: px.h + (spread.s ? reach : 0),
      }
    : px;

  // ---- floor + rugs
  const [floor, fctx] = makeCanvas(fpx.w, fpx.h);
  fctx.translate(-fpx.x, -fpx.y);
  // the floor spilling into the yard: the room's main floor carried on past its edge
  const main = layout.floors.find((f) => f.kind === 'marble') ?? layout.floors[0];
  if (spread && main) {
    try {
      art.drawFloor(fctx, main.kind, fpx.x, fpx.y, fpx.w, fpx.h, { seed: main.seed, tint: main.tint, tint2: main.tint2 });
    } catch {
      // the rect's own floors still go down below
    }
  }
  for (const f of layout.floors) {
    try {
      art.drawFloor(fctx, f.kind, f.x, f.y, f.w, f.h, { seed: f.seed, tint: f.tint, tint2: f.tint2, fade: f.fade });
    } catch {
      fctx.fillStyle = '#d9dde2';
      fctx.fillRect(f.x, f.y, f.w, f.h);
    }
  }
  if (layout.floorTint) tintFloor(fctx, fpx, layout.floorTint);
  for (const rug of layout.rugs) {
    const color = seasonalRugColor(theme, rug.color);
    try {
      art.drawRug(fctx, rug.x, rug.y, rug.w, rug.h, color, rug.seed, rug.style);
    } catch {
      fctx.fillStyle = color;
      fctx.fillRect(rug.x, rug.y, rug.w, rug.h);
    }
    decorateSeasonalRug(fctx, theme, rug);
  }
  if (spread) maskSpread(fctx, r, fpx, spread);

  // ---- walls + fixed wall items
  const [walls, wctx] = makeCanvas(px.w, px.h + WALL_MARGIN);
  wctx.translate(-px.x, -px.y + WALL_MARGIN);
  const order = { face: 0, south: 1, cap: 2 } as const;
  // on a side that spreads into the yard the room has no side wall: its floor just runs out
  const sideWall = (w: WallSegment) =>
    !!spread && w.kind === 'cap' && w.h >= 2 * TILE && ((spread.w && w.x < px.x + TILE) || (spread.e && w.x + w.w > px.x + px.w - TILE));
  const kept = layout.walls.filter((w) => !sideWall(w));
  for (const w of [...kept].sort((a, b) => order[a.kind] - order[b.kind])) drawWallSegment(art, wctx, { ...w, style: seasonalWallStyle(theme, w.style) });
  for (const w of kept) decorateSeasonalWall(wctx, theme, w);
  if (room) for (const w of kept) decorateRaceWall(wctx, raceOfSeed(room.seed), w, room.seed);

  const wallItems: WallVis[] = [];
  let sign: WallVis | undefined;
  for (const it of layout.wallItems) {
    const vis = toWallVis(it, layout.id);
    if (DYNAMIC_WALL.has(it.kind)) {
      if (it.kind === 'sign') sign = vis;
      else wallItems.push(vis);
      continue;
    }
    // paintings and posters: ready-made AI art (when available) in place of the procedural one
    const ai = it.kind === 'painting' || it.kind === 'poster' ? pickWallArt(assets, it.kind, it.kind === 'poster' ? 1 : it.variant === 'wide' ? 4 : 2, it.variant, vis.seed) : null;
    if (ai && vis.on === 'face' && drawWallArtAsset(wctx, vis, ai)) continue;
    const s = wallSprites(art, it.kind, it.variant === 'wide' ? undefined : it.variant, 0, vis.seed);
    if (!s) continue;
    const o = wallItemOrigin(vis, s.base);
    wctx.drawImage(s.base.canvas, o.x, o.y);
    if (ai && it.kind === 'painting') drawRawPainting(wctx, s.base, o.x, o.y, ai);
  }

  // ---- furniture
  const bone = !!room && raceOfSeed(room.seed) === 'undead';
  const furniture: FurnVis[] = layout.furniture.map((f) => {
    const def = FURNITURE[f.kind];
    const ax = (f.tx + def.footprint.w / 2) * TILE + (f.dx ?? 0);
    const ay = (f.ty + def.footprint.h) * TILE + (f.dy ?? 0);
    return {
      id: f.id,
      kind: f.kind,
      variant: f.variant,
      seed: hash32(f.id),
      ax,
      ay,
      order: f.order,
      areaId: layout.id,
      seatSpot: layout.spots.find((s) => s.deskId === f.id)?.id,
      states: [],
      bone,
    };
  });

  return { id: layout.id, layout, room, px, fpx, spread: spreadKey(spread), floor, walls, furniture, wallItems, sign, version: room?.version ?? 0 };
}

/**
 * Cuts the floor to its spreading edge (layout/enclosure.ts spreadFloorAt), in 2-px blocks: the yard shows where it
 * bites in, loose slabs stay out in the yard, and the rim is a shade darker with a soft shadow below it. Only the
 * band along the spreading sides is looked at; the middle of the room is always floor.
 */
function maskSpread(ctx: CanvasRenderingContext2D, rect: TileRect, fpx: { x: number; y: number; w: number; h: number }, s: Spread): void {
  const T = TILE;
  const band = 2 * T;
  const rx0 = rect.x * T;
  const rx1 = (rect.x + rect.w) * T;
  const ry1 = (rect.y + rect.h) * T;
  const near = (x: number, y: number) => (s.w && x < rx0 + band) || (s.e && x >= rx1 - band) || (s.s && y >= ry1 - band);
  const B = 2;
  const x1 = fpx.x + fpx.w;
  const y1 = fpx.y + fpx.h;
  ctx.save();
  for (let y = fpx.y; y < y1; y += B) {
    for (let x = fpx.x; x < x1; x += B) {
      if (!near(x, y)) continue;
      const at = spreadFloorAt(rect, s, x + B / 2, y + B / 2);
      if (!at) {
        ctx.clearRect(x, y, B, B);
        // a soft shadow just below the floor's lower rim
        if (spreadFloorAt(rect, s, x + B / 2, y - B / 2) === 'edge') {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.fillRect(x, y, B, B);
        }
      } else if (at === 'edge' || at === 'slab') {
        ctx.fillStyle = at === 'edge' ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.12)';
        ctx.fillRect(x, y, B, B);
      }
    }
  }
  ctx.restore();
}

export function toWallVis(it: WallItemPlacement, areaId: string): WallVis {
  return { id: it.id, kind: it.kind, variant: it.variant, seed: hash32(it.id), cx: it.cx, baseY: it.baseY, on: it.on, order: it.order, areaId };
}

/** Draws the walls and floor of a set of segments/floors into an already-transformed context (base layer). */
export function paintShell(art: ArtModule, ctx: CanvasRenderingContext2D, floors: AreaLayout['floors'], walls: WallSegment[]): void {
  for (const f of floors) {
    try {
      art.drawFloor(ctx, f.kind, f.x, f.y, f.w, f.h, { seed: f.seed, tint: f.tint, tint2: f.tint2, fade: f.fade });
    } catch {
      ctx.fillStyle = '#9fc77f';
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }
  }
  for (const w of walls) drawWallSegment(art, ctx, w);
}
