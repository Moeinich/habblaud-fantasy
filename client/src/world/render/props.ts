// Sprites procedurais da área externa (árvores, arbustos, postes, carros...) e utilitários
// visuais do mundo (sombra, brilhos). Mesma direção de arte do módulo de arte: contorno
// cinza-azulado escuro, 3–4 tons por material, luz vinda de cima/esquerda.
import { mulberry32 } from '../../../../shared/hash';
import type { ExteriorProp } from '../layout/types';

export interface PropSprite {
  canvas: HTMLCanvasElement;
  ax: number;
  ay: number;
}

const cache = new Map<string, PropSprite>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Pintor por pixel (ImageData) para formas orgânicas. */
class Painter {
  readonly data: ImageData;
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly w: number,
    readonly h: number,
  ) {
    // parte do conteúdo já desenhado (ex.: sombra) para não apagá-lo no putImageData
    this.data = ctx.getImageData(0, 0, w, h);
  }
  set(x: number, y: number, color: string, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b] = hex(color);
    const i = (y * this.w + x) * 4;
    this.data.data[i] = r;
    this.data.data[i + 1] = g;
    this.data.data[i + 2] = b;
    this.data.data[i + 3] = a;
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data.data[(y * this.w + x) * 4 + 3];
  }
  flush(): void {
    this.ctx.putImageData(this.data, 0, 0);
  }
}

function shadowEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a = 0.22): void {
  ctx.fillStyle = `rgba(28,36,52,${a})`;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    ctx.fillRect(cx - half, cy + y, half * 2, 1);
  }
}

/** Copa arredondada: união de círculos com sombreamento por luz superior-esquerda. */
function canopy(p: Painter, rng: () => number, cx: number, cy: number, r: number, tones: string[], outline: string): void {
  const blobs: [number, number, number][] = [[cx, cy, r]];
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const d = r * (0.35 + rng() * 0.35);
    blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * (0.55 + rng() * 0.25)]);
  }
  const inside = (x: number, y: number) => blobs.some(([bx, by, br]) => (x - bx) ** 2 + (y - by) ** 2 <= br * br);
  const x0 = Math.floor(cx - r * 1.8);
  const x1 = Math.ceil(cx + r * 1.8);
  const y0 = Math.floor(cy - r * 1.6);
  const y1 = Math.ceil(cy + r * 1.6);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge = !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
      if (edge) {
        p.set(x, y, outline);
        continue;
      }
      // luz: topo-esquerda mais claro; ruído para "folhas"
      const nx = (x - cx) / r;
      const ny = (y - cy) / r;
      const light = -nx * 0.45 - ny * 0.75 + (rng() - 0.5) * 0.55;
      const k = light > 0.55 ? 3 : light > 0.05 ? 2 : light > -0.5 ? 1 : 0;
      p.set(x, y, tones[k]);
    }
  }
}

function treeSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(36, 48);
  shadowEllipse(ctx, 18, 45, 12, 3, 0.25);
  const p = new Painter(ctx, 36, 48);
  // tronco
  for (let y = 30; y < 46; y++) {
    for (let x = 16; x < 21; x++) {
      const col = x === 16 ? '#8a6243' : x === 20 ? '#4a3222' : '#6b4a32';
      p.set(x, y, col);
    }
  }
  p.set(15, 45, '#4a3222');
  p.set(21, 45, '#4a3222');
  const variants = [
    ['#2a4f30', '#3a6a3a', '#4f8a45', '#74a85a'],
    ['#3a4f2a', '#4f6a35', '#6a8a45', '#90a85e'],
    ['#264a3a', '#335f48', '#467a58', '#6a9a6e'],
  ];
  canopy(p, rng, 18, 18, 11 + Math.floor(rng() * 3), variants[Math.floor(rng() * variants.length)], '#25463a');
  p.flush();
  return { canvas: c, ax: 18, ay: 45 };
}

function pineSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(28, 48);
  shadowEllipse(ctx, 14, 45, 9, 3, 0.25);
  const p = new Painter(ctx, 28, 48);
  for (let y = 38; y < 46; y++) for (let x = 12; x < 16; x++) p.set(x, y, x === 12 ? '#8a6243' : x === 15 ? '#4a3222' : '#6b4a32');
  const tones = ['#24533f', '#2f6b4f', '#3f8a5f', '#62ab79'];
  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const top = 4 + l * 8;
    const bottom = top + 14;
    for (let y = top; y < bottom; y++) {
      const half = Math.round(((y - top) / (bottom - top)) * (5 + l * 2.2));
      for (let x = 14 - half; x <= 14 + half; x++) {
        const edge = x === 14 - half || x === 14 + half || y === bottom - 1;
        const light = (14 - x) / (half + 1) - (y - top) / (bottom - top) + (rng() - 0.5) * 0.5;
        p.set(x, y, edge ? '#1d3f33' : tones[light > 0.5 ? 3 : light > -0.1 ? 2 : light > -0.6 ? 1 : 0]);
      }
    }
  }
  p.flush();
  return { canvas: c, ax: 14, ay: 45 };
}

function bushSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(22, 16);
  shadowEllipse(ctx, 11, 14, 9, 2, 0.22);
  const p = new Painter(ctx, 22, 16);
  canopy(p, rng, 11, 9, 6, ['#34663f', '#47864c', '#62a45a', '#8cc66f'], '#264a36');
  // florzinhas
  if (rng() < 0.6) {
    const col = ['#e0b23c', '#c46a8a', '#e8e2c0'][Math.floor(rng() * 3)];
    for (let i = 0; i < 4; i++) p.set(6 + Math.floor(rng() * 10), 5 + Math.floor(rng() * 6), col);
  }
  p.flush();
  return { canvas: c, ax: 11, ay: 14 };
}

function flowersSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(30, 14);
  const p = new Painter(ctx, 30, 14);
  // canteiro: borda de pedra + terra
  for (let y = 4; y < 13; y++) {
    for (let x = 1; x < 29; x++) {
      const border = y === 4 || y === 12 || x === 1 || x === 28;
      p.set(x, y, border ? (y === 12 ? '#8d8a82' : '#b9b5aa') : '#6a4b35');
    }
  }
  const cols = ['#b8352a', '#e0b23c', '#c46a8a', '#e8e2c0', '#8a7ab0'];
  for (let i = 0; i < 26; i++) {
    const x = 3 + Math.floor(rng() * 24);
    const y = 2 + Math.floor(rng() * 9);
    p.set(x, y + 1, '#3f8550');
    p.set(x, y, rng() < 0.75 ? cols[Math.floor(rng() * cols.length)] : '#5aa45d');
  }
  p.flush();
  return { canvas: c, ax: 15, ay: 13 };
}

function hedgeSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(34, 16);
  shadowEllipse(ctx, 17, 14, 15, 2, 0.2);
  const p = new Painter(ctx, 34, 16);
  for (let y = 3; y < 14; y++) {
    for (let x = 1; x < 33; x++) {
      const r = y === 3 ? 2 : y === 4 ? 1 : 0;
      if (x < 1 + r || x > 32 - r) continue;
      const edge = y === 3 || y === 13 || x === 1 + r || x === 32 - r;
      const light = -(y - 3) / 10 + (rng() - 0.5) * 0.6;
      p.set(x, y, edge ? '#264a36' : light > 0 ? '#6aa956' : light > -0.4 ? '#4b8a45' : '#356b3c');
    }
  }
  p.flush();
  return { canvas: c, ax: 17, ay: 14 };
}

/** Braseiro de ferro no alto de um poste de madeira (substitui o poste de luz). */
function lampSprite(): PropSprite {
  const [c, ctx] = makeCanvas(10, 36);
  shadowEllipse(ctx, 5, 34, 4, 1, 0.25);
  ctx.fillStyle = '#4e3420';
  ctx.fillRect(4, 8, 2, 26);
  ctx.fillStyle = '#8a6239';
  ctx.fillRect(4, 8, 1, 26);
  ctx.fillStyle = '#c9b483';
  ctx.fillRect(4, 20, 2, 1);
  ctx.fillStyle = '#3b3530';
  ctx.fillRect(1, 5, 8, 3);
  ctx.fillStyle = '#6a645a';
  ctx.fillRect(1, 5, 8, 1);
  ctx.fillStyle = '#e08a2c';
  ctx.fillRect(2, 3, 6, 2);
  ctx.fillStyle = '#f6c04a';
  ctx.fillRect(3, 1, 4, 2);
  ctx.fillStyle = '#fff2b0';
  ctx.fillRect(4, 0, 2, 1);
  ctx.fillStyle = '#4e3420';
  ctx.fillRect(3, 32, 4, 2);
  return { canvas: c, ax: 5, ay: 34 };
}

