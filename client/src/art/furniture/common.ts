// Mess hall (cafe), tavern (lounge), bathhouse (restroom) and great hall (reception) furniture.
// Drawing coordinates = footprint (base at y = h*TILE). Warcraft-III-inspired fantasy look:
// chunky shapes, thick outlines, strong top-left light, wood, iron, stone, bone, fur and gold.
import { mix, ramp, shade, type Ramp } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { floorSheet, rectAt, type BufFurniture } from '../core/sprite';
import { contact, frontFace, pick, rngOf, topFace, underRect } from './kit';

// ------------------------------------------------------------------ local palette

// Alliance (mess hall, bathhouse): oak, cut stone, plaster, royal blue and gold.
const OAK = ramp('#8a6239', 0.07);
const OAK_LT = ramp('#a87a4a', 0.07);
const STONE = ramp('#9c968a', 0.06);
const PLASTER = ramp('#e6dcc4', 0.04);
const BLUE = ramp('#3d63b8', 0.08);
const GOLD = ramp('#e0b23c', 0.08);
// Horde (great hall): dark timber, hide, blood red, blackened iron, bone.
const TIMBER = ramp('#5a3d25', 0.07);
const HIDE = ramp('#b08a5a', 0.07);
const RED = ramp('#9c2f25', 0.08);
const BONE = ramp('#e8dcc0', 0.06);
// Shared metals / tavern woods.
const IRON = ramp('#4a4a52', 0.08);
const HONEY = ramp('#b5813f', 0.07);
const BRASS = ramp('#c27a3a', 0.08);
const BARK = ramp('#5e4128', 0.07);
const FUR = ramp('#c8ab84', 0.07);
const FUR_DARK = ramp('#8a6448', 0.07);
const ROPE = '#c9a45a';
const ROPE_DK = '#8f7038';
const GOB_GLOW = '#7fd65a';
const WATER = ramp('#4f86a8', 0.08);

// ------------------------------------------------------------------ local helpers

/** Removes the side outline (x = -1 and x = w) for modules that tile side by side. */
function seamless(b: PixelBuf, w = 16): void {
  for (let y = -b.oy; y < b.h - b.oy; y++) {
    b.clear(-1, y);
    b.clear(w, y);
  }
}

/** Iron strap with bright rivets every `step` px. */
function band(b: PixelBuf, x0: number, x1: number, y: number, step = 4, m: Ramp = IRON, rivet = GOLD.lt): void {
  b.hline(x0, x1, y, m.lt);
  b.hline(x0, x1, y + 1, m.dk);
  for (let x = x0 + 1; x < x1; x += step) b.set(x, y, rivet);
}

/** Vertical planks with dark seams and a lit left edge. */
function planks(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp, pw = 4): void {
  b.rect(x, y, w, h, m.base);
  for (let xx = x + pw; xx < x + w - 1; xx += pw) {
    b.vline(xx, y, y + h - 1, m.dd);
    b.vline(xx + 1, y, y + h - 1, m.lt);
  }
  b.vline(x, y, y + h - 1, m.lt);
  b.vline(x + w - 1, y, y + h - 1, m.dk);
  b.hline(x, x + w - 1, y + h - 1, m.dk);
}

/** Cut-stone blocks in running bond, each block lit on its top-left. */
function stones(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp, bw = 6, bh = 3): void {
  b.rect(x, y, w, h, m.base);
  for (let r = 0; r * bh < h; r++) {
    const yy = y + r * bh;
    const off = r % 2 ? Math.floor(bw / 2) : 0;
    b.hline(x, x + w - 1, yy, m.dd);
    if (yy + 1 < y + h) b.hline(x, x + w - 1, yy + 1, m.lt);
    for (let xx = x - off; xx < x + w; xx += bw) {
      if (xx > x) b.vline(xx, yy, Math.min(y + h - 1, yy + bh - 1), m.dd);
    }
  }
  b.vline(x + w - 1, y, y + h - 1, m.dk);
}

/** Small flame whose base sits at (x, y). */
function flame(b: PixelBuf, x: number, y: number, big = false): void {
  b.set(x - 1, y, '#b8402e');
  b.set(x, y, '#e08a2c');
  b.set(x + 1, y, '#b8402e');
  b.set(x, y - 1, '#f6c04a');
  b.set(x, y - 2, '#fff2b0');
  if (big) {
    b.set(x - 1, y - 1, '#e08a2c');
    b.set(x + 1, y - 1, '#e08a2c');
    b.set(x - 1, y - 2, '#f6c04a');
    b.set(x + 1, y - 3, '#f6c04a');
    b.set(x, y - 3, '#fff2b0');
    b.set(x, y - 4, '#f6c04a');
  }
}

/** Wax candle (2px wide) with its flame; (x, y) = top of the wax. */
function candle(b: PixelBuf, x: number, y: number, h = 3): void {
  b.rect(x, y, 2, h, '#efe6cc');
  b.vline(x + 1, y, y + h - 1, '#cfc2a0');
  b.set(x, y, '#fffbe8');
  b.set(x, y - 1, '#f6c04a');
  b.set(x, y - 2, '#fff2b0');
  b.set(x + 1, y - 1, '#e08a2c');
}

/** Small heater shield (5x6): royal blue field, gold rim and boss. */
function shield(b: PixelBuf, x: number, y: number): void {
  b.stamp(['GGGGG', 'GLBBG', 'GBYBG', 'GBBDG', '.GBG.', '..G..'], x, y, {
    G: GOLD.base,
    L: BLUE.lt,
    B: BLUE.base,
    D: BLUE.dk,
    Y: GOLD.hi,
  });
}

/** Big bone tusk sweeping up and outward; (x, y) = its root. `flip` sweeps it to the right. */
function tusk(b: PixelBuf, x: number, y: number, flip = false, tall = false): void {
  const rows = tall
    ? ['H.....', 'HB....', 'HB....', 'BBH...', '.BBH..', '.DBBB.', '..DBBB', '...DBB', '....DD']
    : ['H...', 'HB..', 'BBH.', '.BBB', '..DB', '...D'];
  const w = rows[0].length;
  b.stamp(rows, flip ? x : x - w + 1, y - rows.length + 1, { H: BONE.hi, B: BONE.base, D: BONE.dk }, flip);
}

/** Rope lashing band (twisted look). */
function rope(b: PixelBuf, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    b.set(x, y, (x & 1) === 0 ? ROPE : ROPE_DK);
    b.set(x, y + 1, (x & 1) === 1 ? ROPE : ROPE_DK);
  }
}

/** Foaming tankard (4 wide); (x, y) = top-left of the foam. */
function tankard(b: PixelBuf, x: number, y: number, wood: Ramp = HONEY): void {
  b.rect(x, y + 1, 4, 4, wood.base);
  b.vline(x, y + 1, y + 4, wood.lt);
  b.vline(x + 3, y + 1, y + 4, wood.dk);
  b.hline(x, x + 3, y + 3, IRON.base);
  b.hline(x, x + 3, y, '#fff6dc');
  b.set(x + 1, y - 1, '#fffbe8');
  b.set(x + 2, y, '#efe2b8');
  b.vline(x + 4, y + 2, y + 3, wood.dk);
}

// ------------------------------------------------------------------ mess hall (Alliance)

