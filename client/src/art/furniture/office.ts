// Project room furniture: desks (front and back), chairs, shelves, filing cabinet, printer,
// bin, plants, glass partitions, meeting table, stool, lamp and water cooler.
// Drawing coordinates = footprint (0,0 at the top-left corner; base at y = h*TILE).
import { ramp, shade, type Ramp } from '../core/color';
import { floorSheet, rectAt, type BufFurniture, type BufSprite } from '../core/sprite';
import type { PixelBuf } from '../core/pixbuf';
import {
  FACTION, M, book, candle, contact, crescent, drape, foliage, frontFace, handAxe, ironBand, keyboard, leafBlade, leafSprig,
  monitorBack, monitorFront, moonLantern, mouse, mug, papers, pencilCup, photoFrame, pick, pot, quillInk, rivet, rngOf, skullCandle,
  smallSucculent, staticScreen, topFace, tusk, underRect, woodGrain, type DeskItemTone, type Faction,
} from './kit';

type Box = { x: number; y: number; w: number; h: number };

// ------------------------------------------------------------------ desks

/** Desk faction: `dark` = Horde; `moonwood` = Elf; `wood` and `white` = Alliance. */
function deskFaction(variant: string | undefined): Faction {
  return variant === 'dark' ? 'horde' : variant === 'moonwood' ? 'elf' : 'alliance';
}

interface DeskMats {
  top: Ramp;
  edge: Ramp;
  legs: Ramp;
  ped: Ramp;
}

function deskMats(variant: string | undefined): DeskMats {
  switch (variant) {
    case 'white':
      // Alliance: light marble top, carved stone edge, oak legs.
      return { top: ramp('#ddd4c0', 0.05), edge: FACTION.alliance.stone, legs: FACTION.alliance.oak, ped: FACTION.alliance.oak };
    case 'dark':
      // Horde: thick dark-wood planks, log legs, chest with iron bands.
      return { top: ramp('#5e3d24', 0.07), edge: FACTION.horde.timber, legs: FACTION.horde.timber, ped: ramp('#553822', 0.07) };
    case 'moonwood':
      // Elf: polished violet heartwood top grown from living moonwood, bark edge and root legs.
      return { top: ramp('#a8969e', 0.05), edge: FACTION.elf.bark, legs: FACTION.elf.bark, ped: FACTION.elf.bark };
    default:
      // Alliance: honey oak with a gold trim.
      return { top: ramp('#b07d45', 0.07), edge: FACTION.alliance.oak, legs: FACTION.alliance.oak, ped: FACTION.alliance.oak };
  }
}

const MUG_COLORS = ['#9c2f25', '#2f7a78', '#e0b23c', '#5f8a3a', '#d9cba8', '#6a4a8a'] as const;

/** Contact shadow of the desk and the shadow of the gap under the top (composited underneath, after the outline). */
function deskShadow(b: PixelBuf): void {
  underRect(b, 3, 8, 26, 7, 'rgba(36,24,14,0.22)');
  contact(b, -1, 13, 34, 4, 0.2);
}

/** Claw mark (Horde): three diagonal scratches. */
function clawMark(b: PixelBuf, x: number, y: number, h: number, c: string): void {
  for (let k = 0; k < 3; k++) b.line(x + k * 2, y, x + k * 2 + 1, y + h - 1, c);
}

/** Golden Alliance emblem (simple 5x4 crown). */
function crestMark(b: PixelBuf, x: number, y: number): void {
  const g = FACTION.alliance.gold;
  b.set(x, y, g.hi);
  b.set(x + 2, y, g.hi);
  b.set(x + 4, y, g.hi);
  b.hline(x, x + 4, y + 1, g.base);
  b.hline(x, x + 4, y + 2, g.lt);
  b.hline(x + 1, x + 3, y + 3, g.dk);
}

/** Desk leg: a log with iron bands (Horde) or a turned leg with gold rings (Alliance). */
function deskLeg(b: PixelBuf, x: number, m: DeskMats, faction: Faction): void {
  b.rect(x, 8, 3, 8, m.legs.base);
  b.vline(x, 8, 15, m.legs.lt);
  b.vline(x + 2, 8, 15, m.legs.dk);
  b.hline(x, x + 2, 15, m.legs.dd);
  if (faction === 'horde') {
    ironBand(b, x, x + 2, 9, false);
    ironBand(b, x, x + 2, 13, false);
    b.set(x + 1, 9, '#8a8a94');
    b.set(x + 1, 13, '#8a8a94');
  } else if (faction === 'elf') {
    // Living root: silver ring under the top, a vine with a leaf winding down, and a flared foot.
    const e = FACTION.elf;
    b.hline(x, x + 2, 8, e.silver.base);
    b.set(x, 8, e.silver.hi);
    b.set(x + 1, 10, e.leaf.base);
    b.set(x, 11, e.leaf.lt);
    b.set(x + 2, 12, e.leaf.dk);
    b.set(x + (x === 0 ? 3 : -1), 15, m.legs.dk);
    b.set(x + 1, 13, m.legs.dk);
  } else {
    const g = FACTION.alliance.gold;
    b.hline(x, x + 2, 8, g.base);
    b.set(x, 8, g.hi);
    // Turned waist.
    b.set(x, 11, m.legs.dk);
    b.set(x + 2, 11, m.legs.dd);
    b.hline(x, x + 2, 14, g.dk);
    b.set(x, 14, g.lt);
  }
}