/** Banco de tronco partido ao meio sobre dois tocos. */
function benchSprite(): PropSprite {
  const [c, ctx] = makeCanvas(26, 14);
  shadowEllipse(ctx, 13, 12, 11, 2, 0.22);
  ctx.fillStyle = '#4e3420';
  ctx.fillRect(3, 7, 4, 5);
  ctx.fillRect(19, 7, 4, 5);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(1, 3, 24, 5);
  ctx.fillStyle = '#d9b88e';
  ctx.fillRect(1, 3, 24, 2);
  ctx.fillStyle = '#b98a55';
  ctx.fillRect(4, 3, 6, 1);
  ctx.fillRect(14, 4, 7, 1);
  ctx.fillStyle = '#3f2a18';
  ctx.fillRect(1, 7, 24, 1);
  return { canvas: c, ax: 13, ay: 12 };
}

function rockSprite(seed: number): PropSprite {
  const rng = mulberry32(seed);
  const [c, ctx] = makeCanvas(16, 12);
  const p = new Painter(ctx, 16, 12);
  canopy(p, rng, 8, 7, 4, ['#6a645a', '#7c766a', '#958f82', '#ada79a'], '#3f3a33');
  p.flush();
  return { canvas: c, ax: 8, ay: 11 };
}

/** Mesa de jardim com guarda-sol listrado (vista de cima, 3/4) e duas cadeirinhas. */
function parasolSprite(seed: number): PropSprite {
  const [c, ctx] = makeCanvas(32, 34);
  const palettes: [string, string, string][] = [
    // Tenda de mercado: lona listrada em tons tribais.
    ['#9c2f25', '#d9cba8', '#6e1f18'],
    ['#2f7a78', '#d9cba8', '#1f5654'],
    ['#d48a2c', '#e2d2a4', '#9a5e18'],
  ];
  const [a, b, dk] = palettes[seed % palettes.length];
  // sombra do guarda-sol no chão
  shadowEllipse(ctx, 16, 29, 12, 3, 0.24);
  // cadeirinhas (laterais) e mesa
  ctx.fillStyle = '#5b3c25';
  ctx.fillRect(2, 24, 6, 5);
  ctx.fillRect(24, 24, 6, 5);
  ctx.fillStyle = '#a0703f';
  ctx.fillRect(2, 24, 6, 2);
  ctx.fillRect(24, 24, 6, 2);
  ctx.fillStyle = '#8a6239';
  ctx.fillRect(10, 24, 12, 5);
  ctx.fillStyle = '#b98a55';
  ctx.fillRect(10, 24, 12, 2);
  ctx.fillStyle = '#4e3420';
  ctx.fillRect(10, 28, 12, 1);
  // mercadorias e haste
  ctx.fillStyle = '#e0b23c';
  ctx.fillRect(12, 23, 2, 1);
  ctx.fillStyle = '#9c2f25';
  ctx.fillRect(17, 23, 3, 1);
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(15, 11, 2, 14);
  // lona: octógono achatado com gomos alternados e borda escura
  const p = new Painter(ctx, 32, 34);
  const cx = 15.5;
  const cy = 8;
  for (let y = 0; y <= 15; y++) {
    for (let x = 0; x < 32; x++) {
      const dx = (x - cx) / 14.5;
      const dy = (y - cy) / 7.5;
      const d = Math.abs(dx) + Math.abs(dy) * 0.55 + Math.hypot(dx, dy) * 0.45;
      if (d > 1) continue;
      const ang = Math.atan2(y - cy, x - cx);
      const gomo = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2;
      const edge = d > 0.86;
      const lit = y < cy - 1;
      p.set(x, y, edge ? dk : gomo ? (lit ? '#ffffff' : b) : lit ? a : dk);
    }
  }
  p.set(15, 8, '#4e3420');
  p.set(16, 8, '#4e3420');
  p.flush();
  return { canvas: c, ax: 16, ay: 29 };
}