/** Kitchen counter against the north wall: oak cabinet with iron straps and a thick stone slab. */
function counterBase(b: PixelBuf, kind: 'plain' | 'drawers' | 'doors'): void {
  // Cabinet of oak planks between iron straps.
  planks(b, 0, 5, 16, 10, OAK, 4);
  b.rect(0, 14, 16, 2, STONE.dk);
  b.hline(0, 15, 14, STONE.base);
  if (kind === 'drawers') {
    b.rect(1, 7, 14, 7, OAK.base);
    for (const y of [7, 10]) {
      b.hline(1, 14, y + 2, OAK.dd);
      b.hline(1, 14, y, OAK.lt);
      b.rect(7, y + 1, 2, 1, GOLD.base);
      b.set(7, y + 1, GOLD.hi);
    }
    b.vline(1, 7, 12, OAK.lt);
    b.vline(14, 7, 12, OAK.dk);
    b.hline(1, 14, 13, OAK.dk);
  } else if (kind === 'doors') {
    b.vline(7, 7, 13, OAK.dd);
    b.vline(8, 7, 13, OAK.lt);
    // Strap hinges and gold ring pulls.
    for (const y of [8, 11]) {
      b.hline(1, 4, y, IRON.base);
      b.hline(11, 14, y, IRON.base);
    }
    b.set(5, 9, GOLD.hi);
    b.set(5, 10, GOLD.base);
    b.set(10, 9, GOLD.hi);
    b.set(10, 10, GOLD.base);
  } else {
    // Blue cloth with a gold stripe hanging over the front.
    b.rect(10, 6, 4, 6, BLUE.base);
    b.vline(10, 6, 11, BLUE.lt);
    b.vline(13, 6, 11, BLUE.dk);
    b.hline(10, 13, 9, GOLD.base);
    b.set(11, 12, BLUE.dk);
    b.set(13, 12, BLUE.dk);
  }
  band(b, 0, 15, 5, 5);
  // Thick slab of grey cut stone.
  topFace(b, 0, -3, 16, 6, STONE);
  b.hline(0, 15, -3, STONE.base);
  b.hline(0, 15, 2, STONE.hi);
  b.rect(0, 3, 16, 2, STONE.dk);
  b.hline(0, 15, 3, STONE.base);
  for (const [x, y] of [[3, -1], [11, 0], [6, 1], [13, -2]] as const) b.set(x, y, STONE.base);
  b.vline(9, 3, 4, STONE.dd);
}