/** Top + edges + legs + chest/drawer unit (shared by desk and desk_back). */
function deskBody(s: BufSprite, m: DeskMats, faction: Faction, seed: number, back: boolean): void {
  const b = s.buf;
  const horde = faction === 'horde';
  const elf = faction === 'elf';
  const E = FACTION.elf;
  if (back) {
    // Panel on the viewer's side covering the gap, with the faction banner hanging in the middle.
    frontFace(b, 1, 8, 30, 6, m.ped);
    b.hline(1, 30, 8, m.ped.dk);
    if (horde) {
      for (const x of [8, 16, 24]) b.vline(x, 9, 13, m.ped.dk);
      ironBand(b, 1, 30, 12);
      drape(b, 12, 8, 8, 8, FACTION.horde.red);
      clawMark(b, 13, 10, 4, '#2a1a14');
      b.hline(11, 20, 8, '#3a3a40');
    } else if (elf) {
      // Bark panel with flowing grooves, a silver vine line and a violet banner with a silver crescent.
      for (const x of [5, 10, 22, 27]) {
        b.vline(x, 9, 13, m.ped.dk);
        b.set(x + 1, 10 + (x % 3), m.ped.lt);
      }
      b.hline(1, 30, 9, E.silver.dk);
      for (let x = 2; x < 30; x += 4) b.set(x, 11, E.leaf.base);
      drape(b, 12, 8, 8, 8, E.violet, { fringe: E.silver.lt });
      crescent(b, 14, 9);
      b.hline(11, 20, 8, E.silver.base);
    } else {
      b.hline(2, 29, 11, m.ped.lt);
      b.hline(1, 30, 9, FACTION.alliance.gold.dk);
      drape(b, 12, 8, 8, 8, FACTION.alliance.blue, { fringe: FACTION.alliance.gold.base });
      crestMark(b, 13, 10);
      b.hline(11, 20, 8, FACTION.alliance.gold.base);
    }
  }
  for (const x of [0, 29]) deskLeg(b, x, m, faction);
  if (!back) {
    if (horde) {
      // Plank chest with bands and an iron padlock, under the right side.
      frontFace(b, 19, 8, 10, 8, m.ped);
      b.vline(22, 8, 15, m.ped.dk);
      b.vline(25, 8, 15, m.ped.dk);
      ironBand(b, 19, 28, 9);
      ironBand(b, 19, 28, 14);
      b.rect(23, 11, 2, 2, '#3a3a40');
      b.set(23, 11, '#c4a040');
    } else if (elf) {
      // Hollow-trunk cabinet: bark with an arched niche holding a glowing moon gem, a vine across the top.
      frontFace(b, 19, 8, 10, 8, m.ped);
      b.vline(20, 9, 14, m.ped.lt);
      b.vline(27, 9, 14, m.ped.dk);
      b.rect(22, 10, 4, 5, m.ped.dd);
      b.hline(23, 24, 9, m.ped.dd);
      b.set(23, 12, '#4fc8c0');
      b.set(24, 12, E.moon);
      b.set(24, 13, '#2f8a86');
      b.hline(22, 25, 15, E.silver.dk);
      for (const x of [19, 21, 26, 28]) b.set(x, 8 + (x & 1), E.leaf.base);
      b.set(20, 9, E.leaf.lt);
    } else {
      // Oak drawer unit with gold handles.
      frontFace(b, 19, 8, 10, 8, m.ped);
      b.hline(19, 28, 11, m.ped.dk);
      b.hline(20, 27, 12, m.ped.lt);
      b.hline(23, 24, 10, FACTION.alliance.gold.base);
      b.hline(23, 24, 14, FACTION.alliance.gold.base);
    }
  }
  // Top (12 rows) + edge thickness (2 rows).
  topFace(b, 0, -6, 32, 12, m.top);
  if (elf) {
    // Polished heartwood: long flowing grain with a couple of knots and a thin silver leaf inlay.
    woodGrain(b, 1, -5, 30, 10, m.top, seed);
    const r = rngOf(seed, 9);
    const kx = 10 + Math.floor(r() * 14);
    b.set(kx, -3, m.top.dk);
    b.set(kx + 1, -3, m.top.dd);
    b.hline(1, 30, -5, m.top.base);
  } else if (horde) {
    // Thick planks with joints and nails.
    woodGrain(b, 1, -5, 30, 10, m.top, seed);
    for (const y of [-2, 2]) {
      b.hline(0, 31, y, m.top.dk);
      b.set(1, y + 1, '#2a2a2e');
      b.set(30, y + 1, '#2a2a2e');
    }
  } else if (m.top.lt === deskMats('white').top.lt) {
    // Marble: sparse diagonal grey veins (away from the corner where the keyboard is read).
    const r = rngOf(seed, 9);
    for (let k = 0; k < 3; k++) {
      const x0 = 8 + Math.floor(r() * 18);
      b.line(x0, -5, x0 + 4, -2, '#c4bcaa');
    }
  } else {
    woodGrain(b, 1, -5, 30, 10, m.top, seed);
  }
  b.hline(0, 31, 6, m.edge.base);
  b.hline(0, 31, 7, m.edge.dk);
  b.set(0, 6, m.edge.lt);
  if (horde) {
    // Riveted iron corner brackets on the front edge.
    for (const x of [0, 28]) {
      b.rect(x, 4, 4, 4, '#3a3a40');
      b.hline(x, x + 3, 4, '#55555e');
      rivet(b, x + 1, 5);
    }
  } else if (elf) {
    // Silver filigree along the edge: a thin line with small scrolls, and leaves on the front corners.
    b.hline(0, 31, 6, E.silver.base);
    for (let x = 3; x < 31; x += 5) b.set(x, 7, E.silver.lt);
    b.set(0, 6, E.silver.hi);
    b.set(31, 6, E.silver.dk);
    b.set(0, 5, E.leaf.lt);
    b.set(1, 5, E.leaf.base);
    b.set(31, 5, E.leaf.dk);
  } else {
    // Gold trim along the edge.
    b.hline(0, 31, 6, FACTION.alliance.gold.base);
    b.set(0, 6, FACTION.alliance.gold.hi);
    b.set(31, 6, FACTION.alliance.gold.dk);
  }
  if (!back) {
    // Faction cloth hanging over the edge, on the left (outside the silhouette of whoever sits in the middle).
    if (horde) {
      drape(b, 4, 5, 6, 8, FACTION.horde.red);
      clawMark(b, 5, 7, 3, '#2a1a14');
    } else if (elf) {
      drape(b, 4, 5, 6, 8, E.violet, { fringe: E.silver.lt });
      b.set(6, 7, E.silver.hi);
      b.set(5, 8, E.silver.lt);
      b.set(5, 9, E.silver.base);
      b.set(6, 10, E.silver.dk);
    } else {
      drape(b, 4, 5, 6, 8, FACTION.alliance.blue, { fringe: FACTION.alliance.gold.base });
      b.set(6, 8, FACTION.alliance.gold.hi);
      b.set(7, 8, FACTION.alliance.gold.base);
      b.set(6, 9, FACTION.alliance.gold.dk);
    }
  }
}

/** Desk light by faction: skull candle (Horde), moon lantern (Elf) or candle in an iron holder (Alliance). */
function deskLight(b: PixelBuf, x: number, y: number, faction: Faction): void {
  if (faction === 'horde') skullCandle(b, x, y);
  else if (faction === 'elf') moonLantern(b, x, y - 2);
  else photoFrame(b, x, y);
}

/** Elf desk plant: a moonpetal sprig in a small silver-rimmed bark bowl. (x, y) = top-left of the bowl. */
function moonpetal(b: PixelBuf, x: number, y: number): void {
  const e = FACTION.elf;
  b.rect(x, y, 4, 3, e.bark.base);
  b.hline(x, x + 3, y, e.silver.base);
  b.set(x + 3, y + 1, e.bark.dk);
  b.set(x + 3, y + 2, e.bark.dd);
  leafSprig(b, x + 1, y - 1, 1);
  b.set(x + 2, y - 5, '#c8a8f0');
  b.set(x + 3, y - 5, '#e8d8ff');
}

/** Owl-feather quill in a silver inkwell (Elf). (x, y) = base. */
function owlQuill(b: PixelBuf, x: number, y: number): void {
  const e = FACTION.elf;
  b.rect(x, y - 1, 3, 2, '#2a2438');
  b.hline(x, x + 2, y - 2, e.silver.base);
  b.set(x, y - 2, e.silver.hi);
  b.line(x + 1, y - 2, x + 4, y - 6, '#8a7a68');
  b.set(x + 3, y - 5, '#d8ccb4');
  b.set(x + 4, y - 5, '#5a4a3c');
  b.set(x + 4, y - 7, '#e8dcc4');
}

/** Objects on the desk (variations by seed). Returns the main and the secondary screen rectangles. */
function deskTop(s: BufSprite, seed: number, tone: DeskItemTone, faction: Faction): { screen: Box; screen2?: Box } {
  const b = s.buf;
  const r = rngOf(seed, 11);
  const v = seed % 6;
  const mugC = pick(r, MUG_COLORS);
  const horde = faction === 'horde';
  const elf = faction === 'elf';
  let screen: Box;
  let screen2: Box | undefined;
  switch (v) {
    case 1: {
      screen = monitorFront(b, 2, -17, 16, 11, faction);
      screen2 = monitorFront(b, 18, -16, 13, 10, faction);
      staticScreen(b, screen2, 'sheet', seed);
      keyboard(b, 6, -1, 11, tone);
      mouse(b, 20, 0, tone);
      mug(b, 26, -2, mugC);
      break;
    }
    case 2: {
      screen = monitorFront(b, 5, -17, 16, 11, faction);
      // Open tome standing on the right (a page with runes), leather cover (Horde) or blue with gold corners.
      // Elf: violet cover with silver corners.
      const cover = horde ? '#5a2a1c' : elf ? '#4a2f66' : '#2f4f9c';
      const corner = horde ? '#e8dcc0' : elf ? FACTION.elf.silver.lt : '#e0b23c';
      b.rect(22, -9, 9, 6, cover);
      b.hline(22, 30, -9, horde ? '#7a3a26' : elf ? '#6a3f8a' : '#3d63b8');
      b.set(22, -9, corner);
      b.set(30, -9, corner);
      screen2 = { x: 23, y: -8, w: 7, h: 4 };
      staticScreen(b, screen2, 'ide', seed);
      b.rect(21, -3, 11, 2, '#e2d2a4');
      b.hline(21, 31, -2, '#b8a272');
      b.set(26, -3, '#7a3a26');
      b.hline(22, 31, -1, tone === 'onLight' ? 'rgba(40,46,70,0.3)' : 'rgba(60,40,40,0.2)');
      keyboard(b, 8, -1, 10, tone);
      if (horde) skullCandle(b, 1, -4);
      else if (elf) moonpetal(b, 1, -3);
      else smallSucculent(b, 1, -3);
      break;
    }
    case 3: {
      screen = monitorFront(b, 8, -17, 16, 11, faction);
      // Wax seals nailed to the frame.
      // Wax seals (Horde red, Alliance blue) or teal moonstones (Elf) on the frame.
      b.rect(22, -15, 2, 2, horde ? '#9c2f25' : elf ? '#4fc8c0' : '#2f4f9c');
      b.rect(9, -15, 2, 2, '#d48a2c');
      keyboard(b, 11, -1, 10, tone);
      mouse(b, 23, 0, tone);
      deskLight(b, 2, -5, faction);
      papers(b, 24, -4, 6, 4, tone);
      mug(b, 3, 0, mugC);
      break;
    }
    case 4: {
      screen = monitorFront(b, 4, -17, 15, 11, faction);
      screen2 = monitorFront(b, 19, -17, 12, 10, faction);
      staticScreen(b, screen2, 'chart', seed);
      keyboard(b, 7, -1, 11, tone);
      mouse(b, 21, 0, tone);
      papers(b, 1, -2, 5, 4, tone);
      break;
    }
    case 5: {
      screen = monitorFront(b, 8, -17, 16, 11, faction);
      keyboard(b, 11, -1, 10, tone);
      mouse(b, 23, 0, tone);
      if (horde) {
        // Hand axe lying on the bench.
        handAxe(b, 0, -2);
      } else if (elf) {
        // Leaf-bound scroll tied with a violet ribbon, a fallen leaf beside it.
        b.rect(1, -3, 7, 2, '#dce8d4');
        b.hline(1, 7, -2, '#a8bca0');
        b.vline(4, -3, -2, '#6a3f8a');
        b.set(0, -3, '#b8ccb0');
        b.set(1, 0, FACTION.elf.leaf.base);
        b.set(2, 0, FACTION.elf.leaf.lt);
      } else {
        // Scroll rolled up with a blue ribbon.
        b.rect(1, -3, 7, 2, '#eadcb4');
        b.hline(1, 7, -2, '#c2a874');
        b.vline(4, -3, -2, '#2f4f9c');
        b.set(0, -3, '#d4bf8c');
      }
      mug(b, 26, -3, mugC);
      if (horde) pencilCup(b, 28, 2);
      else if (elf) owlQuill(b, 27, 2);
      else quillInk(b, 27, 2);
      break;
    }
    default: {
      screen = monitorFront(b, 8, -17, 16, 11, faction);
      keyboard(b, 11, -1, 10, tone);
      mouse(b, 23, 0, tone);
      mug(b, 3, -2, mugC);
      papers(b, 25, -4, 6, 4, tone);
      if (horde) skullCandle(b, 25, 0);
      else if (elf) moonLantern(b, 26, -3);
      else smallSucculent(b, 26, 2);
      break;
    }
  }
  return { screen, screen2 };
}

