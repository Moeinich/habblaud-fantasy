// Texturas de parede (puras): cada função gera UMA coluna/tile em PixelBuf; o desenho por quadro
// (art/index.ts) só copia esses tiles já convertidos em canvas.
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

// ------------------------------------------------------------------ paredes

/** Altura da face da parede norte e da tampa escura no topo. */
export const WALL_FACE_H = TILE * 2;
export const WALL_CAP_H = 4;
export const BASEBOARD_H = 3;

/** Cor da tampa (viga/sapê no topo da parede), levemente tingida pela cor da parede. */
export function capColor(style: WallStyle): string {
  return mix(style.exterior ? '#5a4630' : '#4a3a26', style.base, 0.1);
}

/** Coluna de 16x32 da face da parede norte (tampa + padrão + rodapé). */
export function wallFaceTile(style: WallStyle, variant: number, col: number): PixelBuf {
  const b = new PixelBuf(TILE, WALL_FACE_H);
  const base = style.base;
  const pattern: WallPattern = style.pattern ?? 'plain';
  const trim = style.trim ?? shade(base, -0.16);
  const cap = capColor(style);
  const fy = WALL_CAP_H;
  const fh = WALL_FACE_H - WALL_CAP_H - BASEBOARD_H;
  const r = rngOf(variant * 31 + col, 43);
  // Face: gradiente sutil (mais claro em cima) e sombra logo abaixo da tampa.
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
      // Pedra bruta: blocos irregulares (alturas 4–5) com argamassa escura e tom por pedra.
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
      // Parede de vidro: face translúcida com montantes; o mundo vê através.
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
      // Frontão de mármore cinza (copa): placas com veios.
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
  // Sombra projetada pela tampa.
  if (pattern !== 'glass') b.hline(0, TILE - 1, fy, shade(base, -0.06));
  // Tampa escura com brilho na aresta.
  // Viga de topo com fibras (sapê/madeira).
  b.rect(0, 0, TILE, WALL_CAP_H, cap);
  b.hline(0, TILE - 1, 0, shade(cap, 0.1));
  for (let x = (col & 1) * 2; x < TILE; x += 4) b.set(x, 1, shade(cap, 0.05));
  b.hline(0, TILE - 1, WALL_CAP_H - 1, shade(cap, -0.08));
  // Rodapé.
  const by = WALL_FACE_H - BASEBOARD_H;
  b.rect(0, by, TILE, BASEBOARD_H, trim);
  b.hline(0, TILE - 1, by, shade(trim, 0.08));
  b.hline(0, TILE - 1, WALL_FACE_H - 1, shade(trim, -0.08));
  return b;
}

/** Tile de 16x16 da parede sul (tampa + mureta). */
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
  }
  if (col % 4 === 3) b.set(TILE - 1, capH + 1, shade(face, -0.03));
  return b;
}
