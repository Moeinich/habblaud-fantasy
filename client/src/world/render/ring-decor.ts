// Race dressing for the hall rings (render/enclosure.ts): small pixel props on the ring's rim, on its outer face,
// on its corners and along the strip of yard just inside it. Humans get round towers, torches, blue and gold
// banners, barrels, crates and weapon racks; orcs war banners, braziers, spiked hide shields, mammoth tusks, war
// drums and bone piles; the undead gargoyles, tattered violet banners, ghost-fire braziers, gravestones, coffins
// and candles. Every prop is drawn with fillRect around its base point (bottom centre).
import { hash32 } from '../../../../shared/hash';
import type { Race } from '../../../../shared/race';
import type { ExteriorProp } from '../layout/types';
import { propSprite } from './props';

type Ctx = CanvasRenderingContext2D;
export type RingRace = Exclude<Race, 'elf'>;

function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// ------------------------------------------------------------------ shared bits

function flame(ctx: Ctx, x: number, y: number, ghost: boolean): void {
  const [outer, mid, core] = ghost ? ['#3f9a6a', '#7cf0a0', '#e0ffe8'] : ['#c8501e', '#f0a030', '#fff2b0'];
  px(ctx, x - 1, y - 3, 3, 3, outer);
  px(ctx, x - 1, y - 2, 3, 1, mid);
  px(ctx, x, y - 4, 1, 1, outer);
  px(ctx, x, y - 2, 1, 1, core);
}

function skull(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 1, y - 3, 3, 2, '#e2dac4');
  px(ctx, x - 1, y - 1, 3, 1, '#c8bea6');
  px(ctx, x - 1, y - 2, 1, 1, '#2a2020');
  px(ctx, x + 1, y - 2, 1, 1, '#2a2020');
}

function brazier(ctx: Ctx, x: number, y: number, ghost: boolean): void {
  px(ctx, x - 4, y - 5, 1, 5, '#2a2624');
  px(ctx, x + 3, y - 5, 1, 5, '#2a2624');
  px(ctx, x - 1, y - 4, 2, 4, '#2a2624');
  px(ctx, x - 5, y - 8, 10, 3, '#2e2a28');
  px(ctx, x - 5, y - 8, 10, 1, '#5e5854');
  px(ctx, x - 4, y - 6, 8, 1, '#1e1a18');
  flame(ctx, x - 2, y - 8, ghost);
  flame(ctx, x + 2, y - 8, ghost);
  flame(ctx, x, y - 10, ghost);
}

function bones(ctx: Ctx, x: number, y: number, seed: number): void {
  const c = '#e2dac4';
  px(ctx, x - 4, y - 1, 5, 1, c);
  px(ctx, x - 5, y - 2, 1, 1, c);
  px(ctx, x, y - 2, 1, 1, c);
  px(ctx, x + 1, y - 2, 4, 1, '#c8bea6');
  if (seed % 2) px(ctx, x - 2, y - 3, 1, 2, c);
  skull(ctx, x + 2, y - 2);
}

// ------------------------------------------------------------------ human

function torch(ctx: Ctx, x: number, y: number): void {
  px(ctx, x, y - 5, 1, 5, '#3a3632');
  px(ctx, x - 1, y - 6, 3, 1, '#5a544c');
  flame(ctx, x, y - 6, false);
}

