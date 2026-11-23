// CONTRACT of the art module (procedural pixel art).
//
// - Implementation: client/src/art/index.ts (+ internal files under art/).
// - Consumers: client/src/world/** (office rendering) and client/src/ui/** (avatars).
// - Rule: changes here must be ADDITIVE. Do not rename/remove types, kinds or functions.
//
// General conventions
// - The world is in "world pixels"; 1 tile = TILE px. Everything is pixel art at 1x, scaled up by the camera
//   with imageSmoothingEnabled = false.
// - Perspective: top-down 3/4, as in modern pixel-art office tilesets. See ART DIRECTION below. We see the top and the FRONT (south face)
//   of objects. North walls show their face (2 tiles tall); side and south walls appear
//   only as a thin "cap" so they don't hide the inside of the rooms.
// - Light comes from the top/left: lighter tops, darker front faces, soft shadow underneath.
// - Sprites are cached HTMLCanvasElements (generate once, reuse always).

// ART DIRECTION (top-down 3/4 pixel art of a modern office, bright and detailed)
// - Bright, clean office: light porcelain tiles with subtle grout, warm wood in the lounge, light walls,
//   bluish glass partitions, shelves with coloured binders, potted plants, pictures, a name sign.
// - Desk islands with 1–2 monitors with bright bluish screens, keyboard, mouse, mug, papers; graphite chairs.
// - Kitchen with a light counter and marble backsplash, steel sink, coffee maker, fridge; water cooler with a blue jug.
// - Lounge with a blue/blue-grey sofa and orange cushions, rug, coffee table, bonsai, large printer.
// - Light palette (cool neutrals + warm wood + saturated accents on objects); 1px dark blue-grey outline
//   (not black); 3–4 tones per material; specular highlights; contact shadows; lots of small details.

import type { AppearanceParts } from '../../../shared/appearance';
import type { Race } from '../../../shared/race';

export const TILE = 16;

export type Dir = 'down' | 'up' | 'left' | 'right';

/**
 * Character poses. In parentheses: expected number of frames.
 * "Seated" poses (sit/type/sleep) assume the character is on a seat: the legs
 * are hidden/bent and the body is ~4px lower than standing.
 */
export type Pose =
  | 'stand' // standing still, subtle breathing (2)
  | 'walk' // walking (4)
  | 'run' // running, longer strides and body leaning (4)
  | 'sit' // sitting still (2)
  | 'type' // sitting and typing — usually dir 'up', back to the camera, arms alternating (4)
  | 'sleep' // sitting and dozing: head down (2)
  | 'drink' // standing, bringing the cup to the mouth (2) — use with held 'coffee' or 'water'
  | 'use' // standing, operating a machine: arm stretched forward (2)
  | 'raise_hand' // arm raised, waving — asking for attention (2); works standing and seated (opts.seated)
  | 'talk' // standing and talking, gesturing (2)
  | 'stretch' // standing and stretching, arms up (2)
  | 'read' // standing or seated holding a book/papers in front (2)
  | 'play' // ping-pong: paddle in hand, alternating arm (2)
  | 'wait' // sitting and waiting for something to finish (e.g. a shell), leaning back (2). With held 'popcorn': hand goes from the bucket to the mouth, eating popcorn; no item: crossed arms, fingers/foot tapping
  // --- social life (additive)
  | 'cheer' // celebrating: both arms up, clenched fists, mouth open, a little hop on frame 1 (2). Standing or seated (opts.seated)
  | 'laugh' // belly laugh: eyes closed in an arc, mouth open, one hand on the belly, body shaking 1px (2). Standing or seated
  | 'game' // playing a video game: controller (held 'controller') in both hands in front of the chest, thumbs moving, body leaning towards the screen (2). Standing or seated
  | 'rps' // rock-paper-scissors. held 'none': clenched fist going up (frame 0) and down (1) on the "rock-paper-scissors" count; held 'rock'|'paper'|'scissors': arm stretched forward showing the gesture (2). Standing (seated works too)
  | 'groom' // in front of the mirror (usually dir 'up', facing away): one hand near the face/hair going back and forth — lipstick, comb, fixing the hair (2). Optional held 'lipstick'|'comb'. Standing
  | 'sulk'; // upset (lost the bet/match): drooping shoulders, head down, half-closed eyes, hanging arms (2). Standing or seated