/** Totem entalhado da entrada: três rostos empilhados, asas e pintura tribal (o "logo" do acampamento). */
function totemSprite(): PropSprite {
  const [c, ctx] = makeCanvas(14, 34);
  shadowEllipse(ctx, 7, 32, 6, 1.5, 0.25);
  ctx.fillStyle = '#4e3420';
  ctx.fillRect(3, 2, 8, 30);
  ctx.fillStyle = '#7a5a38';
  ctx.fillRect(4, 3, 6, 28);
  ctx.fillStyle = '#9a7048';
  ctx.fillRect(4, 3, 1, 28);
  // asas no topo
  ctx.fillStyle = '#9c2f25';
  ctx.fillRect(0, 4, 3, 3);
  ctx.fillRect(11, 4, 3, 3);
  // três rostos: olhos, bocas e presas
  for (const y of [5, 14, 23]) {
    ctx.fillStyle = '#2a1d14';
    ctx.fillRect(5, y, 1, 1);
    ctx.fillRect(8, y, 1, 1);
    ctx.fillRect(5, y + 3, 4, 1);
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(5, y + 4, 1, 1);
    ctx.fillRect(8, y + 4, 1, 1);
    ctx.fillStyle = '#d48a2c';
    ctx.fillRect(4, y + 6, 6, 1);
  }
  // base de pedra
  ctx.fillStyle = '#6a645a';
  ctx.fillRect(1, 31, 12, 2);
  return { canvas: c, ax: 7, ay: 32 };
}

// ------------------------------------------------------------------ race biomes

/** Jungle giant: a thick buttressed trunk wrapped in vines under a broad, layered crown with glowing blossoms. */
function jungleTreeSprite(seed: number): PropSprite {
  const rng = mulberry32(seed + 101);
  const [c, ctx] = makeCanvas(52, 68);
  shadowEllipse(ctx, 26, 65, 17, 4, 0.3);
  const p = new Painter(ctx, 52, 68);
  for (let y = 34; y < 66; y++) {
    const flare = y > 58 ? (y - 58) * 0.8 : 0;
    const x0 = Math.round(22 - flare);
    const x1 = Math.round(30 + flare);
    for (let x = x0; x <= x1; x++) p.set(x, y, x === x0 ? '#2a1e1a' : x - x0 < 3 ? '#6a5040' : x1 - x < 2 ? '#3a2a24' : '#523e32');
  }
  // vines spiralling round the trunk
  for (let y = 36; y < 64; y++) {
    const x = 26 + Math.round(Math.sin(y * 0.45) * 4);
    p.set(x, y, '#3f7a3e');
    if (y % 3 === 0) p.set(x + 1, y, '#5fae5a');
  }
  canopy(p, rng, 16, 30, 11, ['#1f4a30', '#2a6038', '#3a7e48', '#5aa05e'], '#173826');
  canopy(p, rng, 36, 28, 12, ['#1f4a30', '#2a6038', '#3a7e48', '#5aa05e'], '#173826');
  canopy(p, rng, 26, 16, 14, ['#24543a', '#2f6c44', '#428c52', '#66b066'], '#173826');
  for (let i = 0; i < 6; i++) {
    const x = 8 + Math.floor(rng() * 36);
    const y = 6 + Math.floor(rng() * 30);
    if (p.alpha(x, y) < 200) continue;
    p.set(x, y, '#c8fff6');
    p.set(x + 1, y, '#8ff0e0');
  }
  // hanging vines from the crown
  for (let k = 0; k < 4; k++) {
    const x = 10 + Math.floor(rng() * 32);
    for (let y = 36; y < 40 + Math.floor(rng() * 10); y++) p.set(x, y, y % 2 ? '#3f7a3e' : '#2a5a30');
  }
  p.flush();
  return { canvas: c, ax: 26, ay: 65 };
}

/** Big-leafed jungle undergrowth. */
function fernSprite(seed: number): PropSprite {
  const rng = mulberry32(seed + 202);
  const [c, ctx] = makeCanvas(26, 18);
  shadowEllipse(ctx, 13, 16, 10, 2, 0.22);
  const p = new Painter(ctx, 26, 18);
  for (let f = 0; f < 6; f++) {
    const a = Math.PI * (0.1 + (f / 5) * 0.8) + (rng() - 0.5) * 0.2;
    const len = 8 + rng() * 4;
    for (let t = 0; t < len; t++) {
      const x = Math.round(13 - Math.cos(a) * t);
      const y = Math.round(15 - Math.sin(a) * t * 0.9);
      p.set(x, y, '#24482c');
      const w = Math.round(Math.sin((t / len) * Math.PI) * 2.5);
      for (let d = 1; d <= w; d++) {
        p.set(x, y - d, t % 2 ? '#4f9a4e' : '#62b05a');
        p.set(x, y + d, '#3a7a40');
      }
    }
  }
  p.flush();
  return { canvas: c, ax: 13, ay: 16 };
}