function humanBanner(ctx: Ctx, x: number, top: number): void {
  px(ctx, x - 6, top, 13, 2, '#6a5a3a');
  px(ctx, x - 6, top, 1, 2, '#d8b04a');
  px(ctx, x + 6, top, 1, 2, '#d8b04a');
  px(ctx, x - 5, top + 2, 11, 14, '#2f4f9a');
  px(ctx, x - 5, top + 2, 1, 14, '#3e62b4');
  px(ctx, x + 4, top + 2, 2, 14, '#253f7d');
  px(ctx, x - 5, top + 2, 11, 2, '#d8b04a');
  // a gold lion-ish crest: a shield with a chevron
  px(ctx, x - 2, top + 6, 5, 5, '#d8b04a');
  px(ctx, x - 1, top + 11, 3, 1, '#d8b04a');
  px(ctx, x - 1, top + 7, 3, 3, '#253f7d');
  px(ctx, x, top + 8, 1, 1, '#d8b04a');
  // swallowtail
  px(ctx, x - 5, top + 16, 4, 3, '#2f4f9a');
  px(ctx, x + 2, top + 16, 4, 3, '#253f7d');
  px(ctx, x - 5, top + 19, 2, 1, '#2f4f9a');
  px(ctx, x + 4, top + 19, 2, 1, '#253f7d');
}

function tower(ctx: Ctx, x: number, y: number): void {
  const w = 22;
  const h = 18;
  for (let i = 0; i < w; i++) {
    const c = i < 3 ? '#a8a296' : i > w - 5 ? '#6e6a64' : '#8a857c';
    px(ctx, x - w / 2 + i, y - h, 1, h, c);
  }
  for (let j = 0; j < h; j += 4) px(ctx, x - w / 2, y - h + j, w, 1, '#77726a');
  // crenels round the top, an arrow slit, a pennant
  for (let i = 0; i < w; i += 4) px(ctx, x - w / 2 + i, y - h - 3, 2, 3, '#9a958a');
  px(ctx, x - w / 2, y - h - 1, w, 1, '#5e5a54');
  px(ctx, x - 1, y - 13, 2, 6, '#2a2826');
  px(ctx, x - 5, y - 4, 10, 4, '#3a3632');
  px(ctx, x - 4, y - 3, 8, 3, '#1e1c1a');
  px(ctx, x, y - h - 16, 1, 14, '#4a4640');
  px(ctx, x + 1, y - h - 16, 8, 3, '#2f4f9a');
  px(ctx, x + 1, y - h - 13, 5, 2, '#2f4f9a');
  px(ctx, x + 1, y - h - 15, 6, 1, '#d8b04a');
}

function barrel(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 3, y - 7, 6, 7, '#7a5232');
  px(ctx, x - 3, y - 7, 1, 7, '#5e3e24');
  px(ctx, x + 2, y - 7, 1, 7, '#5e3e24');
  px(ctx, x - 3, y - 2, 6, 1, '#3e2a1a');
  px(ctx, x - 3, y - 5, 6, 1, '#3e2a1a');
  px(ctx, x - 2, y - 8, 4, 1, '#9a6a42');
}

function crate(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 3, y - 6, 7, 6, '#9a7448');
  px(ctx, x - 3, y - 6, 7, 1, '#b48a58');
  px(ctx, x - 3, y - 1, 7, 1, '#6a4a2a');
  for (let i = 0; i < 5; i++) px(ctx, x - 2 + i, y - 2 - i, 1, 1, '#6a4a2a');
}

function weaponRack(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 4, y - 7, 1, 7, '#5e3e24');
  px(ctx, x + 4, y - 7, 1, 7, '#5e3e24');
  px(ctx, x - 4, y - 5, 9, 1, '#7a5232');
  for (const dx of [-2, 0, 2]) {
    px(ctx, x + dx, y - 11, 1, 10, '#6a5a3a');
    px(ctx, x + dx, y - 13, 1, 2, '#c8ccd0');
  }
}

function hay(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 4, y - 5, 8, 5, '#d6b45a');
  px(ctx, x - 4, y - 5, 8, 1, '#ead08a');
  px(ctx, x - 4, y - 3, 8, 1, '#a88838');
  px(ctx, x - 3, y - 6, 1, 1, '#d6b45a');
  px(ctx, x + 2, y - 6, 1, 1, '#d6b45a');
}

// ------------------------------------------------------------------ orc

