// Wall textures (pure): each function generates ONE column/tile in a PixelBuf; the per-frame drawing
// (art/index.ts) only copies those tiles, already converted to canvas.
import { TILE, type WallPattern, type WallStyle } from '../api';
import { mix, ramp, shade } from '../core/color';
import { PixelBuf } from '../core/pixbuf';
import { rngOf } from '../furniture/kit';

function speckle(b: PixelBuf, seed: number, n: number, colors: readonly string[]): void {
  const r = rngOf(seed, 91);
  for (let i = 0; i < n; i++) {
    b.set(Math.floor(r() * TILE), Math.floor(r() * TILE * 2), colors[Math.floor(r() * colors.length)]);
  }
}

// ------------------------------------------------------------------ walls

/** Height of the north wall face and of the dark cap on top. */
export const WALL_FACE_H = TILE * 2;
export const WALL_CAP_H = 4;
export const BASEBOARD_H = 3;

/** Colour of the cap (beam/thatch on top of the wall), lightly tinted by the wall colour. */
export function capColor(style: WallStyle): string {
  // Elf groves are roofed by a living canopy: a dark moss-teal cap instead of a timber beam.
  if (style.pattern === 'grove' && !style.exterior) return mix('#2c4038', style.base, 0.12);
  return mix(style.exterior ? '#5a4630' : '#4a3a26', style.base, 0.1);
}

/** Elf silver/moon palette shared by the grove and moonstone walls. */
const SILVER = { hi: '#eef2f8', lt: '#c4ccd8', dk: '#8a92a4' };
const MOONGLOW = '#9ff0e6';
const LEAF = ramp('#4f9a78', 0.08);