export type HeldItem = 'none' | 'coffee' | 'water' | 'papers' | 'laptop' | 'book' | 'box' | 'paddle' | 'popcorn'
  // --- social life (additive)
  | 'controller' // video game controller ('game' pose; standing/walking, in one hand)
  | 'rock' // 'rps' pose: closed hand (rock)
  | 'paper' // 'rps' pose: open hand, palm down (paper)
  | 'scissors' // 'rps' pose: index and middle fingers in a V (scissors)
  | 'phone' // phone (with 'read' or 'sit': looking at the screen, thumb scrolling; bluish lit screen)
  | 'lipstick' // lipstick ('groom' pose)
  | 'comb'; // comb ('groom' pose)

export type HairStyle =
  | 'short' | 'buzz' | 'spiky' | 'side_part' | 'curly' | 'afro' | 'bob' | 'long' | 'ponytail' | 'bun' | 'pigtails'
  | 'mohawk' | 'bald' | 'wavy';

export type TopStyle = 'tshirt' | 'hoodie' | 'shirt_tie' | 'sweater' | 'jacket' | 'blouse' | 'polo';

export type Accessory = 'none' | 'glasses' | 'sunglasses' | 'headphones' | 'cap' | 'beanie' | 'earrings' | 'bow';

export interface Appearance {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  eyes: string;
  top: string;
  topAccent: string;
  topStyle: TopStyle;
  bottom: string;
  shoes: string;
  accessory: Accessory;
  accessoryColor: string;
  /** Badge/lanyard on the neck (used to tell subagents apart). null = no badge. */
  lanyard: string | null;
  look: 'f' | 'm';
  /** (Optional, additive) Beard/moustache — only rolled for look 'm'. Absent = no facial hair. */
  facialHair?: 'none' | 'stubble' | 'beard' | 'mustache' | 'goatee';
  /** (Optional, additive) Bottom half of the outfit. Absent = trousers. */
  bottomStyle?: 'pants' | 'shorts' | 'skirt';
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Dynamic regions inside a sprite (in sprite px, relative to the top-left corner). */
export type SpriteRectName = 'screen' | 'board' | 'glass' | 'face' | 'tv' | 'sign' | 'art' | 'glow'
  /**
   * (Additive) 2nd monitor/laptop of the `desk`, when present. The sprite already has fixed, dimmed
   * content (spreadsheet/editor/dashboard); the world MAY draw over it (e.g. drawScreen 'off'
   * when the room goes dark, or another mode when the owner is working). Ignoring it also works.
   */
  | 'screen2';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Anchor point inside the sprite (px). See the conventions in FurnitureDef / characterSprite. */
  ax: number;
  ay: number;
  rects?: Partial<Record<SpriteRectName, Rect>>;
}

/** `front` is drawn OVER whoever is seated/inside (e.g. the chair backrest, the stall door). */
export interface FurnitureSprites {
  base: Sprite;
  front?: Sprite;
}

export interface CharacterFrameRequest {
  appearance: Appearance;
  dir: Dir;
  pose: Pose;
  frame: number;
  held?: HeldItem;
  /** For poses that can be standing or seated (raise_hand, read, talk). */
  seated?: boolean;
  /** Seasonal accessory; absent keeps the original appearance. */
  costume?: 'santa' | 'witch' | 'pumpkin' | 'vampire';
  /**
   * (Additive) Race the character is drawn as: the race of its room (shared/race.ts `raceOfRoom`). Only the
   * rendering changes (skin tone, ears, tusks, eyes, trims); the stored appearance stays the same. Absent = 'human'.
   */
  race?: Race;
}