export function counter(variant: string | undefined): BufFurniture {
  const s = floorSheet(1, 1, 6);
  const b = s.buf;
  counterBase(b, variant === 'drawers' ? 'drawers' : 'plain');
  if (variant === 'drawers') {
    // A loaf and a knife on the slab.
    b.rect(3, -2, 5, 3, '#c98a3e');
    b.hline(4, 6, -2, '#e8b870');
    b.set(5, -1, '#9a5e24');
    b.line(10, 0, 13, -1, IRON.lt);
  } else {
    // Stack of clay bowls.
    b.rect(4, -1, 6, 2, '#b8693a');
    b.hline(4, 9, -1, '#d48a5a');
    b.rect(5, -3, 4, 2, '#a85a30');
    b.hline(5, 8, -3, '#c87a4a');
  }
  b.outline();
  seamless(b);
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

export function counterSink(): BufFurniture {
  // Stone basin carved into the counter, fed by a little water barrel with a brass tap.
  const s = floorSheet(1, 1, 12);
  const b = s.buf;
  counterBase(b, 'doors');
  b.rect(2, -2, 9, 5, STONE.dd);
  b.rect(3, -1, 7, 3, WATER.base);
  b.hline(3, 9, -1, WATER.lt);
  b.set(5, 0, WATER.hi);
  b.set(8, 1, WATER.dk);
  b.hline(2, 10, 3, STONE.hi);
  // Water barrel on the back of the slab.
  const bx = 10;
  b.rect(bx, -10, 5, 8, HONEY.base);
  b.vline(bx, -10, -3, HONEY.lt);
  b.vline(bx + 4, -10, -3, HONEY.dk);
  b.hline(bx, bx + 4, -11, HONEY.lt);
  b.hline(bx, bx + 4, -8, IRON.base);
  b.hline(bx, bx + 4, -4, IRON.base);
  b.hline(bx + 1, bx + 3, -11, WATER.lt);
  // Brass tap pouring into the basin.
  b.hline(7, bx - 1, -6, BRASS.base);
  b.set(7, -5, BRASS.dk);
  b.set(bx - 1, -7, BRASS.hi);
  b.vline(7, -4, -2, 'rgba(160,210,230,0.75)');
  b.outline();
  seamless(b);
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

export function coffeeMachine(state: number): BufFurniture {
  // Iron cauldron on a stone hearth over logs; state 1 = fire lit and brew bubbling.
  const s = floorSheet(1, 1, 22);
  const b = s.buf;
  counterBase(b, 'drawers');
  const on = state >= 1;
  const iron = ramp('#3a3a40', 0.1);
  // Hearth ring and logs.
  b.ellipse(8, 0, 7, 2.5, STONE.dk);
  b.ellipse(8, -0.5, 6, 2, STONE.lt);
  b.ellipse(8, 0, 4.5, 1.5, '#2a1d14');
  b.line(4, 1, 12, -1, BARK.base, 1);
  b.line(4, -1, 12, 1, BARK.lt, 1);
  if (on) {
    b.hline(5, 11, -1, '#e08a2c');
    b.set(6, -2, '#f6c04a');
    b.set(10, -2, '#f6c04a');
    b.set(3, -2, '#b8402e');
    b.set(13, -2, '#b8402e');
  }
  // Pot belly.
  b.ellipse(8, -7, 6.5, 5, iron.dk);
  b.ellipse(7.5, -7.5, 6, 4.5, iron.base);
  b.ellipse(6, -9, 3, 2, iron.lt);
  b.set(4, -10, iron.hi);
  b.set(5, -10, iron.hi);
  // Legs.
  b.vline(3, -3, -1, iron.dk);
  b.vline(12, -3, -1, iron.dk);
  // Rim and brew.
  b.ellipse(8, -12, 6.5, 2, iron.lt);
  b.ellipse(8, -11.8, 5, 1.3, on ? '#7a4a24' : '#4e3220');
  b.hline(3, 12, -10, iron.dd);
  if (on) {
    b.set(6, -12, '#c8a070');
    b.set(10, -12, '#e0c090');
    b.set(8, -13, '#e0c090');
  }
  // Ears and a ladle.
  b.rect(0, -10, 2, 2, iron.base);
  b.rect(14, -10, 2, 2, iron.dk);
  b.line(10, -12, 14, -19, OAK.lt, 1);
  b.set(14, -19, OAK.hi);
  if (on) {
    flame(b, 4, 2);
    flame(b, 11, 2);
  }
  b.outline();
  seamless(b);
  contact(b, 0, 14, 16, 3, 0.2);
  if (on) {
    for (const [x, y, a] of [[6, -15, 0.6], [8, -17, 0.5], [7, -19, 0.4], [9, -21, 0.3]] as const) {
      b.set(x, y, `rgba(240,236,224,${a})`);
      b.set(x + 1, y, `rgba(240,236,224,${a * 0.6})`);
    }
  }
  return { base: s };
}

export function microwave(): BufFurniture {
  // Small domed stone oven with a fire-lit arch and bread on the hearth.
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  counterBase(b, 'plain');
  // Dome of stone blocks.
  for (let y = -11; y <= 2; y++) {
    const t = y < -6 ? (y + 11) / 5 : 1;
    const half = Math.round(3 + 4 * Math.sqrt(t));
    b.hline(8 - half, 7 + half, y, STONE.base);
    b.set(8 - half, y, STONE.lt);
    b.set(7 + half, y, STONE.dk);
  }
  for (const y of [-8, -5, -2]) b.hline(1, 14, y, STONE.dd);
  for (const [x, y] of [[5, -10], [9, -10], [3, -7], [8, -7], [12, -7], [5, -4], [11, -4], [2, -1], [13, -1]] as const) {
    b.vline(x, y, y + 1, STONE.dd);
  }
  b.hline(4, 7, -11, STONE.hi);
  b.set(3, -9, STONE.hi);
  // Chimney.
  b.rect(10, -15, 3, 4, STONE.dk);
  b.hline(10, 12, -15, STONE.lt);
  b.set(11, -16, 'rgba(200,200,200,0.5)');
  // Arched mouth glowing with embers.
  b.rect(4, -4, 8, 6, '#2a1410');
  b.hline(5, 10, -5, '#2a1410');
  b.hline(6, 9, -6, '#2a1410');
  b.hline(4, 11, 1, '#e08a2c');
  b.hline(5, 10, 0, '#b8402e');
  b.set(6, -1, '#f6c04a');
  b.set(9, 0, '#f6c04a');
  // Loaf on the sill.
  b.rect(5, 1, 5, 2, '#c98a3e');
  b.hline(6, 8, 1, '#e8b870');
  // Gold keystone.
  b.set(7, -7, GOLD.hi);
  b.set(8, -7, GOLD.base);
  b.outline();
  seamless(b);
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

export function fridge(): BufFurniture {
  // Tall frost-runed ice chest: oak frame, iron bands, frozen panels and icicles.
  const s = floorSheet(1, 1, 26);
  const b = s.buf;
  const ice = ramp('#6fa8cc', 0.08);
  topFace(b, 0, -23, 16, 3, OAK_LT);
  frontFace(b, 0, -20, 16, 34, OAK);
  b.vline(0, -20, 13, OAK.lt);
  b.rect(0, 14, 16, 2, STONE.dk);
  // Frozen panels.
  for (const [y0, h] of [[-17, 13], [-1, 12]] as const) {
    b.rect(2, y0, 12, h, ice.base);
    b.hline(2, 13, y0, ice.hi);
    b.vline(2, y0, y0 + h - 1, ice.lt);
    b.vline(13, y0, y0 + h - 1, ice.dk);
    b.hline(2, 13, y0 + h - 1, ice.dk);
    // Frost crackle.
    b.line(3, y0 + 2, 6, y0 + 5, ice.hi);
    b.line(12, y0 + h - 3, 9, y0 + h - 6, ice.lt);
  }
  // Glowing runes.
  const rune = '#f2feff';
  const halo = 'rgba(200,250,255,0.55)';
  b.stamp(['.H.', 'HRH', 'RRR', 'HRH', 'R.R'], 6, -14, { R: rune, H: halo });
  b.stamp(['R.R', 'HRH', 'RRR', 'HRH', '.R.'], 6, 2, { R: rune, H: halo });
  // Iron bands with gold rivets and a lock.
  band(b, 0, 15, -20, 5);
  band(b, 0, 15, -3, 5);
  band(b, 0, 15, 12, 5);
  b.rect(12, -6, 2, 3, GOLD.base);
  b.set(12, -6, GOLD.hi);
  // Icicles under the lid.
  for (const [x, l] of [[2, 3], [4, 2], [7, 4], [10, 2], [13, 3]] as const) {
    b.vline(x, -19, -19 + l - 1, '#d8f2ff');
    b.set(x, -19 + l - 1, '#ffffff');
  }
  // Gold crest on top.
  b.rect(6, -26, 4, 3, GOLD.base);
  b.hline(6, 9, -26, GOLD.hi);
  b.set(7, -25, BLUE.base);
  b.set(8, -25, BLUE.base);
  b.outline();
  contact(b, 0, 13, 16, 4, 0.24);
  // Cold mist at the foot.
  for (const [x, y] of [[1, 15], [4, 16], [9, 16], [13, 15]] as const) b.set(x, y, 'rgba(220,244,255,0.45)');
  return { base: s };
}

export function vendingMachine(): BufFurniture {
  // Potion merchant's cabinet: arched oak case, shelves of flasks, gold coin plaque and a lantern.
  const s = floorSheet(1, 1, 27);
  const b = s.buf;
  frontFace(b, 0, -21, 16, 37, OAK);
  b.vline(0, -21, 15, OAK.lt);
  // Arched crown with a blue plaque and gold coin.
  b.rect(1, -24, 14, 3, OAK.base);
  b.rect(3, -26, 10, 2, OAK.base);
  b.hline(3, 12, -26, OAK.hi);
  b.hline(1, 2, -24, OAK.hi);
  b.hline(13, 14, -24, OAK.lt);
  b.rect(4, -25, 8, 4, BLUE.base);
  b.hline(4, 11, -25, BLUE.lt);
  b.rect(7, -24, 2, 2, GOLD.base);
  b.set(7, -24, GOLD.hi);
  const gx = 2;
  const gy = -18;
  const gw = 12;
  const gh = 22;
  b.rect(gx, gy, gw, gh, '#2e2018');
  b.rect(gx, gy, gw, 2, '#3e2c1e');
  const r = rngOf(7, 61);
  const brews = ['#d0342c', '#3d7ae0', '#5fc040', '#9a4ad0', '#e0b23c', '#e06a2c'];
  for (let row = 0; row < 4; row++) {
    const y = gy + 1 + row * 5 + (row === 0 ? 1 : 0);
    for (let k = 0; k < 3; k++) {
      const c = pick(r, brews);
      const x = gx + 1 + k * 4;
      const tall = r() < 0.4;
      // Cork, neck, round body with a highlight.
      b.set(x + 1, y, OAK.lt);
      b.set(x + 1, y + 1, 'rgba(220,230,230,0.8)');
      if (tall) {
        b.rect(x + 1, y + 1, 2, 3, c);
        b.set(x + 1, y + 1, shade(c, 0.35));
      } else {
        b.rect(x, y + 2, 3, 2, c);
        b.set(x, y + 2, shade(c, 0.35));
        b.set(x + 2, y + 3, shade(c, -0.2));
      }
    }
    b.hline(gx, gx + gw - 1, y + 4 - (row === 0 ? 1 : 0), OAK.lt);
  }
  // Side pillars with gold caps.
  b.vline(1, gy, gy + gh, OAK.dk);
  b.vline(14, gy, gy + gh, OAK.dd);
  b.set(1, gy, GOLD.base);
  b.set(14, gy, GOLD.base);
  // Lower drawer with a coin slot.
  band(b, 0, 15, 5, 5);
  b.rect(2, 8, 12, 5, OAK.lt);
  b.hline(2, 13, 8, OAK.hi);
  b.hline(2, 13, 12, OAK.dk);
  b.rect(6, 10, 4, 1, '#2a1d14');
  b.set(9, 9, GOLD.hi);
  b.rect(0, 14, 16, 2, STONE.dk);
  // Lantern hanging from the corner.
  b.vline(15, -22, -21, IRON.base);
  b.rect(14, -20, 3, 4, IRON.dk);
  b.rect(15, -19, 1, 2, '#ffd36a');
  b.outline();
  contact(b, 0, 13, 16, 4, 0.26);
  s.rects = { glow: rectAt(s, gx, gy, gw, gh) };
  return { base: s };
}

export function cafeTable(): BufFurniture {
  // Round oak table on a stout pedestal with an iron rim, a candle and a loaf.
  const s = floorSheet(1, 1, 6);
  const b = s.buf;
  // Cross feet and pedestal.
  b.rect(3, 13, 10, 2, OAK.dd);
  b.hline(3, 12, 13, OAK.dk);
  b.rect(6, 7, 4, 7, OAK.dk);
  b.vline(6, 7, 13, OAK.base);
  b.vline(9, 7, 13, OAK.dd);
  // Top: iron-rimmed planks.
  b.ellipse(8, 5.5, 8, 3.8, OAK.dd);
  b.ellipse(8, 4.6, 7.8, 3.5, IRON.lt);
  b.ellipse(8, 4.6, 7.1, 3.0, OAK_LT.lt);
  for (const x of [4, 8, 12]) {
    for (let y = 2; y <= 7; y++) {
      const nx = (x + 0.5 - 8) / 7.1;
      const ny = (y + 0.5 - 4.6) / 3.0;
      if (nx * nx + ny * ny <= 1) b.set(x, y, OAK_LT.base);
    }
  }
  b.hline(5, 9, 2, OAK_LT.hi);
  // Loaf.
  b.rect(9, 3, 4, 2, '#c98a3e');
  b.hline(10, 11, 3, '#e8b870');
  // Candle in an iron dish.
  b.hline(3, 6, 5, IRON.base);
  candle(b, 4, 2, 3);
  b.outline();
  contact(b, 2, 13, 12, 3, 0.22);
  return { base: s };
}

export function cafeChair(variant: string | undefined): BufFurniture {
  // Carved oak chair with a royal blue cushion and gold finials.
  const v = variant ?? 'down';
  const s = floorSheet(1, 1, 12);
  const b = s.buf;
  const legC = OAK.dd;
  for (const x of [4, 11]) b.vline(x, 9, 15, legC);
  for (const x of [5, 10]) b.vline(x, 9, 13, OAK.dk);
  const seat = () => {
    b.rect(3, 8, 10, 2, OAK.dk);
    b.hline(3, 12, 9, OAK.dd);
    b.rect(3, 4, 10, 4, BLUE.base);
    b.hline(4, 11, 4, BLUE.hi);
    b.hline(3, 12, 5, BLUE.lt);
    b.hline(3, 12, 7, BLUE.dk);
    b.set(5, 6, GOLD.base);
    b.set(10, 6, GOLD.base);
  };
  if (v === 'down') {
    for (const x of [3, 12]) {
      b.vline(x, -8, 5, OAK.base);
      b.set(x, -9, GOLD.hi);
      b.set(x, -8, GOLD.base);
    }
    b.vline(3, -7, 5, OAK.lt);
    b.vline(12, -7, 5, OAK.dk);
    // Arched top rail and padded blue panel.
    b.hline(4, 11, -7, OAK.base);
    b.hline(5, 10, -8, OAK.lt);
    b.hline(6, 9, -9, OAK.hi);
    b.rect(4, -6, 8, 6, BLUE.base);
    b.hline(4, 11, -6, BLUE.lt);
    b.vline(11, -6, -1, BLUE.dk);
    b.set(7, -4, GOLD.hi);
    b.set(8, -4, GOLD.base);
    b.set(7, -3, GOLD.base);
    b.hline(4, 11, 0, OAK.dk);
    seat();
    b.outline();
    contact(b, 2, 13, 12, 3, 0.2);
    return { base: s };
  }
  if (v === 'up') {
    seat();
    b.outline();
    const front = floorSheet(1, 1, 12);
    const f = front.buf;
    for (const x of [4, 11]) f.vline(x, 6, 10, legC);
    // Back of the chair seen from behind: oak panel with a gold-capped crest.
    f.rect(3, 2, 10, 6, OAK.base);
    f.hline(3, 12, 2, OAK.hi);
    f.vline(3, 2, 7, OAK.lt);
    f.vline(12, 2, 7, OAK.dk);
    f.hline(3, 12, 7, OAK.dk);
    f.vline(7, 3, 6, OAK.dk);
    f.vline(8, 3, 6, OAK.lt);
    f.set(3, 1, GOLD.hi);
    f.set(12, 1, GOLD.base);
    f.outline();
    return { base: s, front };
  }
  // left/right: tall side post (on the side opposite to where the sitter looks).
  seat();
  const bx = v === 'left' ? 11 : 3;
  b.vline(bx + 1, 0, 9, legC);
  b.rect(bx, -7, 2, 12, OAK.base);
  b.vline(bx, -7, 4, OAK.lt);
  b.vline(bx + 1, -7, 4, OAK.dk);
  b.rect(bx, -5, 2, 6, BLUE.base);
  b.vline(bx, -5, 0, BLUE.lt);
  b.set(bx, -8, GOLD.hi);
  b.set(bx + 1, -8, GOLD.base);
  b.outline();
  return { base: s };
}

// ------------------------------------------------------------------ tavern (neutral)

/** Woollen tavern pillow (6x5): red with a gold stripe. */
function pillow(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 6, 5, RED.base);
  b.hline(x + 1, x + 4, y, RED.hi);
  b.vline(x, y + 1, y + 3, RED.lt);
  b.vline(x + 5, y + 1, y + 4, RED.dk);
  b.hline(x + 1, x + 5, y + 4, RED.dk);
  b.hline(x, x + 5, y + 2, GOLD.base);
  b.set(x - 1, y + 4, GOLD.dk);
  b.set(x + 6, y + 4, GOLD.dk);
}

/** Only the top of a pillow, peeking above the back rest. */
function pillowTop(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 6, 4, RED.base);
  b.hline(x + 1, x + 4, y, RED.hi);
  b.vline(x, y + 1, y + 3, RED.lt);
  b.vline(x + 5, y + 1, y + 3, RED.dk);
  b.hline(x, x + 5, y + 2, GOLD.base);
}

/** Shaggy fur pelt: soft body with combed strands and tufts along the bottom edge. */
function fur(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp, seed: number): void {
  b.rect(x, y, w, h, m.base);
  b.hline(x, x + w - 1, y, m.lt);
  b.hline(x + 1, x + w - 2, y, m.hi);
  const r = rngOf(seed, 13);
  // Combed strands: short vertical streaks (light on top, shadow below).
  for (let yy = y + 1; yy < y + h - 1; yy += 2) {
    for (let xx = x + ((yy - y) % 4 === 1 ? 0 : 1); xx < x + w; xx += 2 + Math.floor(r() * 2)) {
      b.set(xx, yy, m.lt);
      b.set(xx, yy + 1, m.dk);
    }
  }
  // Ragged bottom edge with hanging tufts.
  b.hline(x, x + w - 1, y + h - 1, m.dk);
  for (let xx = x; xx < x + w; xx++) {
    const t = (xx * 7 + seed) % 3;
    if (t === 0) b.set(xx, y + h, m.dk);
    if (t === 1) {
      b.set(xx, y + h, m.base);
      b.set(xx, y + h + 1, m.dd);
    }
  }
}

/** Tree-stump arm: cut top with rings, barked sides. */
function stump(b: PixelBuf, x: number, top: number, w: number, bottom: number): void {
  b.rect(x, top + 2, w, bottom - top - 1, BARK.base);
  b.vline(x, top + 2, bottom, BARK.lt);
  b.vline(x + w - 1, top + 2, bottom, BARK.dd);
  for (let xx = x + 2; xx < x + w - 1; xx += 2) b.vline(xx, top + 4 + (xx % 3), bottom - 2, BARK.dk);
  b.hline(x, x + w - 1, bottom, BARK.dd);
  // Cut top: pale wood with a ring.
  b.rect(x, top, w, 3, HONEY.hi);
  b.hline(x + 1, x + w - 2, top + 1, HONEY.lt);
  b.set(x + Math.floor(w / 2), top + 1, HONEY.base);
  b.hline(x, x + w - 1, top + 3, BARK.lt);
  b.clear(x, top);
  b.clear(x + w - 1, top);
}

/** Log seen lengthwise: rounded shading by row, end grain at both ends. */
function logBeam(b: PixelBuf, x0: number, x1: number, y: number, h: number, ends = true): void {
  const rows = [BARK.lt, BARK.base, BARK.base, BARK.dk, BARK.dd];
  for (let i = 0; i < h; i++) b.hline(x0, x1, y + i, rows[Math.min(rows.length - 1, Math.floor((i * rows.length) / h))]);
  if (ends) {
    b.vline(x0, y + 1, y + h - 2, HONEY.lt);
    b.vline(x1, y + 1, y + h - 2, HONEY.base);
  }
}

function stubLegs(b: PixelBuf, xs: readonly number[], y: number): void {
  for (const x of xs) {
    b.rect(x, y, 2, 2, BARK.dk);
    b.set(x, y, BARK.base);
  }
}

export function sofa(variant: string | undefined): BufFurniture {
  // Long tavern bench of logs, covered in furs, with tree-stump arms.
  const up = variant === 'up';
  const s = floorSheet(3, 1, 14);
  const b = s.buf;
  if (!up) {
    // Two stacked logs as the back rest, a fur draped over them.
    b.rect(5, -11, 38, 13, BARK.dd);
    logBeam(b, 5, 42, -11, 6);
    logBeam(b, 5, 42, -5, 6);
    fur(b, 12, -10, 24, 6, FUR_DARK, 3);
    // Seat: a big pale fur with a shaggy front edge.
    fur(b, 6, 1, 36, 7, FUR, 7);
    // Front log beam and stubby legs.
    logBeam(b, 5, 42, 9, 5);
    stubLegs(b, [8, 38], 14);
    stump(b, 0, -5, 6, 13);
    stump(b, 42, -5, 6, 13);
    stubLegs(b, [1, 45], 14);
    pillow(b, 7, -5);
    pillow(b, 35, -5);
    // A foaming tankard on the left stump.
    tankard(b, 1, -9);
    b.outline();
    contact(b, -1, 13, 50, 4, 0.24);
    return { base: s };
  }
  // Seen from behind (the sitter faces north): base = tall stump arms + fur strip + pillow tops;
  // front = the back of the log back rest (continuous, no seat divisions).
  b.rect(5, -3, 38, 5, FUR.base);
  b.hline(5, 42, -3, FUR.dk);
  b.hline(5, 42, -2, FUR.lt);
  pillowTop(b, 8, -3);
  pillowTop(b, 34, -3);
  stump(b, 0, -7, 6, 13);
  stump(b, 42, -7, 6, 13);
  b.outline();
  contact(b, -1, 13, 50, 4, 0.24);
  const front = floorSheet(3, 1, 14);
  const f = front.buf;
  backLogs(f, 0, 47);
  stubLegs(f, [2, 23, 44], 14);
  f.outline();
  return { base: s, front };
}

/** Back of the log back rest (seen from behind): two logs, each row a single tone. */
function backLogs(f: PixelBuf, x0: number, x1: number): void {
  logBeam(f, x0, x1, 1, 6);
  logBeam(f, x0, x1, 7, 6);
  f.hline(x0, x1, 13, BARK.dd);
  // Rope lashings near the ends.
  for (const x of [x0, x1 - 1]) {
    f.vline(x, 1, 12, ROPE);
    f.vline(x + 1, 1, 12, ROPE_DK);
  }
}

/** Curved horn (for the fur throne) rising from (x, y). */
function horn(b: PixelBuf, x: number, y: number, flip: boolean): void {
  b.stamp(['H...', 'BH..', 'BB..', '.BB.', '.DBB'], x - (flip ? 3 : 0), y - 4, { H: BONE.hi, B: BONE.base, D: BONE.dk }, flip);
}

export function armchair(variant: string | undefined): BufFurniture {
  // Fur throne: timber frame, horn finials, draped pelt and brass knobs.
  const v = variant ?? 'down';
  const s = floorSheet(1, 1, 18);
  const b = s.buf;
  if (v === 'down' || v === 'up') {
    if (v === 'down') {
      // Tall back posts with horns.
      for (const x of [2, 12]) {
        b.rect(x, -13, 2, 16, TIMBER.base);
        b.vline(x, -13, 2, TIMBER.lt);
      }
      horn(b, 1, -14, false);
      horn(b, 14, -14, true);
      b.rect(4, -12, 8, 13, TIMBER.dk);
      b.hline(4, 11, -12, TIMBER.base);
      fur(b, 4, -11, 8, 11, FUR_DARK, 5);
      b.set(7, -8, BONE.base);
      b.set(8, -8, BONE.dk);
      fur(b, 3, 2, 10, 6, FUR, 9);
      b.rect(3, 9, 10, 5, TIMBER.base);
      b.hline(3, 12, 9, TIMBER.lt);
      b.hline(3, 12, 13, TIMBER.dd);
      throneArm(b, 0);
      throneArm(b, 12);
      stubLegs(b, [1, 13], 14);
      b.outline();
      contact(b, -1, 13, 18, 4, 0.24);
      return { base: s };
    }
    // Back view: same reading as the bench (high arms, fur seat, continuous back rest).
    b.rect(3, -3, 10, 5, FUR.base);
    b.hline(3, 12, -3, FUR.dk);
    b.hline(3, 12, -2, FUR.lt);
    throneArm(b, 0, -6);
    throneArm(b, 12, -6);
    b.outline();
    contact(b, -1, 13, 18, 4, 0.24);
    const front = floorSheet(1, 1, 18);
    const f = front.buf;
    f.rect(0, 1, 16, 13, TIMBER.dk);
    f.hline(0, 15, 1, TIMBER.lt);
    f.hline(0, 15, 2, TIMBER.base);
    f.vline(0, 1, 13, TIMBER.base);
    f.vline(15, 1, 13, TIMBER.dd);
    for (const x of [5, 10]) f.vline(x, 3, 12, TIMBER.dd);
    f.hline(0, 15, 13, TIMBER.dd);
    rope(f, 1, 14, 6);
    horn(f, 1, 0, false);
    horn(f, 14, 0, true);
    stubLegs(f, [1, 13], 14);
    f.outline();
    return { base: s, front };
  }
  // Side view: tall back on the side opposite to where the sitter looks, low arm in front.
  const left = v === 'left';
  const bx = left ? 11 : 0;
  fur(b, 1, 2, 14, 7, FUR, 11);
  b.rect(1, 10, 14, 4, TIMBER.base);
  b.hline(1, 14, 10, TIMBER.lt);
  b.hline(1, 14, 13, TIMBER.dd);
  b.rect(bx, -12, 5, 26, TIMBER.base);
  b.vline(bx, -12, 13, TIMBER.lt);
  b.vline(bx + 4, -12, 13, TIMBER.dk);
  b.hline(bx, bx + 4, -12, TIMBER.hi);
  fur(b, bx, -10, 5, 10, FUR_DARK, 4);
  horn(b, left ? bx + 4 : bx, -13, left);
  b.hline(bx, bx + 4, 13, TIMBER.dd);
  stubLegs(b, [1, 13], 14);
  b.outline();
  contact(b, -1, 13, 18, 4, 0.24);
  return { base: s };
}

/** Throne arm: timber post with a brass knob on top. */
function throneArm(b: PixelBuf, x: number, top = -4): void {
  b.rect(x, top, 4, 18 - (top + 4), TIMBER.base);
  b.vline(x, top, 13, TIMBER.lt);
  b.vline(x + 3, top, 13, TIMBER.dk);
  b.hline(x, x + 3, 13, TIMBER.dd);
  rope(b, x, x + 3, top + 4);
  b.rect(x + 1, top - 2, 2, 2, BRASS.base);
  b.set(x + 1, top - 2, BRASS.hi);
}

/** Small keg (8 wide) with iron hoops; (x, y) = top-left. */
function keg(b: PixelBuf, x: number, y: number, h: number): void {
  b.rect(x, y, 8, h, HONEY.base);
  b.vline(x, y, y + h - 1, HONEY.lt);
  b.vline(x + 1, y, y + h - 1, HONEY.hi);
  b.vline(x + 7, y, y + h - 1, HONEY.dk);
  b.vline(x + 4, y, y + h - 1, HONEY.dk);
  b.hline(x, x + 7, y + 1, IRON.base);
  b.hline(x, x + 7, y + h - 2, IRON.base);
}

export function coffeeTable(seed: number): BufFurniture {
  // Low tavern table: a plank top laid across two kegs, with ale, dice and snacks.
  const s = floorSheet(2, 1, 8);
  const b = s.buf;
  keg(b, 2, 9, 6);
  keg(b, 22, 9, 6);
  // Plank top (planks running left-right).
  b.rect(1, 1, 30, 8, HONEY.lt);
  b.hline(1, 30, 1, HONEY.base);
  b.hline(1, 30, 4, HONEY.dk);
  b.hline(1, 30, 5, HONEY.hi);
  b.hline(1, 30, 8, HONEY.hi);
  b.rect(1, 9, 30, 2, HONEY.dk);
  b.hline(1, 30, 10, HONEY.dd);
  for (const x of [3, 28]) {
    b.set(x, 2, IRON.lt);
    b.set(x, 6, IRON.lt);
  }
  if (seed % 2) {
    tankard(b, 5, -1);
    tankard(b, 11, 1);
    // Dice.
    b.rect(20, 3, 2, 2, BONE.hi);
    b.set(21, 4, '#2a1d14');
    b.rect(23, 5, 2, 2, BONE.base);
    b.set(23, 5, '#2a1d14');
  } else {
    // Cheese wheel with a wedge cut, bread and a candle.
    b.ellipse(9, 4, 4, 2.2, '#e8b040');
    b.ellipse(9, 3.6, 3.4, 1.6, '#f6d070');
    b.set(10, 3, '#e8b040');
    b.set(11, 4, '#e8b040');
    b.rect(16, 3, 5, 3, '#c98a3e');
    b.hline(17, 19, 3, '#e8b870');
    b.rect(25, 1, 2, 3, '#efe6cc');
    b.set(25, 0, '#f6c04a');
    b.set(25, -1, '#fff2b0');
  }
  b.outline();
  contact(b, 0, 12, 32, 4, 0.22);
  return { base: s };
}

export function pingpongTable(): BufFurniture {
  // Heavy war-game table: a painted map of two realms split by a river, keeps and figurines.
  const s = floorSheet(3, 2, 10);
  const b = s.buf;
  // Thick legs and a central trestle.
  for (const x of [2, 42]) {
    b.rect(x, 22, 4, 9, TIMBER.base);
    b.vline(x, 22, 30, TIMBER.lt);
    b.vline(x + 3, 22, 30, TIMBER.dd);
    b.hline(x, x + 3, 26, IRON.base);
  }
  b.rect(21, 22, 6, 7, TIMBER.dk);
  b.hline(21, 26, 25, IRON.base);
  // Frame.
  b.rect(0, -4, 48, 25, HONEY.base);
  b.hline(0, 47, -4, HONEY.hi);
  b.vline(0, -4, 20, HONEY.lt);
  b.vline(47, -4, 20, HONEY.dk);
  b.rect(0, 20, 48, 3, HONEY.dk);
  b.hline(0, 47, 20, HONEY.base);
  b.hline(0, 47, 22, HONEY.dd);
  // Map: grassland with a river down the middle.
  const grass = ramp('#6a8a3e', 0.06);
  b.rect(3, -1, 42, 19, grass.base);
  b.hline(3, 44, -1, grass.dk);
  const r = rngOf(5, 3);
  for (let i = 0; i < 40; i++) b.set(3 + Math.floor(r() * 42), Math.floor(r() * 19) - 1, r() < 0.5 ? grass.lt : grass.dk);
  for (let y = -1; y <= 17; y++) {
    const wob = Math.round(Math.sin(y / 3) * 1);
    b.hline(22 + wob, 25 + wob, y, WATER.base);
    b.set(22 + wob, y, WATER.lt);
  }
  // A bridge.
  b.rect(20, 7, 8, 3, OAK_LT.lt);
  b.hline(20, 27, 7, OAK_LT.hi);
  b.hline(20, 27, 9, OAK.dk);
  // Hills and trees.
  for (const [x, y] of [[8, 13], [37, 1], [14, 2], [33, 14]] as const) {
    b.rect(x, y, 3, 2, '#3e6a2c');
    b.set(x + 1, y - 1, '#4f7d3a');
  }
  // Keeps: blue (west) and red (east).
  const keep = (x: number, y: number, flag: Ramp) => {
    b.rect(x, y, 6, 6, STONE.base);
    b.vline(x, y, y + 5, STONE.lt);
    b.vline(x + 5, y, y + 5, STONE.dk);
    b.set(x, y - 1, STONE.base);
    b.set(x + 2, y - 1, STONE.base);
    b.set(x + 5, y - 1, STONE.base);
    b.rect(x + 2, y + 3, 2, 3, '#2a1d14');
    b.vline(x + 3, y - 5, y - 1, IRON.dk);
    b.rect(x + 4, y - 5, 3, 2, flag.base);
    b.set(x + 4, y - 5, flag.lt);
  };
  keep(7, 3, BLUE);
  keep(36, 7, RED);
  // Figurines: little pawns for each side.
  const pawn = (x: number, y: number, m: Ramp) => {
    b.set(x, y - 2, m.lt);
    b.rect(x - 1, y - 1, 3, 2, m.base);
    b.set(x + 1, y, m.dk);
  };
  for (const [x, y] of [[15, 9], [17, 13], [13, 15]] as const) pawn(x, y, BLUE);
  for (const [x, y] of [[31, 4], [32, 10], [29, 15]] as const) pawn(x, y, RED);
  // Dice on the frame and iron corner plates.
  b.rect(42, -4, 3, 3, BONE.hi);
  b.set(43, -3, '#2a1d14');
  for (const [x, y] of [[0, -4], [45, -4], [0, 18], [45, 18]] as const) {
    b.rect(x, y, 3, 3, IRON.base);
    b.set(x + 1, y + 1, GOLD.lt);
  }
  b.outline();
  contact(b, 0, 27, 48, 5, 0.22);
  return { base: s };
}

// Grain sacks (red/blue/green dye marks) and a hay bale (yellow).
const SACK_MARK: Readonly<Record<string, string>> = { red: '#b8402e', blue: '#3d63b8', green: '#5f9a3a' };
const BURLAP = ramp('#b8986a', 0.07);
const HAY = ramp('#d9b45a', 0.07);

export function beanbag(variant: string | undefined): BufFurniture {
  const v = variant ?? 'red';
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  if (v === 'yellow') {
    // Hay bale bound with twine.
    b.rect(0, 5, 16, 9, HAY.base);
    b.rect(0, 1, 16, 5, HAY.lt);
    b.hline(1, 14, 1, HAY.hi);
    b.hline(0, 15, 5, HAY.hi);
    b.hline(0, 15, 13, HAY.dk);
    b.vline(15, 5, 13, HAY.dk);
    const r = rngOf(3, 9);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(r() * 16);
      const y = 6 + Math.floor(r() * 7);
      b.hline(x, Math.min(15, x + 2), y, r() < 0.5 ? HAY.dk : HAY.lt);
    }
    for (const x of [4, 11]) {
      b.vline(x, 1, 13, '#8a5a2a');
      b.set(x, 5, '#a8703a');
    }
    // Loose straws.
    b.line(14, 1, 17, -1, HAY.hi);
    b.line(1, 2, -1, 0, HAY.lt);
    b.outline();
    contact(b, 0, 12, 16, 4, 0.24);
    return { base: s };
  }
  const mark = SACK_MARK[v] ?? SACK_MARK.red;
  const m = BURLAP;
  // Slumped sack body.
  b.ellipse(8, 9, 7.8, 5.5, m.dk);
  b.ellipse(7.6, 8.2, 7.2, 5, m.base);
  b.ellipse(7, 7, 5, 3.4, m.lt);
  b.set(4, 5, m.hi);
  b.set(5, 4, m.hi);
  b.set(6, 4, m.hi);
  // Woven texture.
  for (let y = 5; y <= 13; y += 2) for (let x = 2 + (y % 4 ? 1 : 0); x <= 14; x += 3) if (b.alpha(x, y) > 0) b.set(x, y, m.dk);
  // Dyed band and a painted stamp.
  for (let x = 1; x <= 15; x++) if (b.alpha(x, 10) > 0) {
    b.set(x, 10, mark);
    b.set(x, 11, shade(mark, -0.12));
  }
  b.rect(9, 6, 3, 2, mark);
  b.set(10, 5, mark);
  // Tied neck flopped to the back-left, with a rope tie.
  b.rect(2, 1, 4, 4, m.base);
  b.hline(2, 5, 1, m.lt);
  b.set(1, 0, m.lt);
  b.set(4, 0, m.base);
  b.set(6, 0, m.dk);
  b.hline(2, 5, 3, ROPE_DK);
  b.hline(12, 14, 14, m.dd);
  b.outline();
  contact(b, 0, 12, 16, 4, 0.24);
  return { base: s };
}