/** 16x32 column of the north wall face (cap + pattern + skirting). */
export function wallFaceTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const base = style.base;
  const pattern: WallPattern = style.pattern ?? 'plain';
  const trim = style.trim ?? shade(base, -0.16);
  const cap = capColor(style);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const r = rngOf(variant * 31 + col, 43);
  // Face: subtle gradient (lighter on top) and a shadow just under the cap.
  for (let y = 0; y < fh; y++) b.hline(0, TILE - 1, fy + y, shade(base, 0.02 - (y / fh) * 0.035));
  switch (pattern) {
    case 'stripes': {
      // Alliance half-timber: whitewashed plaster between oak posts, a mid rail, diagonal braces in
      // alternating columns and a painted blue/gold band under the cap.
      const plaster = ramp(mix('#e6dcc4', base, 0.3), 0.04);
      b.rect(0, fy, TILE, fh, plaster.base);
      for (let i = 0; i < 7; i++) b.set(Math.floor(r() * TILE), fy + Math.floor(r() * fh), r() < 0.5 ? plaster.dk : plaster.lt);
      const oak = ramp('#8a6239', 0.06);
      const mid = fy + Math.floor(fh / 2);
      // diagonal brace (alternates direction per column so pairs form a chevron)
      for (let k = 0; k < fh / 2 - 1; k++) {
        const x = col % 2 ? 2 + k : TILE - 3 - k;
        const y = mid + 1 + k;
        if (x < 0 || x >= TILE) continue;
        b.set(x, y, oak.base);
        b.set(x + (col % 2 ? 1 : -1), y, oak.dk);
      }
      // corner post on the column edge
      b.rect(0, fy, 3, fh, oak.base);
      b.vline(0, fy, fy + fh - 1, oak.lt);
      b.vline(2, fy, fy + fh - 1, oak.dk);
      // mid rail
      b.rect(0, mid, TILE, 2, oak.base);
      b.hline(0, TILE - 1, mid, oak.lt);
      b.hline(0, TILE - 1, mid + 1, oak.dk);
      // oak pegs
      b.set(1, mid - 3, oak.dd);
      b.set(1, mid + 4, oak.dd);
      // painted frieze: gold line over a royal blue band
      b.hline(0, TILE - 1, fy + 1, '#e0b23c');
      b.rect(0, fy + 2, TILE, 2, '#2f4f9c');
      if (col % 2 === 0) b.set(8, fy + 2, '#e0b23c');
      break;
    }
    case 'tiles': {
      // Alliance dressed stone: neat ashlar courses (5px tall, 8px blocks, staggered) with a bevel and
      // a painted royal-blue frieze with gold studs a third of the way down.
      const stone = ramp(base, 0.05);
      const mortar = shade(base, -0.22);
      b.rect(0, fy, TILE, fh, mortar);
      for (let ry = 0, row = 0; ry < fh; ry += 5, row++) {
        const off = row % 2 ? 4 : 0;
        for (let x = -off; x < TILE; x += 8) {
          const tone = [stone.base, stone.lt, stone.base, shade(stone.base, -0.03)][(row * 3 + col * 2 + ((x + off) >> 3)) % 4];
          for (let xx = Math.max(0, x); xx < Math.min(TILE, x + 7); xx++) {
            for (let yy = ry; yy < Math.min(fh, ry + 4); yy++) {
              const c = yy === ry ? shade(tone, 0.06) : yy === ry + 3 ? shade(tone, -0.07) : xx === x + 6 ? shade(tone, -0.04) : tone;
              b.set(xx, fy + yy, c);
            }
          }
        }
      }
      const fz = fy + 5;
      b.rect(0, fz, TILE, 4, '#2f4f9c');
      b.hline(0, TILE - 1, fz, '#4a6cc0');
      b.hline(0, TILE - 1, fz + 3, '#22397a');
      b.set(4, fz + 1, '#e0b23c');
      b.set(12, fz + 1, '#e0b23c');
      b.set(4, fz + 2, '#a8801c');
      b.set(12, fz + 2, '#a8801c');
      break;
    }
    case 'wood_panel': {
      // Horde palisade: sharpened vertical logs (4px, lit left / shaded right) whose points show under the
      // cap, a blood-red hide band lashed with black rope and a blackened iron band with rivets near the floor.
      const w = ramp(mix('#4e3420', base, 0.45), 0.06);
      const behind = shade(w.dd, -0.1);
      b.rect(0, fy, TILE, fh, behind);
      for (let x = 0; x < TILE; x += 4) {
        const tone = [w.base, w.lt, w.base, w.dk][((col * 4 + x / 4) * 7) % 4];
        const tip = fy + 1 + (((col * 4 + x / 4) * 5) % 3);
        b.rect(x, tip + 2, 4, fy + fh - tip - 2, tone);
        b.rect(x + 1, tip, 2, 2, tone);
        b.set(x + 1, tip, shade(tone, 0.08));
        b.vline(x, tip + 2, fy + fh - 1, shade(tone, 0.07));
        b.vline(x + 3, tip + 2, fy + fh - 1, shade(tone, -0.12));
        if (r() < 0.6) b.set(x + 1 + Math.floor(r() * 2), fy + 6 + Math.floor(r() * (fh - 8)), shade(tone, -0.1));
        b.vline(x + 2, fy + 6 + Math.floor(r() * 4), fy + 10 + Math.floor(r() * 6), shade(tone, -0.05));
      }
      // red hide band with black lashing
      const band = fy + Math.floor(fh * 0.38);
      b.rect(0, band, TILE, 3, '#9c2f25');
      b.hline(0, TILE - 1, band, '#b8402e');
      b.hline(0, TILE - 1, band + 2, '#6e1f18');
      for (let x = 1; x < TILE; x += 4) {
        b.set(x, band, '#1e1a18');
        b.set(x + 1, band + 1, '#1e1a18');
        b.set(x + 2, band + 2, '#1e1a18');
      }
      // blackened iron band with rivets
      const iron = fy + fh - 5;
      b.rect(0, iron, TILE, 2, '#3a3a40');
      b.hline(0, TILE - 1, iron, '#5a5a62');
      for (let x = 2; x < TILE; x += 8) b.set(x, iron + 1, '#8a8a92');
      break;
    }
    case 'brick': {
      // Rough stone: irregular blocks (heights 4–5) with dark mortar and a tone per stone.
      const stone = ramp(base, 0.05);
      const mortar = shade(base, -0.28);
      b.rect(0, fy, TILE, fh, mortar);
      let y = fy;
      let row = 0;
      while (y < fy + fh) {
        const hgt = 4 + ((row * 3 + col) % 2);
        let x = row % 2 ? -3 : 0;
        while (x < TILE) {
          const bw = 5 + Math.floor(r() * 4);
          const tone = [stone.lt, stone.base, stone.base, stone.dk][Math.floor(r() * 4)];
          for (let xx = Math.max(0, x); xx < Math.min(TILE, x + bw - 1); xx++) {
            for (let yy = y; yy < Math.min(fy + fh, y + hgt - 1); yy++) {
              const edgeTop = yy === y;
              const edgeBot = yy === y + hgt - 2;
              b.set(xx, yy, edgeTop ? shade(tone, 0.06) : edgeBot ? shade(tone, -0.07) : tone);
            }
          }
          x += bw;
        }
        y += hgt;
        row++;
      }
      break;
    }
    case 'glass': {
      // Glass wall: translucent face with mullions; the world shows through.
      b.clearRect(0, fy, TILE, fh);
      b.rect(0, fy, TILE, fh, 'rgba(196,214,190,0.34)');
      b.vline(0, fy, fy + fh - 1, 'rgba(195,202,212,0.95)');
      b.hline(0, TILE - 1, fy, 'rgba(255,255,255,0.45)');
      for (let i = 0; i < fh; i++) {
        const x = (col * 5 + 11 - i) & 15;
        b.set(x, fy + i, 'rgba(255,255,255,0.35)');
        b.set((x + 1) & 15, fy + i, 'rgba(255,255,255,0.18)');
      }
      break;
    }
    case 'marble': {
      // Grey marble backsplash (kitchen): veined plates.
      const m = mix('#8f897d', base, 0.25);
      b.rect(0, fy, TILE, fh, m);
      for (let v = 0; v < 2; v++) {
        let x = r() * TILE;
        for (let y = 0; y < fh; y++) {
          b.set(Math.floor(x) & 15, fy + y, v ? 'rgba(120,126,138,0.4)' : 'rgba(250,250,252,0.55)');
          x += (r() - 0.35) * 1.4;
        }
      }
      for (let i = 0; i < 8; i++) b.set(Math.floor(r() * TILE), fy + Math.floor(r() * fh), r() < 0.5 ? '#a8a296' : '#6a645a');
      b.hline(0, TILE - 1, fy + Math.floor(fh / 2), 'rgba(120,126,138,0.35)');
      if (col % 2 === 1) b.vline(TILE - 1, fy, fy + fh - 1, 'rgba(120,126,138,0.35)');
      break;
    }
    case 'grove': {
      // Elf living grove: two moonwood trunks per column (dark violet-brown bark with vertical fissures), a
      // twisting vine with teal leaves and the odd moon blossom (period 32px = two columns, so it flows across
      // tiles), and a violet band edged in silver with a crescent per column under the canopy.
      const bark = ramp(mix('#5a4058', base, 0.55), 0.06);
      b.rect(0, fy, TILE, fh, shade(bark.dd, -0.15));
      for (const [tx, tw] of [[0, 8], [8, 8]] as const) {
        const tone = [bark.base, bark.lt, bark.base, bark.dk][(col * 2 + tx / 8 + variant) % 4];
        b.rect(tx, fy, tw - 1, fh, tone);
        b.vline(tx, fy, fy + fh - 1, shade(tone, 0.07));
        b.vline(tx + tw - 2, fy, fy + fh - 1, shade(tone, -0.12));
        // bark fissures: broken vertical streaks
        for (let k = 0; k < 3; k++) {
          const xx = tx + 2 + Math.floor(r() * (tw - 4));
          const y0 = fy + 6 + Math.floor(r() * (fh - 10));
          b.vline(xx, y0, Math.min(fy + fh - 1, y0 + 2 + Math.floor(r() * 5)), shade(tone, -0.1));
        }
        b.set(tx + 2 + Math.floor(r() * 3), fy + 8 + Math.floor(r() * 10), shade(tone, 0.1));
      }
      // violet band with silver edges and a crescent per column
      const band = fy + 1;
      b.hline(0, TILE - 1, band, SILVER.lt);
      b.rect(0, band + 1, TILE, 3, '#5a3a78');
      b.hline(0, TILE - 1, band + 1, '#6e4a90');
      b.hline(0, TILE - 1, band + 4, SILVER.dk);
      b.hline(6, 7, band + 1, SILVER.hi);
      b.set(5, band + 2, SILVER.lt);
      b.hline(6, 7, band + 3, SILVER.dk);
      // twisting vine with leaves (continuous across the 2-column period)
      const mid = fy + Math.floor(fh * 0.55);
      for (let x = 0; x < TILE; x++) {
        const wx = col * TILE + x;
        const vy = mid + Math.round(3 * Math.sin((wx / 32) * Math.PI * 2));
        b.set(x, vy, '#3e5a3a');
        b.set(x, vy + 1, '#2c4430');
        if (wx % 6 === 2) {
          const up = wx % 12 === 2 ? -1 : 1;
          b.set(x, vy + up * 2, LEAF.lt);
          b.set(x + 1, vy + up * 2, LEAF.base);
          b.set(x, vy + up, LEAF.base);
          b.set(x + 1, vy + up * 3, LEAF.hi);
        }
      }
      // a moon blossom on one column of the pair
      if (col === 1) {
        const by = mid + Math.round(3 * Math.sin(((TILE + 11) / 32) * Math.PI * 2)) - 3;
        b.set(11, by, MOONGLOW);
        b.set(10, by, '#c8a8f0');
        b.set(12, by, '#c8a8f0');
        b.set(11, by - 1, '#c8a8f0');
        b.set(11, by + 1, '#e8d8ff');
      }
      break;
    }
    case 'moonstone': {
      // Elf moonstone: big rounded violet-grey blocks (courses 7px tall, 16px wide, staggered) with soft bevels,
      // moss growing on their top edges, a dark frieze of moon phases in silver under the cap and, on alternating
      // columns, a carved crescent glyph glowing with moonlight.
      const stone = ramp(mix('#7a7088', base, 0.5), 0.05);
      const joint = shade(stone.dd, -0.12);
      b.rect(0, fy, TILE, fh, joint);
      const fz = fy + 5;
      for (let ry = fz, row = 0; ry < fy + fh; ry += 7, row++) {
        const off = row % 2 ? 8 : 0;
        for (let x = -off; x < TILE; x += 16) {
          const tone = [stone.base, stone.lt, stone.base, shade(stone.base, -0.04)][(row + col + variant + ((x + off) >> 4)) % 4];
          for (let xx = Math.max(0, x); xx < Math.min(TILE, x + 15); xx++) {
            for (let yy = ry; yy < Math.min(fy + fh, ry + 6); yy++) {
              const corner = (xx === x || xx === x + 14) && (yy === ry || yy === ry + 5);
              if (corner) continue;
              const c = yy === ry ? shade(tone, 0.07) : yy === ry + 5 ? shade(tone, -0.08) : xx === x + 14 ? shade(tone, -0.05) : xx === x ? shade(tone, 0.03) : tone;
              b.set(xx, yy, c);
            }
          }
          // moss on the top edge, dripping a little
          const mh = rngOf(variant * 7 + col * 3 + row, 77);
          if (mh() < 0.6) {
            const mx = x + 2 + Math.floor(mh() * 8);
            const ml = 3 + Math.floor(mh() * 4);
            for (let xx = mx; xx < mx + ml; xx++) {
              if (xx < 0 || xx >= TILE) continue;
              b.set(xx, ry, xx % 2 ? '#5a7a4c' : '#6a8a56');
              if ((xx + row) % 3 === 0) b.set(xx, ry + 1, '#4c6c44');
            }
          }
        }
      }
      // frieze: dark strip with moon phases (new, crescent, half, full) in silver
      b.rect(0, fy, TILE, 5, shade(stone.dd, -0.2));
      b.hline(0, TILE - 1, fy + 4, SILVER.dk);
      const phase = col * 2;
      for (const [k, px] of [[0, 3], [1, 11]] as const) {
        const p = (phase + k) % 4;
        const cx = px;
        const cy = fy + 2;
        b.set(cx, cy - 1, SILVER.dk);
        b.set(cx - 1, cy, SILVER.dk);
        b.set(cx + 1, cy, SILVER.dk);
        b.set(cx, cy + 1, SILVER.dk);
        if (p >= 1) {
          b.set(cx - 1, cy, SILVER.hi);
          b.set(cx, cy - 1, SILVER.lt);
        }
        if (p >= 2) b.set(cx, cy, SILVER.lt);
        if (p >= 3) {
          b.set(cx + 1, cy, SILVER.hi);
          b.set(cx, cy + 1, SILVER.lt);
          b.set(cx, cy, MOONGLOW);
        }
      }
      // carved crescent glyph glowing on even columns
      if (col === 0) {
        const gx = 6;
        const gy = fy + 14;
        b.hline(gx + 1, gx + 2, gy, MOONGLOW);
        b.set(gx, gy + 1, MOONGLOW);
        b.set(gx, gy + 2, '#6ad0c8');
        b.set(gx, gy + 3, '#6ad0c8');
        b.hline(gx + 1, gx + 2, gy + 4, '#4fb0a8');
        b.set(gx + 1, gy + 1, '#ffffff');
        b.set(gx + 3, gy - 1, 'rgba(159,240,230,0.35)');
        b.set(gx - 1, gy + 2, 'rgba(159,240,230,0.35)');
        b.set(gx + 3, gy + 5, 'rgba(159,240,230,0.35)');
      }
      break;
    }
    case 'plain':
      // Rough plaster (lime-washed daub): a few blemishes; interior plaster gets an oak picture rail.
      speckle(b, variant * 13 + col, style.exterior ? 5 : 8, [shade(base, -0.04), shade(base, 0.03)]);
      if (!style.exterior) {
        const rail = fy + 4;
        b.rect(0, rail, TILE, 2, style.trim ?? '#8a6239');
        b.hline(0, TILE - 1, rail, shade(style.trim ?? '#8a6239', 0.1));
        b.set(col % 2 ? 3 : 11, rail + 1, '#e0b23c');
      }
      break;
  }
  // Shadow cast by the cap.
  if (pattern !== 'glass') b.hline(0, TILE - 1, fy, shade(base, -0.06));
  // Dark cap with a highlight on the edge.
  // Top beam with fibres (thatch/wood).
  b.rect(0, 0, TILE, WALL_CAP_H, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.1));
  for (let x = (col & 1) * 2; x < TILE; x += 4) b.set(x, 1, shade(cap, 0.05));
  b.hline(0, TILE - 1, WALL_CAP_H - 1, shade(cap, -0.08));
  if (pattern === 'grove' && !style.exterior) {
    // canopy: leaf tufts along the cap, a few hanging over the face
    for (let x = (col & 1) * 3; x < TILE; x += 5) {
      b.set(x, 1, LEAF.base);
      b.set(x + 1, 2, LEAF.lt);
      b.set(x + 1, WALL_CAP_H, LEAF.dk);
    }
    b.set(col ? 4 : 12, WALL_CAP_H + 1, LEAF.base);
  }
  // Skirting.
  const by = WALL_FACE_H - BASEBOARD_H;
  b.rect(0, by, TILE, BASEBOARD_H, trim);
  b.hline(0, TILE - 1, by, shade(trim, 0.08));
  b.hline(0, TILE - 1, WALL_FACE_H - 1, shade(trim, -0.08));
  return b;
}

