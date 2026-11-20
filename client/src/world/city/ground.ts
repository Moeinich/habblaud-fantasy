// Chão da cidade (navegador), no tema de acampamento de fantasia: a célula de quarteirão desenhada UMA vez e repetida
// em todos os quarteirões (estrada de terra com sulcos de roda, pinguelas de tábua nas travessias, beira de pedras,
// gramado dos lotes cercado de madeira), a célula da praça (terreiro de lajes, círculo de pedras em volta da fonte,
// canteiros com borda de toras), o chão dos jardins dos lotes vazios (trilhas, lago, deck, canteiros de pomar) e os
// sprites próprios da cidade (a fonte de pedra rúnica, o cocho de flores). Árvores, postes e bancos vêm de
// render/props.ts (os do escritório).
import { TILE, type ArtModule } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { BLOCK_TILES, DOOR, FOUNTAIN, LOT, SIDEWALK } from '../../../../shared/world/city';
import { cellSurfaces, type GardenKind } from './layout';

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const T = (n: number) => n * TILE;

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // arte incompleta não derruba a cidade
  }
}

/** Grama ~15% menos saturada, como a área externa do escritório. */
function desaturate(ctx: Ctx, x: number, y: number, w: number, h: number, k = 0.16): void {
  ctx.save();
  try {
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = `rgba(128,128,128,${k})`;
    ctx.fillRect(x, y, w, h);
  } catch {
    // sem o modo de mistura
  }
  ctx.restore();
}

/** Beira de pedras: borda clara do caminho e a face escura virada para a estrada. */
function curb(ctx: Ctx, x: number, y: number, w: number, h: number, side: 'n' | 's' | 'w' | 'e'): void {
  const light = '#b8ab90';
  const face = '#7a6e5a';
  const dark = '#4a3f32';
  if (side === 's') {
    ctx.fillStyle = light;
    ctx.fillRect(x, y + h - 3, w, 1);
    ctx.fillStyle = face;
    ctx.fillRect(x, y + h - 2, w, 2);
    ctx.fillStyle = dark;
    ctx.fillRect(x, y + h, w, 1);
  } else if (side === 'n') {
    ctx.fillStyle = dark;
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = light;
    ctx.fillRect(x, y + 1, w, 1);
  } else if (side === 'e') {
    ctx.fillStyle = light;
    ctx.fillRect(x + w - 2, y, 1, h);
    ctx.fillStyle = face;
    ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = 'rgba(40,28,18,0.35)';
    ctx.fillRect(x + w, y, 1, h);
  } else {
    ctx.fillStyle = 'rgba(40,28,18,0.35)';
    ctx.fillRect(x - 1, y, 1, h);
    ctx.fillStyle = face;
    ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = light;
    ctx.fillRect(x + 1, y, 1, h);
  }
}