/** A felled tree's stump, cut flat, with growth rings and splinters. */
function stumpSprite(seed: number): PropSprite {
  const rng = mulberry32(seed + 303);
  const [c, ctx] = makeCanvas(20, 16);
  shadowEllipse(ctx, 10, 14, 8, 2, 0.25);
  const p = new Painter(ctx, 20, 16);
  for (let y = 7; y < 14; y++) for (let x = 4; x < 16; x++) p.set(x, y, x === 4 ? '#3a2a1e' : x === 15 ? '#2e2018' : x < 7 ? '#7a5a3e' : '#5e4430');
  for (let y = 3; y < 9; y++) {
    for (let x = 4; x < 16; x++) {
      const d = ((x - 9.5) / 6) ** 2 + ((y - 6) / 3) ** 2;
      if (d > 1) continue;
      const ring = Math.floor(Math.sqrt(d) * 4);
      p.set(x, y, d > 0.8 ? '#3a2a1e' : ring % 2 ? '#c8a070' : '#b08858');
    }
  }
  // splinters and a root
  if (rng() < 0.6) {
    p.set(6, 3, '#d8b888');
    p.set(6, 2, '#c8a070');
  }
  p.set(3, 13, '#3a2a1e');
  p.set(16, 13, '#3a2a1e');
  p.flush();
  return { canvas: c, ax: 10, ay: 14 };
}

/** A felled trunk lying on the ground, the cut end showing its rings. */
function logSprite(seed: number): PropSprite {
  const rng = mulberry32(seed + 404);
  const flip = rng() < 0.5;
  const [c, ctx] = makeCanvas(36, 14);
  shadowEllipse(ctx, 18, 12, 16, 2, 0.25);
  const p = new Painter(ctx, 36, 14);
  for (let x = 4; x < 32; x++) {
    for (let y = 4; y < 11; y++) p.set(flip ? 35 - x : x, y, y === 4 ? '#8a6648' : y === 10 ? '#2e2018' : y < 7 ? '#6a4e38' : '#523c2c');
    if (x % 5 === 0) p.set(flip ? 35 - x : x, 6, '#3a2a1e');
  }
  for (let y = 4; y < 11; y++) {
    for (let x = 0; x < 6; x++) {
      const d = ((x - 2.5) / 3) ** 2 + ((y - 7) / 3.5) ** 2;
      if (d > 1) continue;
      p.set(flip ? 35 - (29 + x) : 29 + x, y, d > 0.7 ? '#5e4430' : Math.floor(Math.sqrt(d) * 3) % 2 ? '#c8a070' : '#b08858');
    }
  }
  p.flush();
  return { canvas: c, ax: 18, ay: 12 };
}

/** Dry thorn bush of the badlands. */
function dryBushSprite(seed: number): PropSprite {
  const rng = mulberry32(seed + 505);
  const [c, ctx] = makeCanvas(20, 16);
  shadowEllipse(ctx, 10, 14, 7, 2, 0.2);
  const p = new Painter(ctx, 20, 16);
  for (let k = 0; k < 7; k++) {
    let x = 10;
    let y = 14;
    const dx = (rng() - 0.5) * 1.6;
    for (let t = 0; t < 8 + rng() * 4; t++) {
      x += dx;
      y -= 1;
      p.set(Math.round(x), y, t > 5 ? '#a08440' : '#6e5430');
      if (t > 3 && rng() < 0.3) p.set(Math.round(x) + 1, y, '#8a7038');
    }
  }
  p.flush();
  return { canvas: c, ax: 10, ay: 14 };
}