function warBanner(ctx: Ctx, x: number, y: number): void {
  px(ctx, x, y - 18, 1, 18, '#4a3422');
  px(ctx, x - 3, y - 17, 7, 1, '#4a3422');
  px(ctx, x - 3, y - 16, 6, 9, '#9c2f25');
  px(ctx, x + 2, y - 16, 1, 9, '#6e1f18');
  // a black hand
  px(ctx, x - 2, y - 12, 3, 3, '#1e1410');
  for (const dx of [-2, -1, 0]) px(ctx, x + dx, y - 14, 1, 2, '#1e1410');
  px(ctx, x + 1, y - 11, 1, 1, '#1e1410');
  // tattered hem
  px(ctx, x - 3, y - 7, 1, 1, '#9c2f25');
  px(ctx, x - 1, y - 7, 1, 2, '#9c2f25');
  px(ctx, x + 1, y - 7, 1, 1, '#9c2f25');
  skull(ctx, x, y - 18);
}

function hideShield(ctx: Ctx, x: number, cy: number): void {
  for (let dy = -6; dy <= 6; dy++)
    for (let dx = -6; dx <= 6; dx++) {
      const d = dx * dx + dy * dy;
      if (d > 40) continue;
      const stripe = Math.abs(dx + dy) <= 1;
      px(ctx, x + dx, cy + dy, 1, 1, d > 30 ? '#4a3422' : stripe ? '#9c2f25' : dx < -2 && dy < 0 ? '#a8825a' : '#8a6a44');
    }
  px(ctx, x - 1, cy - 1, 3, 3, '#a0a4a8');
  px(ctx, x - 1, cy - 1, 1, 1, '#e0e4e8');
  for (const [dx, dy] of [[0, -8], [0, 7], [-8, 0], [7, 0], [-5, -5], [5, 5], [5, -5], [-5, 5]])
    px(ctx, x + dx, cy + dy, 1, 2, '#d8d0c0');
}

function tusks(ctx: Ctx, x: number, y: number): void {
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const dx = Math.round(10 - 5 * t - 4 * t * t);
    const yy = y - i;
    const c = i > 19 ? '#f4ecd8' : '#e8dcc0';
    px(ctx, x - dx - 1, yy, 2, 1, c);
    px(ctx, x + dx, yy, 2, 1, c);
    px(ctx, x - dx - 1, yy, 1, 1, '#b8a888');
    px(ctx, x + dx + 1, yy, 1, 1, '#b8a888');
  }
  px(ctx, x - 4, y - 3, 9, 3, '#4a3422');
  skull(ctx, x, y - 3);
}

function drum(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 4, y - 6, 8, 6, '#7a4a2a');
  px(ctx, x - 4, y - 7, 8, 2, '#d8c0a0');
  for (let i = 0; i < 8; i += 2) {
    px(ctx, x - 4 + i, y - 5, 1, 1, '#e8d8b0');
    px(ctx, x - 3 + i, y - 3, 1, 1, '#e8d8b0');
  }
  px(ctx, x - 4, y - 1, 8, 1, '#4a2a18');
}

function totem(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 1, y - 14, 2, 14, '#6a4a2a');
  px(ctx, x - 1, y - 9, 2, 1, '#9c2f25');
  skull(ctx, x, y - 14);
  px(ctx, x - 4, y - 18, 2, 1, '#e2dac4');
  px(ctx, x - 3, y - 17, 1, 1, '#e2dac4');
  px(ctx, x + 3, y - 18, 2, 1, '#e2dac4');
  px(ctx, x + 2, y - 17, 1, 1, '#e2dac4');
}

// ------------------------------------------------------------------ undead