export type FurnitureKind =
  // --- office (project rooms)
  | 'desk' // 2x1. Desk with the monitor facing SOUTH (screen visible to the camera), keyboard and mug. rects.screen = screen area. Variants by race: 'wood' | 'white' (human), 'moonwood' (elf), 'dark' (orc).
  | 'desk_back' // 2x1. Desk seen from the other side: we see the BACK of the monitor; the person sits NORTH of it, facing down (face visible). For face-to-face desk islands. Same variants as desk.
  | 'office_chair_front' // 1x1 seat facing DOWN (backrest to the north, drawn BEFORE the character; no front). Pairs with desk_back.
  | 'office_chair' // 1x1 seat. Backrest to the south (the character sits facing up, back to the camera). front = backrest. Variants by race: 'blue' | 'gray' (human), 'violet' | 'teal' (elf), 'red' | 'black' | 'green' (orc).
  | 'bookshelf' // 2x1 against the north wall. Coloured books.
  | 'filing_cabinet' // 1x1 filing cabinet with drawers.
  | 'printer' // 1x1 printer on a low cabinet.
  | 'trash_bin' // 1x1 small bin (can be much smaller than the tile).
  | 'plant_small' // 1x1 small pot. variants: 'fern' | 'succulent' | 'flower'
  | 'plant_tall' // 1x1 tall plant (up to ~2 tiles high). variants: 'palm' | 'ficus' | 'monstera' | 'bonsai'
  | 'glass_partition' // 1x1 glass partition segment on a white base (half wall + bluish glass with a reflection). variants: 'h' (runs east-west) | 'v' (runs north-south) | 'end' (end/post)
  | 'binder_shelf' // 1x1 tall, narrow shelf with coloured binders (blue/orange/green) and boxes.
  | 'meeting_table' // 3x2 meeting table/bench for subagents.
  | 'stool' // 1x1 simple seat (stool). The character can sit facing any direction.
  | 'floor_lamp' // 1x1 floor lamp. rects.glow = centre of the light.
  | 'water_cooler' // 1x1 water cooler with a blue jug. Use: the character stands to the SOUTH, facing up.
  // --- mounted on the north wall (mount: 'wall')
  | 'whiteboard' // 3 tiles wide. Kanban board. rects.board = area where the renderer draws sticky notes.
  | 'window' // 2 tiles. Window; rects.glass = glass (the renderer draws the sky before the frame).
  | 'clock' // 1 tile. Clock; rects.face = dial (hands drawn by the renderer).
  | 'poster' // 1 tile. variants: 'code' | 'coffee' | 'rocket' | 'cat' | 'bug' | 'ship_it' | 'moon'. Race banners: 'code' = Alliance (human), 'coffee' = Horde (orc), 'moon' = night-elf; the rest are neutral notices.
  | 'painting' // 2 tiles. Framed picture; rects.art = painting area (can receive an AI-generated image).
  | 'tv' // 2 tiles. Wall TV; rects.tv = screen.
  | 'light_switch' // 1 tile (the sprite is small). variants: 'on' | 'off'
  | 'elevator' // 2 tiles. Elevator door; state 0..4 = door closed .. fully open. Includes the light/arrow above.
  | 'door_frame' // 2 tiles. Door frame drawn over the opening in the north wall face.
  | 'sign' // 3 tiles. Sign with the room name; rects.sign = text area (the renderer writes the name).
  | 'mirror' // 1 tile. Mirror (above the bathroom sinks). (Additive) rects.glass = reflective area (the world can draw the reflection of whoever stands in front).
  | 'shelf_wall' // 2 tiles. Wall shelf with objects.
  // --- kitchen / café
  | 'counter' // 1x1 counter segment (against the north wall). variants: 'plain' | 'drawers'
  | 'counter_sink' // 1x1 counter with a sink.
  | 'coffee_machine' // 1x1 counter with a coffee maker on top. Use: the character to the SOUTH, facing up. state 0 = idle, 1 = brewing.
  | 'microwave' // 1x1 counter with a microwave.
  | 'fridge' // 1x1 tall fridge.
  | 'vending_machine' // 1x1 tall, lit snack machine.
  | 'cafe_table' // 1x1 small round table.
  | 'cafe_chair' // 1x1 seat. variant = direction the sitter faces: 'up' | 'down' | 'left' | 'right'. front when 'up'.
  // --- lounge
  | 'sofa' // 3x1 seat. variant 'down' (facing the camera) | 'up' (facing away, front = backrest).
  | 'armchair' // 1x1 seat. variants like cafe_chair.
  | 'coffee_table' // 2x1 coffee table.
  | 'pingpong_table' // 3x2 ping-pong table (vertical net in the middle; players at the west/east ends).
  | 'beanbag' // 1x1 beanbag (seat). colour variants: 'red' | 'blue' | 'yellow' | 'green'
  | 'arcade' // 1x1 arcade cabinet (used as a machine: the character to the south facing up). (Additive) rects.screen = screen (the world can draw drawScreen 'game' over it during a match).
  // --- bathroom
  | 'toilet_stall' // 2x2 stall with a toilet. The character goes in through the door (SOUTH side) and disappears. front = partition/door. state 0 = free (door ajar), 1 = occupied (door closed, red indicator).
  | 'sink' // 1x1 sink with a cabinet (against the north wall; use 'mirror' on the wall above).
  // --- reception
  | 'reception_desk' // 3x1 reception counter.
  | 'bench'; // 2x1 waiting bench (seat, facing down).