export function arcade(): BufFurniture {
  // Goblin fortune machine: brass cabinet, gears, glowing green tubes and a scrying window.
  const s = floorSheet(1, 1, 28);
  const b = s.buf;
  const m = BRASS;
  const dark = ramp('#3a3530', 0.08);
  frontFace(b, 1, -20, 14, 36, dark);
  b.vline(1, -20, 15, dark.lt);
  // Brass dome with a green bulb.
  b.ellipse(8, -21, 7, 3.5, m.dk);
  b.ellipse(8, -21.5, 6.5, 3, m.base);
  b.hline(4, 9, -24, m.hi);
  b.rect(6, -27, 4, 3, GOB_GLOW);
  b.hline(6, 9, -27, '#d8ffb0');
  b.set(9, -25, '#4f9a3a');
  b.hline(6, 9, -24, m.dk);
  // Gear on the side.
  b.ellipse(14.5, -13, 2.6, 2.6, IRON.base);
  b.set(14, -13, IRON.dd);
  for (const [x, y] of [[14, -16], [17, -13], [14, -10], [12, -13]] as const) b.set(x, y, IRON.lt);
  // Riveted brass frame around the screen.
  b.rect(2, -18, 12, 11, m.base);
  b.hline(2, 13, -18, m.hi);
  b.vline(2, -18, -8, m.lt);
  b.vline(13, -18, -8, m.dk);
  b.hline(2, 13, -8, m.dk);
  for (const [x, y] of [[2, -18], [13, -18], [2, -8], [13, -8]] as const) b.set(x, y, GOLD.hi);
  const screen = { x: 3, y: -16, w: 10, h: 7 };
  b.rect(screen.x, screen.y, screen.w, screen.h, '#1e2e22');
  // Idle fortune glyph: a glowing eye.
  b.hline(6, 9, -13, '#3f7a3a');
  b.hline(5, 10, -12, '#3f7a3a');
  b.rect(7, -13, 2, 2, GOB_GLOW);
  b.hline(6, 9, -11, '#3f7a3a');
  b.set(4, -15, '#2f4a32');
  b.set(11, -10, '#2f4a32');
  // Control shelf: lever and gem buttons.
  b.rect(1, -7, 14, 3, m.lt);
  b.hline(1, 14, -7, m.hi);
  b.hline(1, 14, -5, m.dk);
  b.rect(3, -9, 1, 3, IRON.lt);
  b.rect(2, -10, 3, 2, RED.lt);
  b.set(2, -10, '#ff9a8a');
  for (const [x, c] of [[8, '#d0342c'], [10, '#3d7ae0'], [12, GOB_GLOW]] as const) b.set(x, -6, c);
  // Bubbling green vat behind a porthole.
  b.ellipse(8, 3, 4, 4, m.dk);
  b.ellipse(8, 3, 3, 3, '#2f6a2a');
  b.set(7, 2, GOB_GLOW);
  b.set(9, 4, GOB_GLOW);
  b.set(6, 1, '#d8ffb0');
  // Brass bands and rivets on the lower body.
  for (const y of [-2, 12]) band(b, 1, 14, y, 3, m, GOLD.hi);
  b.vline(1, -2, 13, m.lt);
  b.vline(14, -2, 13, m.dk);
  // Coin slot and copper pipe.
  b.rect(6, 9, 4, 2, m.base);
  b.hline(7, 8, 10, '#2a1d14');
  b.set(9, 9, GOLD.hi);
  b.vline(-1, -4, 12, m.base);
  b.vline(0, -4, 12, m.dk);
  b.hline(-1, 1, -4, m.hi);
  b.hline(-1, 1, 6, IRON.base);
  b.outline();
  contact(b, -1, 13, 18, 4, 0.26);
  s.rects = { screen: rectAt(s, screen.x, screen.y, screen.w, screen.h) };
  return { base: s };
}