function gravestone(ctx: Ctx, x: number, y: number, seed: number): void {
  const h = 11 + (seed % 4);
  px(ctx, x - 5, y - h, 10, h, '#8a8694');
  px(ctx, x - 5, y - h, 1, h, '#a6a2ae');
  px(ctx, x + 3, y - h, 2, h, '#625e6c');
  px(ctx, x - 5, y - h, 2, 1, '#2a2630');
  px(ctx, x + 3, y - h, 2, 1, '#2a2630');
  px(ctx, x - 5, y - h + 1, 1, 1, '#2a2630');
  px(ctx, x + 4, y - h + 1, 1, 1, '#2a2630');
  px(ctx, x - 3, y - h - 1, 6, 1, '#8a8694');
  // a carved cross, and moss creeping up from the ground
  px(ctx, x - 1, y - h + 3, 2, 6, '#4a4652');
  px(ctx, x - 3, y - h + 5, 6, 2, '#4a4652');
  px(ctx, x - 5, y - 2, 3, 2, '#5a6a4a');
  if (seed % 2) px(ctx, x + 2, y - 3, 2, 3, '#5a6a4a');
  px(ctx, x - 6, y - 1, 12, 1, '#2a2630');
}

function coffin(ctx: Ctx, x: number, y: number): void {
  const rows = [2, 4, 6, 6, 5, 5, 4, 4, 3, 3];
  rows.forEach((w, i) => px(ctx, x - Math.floor(w / 2), y - rows.length + i, w, 1, i === 0 ? '#5a4040' : '#3a2a2a'));
  px(ctx, x, y - 8, 1, 5, '#a08060');
  px(ctx, x - 1, y - 7, 3, 1, '#a08060');
}

function candles(ctx: Ctx, x: number, y: number): void {
  px(ctx, x - 4, y - 1, 8, 1, '#c8c0a8');
  for (const [dx, h] of [[-3, 3], [0, 5], [2, 4]] as const) {
    px(ctx, x + dx, y - h, 1, h, '#d8d0b8');
    px(ctx, x + dx, y - h - 2, 1, 2, '#7cf0a0');
    px(ctx, x + dx, y - h - 1, 1, 1, '#e0ffe8');
  }
}

function gargoyle(ctx: Ctx, x: number, y: number): void {
  // a plinth under the statue
  px(ctx, x - 7, y - 6, 14, 6, '#3e3846');
  px(ctx, x - 7, y - 6, 14, 1, '#6a6474');
  px(ctx, x + 4, y - 5, 3, 5, '#2e2a34');
  y -= 5;
  px(ctx, x - 5, y - 4, 10, 4, '#3e3846');
  px(ctx, x - 5, y - 4, 10, 1, '#56505e');
  px(ctx, x - 3, y - 10, 6, 6, '#4e4a56');
  px(ctx, x + 2, y - 10, 1, 6, '#3a3642');
  px(ctx, x - 2, y - 13, 4, 3, '#4e4a56');
  px(ctx, x - 2, y - 14, 1, 1, '#4e4a56');
  px(ctx, x + 1, y - 14, 1, 1, '#4e4a56');
  px(ctx, x - 1, y - 12, 1, 1, '#c080ff');
  px(ctx, x + 1, y - 12, 1, 1, '#c080ff');
  // folded wings
  px(ctx, x - 6, y - 12, 3, 5, '#3e3846');
  px(ctx, x + 3, y - 12, 3, 5, '#3e3846');
  px(ctx, x - 7, y - 13, 1, 2, '#3e3846');
  px(ctx, x + 6, y - 13, 1, 2, '#3e3846');
}

function undeadBanner(ctx: Ctx, x: number, top: number, seed: number): void {
  px(ctx, x - 6, top, 13, 2, '#2a2630');
  px(ctx, x - 6, top, 1, 2, '#56505e');
  px(ctx, x + 6, top, 1, 2, '#56505e');
  px(ctx, x - 5, top + 2, 11, 14, '#6a3e94');
  px(ctx, x - 5, top + 2, 1, 14, '#8a58b8');
  px(ctx, x + 4, top + 2, 2, 14, '#3e2462');
  px(ctx, x - 5, top + 2, 11, 1, '#9a7ac0');
  // a skull over crossed bones
  px(ctx, x - 2, top + 5, 5, 4, '#e2dac4');
  px(ctx, x - 1, top + 9, 3, 1, '#c8bea6');
  px(ctx, x - 1, top + 6, 1, 2, '#2a2020');
  px(ctx, x + 1, top + 6, 1, 2, '#2a2020');
  for (let i = 0; i < 5; i++) {
    px(ctx, x - 3 + i * 1.5, top + 11 + (i % 2), 1, 1, '#e2dac4');
    px(ctx, x + 3 - i * 1.5, top + 11 + (i % 2), 1, 1, '#e2dac4');
  }
  // ragged hem
  for (let i = 0; i < 11; i++) if ((seed >> i) & 1) px(ctx, x - 5 + i, top + 16, 1, 1 + ((seed >> (i + 3)) & 3), i > 8 ? '#3e2462' : '#6a3e94');
}