/** Tone of the objects according to the top: on white, one step darker and with a firm shadow. */
function itemTone(variant: string | undefined): DeskItemTone {
  return variant === 'white' ? 'onLight' : 'light';
}

export function desk(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(2, 1, 20);
  const m = deskMats(variant);
  const faction = deskFaction(variant);
  deskBody(s, m, faction, seed, false);
  const scr = deskTop(s, seed, itemTone(variant), faction);
  s.buf.outline();
  deskShadow(s.buf);
  s.rects = { screen: rectAt(s, scr.screen.x, scr.screen.y, scr.screen.w, scr.screen.h) };
  if (scr.screen2) s.rects.screen2 = rectAt(s, scr.screen2.x, scr.screen2.y, scr.screen2.w, scr.screen2.h);
  return { base: s };
}

export function deskBack(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(2, 1, 12);
  const m = deskMats(variant);
  const faction = deskFaction(variant);
  const b = s.buf;
  deskBody(s, m, faction, seed, true);
  const r = rngOf(seed, 12);
  const v = seed % 4;
  const mugC = pick(r, MUG_COLORS);
  const tone = itemTone(variant);
  // Light back (rawhide for the Horde, oak panel for the Alliance) — never dark like the face.
  const plastic = variant === 'dark' ? 'mid' : 'light';
  if (v === 1) {
    monitorBack(b, 2, -7, 15, 10, plastic, faction);
    monitorBack(b, 17, -6, 13, 9, plastic, faction);
  } else {
    monitorBack(b, 8, -7, 16, 10, plastic, faction);
    if (v === 2) {
      if (faction === 'elf') moonpetal(b, 26, 0);
      else smallSucculent(b, 26, 0);
    }
    else papers(b, 25, -1, 6, 4, tone);
    if (v === 3) deskLight(b, 2, -3, faction);
    else mug(b, 2, 0, mugC);
  }
  b.outline();
  deskShadow(b);
  return { base: s };
}

// ------------------------------------------------------------------ chairs

/** Chair faction: `red`, `black`, `green` = Horde; `blue`, `gray` = Alliance; `violet`, `teal` = Elf. */
function chairFaction(variant: string | undefined): Faction {
  if (variant === 'blue' || variant === 'gray') return 'alliance';
  if (variant === 'violet' || variant === 'teal') return 'elf';
  return 'horde';
}

// Horde: dyed leather / dark hide / moss leather. Alliance: royal-blue velvet / slate-grey velvet.
const CHAIR_COLORS: Readonly<Record<string, string>> = {
  black: '#3e3430',
  blue: '#3d63b8',
  red: '#a83a2a',
  green: '#5f7a34',
  gray: '#7a8296',
  violet: '#7a4a9c',
  teal: '#2f8a86',
};

function chairRamp(variant: string | undefined): Ramp {
  return ramp(CHAIR_COLORS[variant ?? 'black'] ?? CHAIR_COLORS.black, 0.07);
}

/** Tree stump (Horde) with roots, under the seat. */
function stumpBase(b: PixelBuf): void {
  const t = FACTION.horde.timber;
  b.rect(4, 9, 8, 6, t.base);
  b.vline(4, 9, 14, t.lt);
  b.vline(5, 10, 13, t.lt);
  b.vline(11, 9, 14, t.dk);
  b.vline(8, 10, 14, t.dk);
  // Roots.
  b.hline(3, 4, 15, t.base);
  b.hline(11, 12, 15, t.dk);
  b.set(2, 15, t.dk);
  b.set(13, 15, t.dd);
}

/** Hide seat (Horde) with a ragged fur fringe. */
function hideSeat(b: PixelBuf, c: Ramp, y: number): void {
  b.rect(2, y, 12, 5, c.lt);
  b.hline(3, 12, y, c.hi);
  b.hline(2, 13, y + 3, c.base);
  b.hline(2, 13, y + 4, c.dk);
  b.set(2, y, c.base);
  b.set(13, y, c.base);
  // Tufts of fur hanging from the edge.
  for (const x of [3, 6, 9, 12]) b.set(x, y + 5, c.dk);
  b.set(5, y + 1, c.hi);
}

/** Elf: a short moonwood trunk under the seat that splits into four curling roots. */
function rootBase(b: PixelBuf): void {
  const t = FACTION.elf.bark;
  b.rect(6, 9, 4, 5, t.base);
  b.vline(6, 9, 13, t.lt);
  b.vline(9, 9, 13, t.dk);
  b.set(7, 11, t.dk);
  // Roots curling outwards.
  b.line(6, 13, 3, 15, t.base);
  b.line(9, 13, 12, 15, t.dk);
  b.set(2, 15, t.lt);
  b.set(13, 15, t.dd);
  b.hline(5, 6, 15, t.base);
  b.hline(9, 10, 15, t.dk);
  // A vine with a leaf on the trunk.
  b.set(7, 10, FACTION.elf.leaf.lt);
  b.set(8, 12, FACTION.elf.leaf.base);
}

/** Elf seat: cloth cushion on a bark rim with a silver filigree edge and leaf tips at the corners. */
function leafSeat(b: PixelBuf, c: Ramp, y: number): void {
  const e = FACTION.elf;
  b.rect(2, y, 12, 4, c.lt);
  b.hline(3, 12, y, c.hi);
  b.hline(2, 13, y + 3, c.base);
  b.set(5, y + 1, c.hi);
  b.hline(1, 14, y + 4, e.bark.base);
  b.set(1, y + 4, e.bark.lt);
  b.hline(1, 14, y + 5, e.bark.dk);
  for (let x = 2; x < 14; x += 3) b.set(x, y + 4, e.silver.lt);
  b.set(1, y + 3, e.leaf.lt);
  b.set(14, y + 3, e.leaf.dk);
}

/** Turned oak legs (Alliance) with golden feet. */
function carvedLegs(b: PixelBuf): void {
  const oak = FACTION.alliance.oak;
  const g = FACTION.alliance.gold;
  for (const x of [2, 12]) {
    b.rect(x, 9, 2, 7, oak.base);
    b.vline(x, 9, 15, oak.lt);
    b.set(x, 12, oak.dk);
    b.set(x + 1, 12, oak.dd);
    b.hline(x, x + 1, 15, g.dk);
  }
  b.hline(4, 11, 13, oak.dk);
  b.hline(4, 11, 12, oak.base);
}

/** Upholstered seat (Alliance) with gold piping and rivets. */
function cushionSeat(b: PixelBuf, c: Ramp, y: number): void {
  const oak = FACTION.alliance.oak;
  const g = FACTION.alliance.gold;
  b.rect(2, y, 12, 4, c.lt);
  b.hline(3, 12, y, c.hi);
  b.hline(2, 13, y + 3, c.base);
  b.set(5, y + 1, c.hi);
  // Seat frame.
  b.hline(1, 14, y + 4, g.base);
  b.set(1, y + 4, g.hi);
  b.hline(1, 14, y + 5, oak.dk);
  for (const x of [4, 8, 11]) b.set(x, y + 3, g.lt);
}

