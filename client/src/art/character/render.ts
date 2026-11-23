// Procedural rendering of the chibi characters (pure: draws into a PixelBuf).
// 24x34 px sheet anchored at (12, 31), the centre of the feet. Standing: hair from y≈5,
// head y 7–17, torso 18–23, trousers 24–28, shoes 29–30. Sitting: torso/head 4px lower.
import type { Appearance, CharacterFrameRequest, HeldItem, Pose } from '../api';
import { clamp01, luminance, mix, ramp, shade, type Ramp } from '../core/color';
import { PixelBuf, type Palette } from '../core/pixbuf';
import type { BufSprite } from '../core/sprite';
import { HAIR, HEAD_BASE, TEXTURED, type HeadView, type Tpl } from './hair';
import type { HairStyle } from '../api';
import type { Race } from '../../../../shared/race';

export const CHAR_W = 24;
export const CHAR_H = 34;
export const CHAR_AX = 12;
export const CHAR_AY = 31;
/** Origin of the head grid (column 0, row 0) when standing. */
const HX = 5;
const HY = 3;
/** How far the body drops when sitting. */
export const SEAT_DROP = 4;

export const POSE_FRAMES: Readonly<Record<Pose, number>> = {
  stand: 2, walk: 4, run: 4, sit: 2, type: 4, sleep: 2, drink: 2, use: 2, raise_hand: 2, talk: 2, stretch: 2,
  read: 2, play: 2, wait: 2, cheer: 2, laugh: 2, game: 2, rps: 2, groom: 2, sulk: 2,
};

export const POSE_DURATION: Readonly<Record<Pose, number>> = {
  stand: 650, walk: 140, run: 95, sit: 800, type: 120, sleep: 1000, drink: 700, use: 380, raise_hand: 320, talk: 280,
  stretch: 800, read: 1100, play: 200, wait: 480, cheer: 260, laugh: 190, game: 150, rps: 300, groom: 420, sulk: 1300,
};

const SEATED_ONLY: ReadonlySet<Pose> = new Set<Pose>(['sit', 'type', 'sleep', 'wait']);
const NEVER_SEATED: ReadonlySet<Pose> = new Set<Pose>(['walk', 'run', 'stretch', 'play', 'groom']);
/** Poses that place the hands (and the item) themselves: the generic item logic leaves them alone. */
const OWN_HANDS: ReadonlySet<Pose> = new Set<Pose>(['play', 'drink', 'raise_hand', 'stretch', 'cheer', 'laugh', 'game', 'rps', 'groom', 'sulk']);
/** Rock-paper-scissors gestures (the hand becomes rock, paper or scissors). */
const GESTURES: ReadonlySet<HeldItem> = new Set<HeldItem>(['rock', 'paper', 'scissors']);

export function isSeated(pose: Pose, seated?: boolean): boolean {
  return SEATED_ONLY.has(pose) || (!!seated && !NEVER_SEATED.has(pose));
}

// ---------------------------------------------------------------- palette

interface CharPal {
  skin: Ramp;
  hair: Ramp;
  top: Ramp;
  acc: Ramp;
  bottom: Ramp;
  shoes: Ramp;
  item: Ramp;
  eyeTop: string;
  eyeBot: string;
  blush: string;
  mouth: string;
  mouthOpen: string;
  shaved: string;
  stubble: string;
  /** Eyebrows (the template's `B`): a heavy skin-toned brow for orcs, hair-coloured for humans and elves. */
  brow: string;
  /** Trinkets (buckles, clasps, beads): bone for orcs, gold for humans, moon-silver for elves. */
  bone: string;
  boneSh: string;
}

/** Palettes per race (the race only changes how the stored appearance is drawn). */
const palCache: Record<Race, Map<Appearance, CharPal>> = { human: new Map(), elf: new Map(), orc: new Map(), undead: new Map() };

/**
 * Skin ramp of the workers (light olive green -> dark greyish green). The seed tones
 * (SKINS, light to dark) are mapped by luminance at draw time: the order and the
 * variety stay, only the hue changes. The appearance (and what goes to the server) is not altered.
 */
const ORC_SKIN = ['#9ec45c', '#8ab84e', '#76a844', '#64963c', '#558436', '#487230', '#3c5f2a', '#314d24'] as const;
/** Luminance of the lightest and darkest SKINS tones (#ffe2cc and #5a3623). */
const SKIN_LUM_HI = 0.904;
const SKIN_LUM_LO = 0.236;
const orcCache = new Map<string, string>();

/** Skin tone drawn for an appearance tone (same light -> dark order). */
export function orcSkin(skin: string): string {
  return remapSkin(skin, ORC_SKIN, orcCache);
}

/**
 * Night-elf skin ramp (pale lavender -> deep blue-violet), mapped from the SKINS tones by luminance just like
 * ORC_SKIN: the light-to-dark order and the variety stay, only the hue changes.
 */
const ELF_SKIN = ['#d8c4f4', '#c2a8ec', '#aa8ee0', '#9478d2', '#7e64c2', '#6a52ae', '#574496', '#45367a'] as const;
const elfCache = new Map<string, string>();

function remapSkin(skin: string, target: readonly string[], cache: Map<string, string>): string {
  let c = cache.get(skin);
  if (c) return c;
  const t = clamp01((SKIN_LUM_HI - luminance(skin)) / (SKIN_LUM_HI - SKIN_LUM_LO)) * (target.length - 1);
  const i = Math.min(target.length - 2, Math.floor(t));
  const f = t - i;
  c = f < 0.02 ? target[i] : f > 0.98 ? target[i + 1] : mix(target[i], target[i + 1], f);
  if (cache.size > 256) cache.clear();
  cache.set(skin, c);
  return c;
}

/** Night-elf skin tone drawn for an appearance tone (same light -> dark order). */
export function elfSkin(skin: string): string {
  return remapSkin(skin, ELF_SKIN, elfCache);
}

/** Undead: bare bone, from fresh ivory to old yellowed bone (same light -> dark order). */
const UNDEAD_SKIN = ['#efe9d6', '#e6dfc8', '#dcd4ba', '#d1c8ac', '#c6bc9f', '#bab092', '#ada386', '#a0967a'] as const;
const undeadCache = new Map<string, string>();

/** Skin tone drawn for a race: humans keep the appearance tone, orcs turn green, elves violet, undead bone. */
export function raceSkin(skin: string, race: Race): string {
  if (race === 'undead') return remapSkin(skin, UNDEAD_SKIN, undeadCache);
  return race === 'orc' ? orcSkin(skin) : race === 'elf' ? elfSkin(skin) : skin;
}

/**
 * Night-elf hair: the natural colours (shared/appearance-flat.ts HAIR_NATURAL) drift to the grove palette
 * (indigo, deep blue, teal, violet, moss green, silver) at draw time; "fun" colours already read as elvish.
 */
const ELF_HAIR: Readonly<Record<string, string>> = {
  '#2b2530': '#2b2f5e', // black -> indigo
  '#3f2c22': '#2f427c', // dark brown -> deep blue
  '#5f3c28': '#2d6c78', // brown -> dark teal
  '#87593a': '#3f9a92', // light brown -> teal
  '#b0703c': '#7a56b6', // copper -> violet
  '#8e3b2b': '#5c3a8c', // mahogany -> deep violet
  '#d6ae68': '#79c0a0', // blond -> moss green
  '#ebdcb0': '#e2eaf4', // platinum -> moon silver
  '#8f929b': '#9aa6c8', // grey -> blue silver
  '#d9dbe0': '#eef2fa', // white -> white
};

/**
 * Orc hair is dark: black, dark brown or a deep rust; light natural colours are drawn in those (fun colours stay,
 * like dyed war-hair).
 */
const ORC_HAIR: Readonly<Record<string, string>> = {
  '#87593a': '#3a2a20', // light brown -> dark brown
  '#b0703c': '#6a2e1e', // copper -> deep rust
  '#d6ae68': '#2e2622', // blond -> near-black
  '#ebdcb0': '#4a4440', // platinum -> iron grey
  '#8f929b': '#3e3c3e', // grey -> charcoal
  '#d9dbe0': '#5a5654', // white -> ash
};

function raceHair(hair: string, race: Race): string {
  // undead: what is left of the hair is lank, dull and grave-grey
  if (race === 'undead') return mix(hair, '#4a4a42', 0.7);
  if (race === 'orc') return ORC_HAIR[hair.toLowerCase()] ?? hair;
  return race === 'elf' ? (ELF_HAIR[hair.toLowerCase()] ?? hair) : hair;
}

/** Clothes per race: Horde leather, grave cloth for the undead, a dusk tint for elves; humans keep theirs. */
function raceCloth(c: string, race: Race): string {
  if (race === 'undead') return mix(c, '#3a3444', 0.5);
  if (race === 'orc') return mix(c, '#5a3e2a', 0.28);
  if (race === 'elf') return mix(c, '#3a2c52', 0.18);
  return c;
}

/** Bone of tusks and orc trinkets. */
const TUSK = '#efe6c6';
const TUSK_SH = '#c9bc95';
/** Alliance gold and night-elf moon silver (trinkets in place of bone). */
const GOLD = '#e6c25c';
const GOLD_SH = '#b38a34';
const MOON = '#e2eaf6';
const MOON_SH = '#a8b4cc';
/** Glowing night-elf eyes (silver-cyan). */
const ELF_EYE = '#f0feff';
const ELF_EYE_LO = '#8fe6f2';
/** Undead: empty sockets with a pale yellow glow deep inside. */
const SOCKET = '#1a1420';
const SOCKET_GLOW = '#ffd84a';
/** Alliance tabard and steel. */
const TABARD = ramp('#2f4f9c', 0.08);
const STEEL = ramp('#b8bec8', 0.1);

/**
 * Hairstyles per race and look, so a race reads by its silhouette and not only by its colours: orc women wear
 * war braids, a warrior's tail or a topknot and orc men a mohawk, a topknot or a shaved scalp; night elves wear
 * their hair long (flowing, wavy, a long tail or a high bun); the undead are mostly bare skulls, and what hair is
 * left hangs in lank strands (see stampTpl); humans keep the style of their appearance. The pick is stable for an
 * appearance (hashed from its stored style and colour).
 */
const RACE_HAIR: Readonly<Record<Exclude<Race, 'human'>, { f: readonly HairStyle[]; m: readonly HairStyle[] }>> = {
  orc: { f: ['pigtails', 'ponytail', 'short', 'pigtails'], m: ['mohawk', 'short', 'bald', 'mohawk', 'buzz'] },
  elf: { f: ['long', 'wavy', 'ponytail', 'long'], m: ['long', 'ponytail', 'bun', 'long'] },
  undead: { f: ['long', 'bald', 'bob', 'bald'], m: ['bald', 'bald', 'mohawk', 'bald'] },
};
const raceLookCache: Record<Race, WeakMap<Appearance, Appearance>> = { human: new WeakMap(), elf: new WeakMap(), orc: new WeakMap(), undead: new WeakMap() };