/** Dead tree of the blight: a bare, twisted black-violet trunk with crooked branches. */
function deadTreeSprite(seed: number): PropSprite {
  const rng = mulberry32(seed + 606);
  const [c, ctx] = makeCanvas(40, 52);
  shadowEllipse(ctx, 20, 49, 11, 3, 0.28);
  const p = new Painter(ctx, 40, 52);
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    for (let t = 0; t < len; t++) {
      x += Math.cos(a);
      y -= Math.sin(a);
      a += (rng() - 0.5) * 0.35;
      for (let d = 0; d < w; d++) p.set(Math.round(x) + d, Math.round(y), d === 0 ? '#9a8aa2' : '#5a4c62');
    }
    if (depth > 0) {
      branch(x, y, a + 0.5 + rng() * 0.3, len * 0.6, Math.max(1, w - 1), depth - 1);
      branch(x, y, a - 0.5 - rng() * 0.3, len * 0.6, Math.max(1, w - 1), depth - 1);
    }
  };
  for (let y = 30; y < 50; y++) for (let x = 18; x < 23; x++) p.set(x, y, x === 18 ? '#9a8aa2' : x === 22 ? '#2a2030' : '#5a4c62');
  branch(20, 30, Math.PI / 2, 10, 3, 3);
  // a crow or a lantern now and then
  if (rng() < 0.4) {
    const x = 8 + Math.floor(rng() * 24);
    const y = 6 + Math.floor(rng() * 16);
    if (p.alpha(x, y + 1) > 0) {
      p.set(x, y, '#141018');
      p.set(x + 1, y, '#141018');
      p.set(x + 1, y - 1, '#141018');
      p.set(x + 2, y - 1, '#e0b23c');
    }
  }
  p.flush();
  return { canvas: c, ax: 20, ay: 49 };
}

/** A weathered gravestone, rounded or a cross, mossy at the foot. */
function graveSprite(seed: number): PropSprite {
  const rng = mulberry32(seed + 707);
  const [c, ctx] = makeCanvas(14, 18);
  shadowEllipse(ctx, 7, 16, 6, 2, 0.25);
  const p = new Painter(ctx, 14, 18);
  const stone = ['#4e4a56', '#6a6672', '#8a8692', '#a8a4b0'];
  if (rng() < 0.65) {
    for (let y = 3; y < 16; y++) {
      for (let x = 2; x < 12; x++) {
        if (y < 6 && (x - 7) ** 2 + (y - 6) ** 2 > 22) continue;
        p.set(x, y, x === 2 || x === 11 || y === 3 ? stone[0] : x < 5 ? stone[3] : x < 9 ? stone[2] : stone[1]);
      }
    }
    for (const x of [5, 6, 7, 8]) p.set(x, 8, stone[0]);
    for (const x of [5, 6, 7]) p.set(x, 10, stone[0]);
  } else {
    for (let y = 2; y < 16; y++) for (let x = 6; x < 9; x++) p.set(x, y, x === 6 ? stone[3] : x === 8 ? stone[0] : stone[2]);
    for (let y = 5; y < 8; y++) for (let x = 2; x < 13; x++) p.set(x, y, y === 5 ? stone[3] : y === 7 ? stone[0] : stone[2]);
  }
  for (let x = 2; x < 12; x++) if (rng() < 0.6) p.set(x, 15, '#4a6a3a');
  p.flush();
  return { canvas: c, ax: 7, ay: 16 };
}

export function propSprite(prop: ExteriorProp): PropSprite {
  const key = prop.kind === 'lamp' || prop.kind === 'bench' || prop.kind === 'totem' ? prop.kind : `${prop.kind}:${prop.seed % 7}`;
  let s = cache.get(key);
  if (s) return s;
  switch (prop.kind) {
    case 'tree':
      s = treeSprite(prop.seed % 7);
      break;
    case 'pine':
      s = pineSprite(prop.seed % 7);
      break;
    case 'bush':
      s = bushSprite(prop.seed % 7);
      break;
    case 'flowers':
      s = flowersSprite(prop.seed % 7);
      break;
    case 'hedge':
      s = hedgeSprite(prop.seed % 7);
      break;
    case 'lamp':
      s = lampSprite();
      break;
    case 'bench':
      s = benchSprite();
      break;
    case 'rock':
      s = rockSprite(prop.seed % 7);
      break;
    case 'parasol':
      s = parasolSprite(prop.seed % 7);
      break;
    case 'totem':
      s = totemSprite();
      break;
    case 'jungle_tree':
      s = jungleTreeSprite(prop.seed % 7);
      break;
    case 'fern':
      s = fernSprite(prop.seed % 7);
      break;
    case 'stump':
      s = stumpSprite(prop.seed % 7);
      break;
    case 'log':
      s = logSprite(prop.seed % 7);
      break;
    case 'dry_bush':
      s = dryBushSprite(prop.seed % 7);
      break;
    case 'dead_tree':
      s = deadTreeSprite(prop.seed % 7);
      break;
    case 'grave':
      s = graveSprite(prop.seed % 7);
      break;
    default:
      // 'paving' e outros tipos desenhados pelo próprio renderer
      s = { canvas: makeCanvas(1, 1)[0], ax: 0, ay: 0 };
  }
  cache.set(key, s);
  return s;
}