export function officeChair(variant: string | undefined): BufFurniture {
  const c = chairRamp(variant);
  const faction = chairFaction(variant);
  const horde = faction === 'horde';
  const elf = faction === 'elf';
  // Base: the seat seen from behind (the backrest is in `front`, over whoever sits).
  const base = floorSheet(1, 1, 6);
  const b = base.buf;
  if (horde) {
    stumpBase(b);
    hideSeat(b, c, 4);
  } else if (elf) {
    rootBase(b);
    leafSeat(b, c, 4);
  } else {
    carvedLegs(b);
    cushionSeat(b, c, 4);
  }
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  // Front: low backrest — covers the sitter's lower back and leaves the shoulders and arms showing.
  const front = floorSheet(1, 1, 6);
  const f = front.buf;
  if (horde) {
    // Back of the backrest: leather stretched on a branch hoop, lashed; bone tusks rising from the sides.
    const t = FACTION.horde.timber;
    f.rect(4, 7, 8, 6, c.base);
    f.hline(4, 11, 7, c.lt);
    f.vline(4, 8, 11, c.lt);
    f.vline(11, 7, 12, c.dk);
    f.hline(4, 11, 12, c.dd);
    f.hline(5, 10, 9, '#c9a46a');
    f.set(6, 10, '#c9a46a');
    f.set(9, 10, '#c9a46a');
    f.rect(7, 13, 2, 1, t.base);
    tusk(f, 3, 12, 7, -1);
    tusk(f, 12, 12, 7, 1);
  } else if (elf) {
    // Back of the backrest: two moonwood branches arching into a pointed bough, cloth stretched between them,
    // a silver crescent on the cloth and leaves sprouting at the tips.
    const e = FACTION.elf;
    const t = e.bark;
    f.rect(5, 7, 6, 5, c.base);
    f.hline(5, 10, 7, c.lt);
    f.vline(10, 7, 11, c.dk);
    crescent(f, 6, 7, e.silver.hi, e.silver.dk);
    for (const x of [3, 12]) {
      f.vline(x, 6, 13, x === 3 ? t.lt : t.dk);
      f.vline(x + (x === 3 ? 1 : -1), 6, 13, t.base);
    }
    f.hline(5, 10, 5, t.base);
    f.hline(6, 9, 4, t.lt);
    f.set(4, 5, t.lt);
    f.set(11, 5, t.dk);
    f.hline(4, 11, 12, t.dd);
    f.set(2, 4, e.leaf.lt);
    f.set(3, 4, e.leaf.base);
    f.set(13, 4, e.leaf.dk);
    f.set(12, 4, e.leaf.base);
    f.set(8, 3, e.leaf.hi);
  } else {
    // Back of the chair back: seat-coloured fabric stretched on an oak hoop, posts with gold finials.
    const oak = FACTION.alliance.oak;
    const g = FACTION.alliance.gold;
    f.rect(4, 6, 8, 7, oak.base);
    f.hline(4, 11, 6, oak.lt);
    f.rect(5, 7, 6, 5, c.base);
    f.hline(5, 10, 7, c.lt);
    f.vline(10, 7, 11, c.dk);
    f.set(7, 9, g.lt);
    f.set(8, 9, g.base);
    f.hline(4, 11, 12, oak.dd);
    for (const x of [3, 12]) {
      f.vline(x, 5, 13, x === 3 ? oak.lt : oak.dk);
      f.set(x, 4, g.base);
      f.set(x, 3, g.hi);
    }
  }
  f.outline();
  return { base, front };
}

export function officeChairFront(variant: string | undefined): BufFurniture {
  const c = chairRamp(variant);
  const faction = chairFaction(variant);
  const horde = faction === 'horde';
  const s = floorSheet(1, 1, 12);
  const b = s.buf;
  if (faction === 'elf') {
    rootBase(b);
    // Tall backrest to the north: two moonwood branches rising and meeting in a pointed arch, a violet/teal
    // cloth panel with a silver crescent, and leafy shoots at the crown.
    const e = FACTION.elf;
    const t = e.bark;
    for (const x of [2, 12]) {
      b.rect(x, -7, 2, 13, t.base);
      b.vline(x, -7, 5, t.lt);
      b.vline(x + 1, -7, 5, t.dk);
      b.set(x, -2, t.dk);
      b.set(x + 1, 2, t.lt);
    }
    // Pointed arch.
    b.hline(4, 11, -7, t.base);
    b.hline(4, 5, -8, t.lt);
    b.hline(10, 11, -8, t.dk);
    b.hline(6, 9, -9, t.lt);
    b.hline(7, 8, -10, t.base);
    b.set(3, -8, t.lt);
    b.set(12, -8, t.dk);
    // Cloth panel.
    b.rect(4, -6, 8, 11, c.base);
    b.rect(5, -5, 6, 9, c.lt);
    b.hline(5, 10, -5, c.hi);
    b.vline(11, -6, 4, c.dk);
    crescent(b, 6, -3, e.silver.hi, e.silver.dk);
    b.set(9, 1, e.silver.lt);
    b.set(6, 2, e.silver.base);
    // Leaves at the crown and a vine on the left post.
    b.set(7, -11, e.leaf.lt);
    b.set(8, -11, e.leaf.hi);
    b.set(6, -10, e.leaf.base);
    b.set(9, -10, e.leaf.dk);
    b.set(1, -6, e.leaf.lt);
    b.set(1, -5, e.leaf.base);
    b.set(14, -6, e.leaf.dk);
    b.set(2, 0, e.leaf.base);
    b.set(13, -3, e.leaf.dk);
    leafSeat(b, c, 5);
  } else if (horde) {
    stumpBase(b);
    // Backrest to the north: leather stretched between two big tusks, lashed with straps.
    b.rect(4, -5, 8, 10, c.base);
    b.hline(4, 11, -5, c.lt);
    b.rect(5, -4, 6, 7, c.lt);
    b.hline(5, 10, -4, c.hi);
    b.vline(11, -5, 4, c.dk);
    b.hline(4, 11, 4, c.dd);
    // X stitching on the leather.
    for (const y of [-2, 1]) {
      b.set(6, y, c.dk);
      b.set(9, y, c.dk);
    }
    // Tusks (back to front) and lashings.
    tusk(b, 2, 6, 13, -1);
    tusk(b, 12, 6, 13, 1);
    for (const y of [-3, 2]) {
      b.set(3, y, '#c9a46a');
      b.set(12, y, '#a8844e');
    }
    hideSeat(b, c, 5);
  } else {
    carvedLegs(b);
    // Tall carved chair back: oak posts with gold finials, an arch on top and an upholstered panel.
    const oak = FACTION.alliance.oak;
    const g = FACTION.alliance.gold;
    for (const x of [2, 12]) {
      b.rect(x, -8, 2, 14, oak.base);
      b.vline(x, -8, 5, oak.lt);
      b.vline(x + 1, -8, 5, oak.dk);
      b.rect(x, -10, 2, 2, g.base);
      b.set(x, -10, g.hi);
      b.set(x + 1, -9, g.dk);
    }
    // Arch on top with a medallion.
    b.hline(4, 11, -7, oak.lt);
    b.hline(4, 11, -6, oak.base);
    b.hline(6, 9, -8, oak.lt);
    b.rect(7, -9, 2, 2, g.base);
    b.set(7, -9, g.hi);
    // Upholstered panel with golden buttons.
    b.rect(4, -5, 8, 10, c.base);
    b.rect(5, -4, 6, 8, c.lt);
    b.hline(5, 10, -4, c.hi);
    b.vline(11, -5, 4, c.dk);
    for (const [x, y] of [[6, -2], [9, -2], [6, 2], [9, 2]] as const) b.set(x, y, g.lt);
    cushionSeat(b, c, 5);
  }
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ shelves and cabinets

/** Potion flask (3x4) with a cork and a highlight. */
function potion(b: PixelBuf, x: number, y: number, color: string): void {
  b.set(x + 1, y, '#8a6239');
  b.set(x + 1, y + 1, shade(color, 0.2));
  b.rect(x, y + 2, 3, 2, color);
  b.set(x, y + 2, shade(color, 0.35));
  b.set(x + 2, y + 3, shade(color, -0.25));
}

/** Riveted iron corner bracket (3x3) on a corner of the furniture. */
function cornerIron(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 3, 3, '#3a3a40');
  b.set(x, y, '#55555e');
  b.set(x + 1, y + 1, '#8a8a94');
}