export interface FurnitureDef {
  mount: 'floor' | 'wall';
  /**
   * Floor: tiles occupied on the floor (w x h).
   * Wall: width in tiles on the wall face (h ignored).
   */
  footprint: { w: number; h: number };
  /** Floor: whether the tiles block the way. Seats don't block (the character "enters" them). */
  blocks: boolean;
  /** It is a seat (the character can sit on it). */
  seat?: boolean;
  variants?: readonly string[];
  /** Number of visual states (e.g. elevator 5, toilet_stall 2). */
  states?: number;
}

/**
 * Furniture catalogue. Anchoring (ax, ay) of furniture sprites:
 * - mount 'floor': (ax, ay) matches the BOTTOM CENTRE point of the footprint in the world,
 *   i.e. (x0 + w*TILE/2, y0 + h*TILE) where (x0, y0) is the top-left corner of the footprint.
 *   The sprite may extend upwards (height) and a little to the sides.
 * - mount 'wall': (ax, ay) matches the BOTTOM CENTRE point of the wall segment, that is,
 *   on the skirting line (base of the wall face). The sprite "floats" at the right height by itself.
 * Depth ordering: by the anchor's y in the world (greater y = drawn later).
 */
export const FURNITURE: Readonly<Record<FurnitureKind, FurnitureDef>> = {
  desk: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['wood', 'white', 'dark', 'moonwood'] },
  desk_back: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true, variants: ['wood', 'white', 'dark', 'moonwood'] },
  office_chair_front: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['black', 'blue', 'red', 'green', 'gray', 'violet', 'teal'] },
  office_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['black', 'blue', 'red', 'green', 'gray', 'violet', 'teal'] },
  bookshelf: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  filing_cabinet: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  printer: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  trash_bin: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  plant_small: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['fern', 'succulent', 'flower'] },
  plant_tall: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['palm', 'ficus', 'monstera', 'bonsai'] },
  glass_partition: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['h', 'v', 'end'] },
  binder_shelf: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  meeting_table: { mount: 'floor', footprint: { w: 3, h: 2 }, blocks: true },
  stool: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true },
  floor_lamp: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  water_cooler: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  whiteboard: { mount: 'wall', footprint: { w: 3, h: 0 }, blocks: false },
  window: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  clock: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false },
  poster: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false, variants: ['code', 'coffee', 'rocket', 'cat', 'bug', 'ship_it', 'moon'] },
  painting: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  tv: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  light_switch: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false, variants: ['on', 'off'] },
  elevator: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false, states: 5 },
  door_frame: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  sign: { mount: 'wall', footprint: { w: 3, h: 0 }, blocks: false },
  mirror: { mount: 'wall', footprint: { w: 1, h: 0 }, blocks: false },
  shelf_wall: { mount: 'wall', footprint: { w: 2, h: 0 }, blocks: false },
  counter: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, variants: ['plain', 'drawers'] },
  counter_sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  coffee_machine: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true, states: 2 },
  microwave: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  fridge: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  vending_machine: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  cafe_table: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  cafe_chair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  sofa: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: false, seat: true, variants: ['down', 'up'] },
  armchair: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['up', 'down', 'left', 'right'] },
  coffee_table: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: true },
  pingpong_table: { mount: 'floor', footprint: { w: 3, h: 2 }, blocks: true },
  beanbag: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: false, seat: true, variants: ['red', 'blue', 'yellow', 'green'] },
  arcade: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  toilet_stall: { mount: 'floor', footprint: { w: 2, h: 2 }, blocks: true, states: 2 },
  sink: { mount: 'floor', footprint: { w: 1, h: 1 }, blocks: true },
  reception_desk: { mount: 'floor', footprint: { w: 3, h: 1 }, blocks: true },
  bench: { mount: 'floor', footprint: { w: 2, h: 1 }, blocks: false, seat: true },
};