function chain(ctx: Ctx, x: number, top: number): void {
  for (let i = 0; i < 8; i += 2) {
    px(ctx, x, top + i, 1, 1, '#56505e');
    px(ctx, x - 1, top + i + 1, 1, 1, '#2a2630');
    px(ctx, x + 1, top + i + 1, 1, 1, '#2a2630');
  }
}

// ------------------------------------------------------------------ placement

/** One of the camp's own outdoor props (render/props.ts), at full size. */
function sprite(kind: ExteriorProp['kind']): (ctx: Ctx, x: number, y: number) => void {
  return (ctx, x, y) => {
    const s = propSprite({ kind, x, y, seed: hash32(`${kind}${x},${y}`) });
    ctx.drawImage(s.canvas, Math.round(x - s.ax), Math.round(y - s.ay));
  };
}

export type DecorSpot = 'rim' | 'corner' | 'face' | 'yard';

/**
 * Draws one prop of `race` for a spot. `x, y` = base point (bottom centre; for 'face', the top of the outer face
 * the item hangs from). `n` = running number of the spot, `seed` varies the choice.
 */
export function ringDecor(ctx: Ctx, race: RingRace, spot: DecorSpot, x: number, y: number, n: number, seed: number): void {
  const h = hash32(`${race}${spot}${n}${seed}`);
  if (race === 'human') {
    if (spot === 'corner') tower(ctx, x, y + 4);
    else if (spot === 'rim') torch(ctx, x, y - 8);
    else if (spot === 'face') humanBanner(ctx, x, y);
    else [barrel, crate, weaponRack, hay, sprite('bush'), sprite('lamp'), barrel, sprite('flowers')][h % 8](ctx, x, y);
  } else if (race === 'orc') {
    if (spot === 'corner') tusks(ctx, x, y);
    else if (spot === 'rim') (n % 2 ? brazier(ctx, x, y - 2, false) : warBanner(ctx, x, y));
    else if (spot === 'face') hideShield(ctx, x, y + 4);
    else
      [drum, (c: Ctx, a: number, b: number) => bones(c, a, b, h), sprite('totem'), (c: Ctx, a: number, b: number) => brazier(c, a, b, false), sprite('stump'), totem, sprite('log'), sprite('rock')][
        h % 8
      ](ctx, x, y);
  } else {
    if (spot === 'corner') gargoyle(ctx, x, y + 2);
    else if (spot === 'rim') brazier(ctx, x, y - 2, true);
    else if (spot === 'face') (n % 2 ? undeadBanner(ctx, x, y, h) : chain(ctx, x, y));
    else
      [
        (c: Ctx, a: number, b: number) => gravestone(c, a, b, h),
        coffin,
        candles,
        sprite('grave'),
        (c: Ctx, a: number, b: number) => gravestone(c, a, b, h >> 3),
        (c: Ctx, a: number, b: number) => bones(c, a, b, h),
        sprite('grave'),
        (c: Ctx, a: number, b: number) => brazier(c, a, b, true),
      ][h % 8](ctx, x, y);
  }
}

// ------------------------------------------------------------------ gates