/** Estrada: terra batida, sulcos de roda dos dois lados do meio, pinguelas de tábua nas travessias, poças e pedras. */
function paintStreets(art: ArtModule, ctx: Ctx, seed: number): void {
  const s = cellSurfaces();
  for (const r of [...s.streets, s.intersection]) safe(() => art.drawFloor(ctx, 'street', T(r.x), T(r.y), T(r.w), T(r.h), { seed: 13 }));
  // beira da estrada escurecida junto às pedras
  ctx.fillStyle = 'rgba(40,26,14,0.2)';
  const ow = T(s.sidewalkOuter.w);
  const oh = T(s.sidewalkOuter.h);
  ctx.fillRect(ow, 0, 3, oh);
  ctx.fillRect(0, oh, ow, 3);
  // sulcos de roda: duas trilhas escuras e uma faixa de capim no meio
  const rng = mulberry32(seed);
  for (const [x0, y0, x1, y1] of s.laneMarks) {
    const horiz = y0 === y1;
    const len = horiz ? T(x1) - T(x0) : T(y1) - T(y0);
    for (let i = 0; i < len; i++) {
      const wob = Math.round(Math.sin(i * 0.07 + seed) * 1.2);
      for (const off of [-9, 8]) {
        ctx.fillStyle = (i + off) % 17 < 2 ? 'rgba(46,30,16,0.28)' : 'rgba(46,30,16,0.42)';
        if (horiz) ctx.fillRect(T(x0) + i, T(y0) + off + wob, 1, 2);
        else ctx.fillRect(T(x0) + off + wob, T(y0) + i, 2, 1);
        ctx.fillStyle = 'rgba(255,236,200,0.12)';
        if (horiz) ctx.fillRect(T(x0) + i, T(y0) + off + wob + 2, 1, 1);
        else ctx.fillRect(T(x0) + off + wob + 2, T(y0) + i, 1, 1);
      }
      if (rng() < 0.22) {
        ctx.fillStyle = rng() < 0.5 ? 'rgba(96,122,58,0.7)' : 'rgba(128,148,72,0.6)';
        const k = Math.floor(rng() * 5) - 2;
        if (horiz) ctx.fillRect(T(x0) + i, T(y0) + k, 1, 2);
        else ctx.fillRect(T(x0) + k, T(y0) + i, 2, 1);
      }
    }
  }
  // pinguelas: tábuas atravessadas sobre a lama, com as pontas escuras
  for (const cw of s.crosswalks) {
    const r = cw.rect;
    if (cw.across === 'ns') {
      for (let y = T(r.y) + 3; y < T(r.y + r.h) - 4; y += 6) {
        ctx.fillStyle = '#4a321e';
        ctx.fillRect(T(r.x) + 3, y, T(r.w) - 6, 5);
        ctx.fillStyle = (y >> 1) % 3 === 0 ? '#a07a4e' : '#8e6a42';
        ctx.fillRect(T(r.x) + 4, y, T(r.w) - 8, 4);
        ctx.fillStyle = '#c49a68';
        ctx.fillRect(T(r.x) + 4, y, T(r.w) - 8, 1);
        ctx.fillStyle = '#2a1c14';
        ctx.fillRect(T(r.x) + 6, y + 2, 1, 1);
        ctx.fillRect(T(r.x + r.w) - 7, y + 2, 1, 1);
      }
    } else {
      for (let x = T(r.x) + 3; x < T(r.x + r.w) - 4; x += 6) {
        ctx.fillStyle = '#4a321e';
        ctx.fillRect(x, T(r.y) + 3, 5, T(r.h) - 6);
        ctx.fillStyle = (x >> 1) % 3 === 0 ? '#a07a4e' : '#8e6a42';
        ctx.fillRect(x, T(r.y) + 4, 4, T(r.h) - 8);
        ctx.fillStyle = '#c49a68';
        ctx.fillRect(x, T(r.y) + 4, 1, T(r.h) - 8);
        ctx.fillStyle = '#2a1c14';
        ctx.fillRect(x + 2, T(r.y) + 6, 1, 1);
        ctx.fillRect(x + 2, T(r.y + r.h) - 7, 1, 1);
      }
    }
  }
  // poças e pedras soltas na estrada
  for (let i = 0; i < 3; i++) {
    const x = T(4 + Math.floor(rng() * 36));
    const y = oh + 6 + Math.floor(rng() * 14);
    ctx.fillStyle = 'rgba(40,28,18,0.45)';
    ctx.beginPath();
    ctx.ellipse(x + 7, y + 3, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(110,140,170,0.55)';
    ctx.beginPath();
    ctx.ellipse(x + 7, y + 3, 6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220,235,245,0.6)';
    ctx.fillRect(x + 4, y + 2, 3, 1);
  }
  for (let i = 0; i < 6; i++) {
    const x = ow + 4 + Math.floor(rng() * (T(5) - 8));
    const y = T(2 + Math.floor(rng() * 30));
    ctx.fillStyle = '#5e5648';
    ctx.fillRect(x, y + 1, 4, 2);
    ctx.fillStyle = '#9a917e';
    ctx.fillRect(x, y, 3, 2);
  }
}

/** Caminho de cascalho (anel em volta do quarteirão) com a beira de pedras. */
function paintSidewalkRing(art: ArtModule, ctx: Ctx): void {
  const s = cellSurfaces();
  const o = s.sidewalkOuter;
  safe(() => art.drawFloor(ctx, 'sidewalk', T(o.x), T(o.y), T(o.w), T(o.h), { seed: 12 }));
  // meio-fio nas quatro bordas externas
  curb(ctx, 0, 0, T(o.w), 2, 'n');
  curb(ctx, 0, T(o.h) - 3, T(o.w), 3, 's');
  curb(ctx, 0, 0, 2, T(o.h), 'w');
  curb(ctx, T(o.w) - 3, 0, 3, T(o.h), 'e');
}

/** Gramado dos lotes, com a cerca de madeira em volta do quarteirão e a divisa sutil entre os lotes. */
function paintLotsGround(art: ArtModule, ctx: Ctx): void {
  const s = cellSurfaces();
  const b = s.block;
  safe(() => art.drawFloor(ctx, 'grass', T(b.x), T(b.y), T(b.w), T(b.h), { seed: 11 }));
  desaturate(ctx, T(b.x), T(b.y), T(b.w), T(b.h));
  // divisas (linha de grama mais escura)
  ctx.fillStyle = 'rgba(52,64,30,0.22)';
  for (const r of s.lots) {
    ctx.fillRect(T(r.x + r.w) - 1, T(r.y), 1, T(r.h));
    ctx.fillRect(T(r.x), T(r.y + r.h) - 1, T(r.w), 1);
  }
  // cerca de madeira: duas travessas e um mourão a cada tile
  const x = T(b.x);
  const y = T(b.y);
  const w = T(b.w);
  const h = T(b.h);
  ctx.fillStyle = '#4a321e';
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x, y, 2, h);
  ctx.fillRect(x + w - 2, y, 2, h);
  ctx.fillStyle = '#8e6a42';
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 2, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 2, y, 1, h);
  ctx.fillStyle = '#2e1e12';
  for (let px = x; px < x + w; px += TILE) {
    ctx.fillRect(px, y, 2, 3);
    ctx.fillRect(px, y + h - 3, 2, 3);
  }
  for (let py = y; py < y + h; py += TILE) {
    ctx.fillRect(x, py, 3, 2);
    ctx.fillRect(x + w - 3, py, 3, 2);
  }
  // porteiras dos lotes (abertura da cerca diante das portas)
  for (const r of s.lots) {
    const north = r.y === b.y;
    const gx = T(r.x + DOOR.dx);
    safe(() => art.drawFloor(ctx, 'sidewalk', gx, north ? y : y + h - 2, T(DOOR.w), 2, { seed: 12 }));
  }
}