/** The appearance as the race wears it (only the hairstyle changes; the stored appearance stays the same). */
function raceLook(a: Appearance, race: Race): Appearance {
  if (race === 'human') return a;
  const cache = raceLookCache[race];
  let out = cache.get(a);
  if (out) return out;
  const opts = RACE_HAIR[race][a.look === 'f' ? 'f' : 'm'];
  let h = 0;
  for (const ch of `${a.hairStyle}|${a.hair}|${a.top}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  out = { ...a, hairStyle: opts[Math.abs(h) % opts.length] };
  cache.set(a, out);
  return out;
}

function paletteOf(a: Appearance, race: Race): CharPal {
  const cache = palCache[race];
  let p = cache.get(a);
  if (p) return p;
  const sk = raceSkin(a.skin, race);
  const skin = ramp(sk, 0.07);
  const dark = luminance(sk) < 0.38;
  const hairCol = raceHair(a.hair, race);
  const hair = ramp(hairCol, 0.09);
  const elf = race === 'elf';
  const undead = race === 'undead';
  p = {
    skin,
    hair,
    top: ramp(raceCloth(a.top, race), 0.08),
    acc: ramp(raceCloth(a.topAccent, race), 0.08),
    bottom: ramp(raceCloth(a.bottom, race), 0.07),
    shoes: ramp(a.shoes, 0.08),
    item: ramp(a.accessoryColor, 0.1),
    eyeTop: undead ? SOCKET : elf ? ELF_EYE : dark ? '#ece8f2' : '#1d1826',
    eyeBot: undead ? SOCKET_GLOW : elf ? ELF_EYE_LO : dark ? mix(a.eyes, '#0c0910', 0.55) : mix(a.eyes, '#1d1826', 0.25),
    blush: undead ? shade(sk, -0.14) : shade(sk, -0.1),
    mouth: undead ? SOCKET : shade(sk, -0.24),
    mouthOpen: '#7a2e35',
    shaved: mix(sk, hairCol, 0.42),
    stubble: mix(sk, hairCol, 0.3),
    brow: race === 'orc' ? skin.dd : undead ? skin.dk : elf ? mix(hair.dk, skin.dd, 0.25) : mix(hair.dk, skin.dk, 0.35),
    bone: race === 'orc' ? TUSK : elf ? MOON : GOLD,
    boneSh: race === 'orc' ? TUSK_SH : elf ? MOON_SH : GOLD_SH,
  };
  if (cache.size > 4096) cache.clear();
  cache.set(a, p);
  return p;
}

// ---------------------------------------------------------------- rig (pose -> positions)

type Pt = readonly [number, number];

interface Arm {
  /** Path of the 2x2 brush: shoulder -> ... -> hand (standing coordinates, no offset). */
  pts: readonly Pt[];
}

interface Rig {
  view: HeadView;
  seated: boolean;
  /** Vertical offset of torso/arms/head (sitting, breathing, bounce). */
  ub: number;
  /** Extra offset for the head only (dozing). */
  hd: number;
  /** Forward lean in profile (running): shifts head/torso in x. */
  lean: number;
  /** Feet: vertical (front/back) or horizontal (profile) offset of each leg. */
  legA: { dx: number; dy: number };
  legB: { dx: number; dy: number };
  /** Arm A = screen left (front/back) or far (profile). B = right/near. */
  armA: Arm;
  armB: Arm;
  /** 'half' = half-closed eyelids (boredom/impatience); 'happy' = eyes closed in an arc (^ ^), laughing. */
  eyes: 'open' | 'closed' | 'half' | 'happy';
  /** 'wide' = belly laugh (wide mouth with the tongue showing); 'frown' = sad mouth (corners down). */
  mouth: 'none' | 'open' | 'wide' | 'frown';
  held: HeldItem;
  /** Item behind the body (back view). */
  itemBehind: boolean;
  /** Hands holding the item with both hands (drawn over the item). */
  twoHands: boolean;
  /**
   * FIXED item position (standing coordinates, without ub/lean), independent of the hand — e.g. the popcorn
   * bucket on the lap while the hand goes from the bucket to the mouth. null = the item follows arm B's hand.
   */
  itemAt: Pt | null;
  /** Sitting: the tip of the right shoe rises 1px (tapping foot, impatience). */
  toeTap: boolean;
  /** Fingertips (2 px of skin) tapping on the arm — back view, with crossed arms. */
  tapAt: Pt | null;
  /** A piece of popcorn between the fingers (2 px), on its way to the mouth. */
  kernelAt: Pt | null;
  /** Front: crossed arms drawn by hand (see drawCrossedArms); 1 = fingers raised. */
  crossFront: 0 | 1 | null;
}

/** Arms straight down the sides of the body (front/back). */
const DOWN_A: Arm = { pts: [[6, 18], [6, 22]] };
const DOWN_B: Arm = { pts: [[16, 18], [16, 22]] };

function arm(...pts: Pt[]): Arm {
  return { pts };
}

const TWO_HANDED: ReadonlySet<HeldItem> = new Set<HeldItem>(['box', 'laptop', 'papers', 'book']);

function makeRig(req: CharacterFrameRequest, view: HeadView): Rig {
  const pose = req.pose;
  const n = POSE_FRAMES[pose];
  const f = ((Math.floor(req.frame) % n) + n) % n;
  const seated = isSeated(pose, req.seated);
  const held: HeldItem = req.held ?? 'none';
  const rig: Rig = {
    view,
    seated,
    ub: seated ? SEAT_DROP : 0,
    hd: 0,
    lean: 0,
    legA: { dx: 0, dy: 0 },
    legB: { dx: 0, dy: 0 },
    armA: view === 'side' ? arm([12, 18], [12, 22]) : DOWN_A,
    armB: view === 'side' ? arm([10, 18], [10, 22]) : DOWN_B,
    eyes: 'open',
    mouth: 'none',
    held,
    itemBehind: view === 'up',
    twoHands: false,
    itemAt: null,
    toeTap: false,
    tapAt: null,
    kernelAt: null,
    crossFront: null,
  };
  const side = view === 'side';

  switch (pose) {
    case 'stand':
    case 'sit':
      // Breathing: the head drops 1px on the second frame.
      if (f === 1) rig.hd = 1;
      break;
    case 'walk':
    case 'run': {
      const run = pose === 'run';
      const amp = run ? 2 : 1;
      if (f === 1 || f === 3) rig.ub -= 1;
      if (side) {
        const sw = [amp + 2, 0, -(amp + 2), 0][f];
        rig.legB = { dx: -sw, dy: f === 3 ? -2 : 0 };
        rig.legA = { dx: sw, dy: f === 1 ? -2 : 0 };
        const hs = [-2 - (run ? 1 : 0), 0, 2 + (run ? 1 : 0), 0][f];
        rig.armB = arm([10, 18], [10 + hs, run ? 21 : 22]);
        rig.armA = arm([12, 18], [12 - hs, run ? 21 : 22]);
        if (run) rig.lean = -1;
      } else {
        rig.legA.dy = [1, 0, 0, -amp][f];
        rig.legB.dy = [0, -amp, 1, 0][f];
        const sA = [-1, 0, 1, 0][f] * (run ? 2 : 1);
        rig.armA = arm([6, 18], [6 - (run ? 1 : 0), 22 + sA]);
        rig.armB = arm([16, 18], [16 + (run ? 1 : 0), 22 - sA]);
      }
      break;
    }
    case 'type': {
      const up = f % 2 === 0;
      if (view === 'up') {
        rig.armA = arm([7, 19], [5, 21], [6, 18 + (up ? -1 : 0)]);
        rig.armB = arm([15, 19], [17, 21], [16, 18 + (up ? 0 : -1)]);
      } else if (view === 'down') {
        rig.armA = arm([6, 18], [6, 21], [8, 22 + (up ? 0 : 1)]);
        rig.armB = arm([16, 18], [16, 21], [14, 22 + (up ? 1 : 0)]);
      } else {
        rig.armB = arm([10, 18], [9, 21], [6, 21 + (up ? 0 : -1)]);
        rig.armA = arm([12, 18], [11, 21], [7, 21 + (up ? -1 : 0)]);
      }
      break;
    }
    case 'sleep':
      rig.hd = f === 0 ? 2 : 3;
      rig.eyes = 'closed';
      if (view === 'down') {
        rig.armA = arm([6, 18], [7, 21], [9, 22]);
        rig.armB = arm([16, 18], [15, 21], [13, 22]);
      }
      break;
    case 'raise_hand': {
      const wave = f === 1 ? 1 : 0;
      if (side) {
        rig.armB = arm([10, 18], [4, 14], [3 - wave, 6]);
      } else {
        rig.armB = arm([16, 18], [19, 14], [19 + wave, 7 + wave]);
      }
      rig.mouth = view === 'down' && f === 0 ? 'open' : 'none';
      break;
    }
    case 'talk':
      rig.mouth = f === 0 ? 'open' : 'none';
      if (side) {
        rig.armB = arm([10, 18], [9, 21], f === 0 ? [6, 19] : [7, 21]);
      } else if (f === 0) {
        rig.armB = arm([16, 18], [17, 21], [18, 19]);
      } else {
        rig.armA = arm([6, 18], [5, 21], [4, 19]);
      }
      break;
    case 'stretch':
      rig.eyes = 'closed';
      rig.mouth = view === 'down' ? 'open' : 'none';
      if (f === 1) rig.ub -= 1;
      if (side) {
        rig.armB = arm([10, 18], [5, 13], [5, f === 0 ? 4 : 3]);
        rig.armA = arm([12, 18], [17, 12], [16, f === 0 ? 4 : 3]);
      } else {
        rig.armA = arm([6, 18], [4, 13], f === 0 ? [5, 5] : [4, 4]);
        rig.armB = arm([16, 18], [18, 13], f === 0 ? [17, 5] : [18, 4]);
      }
      break;
    case 'read': {
      rig.held = held === 'none' ? 'book' : held;
      if (f === 1) rig.hd = 1;
      break;
    }
    case 'play':
      rig.held = 'paddle';
      if (side) {
        rig.armB = f === 0 ? arm([10, 18], [13, 20], [15, 18]) : arm([10, 18], [8, 19], [5, 18]);
      } else {
        rig.armB = f === 0 ? arm([16, 18], [18, 20], [19, 18]) : arm([16, 18], [18, 17], [19, 14]);
      }
      break;
    case 'use': {
      const p = f === 1 ? 1 : 0;
      if (view === 'up') rig.armB = arm([16, 18], [17, 15], [16, 12 - p]);
      else if (view === 'down') rig.armB = arm([16, 18], [16, 21], [14, 23 + p]);
      else rig.armB = arm([10, 18], [8, 20], [5 - p, 20]);
      break;
    }
    case 'wait':
      waitRig(rig, view, f, held);
      break;
    case 'drink': {
      if (held === 'none') rig.held = 'coffee';
      const up = f === 1;
      if (side) rig.armB = up ? arm([10, 18], [8, 19], [6, 15]) : arm([10, 18], [10, 21], [8, 21]);
      else if (view === 'down') rig.armB = up ? arm([16, 18], [16, 19], [13, 15]) : arm([16, 18], [17, 21], [16, 21]);
      else rig.armB = up ? arm([16, 18], [18, 17], [16, 14]) : arm([16, 18], [17, 21], [16, 21]);
      break;
    }
    case 'cheer':
      cheerRig(rig, view, f);
      break;
    case 'laugh':
      laughRig(rig, view, f);
      break;
    case 'game':
      gameRig(rig, view, f);
      break;
    case 'rps':
      rpsRig(rig, view, f, held);
      break;
    case 'groom':
      groomRig(rig, view, f, held);
      break;
    case 'sulk':
      sulkRig(rig, view, f);
      break;
  }

  // Held items: arms and item position (except poses that already place the hand).
  const h = rig.held;
  if (h !== 'none' && !rig.itemAt && !OWN_HANDS.has(pose)) {
    if (TWO_HANDED.has(h) || pose === 'read') {
      rig.twoHands = true;
      if (side) {
        rig.armB = arm([10, 18], [10, 21], [7, 21]);
        rig.armA = arm([12, 18], [12, 21], [8, 20]);
      } else {
        rig.armA = arm([6, 18], [6, 20], [8, 21]);
        rig.armB = arm([16, 18], [16, 20], [14, 21]);
      }
    } else if (pose !== 'type' && pose !== 'use' && pose !== 'sleep' && pose !== 'talk') {
      // Cup, bottle or paddle in one hand, arm bent in front.
      if (side) rig.armB = arm([10, 18], [10, 21], [8, 21]);
      else rig.armB = arm([16, 18], [17, 21], [16, 21]);
    }
  }
  if (h === 'paddle' && pose !== 'play') rig.held = pose === 'stand' || pose === 'walk' || pose === 'run' ? 'paddle' : 'none';
  return rig;
}

/**
 * 'wait' pose (waiting for a shell to finish): sitting and leaning back 1px — up when facing front
 * (the backrest is to the north), down when facing away (backrest to the south) and backwards in profile.
 * - With popcorn: bucket on the lap/hugged, the hand alternating between the bucket (frame 0) and the mouth (1).
 *   Facing away the bucket rests beside the hip (outside the backrest) so it stays readable.
 * - No item: crossed arms, fingers tapping on the arm and the tip of the foot tapping; bored look.
 * - Other items: like 'sit' holding the item (the generic item logic handles the arms).
 */
function waitRig(rig: Rig, view: HeadView, f: number, held: HeldItem): void {
  if (view === 'down') rig.ub -= 1;
  else if (view === 'up') rig.ub += 1;
  else rig.lean = 1;
  const eat = f === 1;
  if (held === 'popcorn') {
    rig.itemBehind = false;
    if (view === 'down') {
      // Bucket hugged up against the chin: desk_back (the back of the monitor) hides the sprite from
      // y≈26, so popcorn, rim and three stripes must fit above that. The hand goes from the side of the
      // bucket (chewing, mouth open) to the mouth (covering it, with a piece of popcorn between the fingers).
      rig.itemAt = [9, 17];
      rig.armA = arm([6, 18], [6, 21], [9, 21]);
      rig.armB = eat ? arm([16, 18], [17, 19], [11, 15]) : arm([16, 18], [16, 20], [15, 20]);
      rig.mouth = eat ? 'none' : 'open';
      if (eat) rig.kernelAt = [11, 14];
    } else if (view === 'up') {
      // Facing away: bucket beside the left hip; the left arm dips into it and brings it to the mouth
      // (the hand disappears behind the head, the elbow sticks out).
      rig.itemAt = [0, 18];
      rig.armB = arm([16, 18], [16, 22]);
      rig.armA = eat ? arm([6, 18], [3, 16], [6, 13]) : arm([6, 18], [4, 20], [3, 18]);
    } else {
      // Profile (facing left): bucket on the lap, in front of the belly.
      rig.itemAt = [3, 18];
      rig.armA = arm([12, 18], [12, 21], [8, 22]);
      rig.armB = eat ? arm([10, 18], [9, 21], [5, 16]) : arm([10, 18], [10, 21], [6, 19]);
      rig.mouth = eat ? 'none' : 'open';
      if (eat) rig.kernelAt = [5, 15];
    }
    return;
  }
  if (held !== 'none') return;
  // Crossed arms, tapping the fingers (on the 2nd frame the top hand rises 1px) and the foot.
  const lifted = f === 1;
  rig.eyes = 'half';
  rig.toeTap = lifted;
  const tap = lifted ? -1 : 0;
  if (view === 'down') {
    rig.crossFront = lifted ? 1 : 0;
  } else if (view === 'up') {
    // Facing away only the elbows stick out; the fingertips tap on the left arm.
    rig.armA = arm([6, 18], [4, 20], [6, 22]);
    rig.armB = arm([16, 18], [18, 20], [16, 22]);
    rig.tapAt = [3, 19 + tap];
  } else {
    rig.armA = arm([12, 18], [12, 21], [9, 21]);
    rig.armB = arm([10, 18], [10, 21], [7, 20 + tap]);
  }
}

// ---------------------------------------------------------------- social life

/**
 * 'cheer' (celebrating): both arms up in a V with clenched fists and the mouth open.
 * On frame 1, a little hop (the whole body rises 2 px; sitting, just a bounce) and happy eyes.
 * In profile the back arm passes behind the head and shows above it.
 */
function cheerRig(rig: Rig, view: HeadView, f: number): void {
  const jump = f === 1;
  rig.mouth = 'open';
  if (jump) rig.eyes = 'happy';
  if (jump) {
    if (rig.seated) rig.ub -= 1;
    else {
      rig.ub -= 2;
      rig.legA = { dx: 0, dy: -2 };
      rig.legB = { dx: 0, dy: -2 };
    }
  }
  // Fists above the top of the head: sitting facing away (sofa in front of the TV) only the head and the hands
  // clear the backrest.
  if (view === 'side') {
    rig.armB = jump ? arm([10, 18], [5, 13], [3, 3]) : arm([10, 18], [6, 13], [4, 4]);
    rig.armA = jump ? arm([12, 18], [17, 12], [18, 2]) : arm([12, 18], [16, 12], [17, 3]);
    return;
  }
  rig.armA = jump ? arm([6, 18], [3, 12], [2, 3]) : arm([6, 18], [4, 12], [3, 4]);
  rig.armB = jump ? arm([16, 18], [19, 12], [20, 3]) : arm([16, 18], [18, 12], [19, 4]);
}

/**
 * 'laugh' (belly laugh): eyes closed in an arc, wide mouth, one hand on the belly and the body
 * shaking 1 px; on frame 1 the other hand slaps the thigh and, in profile, the body bends forward.
 */
function laughRig(rig: Rig, view: HeadView, f: number): void {
  rig.eyes = 'happy';
  rig.mouth = f === 0 ? 'wide' : 'open';
  if (f === 0) rig.ub -= 1;
  if (view === 'side') {
    rig.lean = f === 0 ? 1 : -1;
    rig.armB = arm([10, 18], [10, 21], [7, 22]);
    rig.armA = f === 0 ? arm([12, 18], [12, 22]) : arm([12, 18], [11, 21], [9, 23]);
    return;
  }
  if (view === 'up') {
    // Facing away: elbows out (the hands are on the belly, hidden by the body).
    rig.armA = arm([6, 18], [4, 21], [7, 22]);
    rig.armB = arm([16, 18], [18, 21], [15, 22]);
    return;
  }
  rig.armB = arm([16, 18], [17, 21], [14, 22]);
  rig.armA = f === 0 ? arm([6, 18], [6, 22]) : arm([6, 18], [5, 21], [4, 23]);
}

/**
 * 'game' (video game): controller in both hands in front of the chest, thumbs alternating (one hand rises
 * 1 px each frame). In profile the body leans towards the screen; facing away only the elbows stick out,
 * moving — the controller is hidden by the body.
 */
function gameRig(rig: Rig, view: HeadView, f: number): void {
  rig.held = 'controller';
  rig.twoHands = true;
  const a = f === 0 ? 0 : 1;
  const b = 1 - a;
  if (view === 'down') {
    rig.itemAt = [9, 20];
    rig.armA = arm([6, 18], [6, 20], [8, 20 + a]);
    rig.armB = arm([16, 18], [16, 20], [15, 20 + b]);
    return;
  }
  if (view === 'side') {
    rig.lean = -1;
    rig.itemAt = [4, 19];
    rig.armA = arm([12, 18], [11, 21], [7, 20 + a]);
    rig.armB = arm([10, 18], [10, 21], [6, 20 + b]);
    return;
  }
  rig.held = 'none';
  rig.twoHands = false;
  rig.armA = arm([6, 18], [4, 20], [7, 21 + a]);
  rig.armB = arm([16, 18], [18, 20], [15, 21 + b]);
}

/**
 * 'rps' (rock-paper-scissors). No gesture: the fist goes up (frame 0, shouting) and down (1) on the
 * count. With a gesture: arm stretched towards the opponent showing the hand — forward in profile,
 * in front of the chest when facing front and to the side when facing away (so it stays readable).
 */
function rpsRig(rig: Rig, view: HeadView, f: number, held: HeldItem): void {
  const reveal = GESTURES.has(held);
  rig.held = reveal ? held : 'rock';
  rig.itemBehind = false;
  if (!reveal) {
    const up = f === 0;
    if (view !== 'up') rig.mouth = up ? 'open' : 'none';
    if (view === 'side') {
      rig.armB = up ? arm([10, 18], [6, 16], [3, 12]) : arm([10, 18], [6, 18], [3, 16]);
      rig.armA = arm([12, 18], [12, 22]);
    } else if (view === 'down') {
      rig.armB = up ? arm([16, 18], [18, 15], [18, 11]) : arm([16, 18], [18, 18], [18, 15]);
      rig.armA = arm([6, 18], [5, 21], [6, 22]);
    } else {
      rig.armB = up ? arm([16, 18], [19, 15], [20, 11]) : arm([16, 18], [19, 18], [20, 15]);
      rig.armA = arm([6, 18], [6, 22]);
    }
    return;
  }
  const bob = f === 1 ? -1 : 0;
  if (view === 'side') {
    rig.armB = arm([10, 18], [7, 19], [4, 19 + bob]);
    rig.armA = arm([12, 18], [12, 22]);
  } else if (view === 'down') {
    rig.armB = arm([16, 18], [16, 20], [13, 20 + bob]);
    rig.armA = arm([6, 18], [6, 22]);
  } else {
    rig.armB = arm([16, 18], [19, 18], [21, 17 + bob]);
    rig.armA = arm([6, 18], [6, 22]);
  }
}

/**
 * 'groom' (in front of the mirror): one hand near the face/hair going back and forth. Facing away (the usual,
 * facing the mirror) the elbow is raised outwards and the hand shows at the side of the head;
 * facing front the hand applies the lipstick/comb at mouth/hair height.
 */
function groomRig(rig: Rig, view: HeadView, f: number, held: HeldItem): void {
  rig.itemBehind = false;
  const comb = held === 'comb';
  if (view === 'up') {
    rig.armB = f === 0 ? arm([16, 18], [20, 15], [18, 11]) : arm([16, 18], [20, 14], [17, 9]);
    return;
  }
  if (view === 'side') {
    rig.armB = comb
      ? f === 0 ? arm([10, 18], [8, 15], [9, 9]) : arm([10, 18], [8, 14], [11, 8])
      : f === 0 ? arm([10, 18], [9, 17], [6, 15]) : arm([10, 18], [9, 16], [6, 14]);
    return;
  }
  rig.armB = comb
    ? f === 0 ? arm([16, 18], [19, 14], [18, 9]) : arm([16, 18], [19, 13], [16, 8])
    : f === 0 ? arm([16, 18], [18, 17], [14, 15]) : arm([16, 18], [18, 17], [13, 15]);
  if (!comb) rig.mouth = 'none';
}

/** 'sulk' (upset): drooping shoulders, head down, half-closed eyes and hanging arms. */
function sulkRig(rig: Rig, view: HeadView, f: number): void {
  rig.eyes = 'half';
  rig.mouth = 'frown';
  rig.hd = f === 0 ? 1 : 2;
  if (!rig.seated) rig.ub += 1;
  if (view === 'side') {
    rig.lean = -1;
    rig.armB = arm([10, 18], [10, 22]);
    rig.armA = arm([12, 18], [12, 22]);
    return;
  }
  rig.armA = arm([6, 18], [7, 22]);
  rig.armB = arm([16, 18], [15, 22]);
}

/**
 * Crossed arms, front view (pixel by pixel: with long sleeves the 2x2 brush vanishes into the top).
 * The screen-right forearm goes over (light line + base), the other shows underneath
 * (dark line); the top hand holds the left arm and taps its fingers; the bottom one peeks out on the right.
 */
function drawCrossedArms(dc: Dc, sleeveCol: Ramp, sleeve: number, fingersUp: boolean): void {
  const { b, p, r } = dc;
  const y = r.ub;
  const sl = sleeveCol;
  const fa = sleeve < 4 ? p.skin : sl; // forearm: skin with short sleeves
  const sk = p.skin;
  // Everything high on the chest: behind desk_back only ~4 px of the torso show.
  // Arms (shoulder -> elbow) on both sides.
  for (let yy = 18; yy <= 20; yy++) {
    b.set(6, yy + y, yy === 20 ? sl.dk : sl.base);
    b.set(7, yy + y, sl.dk);
    b.set(16, yy + y, sl.base);
    b.set(17, yy + y, yy === 20 ? sl.dd : sl.dk);
  }
  // Bottom forearm (only the lower edge shows) and the hidden hand peeking out on the right.
  b.hline(8, 15, 21 + y, fa.dk);
  b.set(16, 21 + y, sk.base);
  b.set(17, 21 + y, sk.dk);
  // Top forearm, from the right elbow to the hand on the left arm.
  b.hline(8, 17, 19 + y, fa.lt);
  b.hline(8, 17, 20 + y, fa.base);
  b.set(17, 20 + y, fa.dk);
  b.set(12, 20 + y, fa.dk); // fold where the forearms cross
  // Hand on the left arm; on odd frames the fingers rise (tapping).
  const hy = fingersUp ? 18 : 19;
  b.set(5, hy + y, sk.lt);
  b.set(6, hy + y, sk.base);
  b.set(5, hy + 1 + y, sk.base);
  b.set(6, hy + 1 + y, sk.dk);
  b.set(7, 19 + y, sk.base);
  b.set(7, 20 + y, sk.dk);
}

// ---------------------------------------------------------------- drawing

/** Drawing context: buffer + palette + rig. */
interface Dc {
  b: PixelBuf;
  a: Appearance;
  p: CharPal;
  r: Rig;
  race: Race;
}

function hairPalette(p: CharPal, buzz: boolean): Palette {
  const h = p.hair;
  if (buzz) {
    const b = mix(h.base, p.skin.base, 0.3);
    return { o: b, h: mix(h.lt, p.skin.base, 0.3), H: mix(h.hi, p.skin.base, 0.35), d: mix(h.dk, p.skin.base, 0.2), D: h.dd, z: p.shaved, k: p.skin.hi };
  }
  return { o: h.base, h: h.lt, H: h.hi, d: h.dk, D: h.dd, z: p.shaved, k: p.skin.hi };
}

function stampTpl(dc: Dc, tpl: Tpl, pal: Palette, dy: number, textured = false): void {
  const { b } = dc;
  const ox = HX + tpl.x + dc.r.lean;
  const oy = HY + tpl.y + dy;
  if (dc.race === 'undead') {
    // lank, thinning strands: gaps run down the hair in columns, the skull shows through on top
    for (let r = 0; r < tpl.rows.length; r++) {
      const row = tpl.rows[r];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.' || ch === ' ') continue;
        const col = i + tpl.x;
        if ((col % 3 === 1 && r > 1) || (tpl.y + r < 6 && (col + r) % 2 === 0)) continue;
        b.set(ox + i, oy + r, pal[ch === 'H' || ch === 'h' ? 'o' : ch]);
      }
    }
    return;
  }
  if (!textured) {
    b.stamp(tpl.rows, ox, oy, pal);
    return;
  }
  // Curl texture: deterministic dithering over the base areas.
  for (let r = 0; r < tpl.rows.length; r++) {
    const row = tpl.rows[r];
    for (let i = 0; i < row.length; i++) {
      let ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      if (ch === 'o') {
        const k = (i * 5 + (tpl.y + r) * 3) % 7;
        if (k === 0) ch = 'd';
        else if (k === 3 && r < tpl.rows.length / 2) ch = 'h';
      }
      b.set(ox + i, oy + r, pal[ch]);
    }
  }
}

function drawHead(dc: Dc): void {
  const { p, r } = dc;
  const tpl = HEAD_BASE[r.view];
  const dy = r.ub + r.hd;
  const closed = r.eyes === 'closed' || r.eyes === 'happy';
  const half = r.eyes === 'half';
  // Half-closed: the top row becomes an eyelid and the bottom one uses the eye's darkest tone
  // (on dark skin eyeTop is the light highlight, so the pupil gets eyeBot).
  const pupil = luminance(p.eyeTop) > 0.5 ? p.eyeBot : p.eyeTop;
  const pal: Palette = {
    s: p.skin.base,
    S: p.skin.dk,
    L: p.skin.lt,
    e: closed ? p.skin.base : half ? shade(p.skin.base, -0.16) : p.eyeTop,
    E: closed ? shade(p.skin.base, -0.3) : half ? pupil : p.eyeBot,
    b: p.blush,
    m: r.mouth === 'open' || r.mouth === 'wide' ? p.mouthOpen : dc.a.look === 'f' ? mix(p.mouth, '#c0505a', 0.25) : p.mouth,
    r: p.skin.dk,
    B: p.brow,
    // Only orcs have tusks; on the other races the template's tusk pixels are plain skin.
    T: dc.race === 'orc' ? TUSK : p.skin.base,
  };
  dc.b.stamp(tpl.rows, HX + tpl.x + r.lean, HY + tpl.y + dy, pal);
  const ox = HX + tpl.x + r.lean;
  const oy = HY + tpl.y + dy;
  if (r.eyes === 'happy' && r.view !== 'up') {
    // Laughing eyes: a 3 px "^" arc in place of each eye (the pupil becomes skin).
    const ink = mix(p.skin.base, '#1d1826', 0.7);
    for (const cx of r.view === 'down' ? [4, 9] : [3]) {
      dc.b.set(ox + cx, oy + 6, ink);
      dc.b.set(ox + cx, oy + 7, p.skin.base);
      dc.b.set(ox + cx - 1, oy + 7, ink);
      dc.b.set(ox + cx + 1, oy + 7, ink);
    }
  }
  if (r.mouth === 'frown' && r.view !== 'up') {
    // Sad mouth: the corners drop 1 px (an arc turned down).
    const corner = shade(p.mouth, -0.12);
    if (r.view === 'down') {
      dc.b.set(ox + 5, oy + 10, corner);
      dc.b.set(ox + 8, oy + 10, corner);
    } else dc.b.set(ox + 3, oy + 10, corner);
  }
  if (r.mouth === 'wide' && r.view !== 'up') {
    // Belly laugh: the mouth opens sideways and the tongue shows underneath.
    const tongue = '#d8646e';
    if (r.view === 'down') {
      dc.b.set(ox + 5, oy + 9, p.mouthOpen);
      dc.b.set(ox + 8, oy + 9, p.mouthOpen);
      dc.b.set(ox + 6, oy + 10, tongue);
      dc.b.set(ox + 7, oy + 10, tongue);
    } else {
      dc.b.set(ox + 1, oy + 9, p.mouthOpen);
      dc.b.set(ox + 2, oy + 10, tongue);
    }
  }
  // Highlight on the forehead (light from top/left).
  if (r.view !== 'up') dc.b.set(HX + 3 + r.lean, HY + 7 + dy, p.skin.lt);
  drawRaceFace(dc);
}

/**
 * What makes a face read as its race at a glance (drawn over the base head, under the hair):
 * - orc: a broad, heavy jaw flaring past the cheeks and a dark underbite line (the tusks come later, on top);
 * - undead: a bare skull — deep sockets with a yellow glow, a nose hole, a row of teeth, hollow cheeks and a
 *   cracked crown;
 * - elf: night-elf markings on every face (the 'glasses' accessory already draws them) and a moon-silver circlet;
 * - human: the plain face (their look comes from the tabard and steel, see drawRaceBody).
 */
function drawRaceFace(dc: Dc): void {
  const { b, p, r } = dc;
  const ox = HX + r.lean;
  const oy = HY + r.ub + r.hd;
  const put = (cx: number, cy: number, col: string) => b.set(ox + cx, oy + cy, col);
  const v = r.view;
  const sk = p.skin;
  if (dc.race === 'orc') {
    if (v === 'down') {
      for (const cx of [0, 13]) {
        put(cx, 12, cx ? sk.dk : sk.base);
        put(cx, 13, cx ? sk.dd : sk.dk);
      }
      for (let cx = 1; cx <= 12; cx++) put(cx, 14, cx > 9 ? sk.dd : sk.dk);
      for (let cx = 5; cx <= 8; cx++) put(cx, 12, sk.dd);
      put(1, 9, sk.dd);
      put(12, 9, sk.dd);
    } else if (v === 'side') {
      put(0, 12, sk.base);
      put(0, 13, sk.dk);
      for (let cx = 1; cx <= 7; cx++) put(cx, 14, sk.dk);
      put(1, 12, sk.dd);
      put(2, 12, sk.dd);
    }
    return;
  }
  if (dc.race === 'undead') {
    if (v === 'up') {
      // back of the skull: a crack and the knobs of the neck vertebrae
      put(5, 6, sk.dd);
      put(6, 7, sk.dd);
      put(6, 8, sk.dk);
      put(6, 14, sk.dd);
      put(7, 14, sk.dk);
      return;
    }
    const closed = r.eyes === 'closed' || r.eyes === 'happy';
    if (v === 'down') {
      for (const cx of [3, 4, 9, 10]) for (const cy of [10, 11]) put(cx, cy, SOCKET);
      put(3, 9, sk.dd);
      put(4, 9, sk.dd);
      put(9, 9, sk.dd);
      put(10, 9, sk.dd);
      if (!closed) {
        put(4, 11, SOCKET_GLOW);
        put(9, 11, SOCKET_GLOW);
      }
      put(6, 12, SOCKET);
      put(7, 12, SOCKET);
      for (let cx = 4; cx <= 9; cx++) put(cx, 13, cx % 2 ? sk.hi : SOCKET);
      for (let cx = 4; cx <= 9; cx++) put(cx, 14, cx % 2 ? sk.lt : sk.dd);
      put(2, 12, sk.dd);
      put(11, 12, sk.dd);
      // a crack across the crown
      put(8, 5, sk.dd);
      put(9, 6, sk.dd);
      put(9, 7, sk.dk);
    } else {
      put(2, 10, SOCKET);
      put(3, 10, SOCKET);
      put(2, 11, SOCKET);
      put(3, 11, SOCKET);
      if (!closed) put(2, 11, SOCKET_GLOW);
      put(0, 12, SOCKET);
      for (let cx = 0; cx <= 4; cx++) put(cx, 13, cx % 2 ? SOCKET : sk.hi);
      for (let cx = 1; cx <= 5; cx++) put(cx, 14, cx % 2 ? sk.dd : sk.lt);
      put(5, 12, sk.dd);
      put(7, 5, sk.dd);
      put(8, 6, sk.dd);
    }
    return;
  }
  if (dc.race === 'elf') {
    if (dc.a.accessory !== 'glasses') drawElfMarkings(dc, put);
    if (v === 'down') {
      for (let cx = 2; cx <= 11; cx++) put(cx, 7, cx < 6 ? MOON : MOON_SH);
      put(6, 7, '#6ff0e0');
      put(7, 7, '#3fc8c0');
    } else if (v === 'side') {
      for (let cx = 1; cx <= 9; cx++) put(cx, 7, cx < 4 ? MOON : MOON_SH);
      put(2, 7, '#6ff0e0');
    } else {
      for (let cx = 2; cx <= 11; cx++) put(cx, 7, MOON_SH);
    }
  }
}

function drawFacialHair(dc: Dc): void {
  const style = dc.a.facialHair ?? 'none';
  // a skull grows no beard
  if (style === 'none' || dc.r.view === 'up' || dc.race === 'undead') return;
  const { b, p, r } = dc;
  const ox = HX + r.lean;
  const oy = HY + r.ub + r.hd;
  const c = style === 'stubble' ? p.stubble : p.hair.base;
  const cd = style === 'stubble' ? shade(p.stubble, -0.04) : p.hair.dk;
  const put = (cx: number, cy: number, col = c) => b.set(ox + cx, oy + cy, col);
  if (r.view === 'down') {
    if (style === 'beard' || style === 'stubble') {
      for (const cx of [1, 12]) for (const cy of [10, 11]) put(cx, cy, cd);
      for (let cx = 1; cx <= 12; cx++) put(cx, 12, cx > 9 ? cd : c);
      for (let cx = 2; cx <= 11; cx++) if (cx < 6 || cx > 7) put(cx, 13, cx > 9 ? cd : c);
      for (let cx = 3; cx <= 10; cx++) put(cx, 14, cd);
      if (style === 'beard') {
        put(5, 12, p.hair.dk);
        put(8, 12, p.hair.dk);
      }
    } else if (style === 'mustache') {
      for (let cx = 5; cx <= 8; cx++) put(cx, 12, cx === 8 ? cd : c);
    } else if (style === 'goatee') {
      put(5, 13, c);
      put(8, 13, cd);
      for (let cx = 5; cx <= 8; cx++) put(cx, 14, cx > 6 ? cd : c);
    }
  } else {
    if (style === 'beard' || style === 'stubble') {
      for (const cy of [10, 11]) put(7, cy, cd);
      for (let cx = 1; cx <= 8; cx++) put(cx, 12, c);
      for (let cx = 1; cx <= 8; cx++) if (cx !== 2) put(cx, 13, cx > 5 ? cd : c);
      for (let cx = 2; cx <= 8; cx++) put(cx, 14, cd);
    } else if (style === 'mustache') {
      put(1, 12, c);
      put(2, 12, c);
      put(3, 12, cd);
    } else if (style === 'goatee') {
      put(1, 13, c);
      put(2, 14, c);
      put(3, 14, cd);
    }
  }
}

/**
 * Orc tusks, over the beard and the lip: big lower tusks curving up and out of the underbite, past the corners
 * of the mouth, ivory with a shaded base. Every orc has them.
 */
function drawTusks(dc: Dc): void {
  const { b, r } = dc;
  if (dc.race !== 'orc' || r.view === 'up') return;
  const ox = HX + r.lean;
  const oy = HY + r.ub + r.hd;
  const put = (cx: number, cy: number, col: string) => b.set(ox + cx, oy + cy, col);
  if (r.view === 'down') {
    for (const [cx, out] of [[4, -1], [9, 1]] as const) {
      put(cx, 13, TUSK_SH);
      put(cx, 12, TUSK);
      put(cx + out, 11, TUSK);
      put(cx + out, 12, TUSK_SH);
    }
  } else {
    put(3, 13, TUSK_SH);
    put(3, 12, TUSK);
    put(2, 11, TUSK);
    put(2, 12, TUSK_SH);
  }
}

/**
 * Ears, drawn over the hair (they poke through big hairstyles):
 * - orc: short pointed ears, out and up;
 * - human: small round ears at the sides of the head;
 * - elf: long swept-back blades reaching well past the hair (up to column -3 / 16, still inside the
 *   avatar crop), with a pale rim on top and the shadow underneath.
 */
function drawEars(dc: Dc): void {
  // a skull has no ears
  if (dc.race === 'undead') return;
  const { b, p, r } = dc;
  const ox = HX + r.lean;
  const oy = HY + r.ub + r.hd;
  const sk = p.skin;
  const put = (cx: number, cy: number, col: string) => b.set(ox + cx, oy + cy, col);
  if (dc.race === 'human') {
    if (r.view === 'side') {
      // Profile (facing left): a round ear around the template's inner-ear pixels.
      put(9, 9, sk.base);
      put(10, 10, sk.base);
      put(10, 11, sk.dk);
      put(9, 12, sk.dk);
      return;
    }
    const inner = r.view === 'down';
    put(0, 10, sk.base);
    put(0, 11, inner ? sk.dk : sk.base);
    put(-1, 10, sk.lt);
    put(-1, 11, sk.dk);
    put(13, 10, sk.dk);
    put(13, 11, inner ? sk.dd : sk.dk);
    put(14, 10, sk.base);
    put(14, 11, sk.dd);
    return;
  }
  if (dc.race === 'elf') {
    if (r.view === 'side') {
      // Profile (facing left): the blade sweeps back and up behind the head.
      put(9, 10, sk.dk);
      put(9, 11, sk.dd);
      put(10, 10, sk.base);
      put(10, 11, sk.dk);
      put(11, 9, sk.base);
      put(11, 10, sk.dk);
      put(12, 8, sk.lt);
      put(12, 9, sk.base);
      put(13, 7, sk.lt);
      put(13, 8, sk.dk);
      put(14, 6, sk.lt);
      put(14, 7, sk.dk);
      put(15, 5, sk.hi);
      return;
    }
    const inner = r.view === 'down';
    // Screen left (lit) and right (shadow), mirrored: a 2 px blade tapering to a point at row 6.
    put(0, 10, sk.base);
    put(0, 11, sk.dk);
    put(-1, 9, sk.lt);
    put(-1, 10, inner ? sk.dk : sk.base);
    put(-1, 11, sk.dd);
    put(-2, 8, sk.lt);
    put(-2, 9, inner ? sk.dk : sk.base);
    put(-3, 7, sk.lt);
    put(-3, 8, sk.base);
    put(-3, 6, sk.hi);
    put(13, 10, sk.dk);
    put(13, 11, sk.dd);
    put(14, 9, sk.base);
    put(14, 10, inner ? sk.dd : sk.dk);
    put(14, 11, sk.dd);
    put(15, 8, sk.base);
    put(15, 9, inner ? sk.dd : sk.dk);
    put(16, 7, sk.base);
    put(16, 8, sk.dk);
    put(16, 6, sk.lt);
    return;
  }
  if (r.view === 'side') {
    // Profile (facing left): the ear points back and up.
    put(9, 10, sk.dk);
    put(10, 10, sk.base);
    put(9, 11, sk.dd);
    put(10, 9, sk.base);
    put(11, 9, sk.lt);
    put(11, 8, sk.lt);
    put(12, 8, sk.base);
    return;
  }
  const inner = r.view === 'down';
  // Screen left (light) and right (shadow), mirrored.
  put(0, 10, sk.base);
  put(0, 11, sk.dk);
  put(-1, 9, sk.lt);
  put(-1, 10, inner ? sk.dk : sk.base);
  put(-2, 8, sk.lt);
  put(-2, 9, sk.base);
  put(13, 10, sk.dk);
  put(13, 11, sk.dd);
  put(14, 9, sk.base);
  put(14, 10, inner ? sk.dd : sk.dk);
  put(15, 8, sk.base);
  put(15, 9, sk.dk);
}

function drawHair(dc: Dc, layer: 'front' | 'back'): void {
  const style = dc.a.hairStyle;
  const set = HAIR[style]?.[dc.r.view];
  const tpl = set?.[layer];
  if (!tpl) return;
  // Caps/beanies hide the top of the hair.
  const pal = hairPalette(dc.p, style === 'buzz');
  const pal2: Palette = { ...pal, a: dc.a.accessory === 'bow' ? dc.p.item.base : shade(dc.a.top, 0.05) };
  stampTpl(dc, tpl, pal2, dc.r.ub + dc.r.hd, TEXTURED.has(style));
  if (layer === 'front') drawHairDeco(dc);
}

/**
 * Hair ornaments by race: orcs thread bone rings onto their braids and tail and tie their topknot with one, and
 * paint a red stripe up a mohawk; night elves pin a leaf and a moon-silver bead into their hair.
 */
function drawHairDeco(dc: Dc): void {
  const { b, r, a } = dc;
  const ox = HX + r.lean;
  const oy = HY + r.ub + r.hd;
  const put = (cx: number, cy: number, col: string) => b.set(ox + cx, oy + cy, col);
  const v = r.view;
  if (dc.race === 'orc') {
    if (a.hairStyle === 'pigtails' || a.hairStyle === 'ponytail') {
      const cols = v === 'side' ? [10] : a.hairStyle === 'pigtails' ? [0, 13] : [6];
      const cy = a.hairStyle === 'ponytail' && v !== 'up' ? 3 : 14;
      for (const cx of cols) {
        put(cx, cy, TUSK);
        put(cx, cy + 1, TUSK_SH);
      }
    } else if (a.hairStyle === 'short') {
      put(6, 2, TUSK);
      put(7, 2, TUSK_SH);
    } else if (a.hairStyle === 'mohawk' && v !== 'side') {
      for (let cy = 1; cy <= 5; cy++) put(v === 'down' ? 6 : 7, cy, '#a8322a');
    }
    return;
  }
  if (dc.race === 'elf' && v !== 'up') {
    const leaf = v === 'down' ? 11 : 8;
    put(leaf, 5, '#5fc89a');
    put(leaf + 1, 4, '#3fa08a');
    put(leaf, 4, '#8ff0c0');
    put(leaf - 1, 6, MOON);
  }
}

/**
 * Ornaments by contract key, per race:
 * - glasses: war paint across the eyes (orc), round spectacles (human), night-elf face markings (elf);
 * - sunglasses: leather eye patch (orc, human), cloth blindfold (elf);
 * - headphones: pauldron (drawn separately, see drawPauldron);
 * - cap: tied bandana;
 * - beanie: horned iron helm (orc), steel nasal helm with a blue plume (human), domed helm with a silver
 *   crescent crest (elf);
 * - earrings: metal hoop with a bone tooth (orc), plain gold hoop (human), silver cuff and drop on the
 *   long ear (elf);
 * - bow: feather with a bone bead (orc), feather with a gold bead (human), leaf with a moon-silver bead (elf).
 */
function drawAccessory(dc: Dc): void {
  const { b, p, r, a } = dc;
  const ox = HX + r.lean;
  const oy = HY + r.ub + r.hd;
  const put = (cx: number, cy: number, col: string) => b.set(ox + cx, oy + cy, col);
  const it = p.item;
  const v = r.view;
  switch (a.accessory) {
    case 'glasses': {
      if (dc.race === 'human') {
        drawSpectacles(dc, put);
        break;
      }
      if (dc.race === 'elf') {
        drawElfMarkings(dc, put);
        break;
      }
      // War-paint band across the eyes (the eyes stay on top).
      const paint = it.base;
      const paintDk = it.dk;
      if (v === 'down') {
        for (let cx = 2; cx <= 11; cx++) {
          if (cx === 4 || cx === 9) continue;
          put(cx, 10, cx > 9 ? paintDk : paint);
          if (cx !== 6 && cx !== 7) put(cx, 11, cx > 9 ? paintDk : paint);
        }
      } else if (v === 'side') {
        for (let cx = 1; cx <= 6; cx++) {
          if (cx === 3) continue;
          put(cx, 10, paint);
          if (cx > 1) put(cx, 11, cx > 4 ? paintDk : paint);
        }
      }
      break;
    }
    case 'sunglasses': {
      if (dc.race === 'elf') {
        // Cloth blindfold over both eyes, knotted at the back.
        const cloth = ramp(mix(it.base, '#2a2238', 0.55), 0.08);
        if (v === 'down') {
          for (let cx = 1; cx <= 12; cx++) {
            put(cx, 10, cx > 10 ? cloth.dk : cloth.base);
            put(cx, 11, cx > 10 ? cloth.dd : cloth.dk);
          }
          put(3, 10, cloth.lt);
          put(8, 10, cloth.lt);
        } else if (v === 'side') {
          for (let cx = 0; cx <= 9; cx++) {
            put(cx, 10, cloth.base);
            put(cx, 11, cloth.dk);
          }
          put(2, 10, cloth.lt);
          put(10, 11, cloth.dk);
          put(10, 12, cloth.dd);
        } else {
          for (let cx = 1; cx <= 12; cx++) put(cx, 10, cloth.dk);
          put(6, 11, cloth.base);
          put(7, 11, cloth.dk);
          put(6, 12, cloth.dk);
          put(8, 12, cloth.dd);
        }
        break;
      }
      // Leather eye patch with a diagonal strap.
      const patch = '#1d1712';
      const strap = '#3a2a1e';
      if (v === 'down') {
        for (let cx = 3; cx <= 5; cx++) {
          put(cx, 10, patch);
          put(cx, 11, patch);
        }
        put(4, 12, patch);
        put(4, 10, '#4a3a2e');
        put(2, 9, strap);
        put(6, 9, strap);
        put(7, 8, strap);
        put(8, 8, strap);
        put(9, 7, strap);
        put(10, 7, strap);
        put(11, 6, strap);
      } else if (v === 'side') {
        for (let cx = 2; cx <= 4; cx++) {
          put(cx, 10, patch);
          put(cx, 11, patch);
        }
        put(3, 12, patch);
        for (let cx = 5; cx <= 9; cx++) put(cx, 10 - Math.floor((cx - 5) / 2), strap);
      } else {
        for (let cx = 1; cx <= 12; cx++) put(cx, 8 + (cx > 6 ? 1 : 0), strap);
      }
      break;
    }
    case 'headphones':
      // Pauldron: drawn at the end (drawPauldron), over the arms.
      break;
    case 'cap': {
      // Bandana tight on the head, with the knot and the ends hanging at the back.
      const pal = { o: it.base, h: it.lt, H: it.hi, d: it.dk, D: it.dd };
      if (v === 'down') {
        b.stamp(['...oooooooo...', '..ohhHhhoood..', '.ohhhoooooodd.', '.DDDDDDDDDDDD.'], ox, oy + 3, pal);
        put(4, 4, it.dk);
        put(8, 5, it.dk);
        put(13, 6, it.base);
        put(13, 7, it.dk);
        put(14, 8, it.dk);
      } else if (v === 'up') {
        b.stamp(['...oooooooo...', '..ohhhhooood..', '.ohhoooooooddd', '.DDDDDDDDDDDD.', '.....oddo.....', '.....od.d.....', '......d..d....'], ox, oy + 3, pal);
      } else {
        b.stamp(['...oooooooo...', '..ohhHhhoood..', '.ohhhooooooodo', '.DDDDDDDDDDDod', '...........o.d', '............d.'], ox, oy + 3, pal);
      }
      break;
    }
    case 'beanie': {
      // Iron helm with a riveted band and two bone horns.
      const pal = { o: it.base, h: it.lt, H: it.hi, d: it.dk, r: it.dd };
      const rows =
        v === 'side'
          ? ['....oooooo....', '..oohhhooooo..', '.ohhHhhoooood.', '.ohhhhooooood.', '.rrrrrrrrrrrr.']
          : ['....oooooo....', '..oohhhooooo..', '.ohhHhhoooood.', '.ohhhhooooood.', 'rrrrrrrrrrrrrr'];
      b.stamp(rows, ox, oy + 2, pal);
      for (let cx = 1; cx <= 12; cx += 3) put(cx, 6, it.lt);
      if (dc.race === 'human') {
        drawHumanHelmCrest(dc, put);
        break;
      }
      if (dc.race === 'elf') {
        drawElfHelmCrest(dc, put);
        break;
      }
      // 2 px thick horns curving out and up.
      const horn: readonly (readonly [number, number, boolean])[] = [
        [0, 5, false], [1, 5, true], [-1, 4, false], [0, 4, true], [-1, 3, false], [-2, 2, false], [-1, 2, true], [-2, 1, false],
      ];
      if (v === 'side') {
        for (const [hx, hy, sh] of horn) put(7 - hx, hy - 2, sh ? TUSK_SH : TUSK);
      } else {
        for (const [hx, hy, sh] of horn) {
          put(hx, hy, sh ? TUSK_SH : TUSK);
          put(13 - hx, hy, TUSK_SH);
        }
      }
      break;
    }
    case 'earrings': {
      if (dc.race === 'human') {
        // Plain metal hoop hanging under the round ear.
        if (v === 'down') {
          put(-1, 12, it.lt);
          put(14, 12, it.dk);
        } else if (v === 'side') {
          put(10, 12, it.lt);
          put(10, 13, it.base);
        } else {
          put(-1, 12, it.dk);
          put(14, 12, it.dk);
        }
        break;
      }
      if (dc.race === 'elf') {
        // Silver cuff on the long ear and a small drop in the earring colour.
        if (v === 'side') {
          put(12, 9, MOON);
          put(11, 11, it.lt);
          put(11, 12, it.base);
        } else {
          put(-2, 9, MOON);
          put(15, 9, MOON_SH);
          if (v === 'down') {
            put(-1, 12, it.lt);
            put(-1, 13, it.base);
            put(14, 12, it.base);
            put(14, 13, it.dk);
          }
        }
        break;
      }
      // Metal hoop with a small bone tooth hanging from it, just under the pointed ear.
      if (v === 'down') {
        put(-1, 11, it.base);
        put(-1, 12, TUSK);
        put(14, 11, it.dk);
        put(14, 12, TUSK_SH);
      } else if (v === 'side') {
        put(10, 12, it.base);
        put(10, 13, TUSK);
      } else {
        put(-1, 11, it.dk);
        put(14, 11, it.dk);
      }
      break;
    }
    case 'bow': {
      // Feather stuck in the hair, held by a bead (bone / gold / moon silver); the elf wears a leaf.
      const f = dc.race === 'elf' ? ramp(mix(it.base, '#5fb87a', 0.55), 0.1) : it;
      const feather = [
        [3, 0, f.lt],
        [2, 1, f.lt],
        [3, 1, f.base],
        [2, 2, f.base],
        [1, 3, f.dk],
        [0, 4, p.bone],
      ] as const;
      const [fx, fy, flip] = v === 'down' ? [9, 0, false] : v === 'up' ? [1, 0, true] : [7, -1, false];
      for (const [dx, dy, col] of feather) put(flip ? fx + 3 - dx : fx + dx, fy + dy, col);
      break;
    }
    case 'none':
      break;
  }
}

type Put = (cx: number, cy: number, col: string) => void;

/** Human 'glasses': round iron spectacles around each eye, with a bridge (front) or the arm (profile). */
function drawSpectacles(dc: Dc, put: Put): void {
  const frame = mix(dc.p.item.dk, '#3a3440', 0.4);
  const glint = '#e8f4ff';
  const v = dc.r.view;
  if (v === 'down') {
    for (const cx of [4, 9]) {
      put(cx - 1, 10, frame);
      put(cx + 1, 10, frame);
      put(cx - 1, 11, frame);
      put(cx + 1, 11, frame);
      put(cx, 9, frame);
      put(cx, 12, frame);
    }
    put(6, 10, frame);
    put(7, 10, frame);
    put(3, 10, glint);
  } else if (v === 'side') {
    put(2, 10, frame);
    put(4, 10, frame);
    put(2, 11, frame);
    put(4, 11, frame);
    put(3, 9, frame);
    put(3, 12, frame);
    for (let cx = 5; cx <= 8; cx++) put(cx, 10, frame);
  } else {
    for (let cx = 1; cx <= 12; cx++) if (cx < 4 || cx > 9) put(cx, 10, frame);
  }
}

/** Elf 'glasses': night-elf markings, a thin band across the eyes and a streak down each cheek. */
function drawElfMarkings(dc: Dc, put: Put): void {
  const ink = mix(dc.p.item.base, '#3fe0d0', 0.35);
  const inkDk = shade(ink, -0.12);
  const v = dc.r.view;
  if (v === 'down') {
    for (let cx = 2; cx <= 11; cx++) if (cx !== 4 && cx !== 9 && cx !== 6 && cx !== 7) put(cx, 10, cx > 9 ? inkDk : ink);
    put(3, 12, ink);
    put(3, 13, ink);
    put(10, 12, inkDk);
    put(10, 13, inkDk);
  } else if (v === 'side') {
    for (let cx = 1; cx <= 6; cx++) if (cx !== 3) put(cx, 10, ink);
    put(4, 12, ink);
    put(4, 13, ink);
  }
}

/** Human 'beanie': nose guard on the steel helm and a short Alliance-blue plume on top (no horns). */
function drawHumanHelmCrest(dc: Dc, put: Put): void {
  const it = dc.p.item;
  const plume = '#3f68c8';
  const plumeLt = '#7096ea';
  const plumeDk = '#2c4a92';
  const v = dc.r.view;
  if (v === 'down') {
    put(6, 7, it.lt);
    put(7, 7, it.dk);
    put(6, 8, it.lt);
    put(7, 8, it.dk);
    put(6, 9, it.dk);
    put(7, 9, it.dd);
    put(6, 1, plumeLt);
    put(7, 1, plume);
    put(6, 0, plume);
    put(7, 0, plumeDk);
    put(6, -1, plumeLt);
  } else if (v === 'side') {
    put(1, 7, it.base);
    put(1, 8, it.dk);
    put(1, 9, it.dd);
    put(7, 1, plume);
    put(8, 1, plumeDk);
    put(8, 0, plume);
    put(9, 0, plumeDk);
    put(9, -1, plumeLt);
    put(10, 0, plumeDk);
  } else {
    put(6, 1, plume);
    put(7, 1, plumeDk);
    put(6, 0, plumeLt);
    put(7, 0, plume);
    put(7, -1, plumeDk);
  }
}

/** Elf 'beanie': a moon-silver crescent crest rising from the brow of the domed helm (no horns). */
function drawElfHelmCrest(dc: Dc, put: Put): void {
  const v = dc.r.view;
  if (v === 'side') {
    // Profile: the crescent seen from the side, a "(" rising from the top of the helm.
    put(6, 2, MOON_SH);
    put(5, 1, MOON);
    put(5, 0, MOON);
    put(6, -1, MOON);
    return;
  }
  // Front/back: a crescent whose horns point up, centred on the forehead.
  put(5, 0, MOON);
  put(8, 0, MOON_SH);
  put(5, 1, MOON);
  put(6, 2, MOON);
  put(7, 2, MOON_SH);
  put(8, 1, MOON_SH);
  put(4, -1, MOON);
  put(9, -1, MOON_SH);
}

/** Metal pauldron with a bone spike ('headphones' accessory), over the arms. */
function drawPauldron(dc: Dc): void {
  if (dc.a.accessory !== 'headphones') return;
  const { b, p, r } = dc;
  const it = p.item;
  // Orc: bone spike on top. Human: rounded plate with a gold rim. Elf: a silver crescent blade curling up.
  const top = dc.race === 'orc' ? ['.T..', 'ohho', 'ohood', '.dddd'] : dc.race === 'human' ? ['.TT.', 'ohhoT', 'ohood', '.dddd'] : ['T...', '.Tho', 'ohood', '.dddd'];
  const rows = top.map((row) => row.padEnd(5, '.'));
  const pal: Palette = { o: it.base, h: it.lt, d: it.dk, T: dc.race === 'orc' ? TUSK : p.bone };
  const y = 17 + r.ub;
  if (r.view === 'side') b.stamp(rows, 9 + r.lean, y, pal, true);
  else if (r.view === 'down') b.stamp(rows, 4, y, pal);
  else b.stamp(rows, 15, y, pal, true);
}

// ----- body

/** 2x2 brush along the arm path: sleeve up to `sleeve` points, then skin; hand at the end. */
function drawArm(dc: Dc, a: Arm, sleeveCol: Ramp, sleeve: number, dim = 0, backShadow = false): void {
  const { b, p, r } = dc;
  const pts: [number, number][] = [];
  for (let i = 0; i < a.pts.length - 1; i++) {
    const [x0, y0] = a.pts[i];
    const [x1, y1] = a.pts[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      pts.push([Math.round(x0 + ((x1 - x0) * s) / Math.max(1, steps)), Math.round(y0 + ((y1 - y0) * s) / Math.max(1, steps))]);
    }
  }
  if (a.pts.length === 1) pts.push([a.pts[0][0], a.pts[0][1]]);
  const dy = r.ub;
  const lean = r.lean;
  const sk = dim ? ramp(shade(p.skin.base, -dim), 0.07) : p.skin;
  const sl = dim ? ramp(shade(sleeveCol.base, -dim), 0.08) : sleeveCol;
  if (backShadow) {
    // Shadow line behind the arm (over the torso) to separate it from the body in profile.
    const sep = shade(sleeveCol.dd, -0.06);
    for (const [x, y] of pts) {
      if (b.alpha(x + 2 + lean, y + dy) > 0) b.set(x + 2 + lean, y + dy, sep);
    }
  }
  pts.forEach(([x, y], i) => {
    const last = i === pts.length - 1;
    const isSleeve = i < sleeve && !last;
    const c = isSleeve ? sl : sk;
    b.set(x + lean, y + dy, c.base);
    b.set(x + 1 + lean, y + dy, c.dk);
    b.set(x + lean, y + 1 + dy, isSleeve && i === sleeve - 1 ? c.dk : c.base);
    b.set(x + 1 + lean, y + 1 + dy, c.dk);
  });
  const [hx, hy] = pts[pts.length - 1];
  b.set(hx + lean, hy + dy, sk.lt);
  b.set(hx + 1 + lean, hy + dy, sk.base);
  b.set(hx + lean, hy + 1 + dy, sk.base);
  b.set(hx + 1 + lean, hy + 1 + dy, sk.dk);
}

function sleeveLength(a: Appearance): number {
  switch (a.topStyle) {
    case 'shirt_tie':
    case 'polo':
      return 0; // vest and harness: bare arms
    case 'tshirt':
      return 2;
    case 'blouse':
      return 3;
    default:
      return 99;
  }
}

function drawLegs(dc: Dc): void {
  const { b, p, r, a } = dc;
  const pants = p.bottom;
  const sh = p.shoes;
  const style = a.bottomStyle ?? 'pants';
  const skinLeg = style !== 'pants';
  if (r.view === 'side') {
    drawLegsSide(dc, pants, sh, skinLeg);
    return;
  }
  if (r.seated) {
    if (r.view === 'down') {
      // Lap (thighs towards the camera) and shoe tips.
      const y0 = 24 + r.ub;
      const lapTop = style === 'skirt' ? p.bottom : pants;
      b.rect(8, y0, 8, 1, lapTop.lt);
      b.rect(8, y0 + 1, 8, 1, lapTop.base);
      b.set(15, y0, lapTop.base);
      b.set(15, y0 + 1, lapTop.dk);
      b.set(11, y0 + 1, lapTop.dk);
      if (skinLeg) {
        b.rect(9, y0 + 2, 2, 1, p.skin.base);
        b.rect(13, y0 + 2, 2, 1, p.skin.dk);
      } else {
        b.rect(8, y0 + 2, 3, 1, pants.dk);
        b.rect(13, y0 + 2, 3, 1, pants.dk);
      }
      b.rect(8, 30, 3, 1, sh.base);
      b.set(8, 30, sh.lt);
      if (r.toeTap) {
        // Tip of the right foot in the air (the heel stays on the floor).
        b.rect(13, 29, 3, 1, sh.base);
        b.set(13, 29, sh.lt);
        b.set(14, 30, sh.dk);
      } else {
        b.rect(13, 30, 3, 1, sh.base);
        b.set(13, 30, sh.lt);
      }
    } else {
      const y0 = 24 + r.ub;
      b.rect(8, y0, 8, 2, pants.base);
      b.rect(8, y0 + 1, 8, 1, pants.dk);
      b.set(11, y0, pants.dk);
      b.set(12, y0, pants.dk);
    }
    return;
  }
  // Standing (front/back). Hips/waist.
  const top = 24 + r.ub;
  b.rect(8, top, 8, 2, pants.base);
  b.set(15, top, pants.dk);
  b.set(15, top + 1, pants.dk);
  if (style === 'skirt') {
    b.rect(7, top + 2, 10, 1, pants.base);
    b.set(16, top + 2, pants.dk);
    b.rect(8, top + 2, 1, 1, pants.lt);
    b.set(11, top + 1, pants.dk);
    b.set(12, top + 2, pants.dk);
  }
  const wrap = legWrap(pants);
  const leg = (x: number, dyFoot: number, shadeRight: boolean) => {
    const y1 = 28 + dyFoot;
    for (let y = top + 2; y <= y1; y++) {
      const isSkin = skinLeg && y >= top + 3;
      // Cloth wraps around the shin (trousers) or the ankle (bare legs).
      const wrapped = isSkin ? y === y1 : y === y1 || y === y1 - 2;
      const c = wrapped ? wrap : isSkin ? p.skin : pants;
      b.set(x, y, c.base);
      b.set(x + 1, y, wrapped ? c.lt : c.base);
      b.set(x + 2, y, shadeRight ? c.dk : c.base);
    }
    // Shoe: two rows, light toe, dark sole.
    b.rect(x, y1 + 1, 3, 1, sh.base);
    b.set(x, y1 + 1, sh.lt);
    b.rect(x, y1 + 2, 3, 1, sh.dk);
  };
  const a1 = r.view === 'up' ? r.legB.dy : r.legA.dy;
  const b1 = r.view === 'up' ? r.legA.dy : r.legB.dy;
  leg(8, a1, true);
  leg(13, b1, true);
  if (!skinLeg || style === 'shorts') {
    b.set(10, top + 2, pants.dk);
    b.set(13, top + 2, pants.base);
  }
  if (style === 'shorts') {
    // Loincloth: a flap of cloth hanging between the legs, ragged tip.
    b.rect(10, top + 2, 4, 2, pants.base);
    b.set(10, top + 2, pants.lt);
    b.set(13, top + 2, pants.dk);
    b.set(13, top + 3, pants.dk);
    b.set(11, top + 4, pants.base);
    b.set(12, top + 4, pants.dk);
  } else if (style === 'skirt') {
    // Strip kilt: dark pleats.
    for (const x of [9, 11, 13]) b.vline(x, top + 1, top + 2, pants.dk);
  }
  // Leather belt with a bone buckle.
  b.hline(8, 15, top, LEATHER);
  b.set(15, top, LEATHER_DK);
  if (r.view === 'down') {
    b.set(11, top, p.bone);
    b.set(12, top, p.boneSh);
  }
}

/** Cloth wraps on the legs: light straw pulled towards the trouser colour. */
function legWrap(pants: Ramp): Ramp {
  return ramp(mix('#d6c39a', pants.base, 0.25), 0.07);
}

function drawLegsSide(dc: Dc, pants: Ramp, sh: Ramp, skinLeg: boolean): void {
  const { b, p, r, a } = dc;
  const style = a.bottomStyle ?? 'pants';
  if (r.seated) {
    const y0 = 24 + r.ub; // hip line
    // Thigh horizontal going forward (left) and shin going down.
    b.rect(7, y0 - 1, 7, 2, pants.base);
    b.rect(7, y0 - 1, 6, 1, pants.lt);
    b.set(13, y0, pants.dk);
    const shin = skinLeg ? p.skin : pants;
    b.rect(7, y0 + 1, 2, 30 - (y0 + 1), shin.base);
    b.set(8, y0 + 1, shin.dk);
    if (r.toeTap) {
      // Tip of the foot raised, heel resting.
      b.rect(5, 29, 2, 1, sh.base);
      b.set(5, 29, sh.lt);
      b.rect(7, 30, 2, 1, sh.base);
    } else {
      b.rect(5, 30, 4, 1, sh.base);
      b.set(5, 30, sh.lt);
    }
    return;
  }
  const top = 24 + r.ub;
  b.rect(9, top, 5, 2, pants.base);
  b.set(9, top, pants.lt);
  b.set(13, top, pants.dk);
  b.set(13, top + 1, pants.dk);
  if (style === 'skirt') {
    b.rect(8, top + 1, 7, 2, pants.base);
    b.set(8, top + 1, pants.lt);
    b.set(14, top + 2, pants.dk);
  }
  const wr = legWrap(pants);
  const leg = (dx: number, lift: number, dim: boolean) => {
    // 3px leg from the hip (x≈11) to the foot shifted by `dx`.
    const pc = dim ? ramp(pants.dk, 0.07) : pants;
    const sc = dim ? ramp(p.skin.dk, 0.07) : p.skin;
    const shc = dim ? ramp(sh.dk, 0.08) : sh;
    const wc = dim ? ramp(wr.dk, 0.07) : wr;
    const y0 = top + 2;
    const y1 = 28 - lift;
    for (let y = y0; y <= y1; y++) {
      const tt = (y - y0) / Math.max(1, y1 - y0);
      const x = Math.round(10 + dx * tt);
      const isSkin = skinLeg && y >= top + 3;
      const wrapped = isSkin ? y === y1 : y === y1 || y === y1 - 2;
      const c = wrapped ? wc : isSkin ? sc : pc;
      b.set(x, y, c.lt);
      b.set(x + 1, y, c.base);
      b.set(x + 2, y, c.dk);
    }
    const fx = Math.round(10 + dx);
    b.rect(fx - 1, y1 + 1, 4, 1, shc.base);
    b.set(fx - 1, y1 + 1, shc.lt);
    b.rect(fx - 1, y1 + 2, 4, 1, shc.dk);
  };
  leg(r.legA.dx, -r.legA.dy, true);
  leg(r.legB.dx, -r.legB.dy, false);
  if (style === 'shorts') {
    // Loincloth flap in front.
    b.rect(8, top + 1, 2, 3, pants.base);
    b.set(8, top + 1, pants.lt);
    b.set(9, top + 3, pants.dk);
  }
  b.rect(9, top, 5, 1, LEATHER);
  b.set(9, top, LEATHER_LT);
}

/** Leather of the belts, straps and boots. */
const LEATHER = '#5b3a22';
const LEATHER_DK = '#3f2716';
const LEATHER_LT = '#7a5332';

/** Animal hide (cloak, kilt hem): blends the accent colour with a straw brown. */
function furRamp(acc: string): Ramp {
  return ramp(mix(acc, '#a88a5e', 0.55), 0.08);
}

/**
 * Worker clothes by style (same contract keys):
 * tshirt = tunic with a rope belt; hoodie = fur cloak; shirt_tie = leather vest over a
 * bare chest; sweater = padded doublet with a bandolier; jacket = leather coat with laces;
 * blouse = blacksmith's apron; polo = war harness (bare chest, strap and girdle).
 */
function drawTorso(dc: Dc): void {
  drawTorsoBase(dc);
  drawRaceBody(dc);
}

function drawTorsoBase(dc: Dc): void {
  const { b, p, r, a } = dc;
  const y = 18 + r.ub;
  const t = p.top;
  const ac = p.acc;
  const sk = p.skin;
  const lx = r.lean;
  const bare = a.topStyle === 'shirt_tie' || a.topStyle === 'polo';
  if (r.view === 'side') {
    // Torso in profile (x 8..14), front to the left.
    const body = a.topStyle === 'polo' ? sk : t;
    b.rect(8 + lx, y, 7, 6, body.base);
    for (let yy = y; yy < y + 6; yy++) {
      b.set(8 + lx, yy, body.lt);
      b.set(14 + lx, yy, body.dk);
    }
    b.rect(8 + lx, y + 5, 7, 1, body.dk);
    switch (a.topStyle) {
      case 'tshirt':
        b.set(8 + lx, y, sk.base);
        b.set(9 + lx, y, sk.dk);
        b.rect(8 + lx, y + 4, 7, 1, ac.dk);
        b.set(8 + lx, y + 4, ac.lt);
        b.set(8 + lx, y + 5, ac.base);
        break;
      case 'hoodie': {
        const fur = furRamp(a.topAccent);
        b.rect(9 + lx, y - 1, 6, 2, fur.base);
        b.set(10 + lx, y - 1, fur.lt);
        b.set(12 + lx, y - 1, fur.hi);
        for (let x = 9; x <= 14; x += 2) b.set(x + lx, y + 2, fur.dk);
        b.set(9 + lx, y + 1, p.bone);
        break;
      }
      case 'shirt_tie':
        // Open vest: the chest shows at the front.
        b.rect(8 + lx, y, 2, 5, sk.base);
        b.set(8 + lx, y, sk.lt);
        b.set(9 + lx, y + 2, sk.dk);
        b.vline(10 + lx, y, y + 4, t.dk);
        b.rect(8 + lx, y + 5, 7, 1, LEATHER);
        break;
      case 'sweater':
        b.rect(8 + lx, y + 2, 7, 1, t.dk);
        b.set(9 + lx, y, ac.base);
        b.set(10 + lx, y + 1, ac.base);
        b.set(11 + lx, y + 2, ac.dk);
        b.set(12 + lx, y + 3, ac.base);
        b.set(13 + lx, y + 4, ac.base);
        b.set(11 + lx, y + 2, p.bone);
        break;
      case 'jacket':
        b.set(9 + lx, y + 1, ac.base);
        b.set(9 + lx, y + 3, ac.base);
        b.set(8 + lx, y + 2, ac.lt);
        b.set(10 + lx, y, t.hi);
        b.rect(8 + lx, y + 5, 7, 1, furRamp(a.topAccent).base);
        break;
      case 'blouse':
        // Leather apron at the front, down to the thighs.
        b.rect(8 + lx, y + 1, 2, 7, ac.base);
        b.vline(8 + lx, y + 1, y + 7, ac.lt);
        b.set(9 + lx, y + 7, ac.dk);
        b.set(10 + lx, y, ac.dk);
        b.set(11 + lx, y + 3, ac.dk);
        break;
      case 'polo':
        b.set(10 + lx, y, t.base);
        b.set(10 + lx, y + 1, t.base);
        b.set(9 + lx, y + 2, t.dk);
        b.rect(8 + lx, y + 4, 7, 2, t.base);
        b.rect(8 + lx, y + 4, 7, 1, t.lt);
        b.set(8 + lx, y + 5, p.bone);
        break;
    }
    drawLanyard(dc);
    return;
  }
  // Front / back: x 8..15.
  const front = r.view === 'down';
  const body = a.topStyle === 'polo' || (front && a.topStyle === 'shirt_tie') ? sk : t;
  b.rect(8, y, 8, 6, body.base);
  for (let yy = y; yy < y + 6; yy++) {
    b.set(8, yy, body.lt);
    b.set(15, yy, body.dk);
  }
  b.rect(8, y + 5, 8, 1, body.dk);
  b.set(8, y + 5, body.base);
  if (bare && (front || a.topStyle === 'polo')) {
    // Bare chest/back: line of the pecs (or the spine) and belly.
    if (front) {
      b.hline(9, 10, y + 2, sk.dk);
      b.hline(13, 14, y + 2, sk.dk);
      b.set(11, y + 1, sk.dk);
      b.set(12, y + 3, sk.dk);
      b.set(11, y + 4, sk.dk);
    } else b.vline(11, y + 1, y + 4, sk.dk);
  }
  switch (a.topStyle) {
    case 'tshirt':
      // Tunic: V-neck showing skin, rope belt with a hanging knot.
      if (front) {
        b.set(11, y, sk.base);
        b.set(12, y, sk.dk);
        b.set(11, y + 1, sk.dk);
        b.set(10, y, t.dk);
        b.set(13, y, t.dk);
      } else b.rect(10, y, 4, 1, t.dk);
      b.hline(8, 15, y + 4, ac.dk);
      b.hline(9, 14, y + 4, ac.base);
      if (front) {
        b.set(10, y + 4, ac.lt);
        b.set(10, y + 5, ac.base);
        b.set(10, y + 6, ac.dk);
      }
      break;
    case 'hoodie': {
      // Fur cloak over the shoulders: fluffy edge and a bone buckle.
      const fur = furRamp(a.topAccent);
      b.rect(7, y, 10, 2, fur.base);
      b.hline(8, 15, y - 1, fur.base);
      for (let x = 7; x <= 16; x++) {
        if (x % 2 === 0) b.set(x, y + 2, fur.dk);
        if (x % 3 === 0) b.set(x, y, fur.lt);
      }
      b.set(9, y - 1, fur.hi);
      b.set(16, y, fur.dk);
      b.set(16, y + 1, fur.dd);
      if (front) {
        b.set(11, y + 1, p.bone);
        b.set(12, y + 1, p.boneSh);
        b.vline(11, y + 3, y + 5, t.dk);
      }
      break;
    }
    case 'shirt_tie':
      // Open leather vest over the chest, with a lacing cord.
      if (front) {
        b.rect(8, y, 2, 6, t.base);
        b.vline(8, y, y + 5, t.lt);
        b.rect(14, y, 2, 6, t.dk);
        b.vline(15, y, y + 5, t.dd);
        b.set(10, y + 1, ac.base);
        b.set(13, y + 1, ac.base);
        b.set(10, y + 3, ac.base);
        b.set(13, y + 3, ac.base);
      } else {
        b.vline(11, y + 1, y + 4, t.dk);
        b.rect(9, y, 6, 1, t.lt);
      }
      b.hline(8, 15, y + 5, LEATHER);
      if (front) b.set(11, y + 5, p.bone);
      break;
    case 'sweater':
      // Padded doublet (horizontal seams) with a diagonal leather bandolier.
      b.hline(8, 15, y + 2, t.dk);
      b.hline(9, 14, y + 4, t.dk);
      for (let i = 0; i < 6; i++) {
        const x = front ? 9 + i : 14 - i;
        b.set(x, y + i, ac.base);
        b.set(x + 1, y + i, ac.dk);
      }
      if (front) b.set(11, y + 2, p.bone);
      break;
    case 'jacket':
      // Leather coat: opening in the middle with crossed laces and a fur hem.
      if (front) {
        b.vline(11, y, y + 5, t.dd);
        b.vline(12, y, y + 5, t.dd);
        for (let yy = y; yy < y + 5; yy += 2) {
          b.set(11, yy, ac.lt);
          b.set(12, yy + 1, ac.base);
        }
        b.set(10, y, t.hi);
        b.set(13, y, t.lt);
      } else {
        b.vline(11, y + 1, y + 5, t.dk);
        b.rect(9, y, 6, 1, t.lt);
      }
      b.hline(8, 15, y + 5, furRamp(a.topAccent).base);
      b.set(15, y + 5, furRamp(a.topAccent).dk);
      break;
    case 'blouse':
      // Blacksmith's (leather) apron over the tunic; from the back, the crossed straps.
      if (front) {
        b.rect(9, y + 1, 6, 7, ac.base);
        b.vline(9, y + 1, y + 7, ac.lt);
        b.vline(14, y + 1, y + 7, ac.dk);
        b.hline(9, 14, y + 7, ac.dk);
        b.set(9, y, ac.dk);
        b.set(14, y, ac.dk);
        b.rect(11, y + 3, 2, 1, ac.dk);
      } else {
        for (let i = 0; i < 5; i++) {
          b.set(9 + i, y + i, ac.base);
          b.set(14 - i, y + i, ac.dk);
        }
        b.hline(8, 15, y + 4, ac.base);
      }
      break;
    case 'polo':
      // War harness: a strap from shoulder to hip and a wide girdle in the clothes colour.
      for (let i = 0; i < 4; i++) {
        const x = front ? 14 - i : 9 + i;
        b.set(x, y + i, t.base);
        b.set(x - 1, y + i, t.dk);
      }
      b.rect(8, y + 4, 8, 2, t.base);
      b.hline(8, 15, y + 4, t.lt);
      b.set(15, y + 5, t.dk);
      if (front) {
        b.set(11, y + 4, p.bone);
        b.set(12, y + 4, p.bone);
        b.set(11, y + 5, p.boneSh);
        b.set(12, y + 5, p.boneSh);
      }
      break;
  }
  drawLanyard(dc);
}

function drawLanyard(dc: Dc): void {
  const col = dc.a.lanyard;
  if (!col) return;
  const { b, r } = dc;
  const y = 18 + r.ub;
  // Cord with a carved wooden tag (the helpers' badge).
  const card = '#d8bf8c';
  const lx = r.lean;
  if (r.view === 'down') {
    b.set(10, y, col);
    b.set(13, y, col);
    b.set(10, y + 1, col);
    b.set(13, y + 1, col);
    b.set(11, y + 2, col);
    b.set(12, y + 2, col);
    b.rect(10, y + 3, 4, 3, card);
    b.rect(10, y + 3, 4, 1, shade(col, -0.05));
    b.set(11, y + 4, '#6b4a2a');
    b.set(12, y + 4, '#8a6a42');
    b.set(13, y + 5, '#b39a6a');
  } else if (r.view === 'up') {
    b.hline(9, 14, y, col);
    b.set(9, y + 1, shade(col, -0.1));
    b.set(14, y + 1, shade(col, -0.1));
  } else {
    b.set(11 + lx, y, col);
    b.set(10 + lx, y + 1, col);
    b.set(9 + lx, y + 2, col);
    b.rect(8 + lx, y + 3, 2, 3, card);
    b.set(8 + lx, y + 3, shade(col, -0.05));
    b.set(9 + lx, y + 3, shade(col, -0.05));
  }
}

// ----- held items
// Same contract keys, redrawn as camp tools and things:
// coffee = wooden mug (tankard), water = waterskin, papers = scroll, book = leather tome,
// laptop = pickaxe (in both hands), box = bundle of firewood, paddle = hammer, phone = runestone.

const TANKARD: readonly string[] = ['FfF.', 'iiih', 'wWwh', 'wwwh', 'iii.'];
const TANKARD_PAL: Palette = { F: '#f6eedb', f: '#dccfae', i: '#6f747d', w: '#8a5a32', W: '#a8784a', h: '#4e3220' };
const WATERSKIN: readonly string[] = ['.c.', 'lLl', 'lLl', 'lld', '.d.'];
const WATERSKIN_PAL: Palette = { c: '#c9a874', l: '#8a6440', L: '#a8804f', d: '#5e4029' };
const IRON = '#6f747d';
const IRON_LT = '#b9bfc7';
const WOOD = '#8a5a32';
const WOOD_LT = '#a8784a';
const PICK: readonly string[] = ['...........i', '..........Ii', '..........I.', 'hhhhhhhhhhIh', '..........I.', '..........Ii', '...........i'];
const PICK_SIDE: readonly string[] = ['iIi', '.h.', '.h.', '.h.', '.h.', '.h.'];
const HAMMER: readonly string[] = ['IIii', 'IiiD', '.h..', '.h..', '.h..', '.h..'];
const TOOL_PAL: Palette = { i: IRON, I: IRON_LT, D: '#4a4e56', h: WOOD };

function drawItem(dc: Dc, x: number, y: number): void {
  const { b, r } = dc;
  const it = r.held;
  const side = r.view === 'side';
  switch (it) {
    case 'coffee':
      b.stamp(TANKARD, x, y, TANKARD_PAL, side);
      break;
    case 'water':
      b.stamp(WATERSKIN, x, y, WATERSKIN_PAL);
      break;
    case 'papers': {
      // Scroll rolled at the ends.
      const pal: Palette = { p: '#ecdcb4', r: '#c9a874', R: '#a8844e', l: '#7a5a3a' };
      if (side) b.stamp(['Rr', 'pp', 'pl', 'pp', 'pl', 'Rr'], x, y, pal);
      else b.stamp(['RppppR', 'rplllr', 'rppppr', 'rpllpr', 'RppppR'], x, y, pal);
      break;
    }
    case 'book': {
      const cover = '#6a3a24';
      const coverDk = '#4a2616';
      if (side) {
        b.rect(x, y, 2, 6, cover);
        b.vline(x + 1, y + 1, y + 4, '#e6d6ae');
      } else if (r.view === 'down' && r.twoHands) {
        // Open tome in front of the chest.
        b.rect(x, y, 8, 5, '#eee0bc');
        b.vline(x + 3, y, y + 4, '#c9b48a');
        b.vline(x + 4, y, y + 4, '#dccba2');
        for (let i = 0; i < 2; i++) {
          b.hline(x + 1, x + 2, y + 1 + i * 2, '#8a6a4a');
          b.hline(x + 5, x + 6, y + 1 + i * 2, '#8a6a4a');
        }
        b.hline(x, x + 7, y + 5, cover);
      } else {
        b.rect(x, y, 5, 6, cover);
        b.set(x + 2, y + 2, '#d9b45a');
        b.set(x + 2, y + 3, '#d9b45a');
        b.set(x, y, IRON_LT);
        b.set(x, y + 5, IRON);
        b.vline(x + 4, y, y + 5, coverDk);
      }
      break;
    }
    case 'laptop':
      if (side) b.stamp(PICK_SIDE, x - 1, y, TOOL_PAL);
      else b.stamp(PICK, x, y - 2, TOOL_PAL);
      break;
    case 'box': {
      // Bundle of firewood: three stacked logs tied with rope; in profile, the tops of the logs.
      const bark = '#6b4a2e';
      const barkLt = '#8a6440';
      const ring = '#d9b680';
      const rope = '#cdb57e';
      if (side) {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 2; j++) {
            const lx = x + j * 3;
            const ly = y + i * 2 + (j ? 1 : 0);
            b.rect(lx, ly, 3, 2, bark);
            b.set(lx + 1, ly, ring);
            b.set(lx + 1, ly + 1, barkLt);
          }
        }
      } else {
        const w = 10;
        for (let i = 0; i < 3; i++) {
          const ly = y + 1 + i * 2;
          b.hline(x, x + w - 1, ly, barkLt);
          b.hline(x, x + w - 1, ly + 1, bark);
          b.set(x, ly, ring);
          b.set(x, ly + 1, ring);
          b.set(x + w - 1, ly + 1, '#4e3420');
        }
        b.vline(x + 2, y + 1, y + 6, rope);
        b.vline(x + w - 3, y + 1, y + 6, rope);
      }
      break;
    }
    case 'paddle':
      b.stamp(HAMMER, x, y, TOOL_PAL, side);
      break;
    case 'popcorn':
      b.stamp(POPCORN, x, y, POPCORN_PAL);
      break;
    case 'controller':
      b.stamp(side ? CONTROLLER_SIDE : CONTROLLER, x, y, CONTROLLER_PAL);
      break;
    case 'phone':
      b.stamp(side ? PHONE_SIDE : PHONE, x, y, PHONE_PAL);
      break;
    case 'lipstick':
      // War-paint stick (not visible from the back).
      if (r.view !== 'up') b.stamp(['rgG'], x, y, { r: '#d8365a', g: '#c9a874', G: '#8a6a42' });
      break;
    case 'comb':
      b.stamp(['cccc', 'c.c.'], x, y, { c: '#3d4252' });
      break;
    case 'rock':
    case 'paper':
    case 'scissors':
      drawGesture(dc, it, x, y);
      break;
    case 'none':
      break;
  }
}

/** Carved game board (7x3): wood, red and blue pieces. */
const CONTROLLER: readonly string[] = ['.hLLLL.', 'LdLLrbL', 'cc...cc'];
const CONTROLLER_SIDE: readonly string[] = ['hLL', 'cLr'];
const CONTROLLER_PAL: Palette = { L: '#8a5a32', h: '#b08050', d: '#3a2414', r: '#e8545a', b: '#4f8fe6', c: '#5e3c22' };
/** Runestone (3x5) with the rune glowing blue; in profile (2x4), the edge with the glow towards the face. */
const PHONE: readonly string[] = ['dDd', 'dBd', 'dbd', 'dbd', 'ddd'];
const PHONE_SIDE: readonly string[] = ['dB', 'db', 'db', 'dd'];
const PHONE_PAL: Palette = { d: '#5d636d', D: '#8b919b', b: '#6fbdf0', B: '#c8eaff' };

/**
 * Rock-paper-scissors gestures in skin (L = light, s = base, S = shadow), relative to the hand (corner of the 2x2 brush).
 * In profile they point forward (left); facing away they use the same drawing mirrored (to the
 * right, arm open to the side); facing front they show in front of the chest.
 */
interface GestureTpl {
  rows: readonly string[];
  dx: number;
  dy: number;
}
const GESTURE_SIDE: Readonly<Record<'rock' | 'paper' | 'scissors', GestureTpl>> = {
  // Round fist, bigger than the resting hand.
  rock: { rows: ['.LLs', 'LsLs', 'sssS', '.SS.'], dx: -2, dy: -1 },
  // Hand open like a fan: four spread fingers and the thumb up.
  paper: { rows: ['..L.L.', 'L.L.Ls', '.LsLss', 'LsssSS', '.SSSS.'], dx: -4, dy: -3 },
  // Index and middle fingers open in a V, pointing forward.
  scissors: { rows: ['L....', '.L...', '..Lss', '.SsSS', 'S....'], dx: -3, dy: -2 },
};
const GESTURE_FRONT: Readonly<Record<'rock' | 'paper' | 'scissors', GestureTpl>> = {
  rock: { rows: ['.LL.', 'LsLs', 'sSsS', '.SS.'], dx: -1, dy: -1 },
  paper: { rows: ['L.L.L', 'L.L.s', 'sLsLs', 'sssss', 'SsssS', '.SSS.'], dx: -2, dy: -4 },
  scissors: { rows: ['L...s', 'L...s', '.L.s.', '.LsS.', '.sSS.', '..S..'], dx: -2, dy: -4 },
};

function drawGesture(dc: Dc, kind: 'rock' | 'paper' | 'scissors', hx: number, hy: number): void {
  const { b, p, r } = dc;
  const pal: Palette = { L: p.skin.lt, s: p.skin.base, S: p.skin.dk };
  let rows: readonly string[];
  let x0: number;
  let flip = false;
  if (r.view === 'down') {
    const g = GESTURE_FRONT[kind];
    rows = g.rows;
    x0 = hx + g.dx;
    hy += g.dy;
  } else {
    const g = GESTURE_SIDE[kind];
    rows = g.rows;
    flip = r.view === 'up';
    // Mirrored around the centre of the hand (the brush covers hx..hx+1).
    x0 = flip ? hx - g.dx - rows[0].length + 2 : hx + g.dx;
    hy += g.dy;
  }
  b.stamp(rows, x0, hy, pal, flip);
  // Own outline where the gesture goes over the clothes (the general outline only catches the outside).
  const ink = mix(p.skin.dd, '#1d2433', 0.45);
  const w = rows[0].length;
  const on = (cx: number, cy: number) => {
    if (cy < 0 || cy >= rows.length || cx < 0 || cx >= w) return false;
    const ch = rows[cy][flip ? w - 1 - cx : cx];
    return ch !== '.' && ch !== ' ';
  };
  const skins = [p.skin.lt, p.skin.base, p.skin.dk, p.skin.hi].map(hexKey);
  for (let cy = -1; cy <= rows.length; cy++) {
    for (let cx = -1; cx <= w; cx++) {
      if (on(cx, cy)) continue;
      if (!(on(cx - 1, cy) || on(cx + 1, cy) || on(cx, cy - 1) || on(cx, cy + 1))) continue;
      const X = x0 + cx;
      const Y = hy + cy;
      if (b.alpha(X, Y) < 160 || skins.includes(pixelKey(b, X, Y))) continue;
      b.set(X, Y, ink);
    }
  }
}

function hexKey(c: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  return m ? parseInt(m[1], 16) : -1;
}

function pixelKey(b: PixelBuf, x: number, y: number): number {
  const xi = x + b.ox;
  const yi = y + b.oy;
  if (!b.inside(xi, yi)) return -1;
  const i = (yi * b.w + xi) * 4;
  return (b.data[i] << 16) | (b.data[i + 1] << 8) | b.data[i + 2];
}

/**
 * Popcorn bucket (6x7, top-left corner = start of the popcorn): popcorn overflowing on top,
 * light rim and vertical red/white stripes that narrow downwards. Light from the top-left.
 */
const POPCORN: readonly string[] = ['.pk.p.', 'kpypkK', 'aAAAAa', 'lwrwrW', 'lwrwrW', 'lwrwrW', '.wrwr.'];
const POPCORN_PAL: Palette = {
  p: '#fff9e6', // popcorn (light)
  k: '#f3e3b8', // popcorn (shadow)
  K: '#e2cc92',
  y: '#ffd75e', // butter
  a: '#e9e3d6', // rim (edges)
  A: '#fbf8f1', // rim
  l: '#ef6457', // lit red stripe (left edge)
  r: '#d8413f', // red stripe
  w: '#f6f1e6', // white stripe
  W: '#cfc6b6', // white stripe in shadow (right edge)
};

/** Item position relative to the hand (hand = last point of arm B, in drawn coordinates). */
function itemPos(dc: Dc): Pt | null {
  const { r } = dc;
  const it = r.held;
  if (it === 'none') return null;
  if (r.itemAt) return [r.itemAt[0] + r.lean, r.itemAt[1] + r.ub];
  const hand = r.armB.pts[r.armB.pts.length - 1];
  const hx = hand[0] + r.lean;
  const hy = hand[1] + r.ub;
  if (GESTURES.has(it)) return [hx, hy];
  if (r.twoHands) {
    if (r.view === 'side') return [hx - 2, hy - 3];
    const y = 18 + r.ub + 1;
    if (it === 'phone') return [10, y];
    if (it === 'box') return [7, y];
    if (it === 'laptop') return [8, y + 1];
    if (it === 'book' && r.view === 'down') return [8, y + 1];
    return [9, y];
  }
  switch (it) {
    case 'coffee':
      return r.view === 'side' ? [hx - 3, hy - 3] : [hx, hy - 3];
    case 'water':
      return r.view === 'side' ? [hx - 2, hy - 3] : [hx, hy - 3];
    case 'paddle':
      return r.view === 'side' ? [hx - 2, hy - 5] : [hx + 1, hy - 4];
    case 'popcorn':
      // Held by the side of the bucket (the hand stays on the back/left rim).
      return r.view === 'side' ? [hx - 5, hy - 4] : [hx + 1, hy - 4];
    case 'controller':
      return r.view === 'side' ? [hx - 2, hy] : [hx - 2, hy];
    case 'phone':
      return r.view === 'side' ? [hx - 2, hy - 3] : [hx, hy - 4];
    case 'lipstick':
      return r.view === 'side' ? [hx - 2, hy + 1] : [hx - 2, hy + 1];
    case 'comb':
      return [hx - 1, hy - 2];
    default:
      return [hx, hy - 2];
  }
}

// ---------------------------------------------------------------- composition

/** Uses the same rig as the head to follow the bounce, dozing and sitting poses. */
function drawCostume(dc: Dc, costume: CharacterFrameRequest['costume']): void {
  if (!costume) return;
  const { b, r } = dc;
  const x = HX + r.lean;
  const y = HY + r.ub + r.hd;
  if (costume === 'santa') {
    b.rect(x + 2, y, 9, 4, '#c93945');
    b.rect(x + 4, y - 2, 5, 2, '#e95452');
    b.rect(x + 9, y - 1, 3, 3, '#a82436');
    b.rect(x + 11, y + 1, 3, 3, '#fff3d9');
    b.rect(x + 1, y + 4, 11, 2, '#fff3d9');
    b.hline(x + 2, x + 10, y + 5, '#ddd9cb');
  } else if (costume === 'witch') {
    b.rect(x + 6, y - 2, 2, 2, '#50336f');
    b.rect(x + 5, y, 4, 2, '#69428e');
    b.rect(x + 3, y + 2, 7, 3, '#50336f');
    b.hline(x + 3, x + 9, y + 4, '#e9a548');
    b.rect(x - 1, y + 5, 15, 2, '#372641');
    b.set(x + 7, y + 4, '#ffe0a3');
  } else if (costume === 'pumpkin') {
    b.rect(x + 6, y - 2, 2, 3, '#47754b');
    b.rect(x + 2, y + 1, 10, 4, '#ed963c');
    b.rect(x + 1, y + 2, 12, 3, '#dc792e');
    b.vline(x + 4, y + 1, y + 4, '#f9ae48');
    b.vline(x + 8, y + 1, y + 4, '#f9ae48');
    b.hline(x + 2, x + 11, y + 5, '#8d4930');
  } else {
    // Cloak collar: face and badge stay visible.
    b.rect(x, y + 12, 2, 5, '#702743');
    b.rect(x + 12, y + 12, 2, 5, '#702743');
  }
}

/**
 * Over the clothes, before the arms: the Alliance tabard of humans (royal blue with gold edges and a gold
 * emblem), the exposed ribcage of the undead (the shirt hangs open over the bones, the spine shows at the back)
 * and a wide leather war belt with a bone buckle on orcs. Elves keep their clothes (shoulders, see below).
 */
function drawRaceBody(dc: Dc): void {
  const { b, r } = dc;
  const y = 18 + r.ub;
  const lx = r.lean;
  const front = r.view === 'down';
  if (dc.race === 'human') {
    const gold = dc.p.bone;
    if (r.view === 'side') {
      b.rect(8 + lx, y + 1, 3, 6, TABARD.base);
      b.vline(8 + lx, y + 1, y + 6, TABARD.lt);
      b.vline(11 + lx, y + 1, y + 6, gold);
      b.set(9 + lx, y + 3, gold);
      return;
    }
    b.rect(10, y, 4, 7, TABARD.base);
    b.vline(10, y, y + 6, gold);
    b.vline(13, y, y + 6, dc.p.boneSh);
    b.hline(11, 12, y + 6, TABARD.dk);
    if (front) {
      b.set(11, y + 2, gold);
      b.set(12, y + 2, gold);
      b.set(11, y + 3, dc.p.boneSh);
      b.set(12, y + 1, gold);
    }
    return;
  }
  if (dc.race === 'undead') {
    const bone = dc.p.skin;
    if (r.view === 'side') {
      b.rect(8 + lx, y + 1, 2, 4, SOCKET);
      b.set(8 + lx, y + 1, bone.lt);
      b.set(8 + lx, y + 3, bone.base);
      b.set(9 + lx, y + 2, bone.dk);
      // ragged hem
      for (let x = 8; x <= 14; x += 2) b.set(x + lx, y + 5, SOCKET);
      return;
    }
    if (front) {
      b.rect(10, y, 4, 5, SOCKET);
      for (const ry of [y + 1, y + 3]) {
        b.hline(10, 13, ry, bone.base);
        b.set(10, ry, bone.lt);
        b.set(13, ry, bone.dk);
      }
      b.vline(11, y, y + 4, bone.lt);
      b.set(12, y + 2, bone.dk);
    } else {
      for (let yy = y; yy <= y + 4; yy++) b.set(11, yy, yy % 2 ? bone.dk : bone.base);
      b.set(12, y + 1, bone.dk);
      b.set(12, y + 3, bone.dk);
    }
    for (let x = 8; x <= 15; x += 2) b.set(x, y + 5, SOCKET);
    return;
  }
  if (dc.race === 'orc') {
    const belt = ramp('#4a3020', 0.08);
    if (r.view === 'side') {
      b.rect(8 + lx, y + 4, 7, 2, belt.base);
      b.hline(8 + lx, 14 + lx, y + 4, belt.lt);
      b.set(8 + lx, y + 5, TUSK);
      return;
    }
    b.rect(7, y + 4, 10, 2, belt.base);
    b.hline(7, 16, y + 4, belt.lt);
    b.hline(7, 16, y + 5, belt.dk);
    if (front) {
      b.rect(11, y + 3, 2, 3, TUSK);
      b.set(12, y + 5, TUSK_SH);
      b.set(11, y + 4, SOCKET);
    }
  }
}

/**
 * Shoulders, on top of everything (they change the silhouette, which is what tells the races apart at a glance):
 * - orc: black iron spaulders with a tall bone spike on each;
 * - human: rounded steel caps with a gold rim;
 * - elf: curling leaf blades in moonlit teal;
 * - undead: jagged bone shards poking out of a tattered collar.
 * The 'headphones' pauldron (one shoulder) still sits on top.
 */
function drawRaceShoulders(dc: Dc): void {
  const { b, r } = dc;
  const y = 17 + r.ub;
  const side = r.view === 'side';
  const xs = side ? [10 + r.lean] : [6, 16];
  for (const [i, x0] of xs.entries()) {
    const right = !side && i === 1;
    const put = (dx: number, dy: number, col: string) => b.set(right ? x0 + 1 - dx : x0 + dx, y + dy, col);
    if (dc.race === 'orc') {
      const iron = ramp('#4a4448', 0.1);
      put(0, 1, iron.lt);
      put(1, 1, iron.base);
      put(2, 1, iron.dk);
      put(0, 2, iron.base);
      put(1, 2, iron.dk);
      put(2, 2, iron.dd);
      put(1, 0, TUSK_SH);
      put(1, -1, TUSK);
      put(1, -2, TUSK);
      put(0, -2, TUSK_SH);
    } else if (dc.race === 'human') {
      put(0, 1, STEEL.lt);
      put(1, 0, STEEL.hi);
      put(2, 0, STEEL.lt);
      put(1, 1, STEEL.base);
      put(2, 1, STEEL.base);
      put(0, 2, dc.p.bone);
      put(1, 2, dc.p.bone);
      put(2, 2, dc.p.boneSh);
    } else if (dc.race === 'elf') {
      const leaf = ramp('#3fa08a', 0.1);
      put(0, 1, leaf.base);
      put(1, 1, leaf.lt);
      put(2, 1, leaf.base);
      put(1, 0, leaf.lt);
      put(0, 0, leaf.hi);
      put(-1, -1, leaf.lt);
      put(2, 2, leaf.dk);
      put(1, 2, MOON_SH);
    } else {
      const bone = dc.p.skin;
      put(0, 1, SOCKET);
      put(1, 1, SOCKET);
      put(2, 1, SOCKET);
      put(0, 0, bone.lt);
      put(0, -1, bone.base);
      put(2, 0, bone.base);
      put(2, -1, bone.lt);
      put(2, -2, bone.dk);
    }
  }
}

export function renderCharacter(req: CharacterFrameRequest): BufSprite {
  if (req.dir === 'right') {
    const left = renderCharacter({ ...req, dir: 'left' });
    return { buf: left.buf.flipped(), ax: CHAR_W - left.ax, ay: left.ay };
  }
  const view: HeadView = req.dir === 'up' ? 'up' : req.dir === 'down' ? 'down' : 'side';
  const b = new PixelBuf(CHAR_W, CHAR_H);
  const race: Race = req.race ?? 'human';
  const a = raceLook(req.appearance, race);
  const dc: Dc = { b, a, p: paletteOf(a, race), r: makeRig(req, view), race };
  const r = dc.r;
  // the undead stoop: the skull hangs a pixel lower on the neck, pushed forward in profile
  if (race === 'undead') {
    r.hd += 1;
    if (view === 'side') r.lean -= 1;
  }
  const sleeve = sleeveLength(a);
  const sr = sleeve === 0 ? dc.p.skin : dc.p.top;
  const ip = itemPos(dc);

  // 1) Behind everything: long hair (front), item on the back.
  if (req.costume === 'vampire') {
    b.rect(5 + r.lean, 18 + r.ub, 14, 8, '#35283e');
    b.rect(6 + r.lean, 19 + r.ub, 12, 6, '#702743');
  }
  drawHair(dc, 'back');
  if (ip && r.itemBehind) drawItem(dc, ip[0], ip[1]);

  const headStack = () => {
    drawHead(dc);
    drawFacialHair(dc);
    drawHair(dc, 'front');
    drawTusks(dc);
    drawEars(dc);
    drawAccessory(dc);
    drawCostume(dc, req.costume);
  };

  if (view !== 'side' && r.itemAt) {
    // Item at a fixed position (popcorn in the 'wait' pose). Facing away: bucket and arms before the head (the hand
    // going to the mouth disappears behind it). Facing front: head, bucket, hugging arm and the hand on top.
    drawLegs(dc);
    drawTorso(dc);
    if (view === 'up') {
      if (ip) drawItem(dc, ip[0], ip[1]);
      drawArm(dc, r.armA, sr, sleeve);
      drawArm(dc, r.armB, sr, sleeve);
      headStack();
    } else {
      headStack();
      if (ip) drawItem(dc, ip[0], ip[1]);
      drawArm(dc, r.armA, sr, sleeve);
      drawArm(dc, r.armB, sr, sleeve);
    }
  } else if (view === 'side') {
    drawArm(dc, r.armA, sr, sleeve, 0.08);
    drawLegs(dc);
    drawTorso(dc);
    drawHead(dc);
    drawFacialHair(dc);
    drawHair(dc, 'front');
    drawTusks(dc);
    drawEars(dc);
    drawAccessory(dc);
    drawCostume(dc, req.costume);
    if (ip && !r.itemBehind) drawItem(dc, ip[0], ip[1]);
    drawArm(dc, r.armB, sr, sleeve, 0, true);
  } else {
    drawLegs(dc);
    const armsBehindHead = r.view === 'up' && (req.pose === 'type' || req.pose === 'use' || req.pose === 'drink');
    drawTorso(dc);
    if (armsBehindHead) {
      drawArm(dc, r.armA, sr, sleeve);
      drawArm(dc, r.armB, sr, sleeve);
    }
    const raisedHigh = (arm: Arm) => arm.pts[arm.pts.length - 1][1] < 16;
    if (r.crossFront === null && !armsBehindHead) {
      if (!raisedHigh(r.armA)) drawArm(dc, r.armA, sr, sleeve);
      if (!raisedHigh(r.armB) && !(ip && !r.itemBehind && r.twoHands)) drawArm(dc, r.armB, sr, sleeve);
    }
    drawHead(dc);
    drawFacialHair(dc);
    drawHair(dc, 'front');
    drawTusks(dc);
    drawEars(dc);
    drawAccessory(dc);
    drawCostume(dc, req.costume);
    // Crossed arms over the long hair falling on the chest (the tapping hand stays visible).
    if (r.crossFront !== null) {
      // The pauldron sits under the hand that taps its fingers on the arm.
      drawPauldron(dc);
      drawCrossedArms(dc, sr, sleeve, r.crossFront === 1);
    }
    if (ip && !r.itemBehind) {
      drawItem(dc, ip[0], ip[1]);
      if (r.twoHands) {
        // Hands over the edges of the item.
        drawArm(dc, r.armA, sr, sleeve);
        drawArm(dc, r.armB, sr, sleeve);
      }
    }
    if (!armsBehindHead && r.crossFront === null) {
      if (raisedHigh(r.armA)) drawArm(dc, r.armA, sr, sleeve);
      if (raisedHigh(r.armB)) drawArm(dc, r.armB, sr, sleeve);
    }
  }
  if (r.tapAt) {
    const [tx, ty] = r.tapAt;
    b.set(tx + r.lean, ty + r.ub, dc.p.skin.base);
    b.set(tx + r.lean, ty + 1 + r.ub, dc.p.skin.dk);
  }
  if (r.kernelAt) {
    const [kx, ky] = r.kernelAt;
    b.set(kx + r.lean, ky + r.ub, POPCORN_PAL.p);
    b.set(kx + 1 + r.lean, ky + r.ub, POPCORN_PAL.y);
  }

  if (r.view !== 'up' || !r.seated) drawRaceShoulders(dc);
  if (r.crossFront === null) drawPauldron(dc);
  b.outline();
  if (!r.seated) b.shadow(CHAR_AX, CHAR_AY - 0.5, 6, 2, '#1c2034', 0.2);
  return { buf: b, ax: CHAR_AX, ay: CHAR_AY };
}