function gatePost(ctx: Ctx, race: RingRace, x: number, y: number): void {
  if (race === 'human') {
    px(ctx, x - 5, y - 22, 10, 22, '#8a857c');
    px(ctx, x - 5, y - 22, 2, 22, '#a8a296');
    px(ctx, x + 3, y - 22, 2, 22, '#6e6a64');
    for (let j = 4; j < 22; j += 5) px(ctx, x - 5, y - j, 10, 1, '#77726a');
    for (let i = 0; i < 10; i += 4) px(ctx, x - 5 + i, y - 25, 2, 3, '#9a958a');
    torch(ctx, x, y - 22);
  } else if (race === 'orc') {
    for (const dx of [-3, 0, 3]) {
      const h = dx === 0 ? 26 : 22;
      px(ctx, x + dx - 1, y - h, 3, h, dx < 0 ? '#8a6440' : dx > 0 ? '#4a3220' : '#6a4a30');
      px(ctx, x + dx, y - h - 2, 1, 2, '#c8a070');
    }
    px(ctx, x - 4, y - 14, 9, 2, '#3a2418');
    skull(ctx, x, y - 20);
    px(ctx, x - 4, y - 22, 2, 1, '#e2dac4');
    px(ctx, x + 3, y - 22, 2, 1, '#e2dac4');
  } else {
    px(ctx, x - 5, y - 24, 10, 24, '#4e4a56');
    px(ctx, x - 5, y - 24, 2, 24, '#6a6474');
    px(ctx, x + 3, y - 24, 2, 24, '#2e2a34');
    px(ctx, x - 6, y - 26, 12, 2, '#56505e');
    px(ctx, x - 6, y - 3, 12, 3, '#3e3846');
    skull(ctx, x, y - 27);
    // a ghost lantern hung on the post
    px(ctx, x - 2, y - 17, 5, 6, '#2a2630');
    px(ctx, x - 1, y - 16, 3, 4, '#7cf0a0');
    px(ctx, x, y - 15, 1, 2, '#e0ffe8');
  }
}

/**
 * A gate where a corridor passes the ring: a post on each side of the way in (`x0`, `x1`: the posts' centres,
 * `y` their base) and, with `arch`, an arch across between their tops.
 */
export function ringGate(ctx: Ctx, race: RingRace, x0: number, x1: number, y: number, arch: boolean): void {
  if (arch) {
    const top = y - (race === 'undead' ? 30 : 28);
    const span = x1 - x0;
    for (let i = 0; i <= span; i++) {
      const t = i / span;
      const lift = Math.round(Math.sin(t * Math.PI) * 6);
      const ax = x0 + i;
      if (race === 'human') {
        px(ctx, ax, top - lift, 1, 4, i % 6 === 0 ? '#6e6a64' : '#8a857c');
        px(ctx, ax, top - lift, 1, 1, '#a8a296');
      } else if (race === 'orc') {
        px(ctx, ax, top - lift + 1, 1, 3, i % 3 === 0 ? '#4a3220' : '#6a4a30');
      } else {
        px(ctx, ax, top - lift, 1, 2, '#2a2630');
        if (i % 4 === 0) px(ctx, ax, top - lift - 3, 1, 3, '#2a2630');
        if (i % 4 === 0) px(ctx, ax, top - lift - 4, 1, 1, '#96909e');
        if (i % 6 === 3) px(ctx, ax, top - lift + 2, 1, 1, '#56505e');
      }
    }
    // the sign of the hall in the middle of the arch
    const mx = Math.round((x0 + x1) / 2);
    if (race === 'undead') {
      skull(ctx, mx, top - 3);
      px(ctx, mx - 4, top - 2, 2, 1, '#e2dac4');
      px(ctx, mx + 3, top - 2, 2, 1, '#e2dac4');
    } else if (race === 'orc') skull(ctx, mx, top - 4);
    else {
      px(ctx, mx - 3, top - 9, 7, 6, '#2f4f9a');
      px(ctx, mx - 1, top - 8, 3, 3, '#d8b04a');
    }
  }
  gatePost(ctx, race, x0, y);
  if (x1 !== x0) gatePost(ctx, race, x1, y);
}