export function bookshelf(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 26);
  const b = s.buf;
  const w = ramp('#7a5232', 0.07);
  const r = rngOf(seed, 21);
  // Body: thick sides, cornice and a dark back.
  topFace(b, 0, -21, 32, 3, w);
  b.rect(0, -18, 32, 34, w.dk);
  b.rect(2, -17, 28, 31, '#2a1c12');
  b.vline(0, -18, 15, w.lt);
  b.vline(1, -18, 15, w.base);
  b.vline(30, -18, 15, w.base);
  b.vline(31, -18, 15, w.dd);
  // Shelves.
  const shelves = [-8, 3, 15];
  for (const y of shelves) {
    b.hline(1, 30, y, w.lt);
    b.hline(1, 30, y + 1, w.dk);
  }
  b.hline(0, 31, 15, w.dd);
  // Contents of each shelf (resting on the shelf below).
  const tomes = ['#9c2f25', '#2f4f9c', '#5f8a3a', '#6a4a8a', '#7a4a2a', '#b8572c', '#2f6a6a'];
  shelves.forEach((shelf, i) => {
    const bottom = shelf - 1;
    let x = 3;
    while (x < 29) {
      const kind = r();
      if (kind < 0.12 && x < 24) {
        // Potions.
        potion(b, x, bottom - 3, pick(r, ['#5fd06a', '#d0453a', '#4a8ae0', '#b06ad8']));
        potion(b, x + 3, bottom - 3, pick(r, ['#5fd06a', '#e0b23c', '#4a8ae0']));
        x += 7;
      } else if (kind < 0.22 && x < 24) {
        // Stack of rolled scrolls (round ends).
        for (const [dx, dy] of [[0, -1], [2, -1], [1, -3], [4, -1]] as const) {
          b.rect(x + dx, bottom + dy, 2, 2, '#eadcb4');
          b.set(x + dx + 1, bottom + dy + 1, '#b8a272');
        }
        b.set(x + 2, bottom - 2, '#9c2f25');
        x += 7;
      } else if (kind < 0.3 && x < 25 && i > 0) {
        // Candle stub on a dish (neutral: bookshelves stand in rooms of every race).
        b.hline(x, x + 4, bottom, '#5a5550');
        candle(b, x + 1, bottom - 1, 3);
        x += 6;
      } else {
        // Thick tomes with gold bands on the spine (one sometimes lying down).
        const n = 2 + Math.floor(r() * 3);
        for (let k = 0; k < n && x < 28; k++) {
          const bw = 2;
          const bh = 6 + Math.floor(r() * 4);
          const c = pick(r, tomes);
          book(b, x, bottom - bh + 1, bw, bh, c);
          b.hline(x, x + 1, bottom - bh + 2, '#e0b23c');
          b.hline(x, x + 1, bottom - 1, '#c08a2c');
          x += bw;
        }
        if (r() < 0.35 && x < 25) {
          const c = pick(r, tomes);
          b.rect(x, bottom - 1, 5, 2, c);
          b.hline(x, x + 4, bottom - 1, shade(c, 0.2));
          b.set(x + 4, bottom, '#e0b23c');
          x += 6;
        } else x += 1;
      }
    }
  });
  // Iron corner plates and a candle on the cornice (race-neutral: no skulls, crests or crescents).
  cornerIron(b, 0, -18);
  cornerIron(b, 29, -18);
  cornerIron(b, 0, 12);
  cornerIron(b, 29, 12);
  photoFrame(b, 5, -25);
  b.rect(20, -23, 7, 2, '#eadcb4');
  b.hline(20, 26, -22, '#b8a272');
  b.vline(23, -23, -22, '#9c2f25');
  b.outline();
  contact(b, -1, 13, 34, 4, 0.22);
  return { base: s };
}

export function binderShelf(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 26);
  const b = s.buf;
  const w = ramp('#6b4a2b', 0.07);
  const r = rngOf(seed, 23);
  topFace(b, 0, -21, 16, 3, w);
  b.rect(0, -18, 16, 34, w.dk);
  b.rect(1, -17, 14, 31, '#2a1c12');
  b.vline(0, -18, 15, w.lt);
  b.vline(15, -18, 15, w.dd);
  const shelves = [-8, 3, 15];
  for (const y of shelves) {
    b.hline(1, 14, y, w.lt);
    b.hline(1, 14, y + 1, w.dk);
  }
  const tops = [-17, -6, 5];
  // Standing scroll rolls, tied with coloured ribbons.
  const binders = ['#e2d2a4', '#d8c79c', '#eadcb4', '#cfbf90', '#e2d2a4', '#d8c79c', '#eadcb4'];
  const ribbons = ['#9c2f25', '#2f4f9c', '#e0b23c', '#5f8a3a'];
  tops.forEach((top, i) => {
    const bottom = shelves[i] - 1;
    const h = bottom - top + 1;
    if (i === 2 && r() < 0.6) {
      // Small chest with iron bands on the bottom shelf.
      const c = ramp('#8a5a32', 0.07);
      b.rect(2, bottom - 6, 12, 7, c.base);
      b.hline(2, 13, bottom - 6, c.lt);
      b.hline(2, 13, bottom - 4, c.dk);
      ironBand(b, 2, 13, bottom - 3);
      b.vline(4, bottom - 6, bottom, '#3a3a40');
      b.vline(11, bottom - 6, bottom, '#3a3a40');
      b.rect(7, bottom - 3, 2, 2, '#e0b23c');
      b.set(8, bottom - 2, '#8a6a20');
      return;
    }
    let x = 2;
    while (x < 14) {
      const c = pick(r, binders);
      const bh = Math.min(h - 1, 8 + Math.floor(r() * 2));
      b.rect(x, bottom - bh + 1, 2, bh, c);
      b.vline(x, bottom - bh + 1, bottom, shade(c, 0.1));
      b.hline(x, x + 1, bottom - bh + 1, '#f4ead0');
      const rib = pick(r, ribbons);
      b.set(x, bottom - bh + 3, rib);
      b.set(x + 1, bottom - bh + 3, rib);
      b.set(x + 1, bottom - 1, shade(c, -0.2));
      x += 2;
      if (r() < 0.12) x += 1;
    }
  });
  cornerIron(b, 0, -18);
  cornerIron(b, 13, -18);
  candle(b, 11, -22, 3);
  b.outline();
  contact(b, 0, 13, 16, 4, 0.22);
  return { base: s };
}

export function filingCabinet(): BufFurniture {
  // Oak chest of big drawers with riveted iron bands and golden keyhole plates.
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  const m = ramp('#8a5a32', 0.07);
  topFace(b, 1, -7, 14, 4, m);
  frontFace(b, 1, -3, 14, 19, m);
  woodGrain(b, 1, -3, 14, 19, m, 3, true);
  for (const y of [3, 9]) {
    b.hline(1, 14, y, '#3a3a40');
    b.hline(1, 14, y + 1, m.dd);
  }
  for (const y of [-1, 5, 11]) {
    // Iron ring + golden keyhole plate.
    b.rect(7, y, 2, 2, '#e0b23c');
    b.set(7, y, '#f6d878');
    b.set(8, y + 1, '#8a6a20');
    b.set(6, y + 2, '#3a3a40');
    b.set(9, y + 2, '#3a3a40');
    b.hline(7, 8, y + 3, '#3a3a40');
  }
  // Iron posts with rivets.
  for (const x of [1, 14]) {
    b.vline(x, -3, 15, '#3a3a40');
    for (const y of [-2, 4, 10]) b.set(x, y, '#8a8a94');
  }
  b.hline(1, 14, -7, '#3a3a40');
  b.set(2, -7, '#8a8a94');
  b.set(13, -7, '#8a8a94');
  candle(b, 3, -6, 3);
  // Tome lying on top.
  b.rect(8, -7, 6, 2, '#2f4f9c');
  b.hline(8, 13, -7, '#3d63b8');
  b.set(13, -6, '#e0b23c');
  b.outline();
  contact(b, 0, 13, 16, 4, 0.22);
  return { base: s };
}