// ------------------------------------------------------------------ bathhouse (Alliance)

export function toiletStall(state: number): BufFurniture {
  // Half-timbered latrine booth: plaster panels in an oak frame, plank door with strap hinges.
  const occupied = state >= 1;
  const s = floorSheet(2, 2, 26, 3, 4);
  const b = s.buf;
  // Interior: planked latrine box against the back, a bucket and a candle on a shelf.
  planks(b, 9, -2, 14, 6, OAK, 3);
  topFace(b, 9, -7, 14, 6, OAK_LT);
  b.ellipse(16, -4, 3, 1.5, '#2a1d14');
  b.hline(14, 18, -6, OAK_LT.dk);
  b.ellipse(16, 4.5, 6.5, 3.5, 'rgba(40,30,20,0.18)');
  // Bucket.
  b.rect(24, 0, 4, 4, HONEY.base);
  b.vline(24, 0, 3, HONEY.lt);
  b.hline(24, 27, 1, IRON.base);
  b.hline(24, 27, -1, '#5a8aa8');
  // Shelf with a candle on the left partition.
  b.rect(3, -3, 4, 1, OAK.dk);
  candle(b, 4, -6, 3);
  // Side partitions (top seen from above, y = -22 to the front): plaster with oak caps.
  for (const x of [0, 29]) {
    b.rect(x, -22, 3, 34, PLASTER.base);
    b.vline(x, -22, 11, OAK.lt);
    b.vline(x + 2, -22, 11, OAK.dk);
    b.hline(x, x + 2, -22, OAK.hi);
    for (const y of [-12, -2]) b.hline(x, x + 2, y, OAK.base);
  }
  b.outline();
  underRect(b, 2, 0, 28, 12, 'rgba(30,24,20,0.14)');
  // Front: half-timbered wall with a door (covers the interior).
  const front = floorSheet(2, 2, 26, 3, 4);
  const f = front.buf;
  f.rect(0, 10, 32, 20, PLASTER.base);
  f.vline(1, 11, 28, PLASTER.lt);
  // Oak beams: top rail, posts and braces.
  f.rect(0, 8, 32, 3, OAK.base);
  f.hline(0, 31, 8, OAK.hi);
  f.hline(0, 31, 10, OAK.dk);
  for (const x of [0, 29]) {
    f.rect(x, 11, 3, 19, OAK.base);
    f.vline(x, 11, 29, OAK.lt);
    f.vline(x + 2, 11, 29, OAK.dk);
  }
  f.line(3, 28, 5, 13, OAK.base, 1);
  f.line(28, 28, 26, 13, OAK.base, 1);
  f.rect(0, 29, 32, 1, OAK.dk);
  // Stone footing.
  stones(f, 0, 30, 32, 2, STONE, 8, 2);
  // Blue shield above the door.
  shield(f, 13, 3);
  const door = (x: number, w: number) => {
    planks(f, x, 12, w, 17, OAK_LT, 3);
    f.hline(x, x + w - 1, 12, OAK_LT.hi);
    // Strap hinges.
    for (const y of [15, 24]) f.hline(x, x + Math.min(w - 2, 6), y, IRON.base);
    // Crescent moon cut-out.
    const cx = x + Math.floor(w / 2) - 1;
    f.set(cx, 14, '#2a1d14');
    f.set(cx + 1, 15, '#2a1d14');
    f.set(cx + 1, 16, '#2a1d14');
    f.set(cx, 17, '#2a1d14');
  };
  if (occupied) {
    door(7, 18);
    f.rect(21, 19, 2, 2, GOLD.base);
    f.set(21, 19, GOLD.hi);
    // Red "occupied" tag.
    f.rect(19, 22, 4, 3, RED.base);
    f.hline(19, 22, 22, RED.hi);
  } else {
    // Door ajar: dark gap on the right, narrow leaf in perspective.
    f.rect(19, 12, 6, 17, '#2a1d14');
    f.rect(20, 13, 4, 15, '#4a3422');
    door(7, 12);
    f.rect(16, 19, 2, 2, GOLD.base);
    f.set(16, 19, GOLD.hi);
    f.rect(21, 15, 2, 2, '#5fd07a');
  }
  f.outline();
  return { base: s, front };
}