/** 16x16 tile of the south wall (cap + low wall). */
export function southWallTile(style: WallStyle, col: number): PixelBuf {
  const b = new PixelBuf(TILE, TILE);
  const cap = capColor(style);
  const capH = 6;
  b.rect(0, 0, TILE, capH, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.08));
  b.hline(0, TILE - 1, capH - 1, shade(cap, -0.05));
  const face = shade(style.base, -0.05);
  b.rect(0, capH, TILE, TILE - capH, face);
  b.hline(0, TILE - 1, capH, shade(face, -0.06));
  const trim = style.trim ?? shade(style.base, -0.16);
  b.rect(0, TILE - 2, TILE, 2, trim);
  b.hline(0, TILE - 1, TILE - 2, shade(trim, 0.06));
  if (style.pattern === 'brick' || style.exterior) {
    for (let y = capH + 2; y < TILE - 2; y += 3) b.hline(0, TILE - 1, y, shade(face, -0.035));
  } else if (style.pattern === 'grove') {
    // bark fissures and a leaf on the low wall
    for (const x of [3, 7, 12]) b.vline(x, capH + 2 + (x % 3), TILE - 4, shade(face, -0.08));
    if (col % 2 === 0) {
      b.set(9, capH + 2, LEAF.lt);
      b.set(10, capH + 2, LEAF.base);
      b.set(10, capH + 3, LEAF.dk);
    }
    b.hline(0, TILE - 1, TILE - 3, SILVER.dk);
  } else if (style.pattern === 'moonstone') {
    // stone courses with a moss tuft
    b.hline(0, TILE - 1, capH + 4, shade(face, -0.08));
    b.vline(col % 2 ? 4 : 12, capH + 1, capH + 3, shade(face, -0.08));
    b.vline(col % 2 ? 10 : 2, capH + 5, TILE - 3, shade(face, -0.08));
    if (col % 4 === 1) b.hline(5, 8, capH, '#5a7a4c');
  }
  if (col % 4 === 3) b.set(TILE - 1, capH + 1, shade(face, -0.03));
  return b;
}