// Carroças: madeira em tons diferentes; a lona da carga muda de cor.
const CAR_COLORS: [string, string, string][] = [
  ['#9c2f25', '#6e1f18', '#c4483a'],
  ['#2f7a78', '#1f5654', '#4fa09c'],
  ['#d9cba8', '#a8986e', '#efe2c0'],
  ['#d48a2c', '#9a5e18', '#f0b060'],
  ['#5f8a3a', '#3f5f26', '#86b05a'],
  ['#7a6a58', '#4e4234', '#a08a70'],
];

/** Carro visto de lado (3/4), virado para a direita; `flip` desenha para a esquerda. */
export function carSprite(variant: number, flip: boolean): PropSprite {
  const key = `car:${variant % CAR_COLORS.length}:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [body, dark, light] = CAR_COLORS[variant % CAR_COLORS.length];
  const [c, ctx] = makeCanvas(36, 20);
  if (flip) {
    ctx.translate(36, 0);
    ctx.scale(-1, 1);
  }
  shadowEllipse(ctx, 18, 17, 16, 2, 0.3);
  // Carroça de madeira com carga coberta por lona (cor = body) e varal para o animal à frente.
  const o = '#2a1d14';
  ctx.fillStyle = o;
  ctx.fillRect(2, 7, 28, 7);
  ctx.fillStyle = '#8a6239';
  ctx.fillRect(3, 8, 26, 5);
  ctx.fillStyle = '#b98a55';
  ctx.fillRect(3, 8, 26, 1);
  ctx.fillStyle = '#5e3f27';
  ctx.fillRect(3, 11, 26, 1);
  for (const px of [9, 16, 23]) ctx.fillRect(px, 8, 1, 5);
  // lona
  ctx.fillStyle = o;
  ctx.fillRect(5, 1, 20, 7);
  ctx.fillStyle = body;
  ctx.fillRect(6, 2, 18, 6);
  ctx.fillStyle = light;
  ctx.fillRect(6, 2, 18, 1);
  ctx.fillStyle = dark;
  ctx.fillRect(6, 6, 18, 2);
  ctx.fillRect(12, 2, 1, 6);
  ctx.fillRect(18, 2, 1, 6);
  // varal
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(30, 10, 5, 1);
  // lanterna pendurada
  ctx.fillStyle = '#f6c04a';
  ctx.fillRect(28, 5, 2, 2);
  // rodas raiadas
  for (const wx of [5, 21]) {
    ctx.fillStyle = o;
    ctx.fillRect(wx, 12, 6, 6);
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(wx + 1, 13, 4, 4);
    ctx.fillStyle = '#3f2a18';
    ctx.fillRect(wx + 2, 13, 1, 4);
    ctx.fillRect(wx + 1, 14, 4, 1);
    ctx.fillStyle = '#8f949a';
    ctx.fillRect(wx + 2, 14, 1, 1);
  }
  const s = { canvas: c, ax: 18, ay: 17 };
  cache.set(key, s);
  return s;
}

/** Sombra de contato sob os personagens. */
export function shadowSprite(): PropSprite {
  const hit = cache.get('shadow');
  if (hit) return hit;
  const [c, ctx] = makeCanvas(14, 6);
  shadowEllipse(ctx, 7, 3, 6, 2, 0.28);
  const s = { canvas: c, ax: 7, ay: 3 };
  cache.set('shadow', s);
  return s;
}

/** Brilho radial (desenhado com composição aditiva). */
export function glowSprite(color: string, size = 64): HTMLCanvasElement {
  const key = `glow:${color}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit.canvas;
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const [r, gg, b] = hex(color);
  g.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
  g.addColorStop(0.4, `rgba(${r},${gg},${b},0.35)`);
  g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, { canvas: c, ax: size / 2, ay: size / 2 });
  return c;
}