/** A célula de um quarteirão comum (todas iguais). */
export function cellCanvas(art: ArtModule): HTMLCanvasElement {
  const s = cellSurfaces();
  const [c, ctx] = canvas(T(s.sidewalkOuter.w + s.streets[0]!.w), T(s.sidewalkOuter.h + s.streets[1]!.h));
  paintStreets(art, ctx, 77);
  paintSidewalkRing(art, ctx);
  paintLotsGround(art, ctx);
  return c;
}

/** A célula da praça: terreiro de lajes, círculo de pedras em pé em volta da fonte, canteiros com borda de toras. */
export function plazaCanvas(art: ArtModule): HTMLCanvasElement {
  const s = cellSurfaces();
  const [c, ctx] = canvas(T(s.sidewalkOuter.w + s.streets[0]!.w), T(s.sidewalkOuter.h + s.streets[1]!.h));
  paintStreets(art, ctx, 99);
  paintSidewalkRing(art, ctx);
  const b = s.block;
  const bx = T(b.x);
  const by = T(b.y);
  const bw = T(b.w);
  const bh = T(b.h);
  // terreiro: o cascalho do caminho num tom mais quente, com uma borda de toras em volta
  safe(() => art.drawFloor(ctx, 'sidewalk', bx, by, bw, bh, { seed: 23 }));
  ctx.fillStyle = 'rgba(150,100,50,0.12)';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = '#4a321e';
  ctx.fillRect(bx + T(1), by + T(1), bw - T(2), 3);
  ctx.fillRect(bx + T(1), by + bh - T(1) - 3, bw - T(2), 3);
  ctx.fillRect(bx + T(1), by + T(1), 3, bh - T(2));
  ctx.fillRect(bx + bw - T(1) - 3, by + T(1), 3, bh - T(2));
  ctx.fillStyle = '#8e6a42';
  ctx.fillRect(bx + T(1), by + T(1), bw - T(2), 1);
  ctx.fillRect(bx + T(1), by + T(1), 1, bh - T(2));
  // trilhas de lajes ligando as quatro saídas ao círculo da fonte
  const fcx = bx + T(FOUNTAIN.x + FOUNTAIN.w / 2);
  const fcy = by + T(FOUNTAIN.y + FOUNTAIN.h / 2);
  const flags = (x: number, y: number, w: number, h: number, seed: number) => {
    const rng = mulberry32(seed);
    const horiz = w > h;
    const len = horiz ? w : h;
    for (let i = 0; i < len; ) {
      const step = 8 + Math.floor(rng() * 6);
      const across = horiz ? h : w;
      for (let j = 0; j < across; ) {
        const sj = 8 + Math.floor(rng() * 7);
        const ww = Math.min(step - 1, len - i - 1);
        const hh = Math.min(sj - 1, across - j - 1);
        if (ww > 1 && hh > 1) {
          const tone = rng() < 0.4 ? '#a89c84' : rng() < 0.7 ? '#958a74' : '#b8ad94';
          ctx.fillStyle = '#5e5446';
          if (horiz) ctx.fillRect(x + i, y + j, ww + 1, hh + 1);
          else ctx.fillRect(x + j, y + i, hh + 1, ww + 1);
          ctx.fillStyle = tone;
          if (horiz) ctx.fillRect(x + i, y + j, ww, hh);
          else ctx.fillRect(x + j, y + i, hh, ww);
          ctx.fillStyle = 'rgba(255,245,220,0.35)';
          if (horiz) ctx.fillRect(x + i, y + j, ww, 1);
          else ctx.fillRect(x + j, y + i, hh, 1);
        }
        j += sj;
      }
      i += step;
    }
  };
  flags(fcx - T(1.5), by + T(1) + 3, T(3), bh - T(2) - 6, 51);
  flags(bx + T(1) + 3, fcy - T(1.5), bw - T(2) - 6, T(3), 52);
  // canteiros de grama nos quatro cantos, com borda de toras
  const beds: [number, number, number, number][] = [
    [2, 2, 10, 6],
    [b.w - 12, 2, 10, 6],
    [2, b.h - 8, 10, 6],
    [b.w - 12, b.h - 8, 10, 6],
  ];
  for (const [x, y, w, h] of beds) {
    const px = bx + T(x);
    const py = by + T(y);
    ctx.fillStyle = '#4a321e';
    ctx.fillRect(px - 2, py - 2, T(w) + 4, T(h) + 4);
    ctx.fillStyle = '#8e6a42';
    ctx.fillRect(px - 2, py - 2, T(w) + 4, 1);
    ctx.fillStyle = '#c49a68';
    for (let k = px; k < px + T(w); k += 12) ctx.fillRect(k, py - 2, 2, 2);
    safe(() => art.drawFloor(ctx, 'grass', px, py, T(w), T(h), { seed: 31 }));
    desaturate(ctx, px, py, T(w), T(h));
  }
  // o círculo de lajes em volta da fonte, com a borda de pedra e as pedras em pé
  const f = FOUNTAIN;
  const cx = bx + T(f.x + f.w / 2);
  const cy = by + T(f.y + f.h / 2);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, T(7), T(5.2), 0, 0, Math.PI * 2);
  ctx.clip();
  safe(() => art.drawFloor(ctx, 'marble', cx - T(8), cy - T(6), T(16), T(12), { seed: 41 }));
  ctx.restore();
  ctx.strokeStyle = '#5e5446';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, T(7) - 1, T(5.2) - 1, 0, 0, Math.PI * 2);
  ctx.stroke();
  // anel de runas entalhadas em volta da bacia
  ctx.strokeStyle = 'rgba(110,70,170,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([2, 5, 4, 3]);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, T(4.8), T(3.4), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,240,210,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 1, T(7) - 2, T(5.2) - 2, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
  // lajes rúnicas deitadas no anel (oito, como os pontos da rosa dos ventos)
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    const sx = Math.round(cx + Math.cos(a) * (T(7) - 6));
    const sy = Math.round(cy + Math.sin(a) * (T(5.2) - 5));
    ctx.fillStyle = '#4a4238';
    ctx.fillRect(sx - 5, sy - 3, 10, 7);
    ctx.fillStyle = '#7a756a';
    ctx.fillRect(sx - 4, sy - 3, 8, 6);
    ctx.fillStyle = '#a8a397';
    ctx.fillRect(sx - 4, sy - 3, 8, 1);
    ctx.fillStyle = '#6a4aa8';
    ctx.fillRect(sx - 1, sy - 1, 1, 3);
    ctx.fillRect(sx - 2, sy, 3, 1);
    ctx.fillRect(sx + 1, sy - 1, 1, 1);
  }
  // emblema do sol ao sul (onde se nasce): pedras ocres em estrela
  const sx = bx + T(21) + 8;
  const sy = by + T(15) + 8;
  ctx.fillStyle = '#8a6a3a';
  ctx.beginPath();
  ctx.moveTo(sx, sy - 12);
  ctx.lineTo(sx + 4, sy);
  ctx.lineTo(sx, sy + 12);
  ctx.lineTo(sx - 4, sy);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx - 12, sy);
  ctx.lineTo(sx, sy - 4);
  ctx.lineTo(sx + 12, sy);
  ctx.lineTo(sx, sy + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c49a3c';
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c25a';
  ctx.fillRect(sx - 1, sy - 11, 2, 6);
  return c;
}