export function printer(): BufFurniture {
  // Goblin press: wooden frame, brass screw with a crank, copper gears,
  // a green "on" lamp and a printed sheet coming out at the front.
  const s = floorSheet(1, 1, 22);
  const b = s.buf;
  const t = ramp('#8a5a32', 0.07);
  const cu = ramp('#c27a3a', 0.08);
  // Base (machine housing).
  topFace(b, 0, 1, 16, 4, t);
  frontFace(b, 0, 5, 16, 11, t);
  woodGrain(b, 0, 5, 16, 11, t, 5, true);
  ironBand(b, 0, 15, 7);
  ironBand(b, 0, 15, 14);
  // Copper gear on the face.
  b.ellipse(4.5, 10.5, 3, 3, cu.base);
  for (const [x, y] of [[4, 6], [4, 14], [0, 10], [8, 10], [1, 7], [7, 7], [1, 13], [7, 13]] as const) b.set(x, y, cu.dk);
  b.set(3, 9, cu.hi);
  b.rect(4, 10, 2, 2, '#3a2a1c');
  // Tray with a printed sheet.
  b.rect(9, 9, 6, 6, '#eadcb4');
  b.hline(9, 14, 9, '#f6eed6');
  for (const y of [11, 13]) b.hline(10, 13, y, '#5a4a3a');
  b.vline(14, 10, 14, '#c2a874');
  // Frame: two posts and a crossbar.
  for (const x of [1, 13]) {
    b.rect(x, -12, 2, 14, t.base);
    b.vline(x, -12, 1, t.lt);
    b.vline(x + 1, -12, 1, t.dk);
  }
  b.rect(0, -14, 16, 3, t.base);
  b.hline(0, 15, -14, t.lt);
  b.hline(0, 15, -12, t.dk);
  rivet(b, 1, -13);
  rivet(b, 13, -13);
  // Brass screw and crank.
  b.rect(7, -11, 2, 8, cu.lt);
  for (let y = -10; y < -3; y += 2) b.set(8, y, cu.dk);
  b.hline(3, 12, -8, cu.base);
  b.set(3, -8, cu.hi);
  b.rect(2, -9, 2, 3, '#3a3a40');
  b.rect(12, -9, 2, 3, '#3a3a40');
  // Iron platen over the sheet.
  b.rect(4, -3, 8, 2, '#4a4a52');
  b.hline(4, 11, -3, '#6a6a74');
  b.rect(4, -1, 8, 2, '#eadcb4');
  // Green lamp and a smoking pipe.
  b.rect(14, -18, 2, 3, '#7fd65a');
  b.set(14, -18, '#d4ffb0');
  b.set(15, -16, '#4fa03a');
  b.vline(15, -15, -14, cu.dk);
  b.rect(0, -18, 2, 4, cu.base);
  b.set(0, -18, cu.hi);
  b.set(1, -20, 'rgba(220,220,220,0.6)');
  b.set(0, -21, 'rgba(220,220,220,0.4)');
  b.outline();
  contact(b, -1, 13, 18, 4, 0.22);
  return { base: s };
}