export type FloorKind =
  | 'carpet' // project rooms (uses tint/tint2 from the room theme)
  | 'wood' // lounge
  | 'tile_check' // kitchen (checkered)
  | 'tile_white' // bathroom
  | 'concrete' // packed earth (old corridor; still in the art preview)
  | 'hall' // corridor: wall-to-wall office carpet (tint = base, tint2 = woven motif)
  | 'marble' // reception
  | 'grass' // outdoor area
  | 'jungle' // outside the elf wing: deep, lush undergrowth with ferns and moss
  | 'desert' // outside the orc wing: dry, cracked sand and pebbles
  | 'blight' // outside the undead wing: dead purple-grey earth with withered tufts
  | 'forest_path' // the elf road: packed earth, fallen leaves, roots and mossy stepping stones
  | 'sidewalk' // outdoor sidewalk
  | 'street'; // outdoor street (lanes drawn by the renderer if it wants)

/**
 * Organic seam between two floors: the floor is kept fully at `from` and gone at `to` (px of world, along
 * `axis`), with a blotchy pixel edge in between, so it interlocks with the floor underneath instead of fading.
 */
export interface FloorFade {
  axis: 'x' | 'y';
  from: number;
  to: number;
}

/** Forced rug look (otherwise the colour picks it). */
export type RugStyle = 'crypt';

export type WallPattern = 'plain' | 'stripes' | 'tiles' | 'wood_panel' | 'brick' | 'glass' | 'marble'
  | 'grove' // (additive) elf: living moonwood trunks with vines, leaves and a silver crescent band
  | 'moonstone'; // (additive) elf: mossy carved violet-grey stone with moon glyphs

export interface WallStyle {
  /** Base colour of the wall face. */
  base: string;
  /** Detail colour (skirting/stripe). */
  trim?: string;
  pattern?: WallPattern;
  /** Outer wall of the building (a more sober tone, may have a brick/concrete texture). */
  exterior?: boolean;
}

export interface Doorway {
  /** Start of the opening in world px (absolute) and width in px. */
  x: number;
  w: number;
}

export type ScreenMode =
  | 'off' // monitor off (matte navy blue with a diagonal reflection; never near-black)
  | 'standby' // (additive) on but unused: blue background with a slowly pulsing logo — e.g. a vacant desk while the room is lit
  | 'idle' // gentle screensaver
  | 'code' // editor with coloured lines of code scrolling
  | 'terminal' // dark terminal with green text appearing
  | 'browser' // web page (address bar + blocks)
  | 'search' // search results / magnifier
  | 'chat' // conversation (alternating bubbles)
  | 'docs' // text document
  | 'tasks' // checkbox list
  | 'alert' // screen flashing amber (needs attention)
  | 'progress' // dark terminal with a moving progress bar/spinner (waiting for a command to finish)
  // --- social life (additive; meant for the lounge TV and the arcade, but valid for any screen)
  | 'show' // animated TV show; FIXED mapping by `seed`: seed % 3 === 0 football (pitch, players, ball; every so often the ball goes into the goal and the screen flashes "GOL"), 1 soap opera (two faces in close-up, hearts), 2 cartoon (bright colours)
  | 'game'; // video game (two players); FIXED mapping by `seed`: seed % 2 === 0 split-screen race (two little cars on the track), 1 fighting game (two figures and health bars)

export interface RoomTheme {
  carpet: string;
  carpet2: string;
  wall: WallStyle;
  accent: string;
  deskVariant: string;
  chairVariant: string;
}