/** Chão de um jardim (lote vazio), por cima do gramado: caminho do portão, lago, deck ou canteiros. */
export function gardenCanvas(art: ArtModule, kind: GardenKind, north: boolean, seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(T(LOT.w), T(LOT.h));
  const gx = T(DOOR.dx);
  const path = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = '#6e6454';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    safe(() => art.drawFloor(ctx, 'sidewalk', x, y, w, h, { seed: 12 + seed % 3 }));
  };
  const midY = T(LOT.h / 2);
  switch (kind) {
    case 'park': {
      // caminho do portão até o meio, e uma cruz
      if (north) path(gx, 0, T(2), midY + 8);
      else path(gx, midY - 8, T(2), T(LOT.h) - midY + 8);
      path(T(2), midY - 8, T(10), T(1));
      // canteiro redondo no centro
      ctx.fillStyle = '#6a4b35';
      ctx.beginPath();
      ctx.ellipse(T(7), midY + 14, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a5636';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 'pond': {
      if (north) path(gx, 0, T(2), T(2));
      else path(gx, T(LOT.h - 2), T(2), T(2));
      const cx = T(7);
      const cy = midY + (north ? 4 : -4);
      ctx.fillStyle = '#6e6a5e';
      ctx.beginPath();
      ctx.ellipse(cx, cy, T(4.6), T(2.8), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f6a7a';
      ctx.beginPath();
      ctx.ellipse(cx, cy, T(4.6) - 3, T(2.8) - 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4a8a94';
      ctx.beginPath();
      ctx.ellipse(cx - 6, cy - 6, T(3), T(1.4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const [x, y] of [
        [cx - 30, cy - 4],
        [cx + 12, cy + 6],
        [cx + 28, cy - 8],
      ]) ctx.fillRect(x!, y!, 5, 1);
      // vitórias-régias
      ctx.fillStyle = '#4b8a45';
      for (const [x, y] of [
        [cx + 20, cy + 3],
        [cx - 22, cy + 8],
      ]) {
        ctx.beginPath();
        ctx.ellipse(x!, y!, 4, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f28fb0';
      ctx.fillRect(cx + 19, cy + 2, 2, 1);
      break;
    }
    case 'orchard': {
      ctx.fillStyle = 'rgba(106,75,53,0.55)';
      for (let j = 0; j < 2; j++) ctx.fillRect(T(1), T((north ? 3.4 : 2.4) + j * 4.4), T(12), 6);
      if (north) path(gx, 0, T(2), T(1.4));
      else path(gx, T(LOT.h - 1.4), T(2), T(1.4));
      break;
    }
    case 'cafe': {
      // deck de tábuas com borda de toras e a trilha da porteira
      ctx.fillStyle = '#4a321e';
      ctx.fillRect(T(2) - 2, midY - T(2) - 2, T(10) + 4, T(4) + 4);
      safe(() => art.drawFloor(ctx, 'wood', T(2), midY - T(2), T(10), T(4), { seed: 8 }));
      if (north) path(gx, 0, T(2), midY - T(2));
      else path(gx, midY + T(2), T(2), T(LOT.h) - midY - T(2));
      break;
    }
  }
  return c;
}

/**
 * Fonte da praça (bloqueia 4 × 3 tiles; o desenho passa um pouco para os lados): a nascente sagrada do acampamento,
 * bacia octogonal de pedra bruta com musgo, água, e um pilar entalhado com duas bacias de pedra e um cristal no topo.
 * A água que pula e as ondinhas são desenhadas por quadro (scene.ts), a partir de `water` (centro da bacia) e `jet`
 * (topo da bacia de cima).
 */
export function fountainCanvas(): { canvas: HTMLCanvasElement; ax: number; ay: number; water: { x: number; y: number; rx: number; ry: number }; jet: { x: number; y: number } } {
  const w = T(6);
  const h = T(5);
  const [c, ctx] = canvas(w, h);
  const cx = w / 2;
  const base = h - 2;
  const rx = T(2.9);
  const ry = T(1.75);
  const wall = 7;
  const cy = base - wall - ry;
  const oct = (ox: number, oy: number, ax: number, ay: number) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      const x = ox + Math.cos(a) * ax;
      const y = oy + Math.sin(a) * ay;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const rng = mulberry32(17);
  // sombra no chão
  ctx.fillStyle = 'rgba(30,20,12,0.24)';
  oct(cx + 4, cy + wall + 3, rx + 2, ry + 1);
  ctx.fill();
  // mureta de pedra bruta (face) e tampa
  ctx.fillStyle = '#4e483e';
  oct(cx, cy + wall, rx, ry);
  ctx.fill();
  ctx.fillRect(cx - rx * 0.92, cy, rx * 1.84, wall);
  ctx.fillStyle = '#7a7266';
  ctx.fillRect(cx - rx * 0.92, cy + 1, rx * 1.84, wall - 3);
  // blocos da face, com juntas escuras e musgo embaixo
  for (let x = Math.round(cx - rx * 0.9), k = 0; x < cx + rx * 0.9; x += 7 + (k % 3), k++) {
    ctx.fillStyle = '#4e483e';
    ctx.fillRect(x, cy + 1, 1, wall - 3);
    ctx.fillStyle = k % 2 ? '#8a8276' : '#6e665a';
    ctx.fillRect(x + 1, cy + 1, 5, 1);
    if (rng() < 0.6) {
      ctx.fillStyle = '#5d7a3a';
      ctx.fillRect(x + 1, cy + wall - 3, 3 + Math.floor(rng() * 3), 1);
    }
  }
  ctx.fillStyle = '#9a9284';
  oct(cx, cy, rx, ry);
  ctx.fill();
  ctx.fillStyle = '#b4ac9c';
  oct(cx, cy - 1, rx - 2, ry - 1.5);
  ctx.fill();
  // água (um verde-azulado de nascente)
  ctx.fillStyle = '#2a6a78';
  oct(cx, cy + 1, rx - 6, ry - 5);
  ctx.fill();
  ctx.fillStyle = '#3a8494';
  oct(cx, cy, rx - 8, ry - 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,230,230,0.5)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35, cy - ry * 0.3, rx * 0.32, ry * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // pilar entalhado, bacia de baixo, coluna e bacia de cima
  const p1 = cy - 3;
  ctx.fillStyle = '#5e574c';
  ctx.fillRect(cx - 4, p1 - 10, 8, 12);
  ctx.fillStyle = '#9a9284';
  ctx.fillRect(cx - 4, p1 - 10, 3, 12);
  ctx.fillStyle = '#7f5cd0';
  ctx.fillRect(cx, p1 - 7, 1, 4);
  ctx.fillRect(cx - 1, p1 - 6, 3, 1);
  const bowl = (y: number, r: number) => {
    ctx.fillStyle = '#4e483e';
    ctx.beginPath();
    ctx.ellipse(cx, y + 2, r, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a8a092';
    ctx.beginPath();
    ctx.ellipse(cx, y, r, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a8494';
    ctx.beginPath();
    ctx.ellipse(cx, y, r - 3, r * 0.32 - 2, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  bowl(p1 - 11, 15);
  ctx.fillStyle = '#5e574c';
  ctx.fillRect(cx - 2, p1 - 24, 4, 13);
  ctx.fillStyle = '#9a9284';
  ctx.fillRect(cx - 2, p1 - 24, 2, 13);
  ctx.fillStyle = '#5d7a3a';
  ctx.fillRect(cx - 2, p1 - 14, 2, 2);
  bowl(p1 - 25, 8);
  // cristal violeta no topo
  ctx.fillStyle = '#3a2a6a';
  ctx.fillRect(cx - 2, p1 - 32, 5, 7);
  ctx.fillStyle = '#7f5cd0';
  ctx.fillRect(cx - 1, p1 - 31, 3, 6);
  ctx.fillStyle = '#c8b4ff';
  ctx.fillRect(cx - 1, p1 - 31, 1, 3);
  ctx.fillRect(cx, p1 - 33, 1, 2);
  return { canvas: c, ax: Math.round(cx), ay: base, water: { x: cx, y: cy, rx: rx - 8, ry: ry - 7 }, jet: { x: cx, y: p1 - 31 } };
}

/** Cocho de madeira com flores do campo. */
export function planterCanvas(seed: number): { canvas: HTMLCanvasElement; ax: number; ay: number } {
  const [c, ctx] = canvas(24, 16);
  const rng = mulberry32(seed);
  ctx.fillStyle = 'rgba(30,20,12,0.22)';
  ctx.fillRect(3, 13, 20, 2);
  ctx.fillStyle = '#2a1c14';
  ctx.fillRect(1, 6, 22, 9);
  ctx.fillStyle = '#7a5032';
  ctx.fillRect(2, 7, 20, 7);
  ctx.fillStyle = '#946240';
  ctx.fillRect(2, 7, 20, 1);
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(2, 10, 20, 1);
  ctx.fillStyle = '#4a4a52';
  ctx.fillRect(5, 7, 1, 7);
  ctx.fillRect(18, 7, 1, 7);
  ctx.fillStyle = '#3e2a1a';
  ctx.fillRect(3, 6, 18, 2);
  const cols = ['#c94a3a', '#e8c25a', '#c9a0d8', '#f0e8d0', '#7f5cd0'];
  for (let i = 0; i < 14; i++) {
    const x = 3 + Math.floor(rng() * 18);
    const y = 1 + Math.floor(rng() * 6);
    ctx.fillStyle = '#4e6b2e';
    ctx.fillRect(x, y + 1, 1, 2);
    ctx.fillStyle = cols[Math.floor(rng() * cols.length)]!;
    ctx.fillRect(x, y, 1, 1);
  }
  return { canvas: c, ax: 12, ay: 14 };
}

/** Tamanho (px) da célula de quarteirão. */
export const CELL_PX = { w: T(BLOCK_TILES.w + 2 * SIDEWALK + 5), h: T(BLOCK_TILES.h + 2 * SIDEWALK + 5) };