export function trashBin(): BufFurniture {
  // Little stave barrel with iron hoops and crumpled scrolls.
  const s = floorSheet(1, 1, 3);
  const b = s.buf;
  const m = ramp('#9a6a3c', 0.07);
  for (let y = 6; y <= 15; y++) {
    const bulge = y > 7 && y < 14 ? 1 : 0;
    b.hline(4 - bulge, 11 + bulge, y, m.base);
    b.set(4 - bulge, y, m.lt);
    b.set(5 - bulge, y, m.lt);
    b.set(11 + bulge, y, m.dk);
  }
  for (const x of [6, 9]) b.vline(x, 7, 14, m.dk);
  b.hline(3, 12, 9, '#3a3a40');
  b.hline(3, 12, 13, '#3a3a40');
  b.set(4, 9, '#8a8a94');
  b.set(4, 13, '#8a8a94');
  b.ellipse(8, 5.5, 4.5, 2, m.lt);
  b.ellipse(8, 5.6, 3.5, 1.3, '#2a1c12');
  // Crumpled scrolls.
  b.rect(5, 3, 3, 3, '#eadcb4');
  b.set(7, 4, '#c2a874');
  b.rect(8, 2, 3, 3, '#e2d2a4');
  b.set(9, 3, '#b8a272');
  b.set(10, 4, '#9c2f25');
  b.outline();
  contact(b, 3, 14, 10, 2, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ plants

/** Wooden tub with an iron hoop (rustic pot). (x, y) = top-left corner. */
function tub(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  const m = ramp('#8a5a32', 0.07);
  pot(b, x, y, w, h, m);
  for (let xx = x + 2; xx < x + w - 1; xx += 2) b.vline(xx, y + 2, y + h - 2, m.dk);
  b.hline(x, x + w - 1, y + 2, '#3a3a40');
  b.hline(x + 1, x + w - 2, y + h - 2, '#3a3a40');
  b.set(x + 1, y + 2, '#8a8a94');
}

/** Carved stone urn (Alliance) with a gold trim. */
function urn(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  pot(b, x, y, w, h, FACTION.alliance.stone);
  b.hline(x + 1, x + w - 2, y + 3, FACTION.alliance.gold.base);
  b.set(x + 1, y + 3, FACTION.alliance.gold.hi);
}

/** Capped mushroom (cx = centre, y = top of the cap); `glow` marks the glowing spots. */
function mushroom(b: PixelBuf, cx: number, y: number, rx: number, stem: number, cap: Ramp, glow: string): void {
  // Stem.
  b.rect(cx - 1, y + 2, 2, stem, '#e8dcc0');
  b.vline(cx, y + 2, y + 1 + stem, '#c4b498');
  // Domed cap.
  for (let i = 0; i < 3; i++) {
    const half = Math.max(1, Math.round(rx * Math.sqrt(1 - ((2 - i) / 3) ** 2)));
    b.hline(cx - half, cx + half - 1, y + i, i === 2 ? cap.dk : cap.base);
    b.set(cx - half, y + i, cap.lt);
  }
  b.hline(cx - rx, cx + rx - 1, y + 2, cap.dk);
  b.set(cx - Math.max(1, rx - 2), y + 1, cap.hi);
  b.set(cx - 1, y + 1, glow);
  if (rx > 2) b.set(cx + 1, y, glow);
}

export function plantSmall(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  const v = variant ?? 'fern';
  if (v === 'succulent') {
    // Glowing mushrooms in a stone bowl.
    pot(b, 3, 10, 10, 6, M.stone);
    b.rect(4, 10, 8, 1, '#3a2a1c');
    const teal = ramp('#2f8a8a', 0.09);
    const violet = ramp('#7a4ab0', 0.09);
    mushroom(b, 5, 4, 3, 5, violet, '#d0a8ff');
    mushroom(b, 10, 1, 4, 8, teal, '#9ff5e0');
    mushroom(b, 7, 7, 2, 3, teal, '#9ff5e0');
  } else if (v === 'flower') {
    // Golden flowers in a stone urn (Alliance).
    urn(b, 4, 9, 8, 7);
    b.rect(5, 9, 6, 1, '#3a2a1c');
    const g = M.leaf;
    for (const [x1, y1] of [[2, 6], [14, 5], [5, 2], [11, 2], [8, 4]] as const) leafBlade(b, 8, 9, x1, y1, 3, g, x1 < 8);
    const petals = pick(rngOf(seed, 5), ['#f2c14e', '#ffffff', '#5a8ae0', '#e0583a']);
    for (const [x, y] of [[4, 1], [10, 0], [7, 3], [12, 4], [3, 5]] as const) {
      b.set(x, y, petals);
      b.set(x + 1, y, shade(petals, 0.12));
      b.set(x, y + 1, shade(petals, -0.12));
      b.set(x + 1, y + 1, '#f7d154');
    }
  } else {
    // Thorny bush in a tub with an iron hoop.
    tub(b, 4, 9, 8, 7);
    b.rect(5, 9, 6, 1, '#3a2a1c');
    const g = ramp('#4f7a34', 0.08);
    const fr: [number, number, number][] = [[0, 7, 0], [16, 7, 0], [2, 1, 1], [14, 1, 0], [5, -3, 1], [11, -3, 1], [8, -5, 1], [-1, 11, 0], [17, 11, 0]];
    fr.forEach(([x1, y1, light]) => leafBlade(b, 8, 9, x1, y1, 2.6, light ? g : ramp(g.dk, 0.07), x1 < 8));
    // Thorns/red berries.
    for (const [x, y] of [[3, 4], [12, 2], [7, -2], [14, 8]] as const) b.set(x, y, '#c8402e');
    b.set(8, -5, g.hi);
  }
  b.outline();
  contact(b, 3, 14, 10, 2, 0.24);
  return { base: s };
}

export function plantTall(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(1, 1, 30, 6);
  const b = s.buf;
  const v = variant ?? 'ficus';
  if (v === 'bonsai') {
    // Twisted bonsai in a stone tray on a carved plinth, with a little lantern.
    const st = M.stone;
    topFace(b, 1, 7, 14, 3, st);
    frontFace(b, 1, 10, 14, 4, st);
    b.hline(1, 14, 12, st.dk);
    b.rect(2, 14, 12, 2, st.dk);
    const tray = ramp('#5a5a62', 0.07);
    b.rect(3, 4, 10, 1, tray.lt);
    b.rect(3, 5, 10, 2, tray.base);
    b.hline(4, 11, 4, '#3a2a1c');
    b.vline(12, 5, 6, tray.dk);
    b.hline(4, 11, 6, tray.dk);
    const tr = ramp('#6a4a32', 0.08);
    b.line(7, 4, 6, 0, tr.base, 2);
    b.line(6, 0, 9, -4, tr.base, 2);
    b.line(9, -4, 8, -8, tr.base, 1);
    b.line(8, -3, 4, -5, tr.base, 1);
    b.line(9, -5, 12, -6, tr.base, 1);
    b.set(6, 3, tr.dk);
    b.set(9, 4, tr.lt);
    b.set(5, 4, tr.lt);
    foliage(b, 4, -6.5, 3.6, 2.2, M.leafDark, seed + 3);
    foliage(b, 12.5, -7.5, 3.2, 2, M.leafDark, seed + 4);
    foliage(b, 8.5, -10.5, 4, 2.4, M.leaf, seed + 5);
    // Stone lantern in the corner of the tray.
    b.rect(12, 1, 3, 3, '#7a7468');
    b.set(13, 2, '#ffd060');
    b.hline(11, 15, 0, '#5a554c');
  } else if (v === 'palm') {
    // Spirit totem: a carved post with painted faces, tusks and feathers, on a base of stones.
    const t = FACTION.horde.timber;
    b.ellipse(8, 13.5, 6, 2.5, '#7a7468');
    b.ellipse(7, 12.8, 4, 1.5, '#9c968a');
    b.rect(5, -18, 6, 31, t.base);
    b.vline(5, -18, 12, t.lt);
    b.vline(6, -18, 12, ramp('#6a4a30', 0.07).base);
    b.vline(10, -18, 12, t.dd);
    // Carved faces (two), with eyes painted red and a tusked mouth.
    for (const fy of [-12, 0]) {
      b.hline(5, 10, fy - 1, t.dd);
      b.rect(6, fy + 1, 2, 1, '#c8402e');
      b.rect(9, fy + 1, 1, 1, '#c8402e');
      b.set(8, fy + 2, t.dd);
      b.hline(6, 9, fy + 4, '#1e140c');
      b.set(6, fy + 3, FACTION.horde.bone.lt);
      b.set(9, fy + 3, FACTION.horde.bone.lt);
    }
    // Painted bands.
    b.hline(5, 10, -6, '#9c2f25');
    b.hline(5, 10, 6, '#9c2f25');
    b.hline(5, 10, 7, '#2a1a14');
    // Big tusks coming out of the sides and a feathered top.
    tusk(b, 4, -8, 6, -1);
    tusk(b, 11, -8, 6, 1);
    b.rect(4, -21, 8, 3, '#3a3a40');
    b.hline(4, 11, -21, '#55555e');
    for (const [x, c] of [[4, '#c8402e'], [7, '#e8dcc0'], [10, '#2f6a6a']] as const) {
      b.vline(x, -27, -22, c);
      b.vline(x + 1, -26, -22, shade(c, -0.25));
    }
    b.set(7, -28, '#ffffff');
  } else if (v === 'monstera') {
    // Giant glowing mushrooms in a stone planter.
    pot(b, 2, 6, 12, 10, M.stone);
    b.rect(3, 6, 10, 1, '#3a2a1c');
    const teal = ramp('#2f8a8a', 0.09);
    const violet = ramp('#7a4ab0', 0.09);
    // Big central mushroom.
    b.rect(6, -10, 4, 16, '#e8dcc0');
    b.vline(9, -10, 5, '#c4b498');
    b.vline(6, -10, 5, '#f4ead6');
    b.ellipse(8, -13, 7.5, 4, violet.dk);
    b.ellipse(8, -14, 7, 3.4, violet.base);
    b.ellipse(6.5, -15.2, 4.2, 1.8, violet.lt);
    b.set(4, -16, violet.hi);
    b.hline(1, 14, -11, violet.dd);
    for (const [x, y] of [[3, -13], [8, -16], [12, -13], [10, -15], [5, -12]] as const) b.set(x, y, '#e0c8ff');
    // Smaller mushrooms.
    mushroom(b, 3, -2, 3, 7, teal, '#9ff5e0');
    mushroom(b, 13, -4, 3, 9, teal, '#9ff5e0');
  } else {
    // Twisted tree in a tub with iron bands.
    tub(b, 3, 6, 10, 10);
    b.rect(4, 6, 8, 1, '#3a2a1c');
    const tr = ramp('#5e4430', 0.08);
    b.line(8, 6, 7, 1, tr.base, 2);
    b.line(7, 1, 9, -3, tr.base, 2);
    b.line(9, -3, 8, -7, tr.base, 1);
    b.line(8, -1, 4, -5, tr.base, 1);
    b.line(9, -3, 12, -6, tr.base, 1);
    b.set(7, 4, tr.lt);
    b.set(8, 0, tr.lt);
    const dark = ramp('#2f5528', 0.07);
    const leaf = ramp('#4a7a34', 0.08);
    foliage(b, 8, -10, 7, 5.5, dark, seed + 7);
    foliage(b, 6, -13, 4.6, 3.6, leaf, seed + 8);
    foliage(b, 11.5, -9, 3.8, 3.2, leaf, seed + 9);
    foliage(b, 4, -7, 3.2, 2.6, leaf, seed + 10);
  }
  b.outline();
  contact(b, 2, 14, 12, 3, 0.24);
  return { base: s };
}

// ------------------------------------------------------------------ glass partitions

/** Carved tip of a palisade log (light wood at the cut). */
function stakeTip(b: PixelBuf, x: number, top: number, w: number, log: Ramp): void {
  b.hline(x + 1, x + w - 2, top - 1, log.lt);
  b.set(x + 1, top - 1, '#e2c89a');
  b.set(x + Math.floor(w / 2), top - 2, '#e2c89a');
  if (w > 4) b.set(x + Math.floor(w / 2), top - 3, '#f0dcb4');
}

export function glassPartition(variant: string | undefined): BufFurniture {
  // Palisade: pointed logs, tied with rope and banded with iron (separates areas of the camp).
  const v = variant ?? 'h';
  const s = floorSheet(1, 1, 22, 2);
  const b = s.buf;
  const log = ramp('#9a6a3c', 0.07);
  if (v === 'v') {
    // North-south: seen from above it is a strip of log tops (no outline, so it joins up).
    const cols = ['#3f2a18', '#7a5232', '#a8763f', '#c9a06a', '#a8763f', '#7a5232', '#5e3d24', '#3f2a18'];
    cols.forEach((c, i) => b.vline(4 + i, -16, 15, c));
    for (let y = -16; y < 16; y += 4) {
      b.hline(5, 10, y, '#4a321e');
      b.set(7, y + 2, '#e2c89a');
    }
    b.hline(4, 11, -6, '#c9a46a');
    b.hline(4, 11, 6, '#c9a46a');
    underRect(b, 12, -16, 2, 32, 'rgba(36,24,14,0.14)');
    return { base: s };
  }
  if (v === 'end') {
    // End: a thicker post with a carved tip, iron bands and a red pennant.
    b.rect(5, -16, 6, 32, log.base);
    b.vline(5, -16, 15, log.lt);
    b.vline(6, -16, 15, log.lt);
    b.vline(10, -16, 15, log.dk);
    stakeTip(b, 5, -16, 6, log);
    for (const y of [-6, 6]) {
      ironBand(b, 5, 10, y);
      b.hline(5, 10, y + 1, '#c9a46a');
    }
    drape(b, 11, -14, 4, 7, FACTION.horde.red, { notch: true });
    b.hline(10, 14, -15, '#3a3a40');
    b.outline();
    contact(b, 3, 13, 10, 4, 0.2);
    return { base: s };
  }
  // 'h': east-west — 4 logs of 4px with tips, tied with ropes and an iron band.
  for (let i = 0; i < 4; i++) {
    const x = i * 4;
    const top = -14 - ((i * 5) % 3);
    b.rect(x, top, 4, 16 - top, log.base);
    b.vline(x, top, 15, log.lt);
    b.vline(x + 3, top, 15, log.dk);
    stakeTip(b, x, top, 4, log);
    b.set(x + 1, top + 6 + (i % 2) * 5, log.dk);
  }
  b.hline(0, 15, -4, '#c9a46a');
  b.hline(0, 15, -3, '#8a6a3c');
  ironBand(b, 0, 15, 8, false);
  for (let x = 1; x < 16; x += 4) b.set(x, 8, '#8a8a94');
  b.hline(0, 15, 15, log.dd);
  b.outline();
  for (let y = 0; y < b.h; y++) {
    b.clear(-1, y - b.oy);
    b.clear(16, y - b.oy);
  }
  contact(b, 0, 14, 16, 3, 0.16);
  return { base: s };
}

// ------------------------------------------------------------------ meeting and support

/** Soldier miniature (pawn) of the war table: base, coloured body and head. */
function figurine(b: PixelBuf, x: number, y: number, c: string): void {
  b.hline(x, x + 2, y + 3, '#3a3a40');
  b.rect(x, y + 1, 3, 2, c);
  b.set(x, y + 1, shade(c, 0.25));
  b.set(x + 1, y, shade(c, 0.15));
}

export function meetingTable(seed: number): BufFurniture {
  const s = floorSheet(3, 2, 12);
  const b = s.buf;
  // War table: plank top with a banded edge, an open map, miniatures, a dagger and candles.
  const m = ramp('#9a6a3c', 0.07);
  const r = rngOf(seed, 31);
  // X-shaped trestles at the ends.
  for (const x of [3, 41]) {
    b.line(x, 31, x + 4, 22, M.walnut.base, 2);
    b.line(x + 4, 31, x, 22, M.walnut.lt, 2);
  }
  topFace(b, 0, -4, 48, 24, m);
  b.hline(0, 47, 20, m.base);
  b.hline(0, 47, 21, m.dk);
  woodGrain(b, 1, -3, 46, 22, m, seed);
  for (const y of [4, 12]) b.hline(1, 46, y, m.base);
  // Iron-banded edge with corner brackets.
  ironBand(b, 0, 47, 20);
  for (const [x, y] of [[0, -4], [45, -4], [0, 17], [45, 17]] as const) cornerIron(b, x, y);
  // Parchment map in the centre, with a river, mountains, forest and a border.
  b.rect(4, 2, 40, 10, '#e2d2a4');
  b.hline(4, 43, 2, '#c9b483');
  b.hline(4, 43, 11, '#b8a272');
  b.set(4, 2, '#b8a272');
  b.set(43, 11, '#a8925a');
  b.line(6, 9, 40, 4, '#4f7aa8', 1);
  for (const x of [12, 16, 30]) {
    b.set(x, 4, '#7a6a58');
    b.hline(x - 1, x + 1, 5, '#7a6a58');
  }
  for (const [x, y] of [[34, 8], [36, 9], [9, 5]] as const) {
    b.set(x, y, '#4f7a34');
    b.set(x + 1, y, '#3a5a28');
  }
  for (let y = 3; y < 11; y += 2) b.set(24, y, '#9c2f25');
  // Miniatures: Horde (red) on the left, Alliance (blue) on the right; a dagger stuck in.
  figurine(b, 18, 4, '#b8402e');
  figurine(b, 20, 7, '#b8402e');
  figurine(b, 27, 5, '#3d63b8');
  figurine(b, 30, 7, '#3d63b8');
  b.line(14, 6, 16, 10, '#c4c8d0');
  b.rect(13, 4, 2, 2, '#5a3c22');
  b.set(12, 5, '#e0b23c');
  // Tomes and objects (vary by seed).
  const laptop = (x: number, y: number, facing: 'up' | 'down') => {
    // Open tomes (standing, facing the camera) or closed (leather cover).
    if (facing === 'down') {
      b.rect(x, y, 9, 5, '#5a2a1c');
      b.hline(x, x + 8, y, '#7a3a26');
      staticScreen(b, { x: x + 1, y: y + 1, w: 7, h: 3 }, x < 20 ? 'ide' : 'sheet', seed + x);
      b.rect(x - 1, y + 5, 11, 2, '#e2d2a4');
      b.hline(x - 1, x + 9, y + 6, '#b8a272');
    } else {
      b.rect(x - 1, y, 11, 2, '#7a3a26');
      b.rect(x, y + 2, 9, 4, '#6a3020');
      b.hline(x, x + 8, y + 2, '#8a4a30');
      b.set(x + 4, y + 4, '#e0b23c');
    }
  };
  laptop(6, -3, 'down');
  laptop(32, 13, 'up');
  if (seed % 2 === 0) laptop(34, -3, 'down');
  else papers(b, 34, -1, 7, 5);
  papers(b, 8, 14, 6, 4);
  mug(b, 18, 14, pick(r, MUG_COLORS));
  // Candles.
  candle(b, 29, 1, 3);
  candle(b, 16, 0, 3);
  skullCandle(b, 24, 13);
  b.outline();
  contact(b, -1, 28, 50, 5, 0.22);
  underRect(b, 4, 22, 40, 8, 'rgba(36,24,14,0.18)');
  return { base: s };
}

export function stool(): BufFurniture {
  // Tree stump with roots, rings on top and an axe mark.
  const s = floorSheet(1, 1, 2);
  const b = s.buf;
  const bark = ramp('#5e3d24', 0.07);
  b.rect(4, 6, 8, 9, bark.base);
  b.vline(4, 6, 14, bark.lt);
  b.vline(5, 7, 13, bark.lt);
  b.vline(11, 6, 14, bark.dk);
  b.vline(8, 8, 13, bark.dk);
  // Roots.
  b.hline(2, 4, 15, bark.base);
  b.set(2, 14, bark.lt);
  b.hline(11, 13, 15, bark.dk);
  b.set(13, 14, bark.dk);
  b.set(7, 15, bark.dk);
  // Moss.
  b.set(5, 12, '#6a8a3a');
  b.set(4, 13, '#5f7a34');
  b.ellipse(8, 6, 4.5, 2.2, '#d9b88e');
  b.ellipse(8, 6, 2.6, 1.2, '#c49a68');
  b.set(8, 6, '#a87a48');
  b.set(10, 5, '#8a6239');
  b.set(11, 6, '#8a6239');
  b.outline();
  contact(b, 3, 13, 10, 3, 0.22);
  return { base: s };
}

export function floorLamp(): BufFurniture {
  // Tall brazier: iron tripod, a post and an iron basket with big flames.
  const s = floorSheet(1, 1, 26);
  const b = s.buf;
  const iron = FACTION.horde.iron;
  // Tripod.
  b.line(8, 9, 3, 15, iron.base);
  b.line(8, 9, 13, 15, iron.dk);
  b.line(8, 9, 8, 14, iron.lt);
  b.set(3, 15, iron.dd);
  b.set(13, 15, iron.dd);
  // Post.
  b.rect(7, -14, 2, 24, iron.base);
  b.vline(7, -14, 9, iron.lt);
  b.hline(6, 9, -2, '#c9a46a');
  b.hline(6, 9, -1, '#a8844e');
  // Basket.
  b.rect(3, -18, 10, 4, iron.base);
  b.hline(3, 12, -18, iron.hi);
  b.hline(4, 11, -15, iron.dk);
  b.hline(5, 10, -14, iron.dd);
  for (const x of [5, 8, 11]) b.vline(x, -17, -15, iron.dd);
  b.set(3, -19, iron.lt);
  b.set(12, -19, iron.lt);
  // Flames.
  b.hline(4, 11, -19, '#d0451e');
  b.hline(4, 11, -20, '#e08a2c');
  b.hline(5, 10, -21, '#f0b040');
  b.hline(5, 9, -22, '#f6c04a');
  b.hline(6, 8, -23, '#ffe08a');
  b.set(7, -24, '#fff2b0');
  b.set(9, -24, '#f6c04a');
  b.set(5, -23, '#e08a2c');
  b.set(8, -25, '#fff2b0');
  b.outline();
  contact(b, 2, 13, 12, 3, 0.22);
  s.rects = { glow: rectAt(s, 4, -22, 8, 6) };
  return { base: s };
}

export function waterCooler(): BufFurniture {
  // Water barrel on a stand, with a wooden tap, a bucket underneath and a hanging ladle.
  const s = floorSheet(1, 1, 20);
  const b = s.buf;
  const st = ramp('#5e3d24', 0.07);
  // Stand.
  b.rect(3, 4, 2, 12, st.base);
  b.rect(11, 4, 2, 12, st.base);
  b.vline(3, 4, 15, st.lt);
  b.hline(3, 12, 10, st.lt);
  // Bucket underneath.
  b.rect(6, 11, 4, 4, '#9a6a3c');
  b.hline(6, 9, 12, '#3a3a40');
  b.hline(6, 9, 11, '#5f8aa8');
  // Barrel.
  const m = ramp('#9a6a3c', 0.07);
  for (let y = -14; y <= 3; y++) {
    const bulge = y > -11 && y < 0 ? 1 : 0;
    b.hline(3 - bulge, 12 + bulge, y, m.base);
    b.set(3 - bulge, y, m.lt);
    b.set(4 - bulge, y, m.lt);
    b.set(12 + bulge, y, m.dk);
  }
  for (const x of [6, 9]) b.vline(x, -13, 2, m.dk);
  for (const y of [-12, -5, 2]) {
    b.hline(2, 13, y, '#3a3a40');
    b.set(3, y, '#8a8a94');
  }
  b.ellipse(7.5, -14.5, 4.5, 1.5, m.lt);
  b.ellipse(7.5, -14.5, 3, 0.8, '#4f8ac0');
  b.set(6, -15, '#a8d8f0');
  // Tap with a drop.
  b.rect(7, 3, 2, 2, '#6b4a2b');
  b.set(7, 3, '#8a6239');
  b.set(8, 6, '#7fb0d0');
  // Ladle hanging on the side.
  b.vline(14, -9, -3, '#8a6239');
  b.set(14, -10, '#3a3a40');
  b.rect(13, -3, 3, 2, '#6b4a2b');
  b.set(13, -3, '#8a6239');
  b.outline();
  contact(b, 1, 13, 14, 4, 0.22);
  return { base: s };
}
