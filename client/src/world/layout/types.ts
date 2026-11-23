// Office layout types. Layout modules are PURE (no DOM): they produce descriptions that the
// renderer turns into pixels and the simulation uses for paths and points of interest.
import type { Dir, FloorFade, FloorKind, FurnitureKind, RugStyle, WallStyle } from '../../art/api';

export type AreaKind = 'reception' | 'restroom' | 'cafe' | 'lounge' | 'room' | 'corridor';

/** Rectangle in tiles (absolute world coordinates). */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A placed piece of floor furniture. */
export interface FurniturePlacement {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  /** Top-left corner of the footprint, in absolute tiles. */
  tx: number;
  ty: number;
  /** Drawing offset in px (e.g. a chair centred on a 2-tile desk). Does not affect the footprint. */
  dx?: number;
  dy?: number;
  /** Relative order in the build-up animation (0..1). */
  order: number;
  /** For desks: index of the seat (the screen follows the activity of whoever sits there). */
  seat?: string;
}

/** Wall-mounted item. `cx` = centre in world px; `baseY` = baseboard line in px. */
export interface WallItemPlacement {
  id: string;
  kind: FurnitureKind;
  variant?: string;
  cx: number;
  baseY: number;
  /** 'face' = north wall face; 'south' = on top of the low south wall. */
  on: 'face' | 'south';
  order: number;
}

export interface Doorway {
  x: number;
  w: number;
}

/** Wall segment in world px. */
export type WallSegment =
  | { kind: 'face'; x: number; y: number; w: number; style: WallStyle; doorways?: Doorway[] }
  | { kind: 'south'; x: number; y: number; w: number; style: WallStyle; doorways?: Doorway[] }
  | { kind: 'cap'; x: number; y: number; w: number; h: number; style: WallStyle };

export interface FloorPatch {
  kind: FloorKind;
  /** world px */
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  tint?: string;
  tint2?: string;
  /** Organic seam into the floor drawn before it (px of world). */
  fade?: FloorFade;
}

export interface RugPatch {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  seed: number;
  /** Forces a rug look regardless of the colour ('crypt' = undead grave-cloth runner). */
  style?: RugStyle;
}

export type SpotKind =
  | 'desk' // workplace (desk + chair)
  | 'stool' // meeting-table stool
  | 'nook' // armchair/beanbag inside a project room (extra workplace, with a laptop)
  | 'stand' // standing spot inside the room (work without a desk)
  | 'switch' // light switch
  | 'whiteboard'
  | 'coffee'
  | 'water'
  | 'snack'
  | 'fridge'
  | 'cafe_seat'
  | 'sofa'
  | 'armchair'
  | 'beanbag'
  | 'bench'
  | 'pingpong'
  | 'arcade'
  | 'shelf'
  | 'window'
  | 'stall'
  | 'sink'
  | 'elevator'
  | 'talk'
  | 'watch'; // spectators' standing spot (watching a match)

/**
 * Point of interest. The character walks to the (walkable) approach tile (tx, ty) and then
 * "snaps" into the final position (x, y) in px, facing `dir`.
 */
export interface SpotDef {
  id: string;
  kind: SpotKind;
  areaId: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  dir: Dir;
  seated?: boolean;
  /** Associated furniture (chair, machine, stall...). */
  furnitureId?: string;
  /** Depth to use when occupied (seats: just after the furniture). */
  sortY?: number;
  /** Paired spots (ping-pong, conversation) share the group. */
  group?: string;
  /** Desk whose screen follows whoever is sitting here. */
  deskId?: string;
  /** Order of preference (desks). */
  rank?: number;
  /** Side of the desk island: 'S' = back to the camera (screen visible), 'N' = facing it (desk_back). */
  side?: 'S' | 'N';
}

export interface AreaLayout {
  id: string;
  kind: AreaKind;
  /** The area's rectangle in absolute tiles. */
  rect: TileRect;
  floors: FloorPatch[];
  rugs: RugPatch[];
  walls: WallSegment[];
  wallItems: WallItemPlacement[];
  furniture: FurniturePlacement[];
  spots: SpotDef[];
  /** Walkable tiles (absolute), besides the ones blocked by furniture. */
  walkable: TileRect[];
  /** Explicitly blocked tiles (partitions drawn as floor, etc.). */
  blocked?: TileRect[];
  /** Door tiles (absolute). */
  door?: TileRect;
  /** For project rooms: which side of the corridor it is on. */
  side?: 'north' | 'south';
  /** Tint (hex colour) lightly applied over the floor, so each room has its own identity. */
  floorTint?: string;
  /** Rectangle (px) darkened when the light is off. */
  shade?: { x: number; y: number; w: number; h: number };
  /** Rectangle (px) of the name plate. */
  signId?: string;
}

/** Outdoor decorative element (tree, bush, lamp post...) drawn by the world itself. */
export interface ExteriorProp {
  kind:
    | 'tree'
    | 'pine'
    | 'bush'
    | 'flowers'
    | 'lamp'
    | 'bench'
    | 'rock'
    | 'hedge'
    | 'parasol'
    | 'totem'
    | 'paving'
    // race biomes around the wings (layout/biome.ts): elf jungle, orc badlands, undead blight
    | 'jungle_tree'
    | 'fern'
    | 'stump'
    | 'log'
    | 'dry_bush'
    | 'dead_tree'
    | 'grave';
  /** World px: bottom-centre point (base). */
  x: number;
  y: number;
  seed: number;
  /** Slot it belongs to (disappears when there is a room there). */
  slot?: number;
  /** The opposite: only appears when there IS a room in this slot (e.g. the hedge that closes the garden path). */
  whenRoom?: number;
}