/** Small pixel-art icons (~8–12px) for states above the head. */
export type IconName = 'alert' | 'question' | 'zzz' | 'check' | 'heart' | 'coffee' | 'music' | 'idea' | 'sweat' | 'star' | 'lightning' | 'chat' | 'box' | 'wave'
  | 'hourglass' // hourglass (waiting for a shell)
  | 'hourglass_flip' // the same hourglass turning over (alternate with 'hourglass' to animate)
  | 'cobweb' // cobweb (~12px) for the corner of the chair/character when the wait gets long
  | 'storm' // little rain cloud with lightning (something failed)
  // --- social life (additive)
  | 'coin' // shiny gold coin (~8px) — earned money
  | 'sparkle' // 4-point sparkle (~9px) — got spruced up at the mirror
  | 'trophy' // gold trophy (~10px) — won the match/bet
  | 'hand_rock' // rock gesture (fist) (~10px) — rock-paper-scissors reveal
  | 'hand_paper' // paper gesture (open hand) (~10px)
  | 'hand_scissors'; // scissors gesture (V) (~10px)

/** Signature that art/index.ts must export (the world and the UI depend on it). */
export interface ArtModule {
  appearanceFromSeed(seed: number, opts?: { look?: 'f' | 'm'; sub?: boolean; parts?: AppearanceParts }): Appearance;
  /** Anchoring: (ax, ay) = centre of the feet (point on the floor). A character is ~14–18px wide and ~24–28px tall. */
  characterSprite(req: CharacterFrameRequest): Sprite;
  poseFrameCount(pose: Pose): number;
  /** Duration of each frame of the pose in ms. */
  poseFrameDuration(pose: Pose): number;
  /**
   * `opts.seed` (optional, additive) varies the details of repeated items (objects on the desk, books on the
   * shelf, binders...). Without a seed, variation 0 is used. Sprites stay cached by (kind, variant, state, seed % N).
   */
  /** `bone`: drawn as undead furniture (wood and hide turn to bone, red leather to grave violet). */
  furnitureSprites(kind: FurnitureKind, variant?: string, state?: number, opts?: { seed?: number; bone?: boolean }): FurnitureSprites;
  /** Draws a floor area (world px, multiples of TILE). `seed` varies the details per tile. */
  drawFloor(ctx: CanvasRenderingContext2D, kind: FloorKind, x: number, y: number, w: number, h: number, opts: { seed: number; tint?: string; tint2?: string; fade?: FloorFade }): void;
  /** Decorative rug on the floor. */
  drawRug(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, seed: number, style?: RugStyle): void;
  /** North wall face: 2*TILE tall from y, with a dark "cap" on top and skirting at the base. */
  drawWallFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: WallStyle, opts?: { doorways?: Doorway[] }): void;
  /** Wall cap (sides and segments without a face), arbitrary rectangle. */
  drawWallTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, style: WallStyle): void;
  /** South wall: 1 tile tall (cap + short low wall), with optional openings. */
  drawSouthWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, style: WallStyle, opts?: { doorways?: Doorway[] }): void;
  /** Animated screen content (monitor/TV). `r` in world px. `t` in ms. */
  drawScreen(ctx: CanvasRenderingContext2D, r: Rect, mode: ScreenMode, t: number, seed: number): void;
  /** Kanban board sticky notes (columns: to do / doing / done). */
  drawBoard(ctx: CanvasRenderingContext2D, r: Rect, items: readonly { status: 'pending' | 'in_progress' | 'completed' }[], t: number): void;
  /** Sky + horizon seen through the window for the local time (0–24, fractional). */
  drawWindowView(ctx: CanvasRenderingContext2D, r: Rect, hour: number, t: number, seed: number): void;
  drawClock(ctx: CanvasRenderingContext2D, r: Rect, date: Date): void;
  roomTheme(seed: number): RoomTheme;
  iconSprite(name: IconName): Sprite;
  /**
   * (Optional, additive) Football play of drawScreen('show') with seed % 3 === 0, at instant `t`:
   * from `progress >= goalAt` the screen flashes "GOL" (ball in the right-hand goal if `right`). The world
   * uses it to make the crowd cheer along with the TV.
   */
  footballLance?(t: number, seed: number): { lance: number; progress: number; right: boolean; period: number; goalAt: number };
  /** Avatar (head + shoulders) scaled up for the UI. `parts`: pieces of the edited character (see AgentInfo.parts). */
  avatarCanvas(seed: number, opts?: { look?: 'f' | 'm'; sub?: boolean; scale?: number; parts?: AppearanceParts; race?: Race }): HTMLCanvasElement;
}