export function sink(): BufFurniture {
  // Stone wash basin on a block pedestal, with an iron hand pump and a blue towel.
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  stones(b, 2, 4, 12, 12, STONE, 6, 3);
  b.vline(2, 4, 15, STONE.lt);
  b.rect(1, 14, 14, 2, STONE.dk);
  b.hline(1, 14, 14, STONE.base);
  // Pump behind the basin.
  b.rect(10, -11, 3, 10, IRON.base);
  b.vline(10, -11, -2, IRON.lt);
  b.vline(12, -11, -2, IRON.dk);
  b.hline(10, 12, -12, IRON.hi);
  b.line(11, -12, 15, -15, IRON.dk);
  b.rect(14, -16, 2, 2, OAK.base);
  b.hline(6, 9, -9, IRON.base);
  b.hline(6, 9, -10, IRON.lt);
  b.set(6, -8, IRON.dk);
  // Basin bowl.
  b.ellipse(8, 1, 7.6, 3.6, STONE.dk);
  b.ellipse(8, 0.4, 7.2, 3.2, STONE.lt);
  b.ellipse(8, 0.8, 5.4, 2.2, WATER.base);
  b.hline(5, 10, 0, WATER.lt);
  b.set(6, 0, WATER.hi);
  b.vline(6, -7, -1, 'rgba(170,215,235,0.7)');
  // Blue towel with a gold stripe over the rim.
  b.rect(1, 3, 3, 7, BLUE.base);
  b.vline(1, 3, 9, BLUE.lt);
  b.hline(1, 3, 7, GOLD.base);
  b.set(3, 10, BLUE.dk);
  b.outline();
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

// ------------------------------------------------------------------ great hall (Horde)

export function receptionDesk(seed: number): BufFurniture {
  // Horde great-hall counter: lashed dark logs, a red war banner, bone tusks and a brazier.
  const s = floorSheet(3, 1, 20);
  const b = s.buf;
  const slab = ramp('#6b4a2b', 0.07);
  // Back work area: brazier, scrolls and a skull candle.
  topFace(b, 1, -10, 46, 6, TIMBER);
  // Brazier on a tripod.
  b.line(5, -9, 7, -13, IRON.dk);
  b.line(11, -9, 9, -13, IRON.dk);
  b.ellipse(8, -14, 4.5, 2, IRON.base);
  b.hline(4, 12, -15, IRON.lt);
  b.hline(5, 11, -16, '#b8402e');
  flame(b, 7, -16, true);
  flame(b, 10, -16);
  // Scroll stack.
  for (const [x, y] of [[18, -9], [20, -11], [24, -9]] as const) {
    b.rect(x, y, 6, 2, BONE.base);
    b.hline(x, x + 5, y, BONE.hi);
    b.set(x + 5, y + 1, RED.base);
  }
  // Cartoony skull with a candle melted on top.
  const sx = 38;
  b.stamp(['.HHHH.', 'HBBBBB', 'BKKBKK', 'BKKBKK', 'BBBBBD', '.BDBD.', '.D.D..'], sx, -14, {
    H: BONE.hi,
    B: BONE.base,
    D: BONE.dk,
    K: '#2a1d14',
  });
  candle(b, sx + 2, -17, 3);
  b.set(sx + 1, -14, '#efe6cc');
  b.set(sx + 4, -13, '#efe6cc');
  // Front of lashed vertical logs.
  for (let x = 0; x < 48; x += 4) {
    b.rect(x, -2, 4, 18, TIMBER.base);
    b.vline(x, -2, 15, TIMBER.lt);
    b.vline(x + 3, -2, 15, TIMBER.dd);
    b.set(x + 1, 4 + ((x * 3 + seed) % 7), TIMBER.dk);
  }
  b.rect(0, 14, 48, 2, TIMBER.dd);
  rope(b, 0, 47, 1);
  rope(b, 0, 47, 10);
  // Red war banner with notched hem and a bone fang sigil.
  b.rect(17, -1, 14, 13, RED.base);
  b.vline(17, -1, 11, RED.lt);
  b.vline(30, -1, 11, RED.dk);
  b.hline(17, 30, -1, RED.hi);
  for (let i = 0; i < 3; i++) {
    b.set(23 - i, 12 + i, RED.base);
    b.set(24 + i, 12 + i, RED.base);
    b.set(17 + i, 12 + i, RED.dk);
    b.set(30 - i, 12 + i, RED.dk);
  }
  b.rect(19, 12, 3, 1, RED.base);
  b.rect(26, 12, 3, 1, RED.base);
  // Sigil: crossed black axes with bone blades.
  b.stamp(['BB......BB', 'BBK....KBB', '..KK..KK..', '...KKKK...', '...KKKK...', '..KK..KK..', '.KK....KK.'], 19, 2, {
    B: BONE.base,
    K: '#2a1d14',
  });
  // Thick slab top with iron plates.
  topFace(b, -1, -6, 50, 5, slab);
  b.hline(-1, 48, -2, slab.dk);
  for (const x of [0, 44]) {
    b.rect(x, -6, 4, 4, IRON.base);
    b.set(x + 1, -5, IRON.hi);
    b.set(x + 2, -4, IRON.lt);
  }
  // Drinking horn and a parchment ledger on the slab.
  b.line(30, -4, 35, -5, BONE.base, 1);
  b.set(35, -6, BONE.hi);
  b.rect(8, -5, 6, 2, '#d9cba8');
  b.hline(9, 12, -5, '#8a7a5a');
  // Tusks at the front corners.
  tusk(b, 2, 8, false, true);
  tusk(b, 45, 8, true, true);
  b.outline();
  contact(b, -1, 13, 50, 4, 0.24);
  return { base: s };
}

export function bench(): BufFurniture {
  // Horde waiting bench: split log seat, log back rail on tusk-topped posts, a hide drape.
  const s = floorSheet(2, 1, 14);
  const b = s.buf;
  // Posts with bone spikes.
  for (const x of [2, 28]) {
    b.rect(x, -9, 2, 24, TIMBER.base);
    b.vline(x, -9, 14, TIMBER.lt);
    b.vline(x + 1, -9, 14, TIMBER.dd);
  }
  tusk(b, 3, -9, false);
  tusk(b, 28, -9, true);
  // Back rail log.
  logBeam(b, 0, 31, -6, 4);
  rope(b, 1, 4, -5);
  rope(b, 27, 30, -5);
  // Hide drape with a red stripe.
  b.rect(10, -6, 12, 7, HIDE.base);
  b.hline(10, 21, -6, HIDE.lt);
  b.vline(21, -6, 0, HIDE.dk);
  b.hline(10, 21, -2, RED.base);
  b.set(10, 1, HIDE.dk);
  b.set(15, 1, HIDE.base);
  b.set(21, 1, HIDE.dk);
  for (const x of [11, 14, 17, 20]) b.set(x, -5, HIDE.dk);
  // Splayed stake legs lashed with rope.
  for (const [x0, x1] of [[5, 3], [26, 28]] as const) b.line(x0, 9, x1, 15, TIMBER.dk, 2);
  // Split log seat: cut face on top, bark below.
  b.rect(0, 2, 32, 3, mix(HONEY.lt, HONEY.base, 0.4));
  b.hline(0, 31, 2, HONEY.hi);
  for (const x of [6, 13, 21, 27]) b.hline(x, x + 3, 3, HONEY.base);
  logBeam(b, 0, 31, 5, 4, false);
  b.vline(0, 2, 8, HONEY.lt);
  b.vline(31, 2, 8, HONEY.base);
  rope(b, 2, 4, 6);
  rope(b, 27, 29, 6);
  b.outline();
  contact(b, 0, 13, 32, 3, 0.22);
  return { base: s };
}
