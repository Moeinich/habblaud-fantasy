// Race dressing of the project rooms' walls (drawn once, into the static wall layer), so each race's rooms read
// at a glance beyond their palette:
// - elf: the room sits inside a great living tree — a leafy canopy hangs over the top of the north wall, with
//   vines trailing down and glowing moon-blossoms among the leaves, and thick roots grip the corners;
// - orc: brutal — sharpened stakes along the top of the wall, horned skull trophies between them and streaks of
//   blood-red war paint;
// - human: festive Alliance bunting, blue and gold pennants strung along the top of the wall;
// - undead: nothing here — their rooms are dressed for Halloween all year (render/seasonal.ts areaTheme).
import { hash32 } from '../../../../shared/hash';
import type { Race } from '../../../../shared/race';
import type { WallSegment } from '../layout/types';

type Ctx = CanvasRenderingContext2D;

type Face = Extract<WallSegment, { kind: 'face' }>;
type Cap = Extract<WallSegment, { kind: 'cap' }>;

const inDoor = (w: Face, x: number, pad = 0) => !!w.doorways?.some((d) => x >= d.x - pad && x < d.x + d.w + pad);

export function decorateRaceWall(ctx: Ctx, race: Race, wall: WallSegment, seed: number): void {
  if (race === 'undead') return;
  ctx.save();
  if (wall.kind === 'face') {
    if (race === 'elf') elfCanopy(ctx, wall, seed);
    else if (race === 'orc') orcStakes(ctx, wall, seed);
    else humanBunting(ctx, wall);
  } else if (wall.kind === 'cap' && race === 'elf') elfRoots(ctx, wall);
  ctx.restore();
}

function px(ctx: Ctx, x: number, y: number, c: string, w = 1, h = 1): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

const LEAF = ['#1f4a32', '#2e6a40', '#3f8a4e', '#5fae62'] as const;

function elfCanopy(ctx: Ctx, w: Face, seed: number): void {
  const x0 = Math.round(w.x);
  const x1 = Math.round(w.x + w.w);
  const top = Math.round(w.y);
  // leaf clumps: overlapping blobs along the top edge, darker underneath
  for (let x = x0 - 4; x < x1 + 4; x += 4) {
    const h = hash32(`${seed}:${x}`);
    const r = 5 + (h % 4);
    const cy = top - 3 + ((h >>> 3) % 4);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const tone = dy > r / 2 ? 0 : dy > 0 ? 1 : dx + dy < -r / 2 ? 3 : 2;
        px(ctx, x + dx, cy + dy, LEAF[tone]);
      }
    }
    if ((h >>> 7) % 5 === 0) {
      px(ctx, x, cy - 1, '#8ff0e0');
      px(ctx, x + 1, cy - 1, '#c8fff6');
    }
  }
  // vines trailing down the wall (not over the doors)
  for (let x = x0 + 9; x < x1 - 4; x += 17) {
    if (inDoor(w, x, 2)) continue;
    const h = hash32(`${seed}:v${x}`);
    const len = 12 + (h % 14);
    for (let y = 0; y < len; y++) {
      const sway = Math.round(Math.sin((y + h) * 0.6));
      px(ctx, x + sway, top + 5 + y, y % 4 === 3 ? LEAF[3] : LEAF[1]);
      if (y % 4 === 1) px(ctx, x + sway + (y % 8 === 1 ? 1 : -1), top + 5 + y, LEAF[2]);
    }
  }
}

function elfRoots(ctx: Ctx, w: Cap): void {
  const x0 = Math.round(w.x);
  const y0 = Math.round(w.y);
  const y1 = Math.round(w.y + w.h);
  const bark = ['#3a2a22', '#4e3a2c', '#6a5038'] as const;
  // the side walls are the living trunk: furrowed bark from top to bottom
  const cw = Math.max(1, Math.round(w.w));
  for (let y = y0 - 6; y < y1; y++) {
    for (let x = 0; x < cw + 2; x++) {
      const furrow = (x + Math.floor((y + (x % 2) * 3) / 5)) % 3 === 0;
      px(ctx, x0 - 1 + x, y, furrow ? bark[0] : x === 0 ? bark[2] : bark[1]);
    }
  }
  // a buttress root swelling out at the foot of the corner
  for (let k = 0; k < 7; k++) {
    const y = y1 - 1 - k;
    const spread = Math.max(0, 6 - k);
    px(ctx, x0 - spread, y, bark[1], Math.round(w.w) + spread * 2, 1);
    px(ctx, x0 - spread, y, bark[2]);
    px(ctx, x0 + Math.round(w.w) + spread - 1, y, bark[0]);
  }
}

const STAKE = ['#3a2416', '#5a3a22', '#7a5434'] as const;

function orcStakes(ctx: Ctx, w: Face, seed: number): void {
  const x0 = Math.round(w.x);
  const x1 = Math.round(w.x + w.w);
  const top = Math.round(w.y);
  // sharpened stakes poking up above the wall
  for (let x = x0 + 1; x < x1 - 2; x += 4) {
    const h = 4 + (hash32(`${seed}:s${x}`) % 3);
    for (let k = 0; k < h; k++) {
      const wd = k < 2 ? 1 : 2;
      px(ctx, x + (wd === 1 ? 1 : 0), top - k + 1, k === h - 1 ? '#c8b89a' : STAKE[k % 2 ? 1 : 2], wd, 1);
    }
    px(ctx, x + 2, top + 1, STAKE[0]);
  }
  // horned skull trophies and war-paint streaks between them
  for (let x = x0 + 20; x < x1 - 12; x += 44) {
    if (inDoor(w, x, 8)) continue;
    const y = top + 4;
    const bone = '#e8dcc0';
    const sh = '#b0a488';
    px(ctx, x - 2, y, bone, 5, 3);
    px(ctx, x - 1, y + 3, bone, 3, 1);
    px(ctx, x - 1, y + 1, '#1a1012');
    px(ctx, x + 1, y + 1, '#1a1012');
    px(ctx, x, y + 3, sh);
    // horns
    px(ctx, x - 3, y - 1, sh);
    px(ctx, x - 4, y - 2, bone);
    px(ctx, x - 4, y - 3, bone);
    px(ctx, x + 3, y - 1, sh);
    px(ctx, x + 4, y - 2, bone);
    px(ctx, x + 4, y - 3, bone);
    // blood-red paint dripping from the trophy
    for (const dx of [-8, 8]) {
      if (inDoor(w, x + dx, 2)) continue;
      const len = 5 + (hash32(`${seed}:p${x + dx}`) % 6);
      px(ctx, x + dx, y - 1, '#9c2f25', 2, len);
      px(ctx, x + dx, y - 1 + len, '#7a2018');
    }
  }
}

function humanBunting(ctx: Ctx, w: Face): void {
  const x0 = Math.round(w.x + 3);
  const x1 = Math.round(w.x + w.w - 3);
  const top = Math.round(w.y + 3);
  let i = 0;
  for (let x = x0; x < x1; x += 7, i++) {
    if (inDoor(w, x, 3)) continue;
    const sag = Math.round(Math.sin(((x - x0) % 56) / 56 * Math.PI) * 3);
    px(ctx, x, top + sag, '#5a4632', 7, 1);
    const c = i % 2 ? '#e0b23c' : '#2f4f9c';
    const c2 = i % 2 ? '#b38a34' : '#24407e';
    for (let k = 0; k < 4; k++) px(ctx, x + 1 + Math.floor(k / 2), top + sag + 1 + k, k > 1 ? c2 : c, 5 - k, 1);
  }
}
