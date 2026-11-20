// Móveis das salas de projeto: mesas (frente e traseira), cadeiras, estantes, arquivo, impressora,
// lixeira, plantas, divisórias de vidro, mesa de reunião, banqueta, luminária e bebedouro.
// Coordenadas de desenho = footprint (0,0 no canto superior esquerdo; base em y = h*TILE).
import { mix, ramp, shade, type Ramp } from '../core/color';
import { floorSheet, rectAt, type BufFurniture, type BufSprite } from '../core/sprite';
import type { PixelBuf } from '../core/pixbuf';
import {
  ACCENTS, M, bigLeaf, book, contact, foliage, frontFace, keyboard, leafBlade, monitorBack, monitorFront, mouse, mug,
  papers, pencilCup, photoFrame, pick, pot, rngOf, smallSucculent, staticScreen, topFace, underRect, woodGrain,
  type DeskItemTone,
} from './kit';

type Box = { x: number; y: number; w: number; h: number };

// ------------------------------------------------------------------ mesas

interface DeskMats {
  top: Ramp;
  edge: Ramp;
  legs: Ramp;
  ped: Ramp;
}

function deskMats(variant: string | undefined): DeskMats {
  // Bancadas de trabalho: tampo de tábuas grossas, pernas de tronco e um caixote embaixo.
  switch (variant) {
    case 'white':
      return { top: M.white, edge: ramp('#b8a67e', 0.06), legs: M.oakDark, ped: M.cardboard };
    case 'dark':
      return { top: M.walnut, edge: ramp('#47301e', 0.06), legs: M.graphite, ped: M.oakDark };
    default:
      return { top: M.oak, edge: M.oakDark, legs: M.walnut, ped: M.cardboard };
  }
}

const MUG_COLORS = ['#9c2f25', '#2f7a78', '#e0b23c', '#5f8a3a', '#d9cba8', '#6a4a8a'] as const;

/** Sombra de contato da mesa e sombra do vão sob o tampo (compostas por baixo, após o contorno). */
function deskShadow(b: PixelBuf): void {
  underRect(b, 3, 8, 26, 7, 'rgba(36,24,14,0.22)');
  contact(b, -1, 13, 34, 4, 0.2);
}

/** Tampo + bordas + pernas + gaveteiro (comum a desk e desk_back). */
function deskBody(s: BufSprite, m: DeskMats, seed: number, back: boolean): void {
  const b = s.buf;
  if (back) {
    // Painel frontal (lado de quem olha) cobrindo o vão.
    frontFace(b, 1, 8, 30, 6, m.ped);
    b.hline(1, 30, 8, m.ped.dk);
    b.hline(2, 29, 11, m.ped.lt);
  }
  // Pernas (laterais) com brilho.
  for (const x of [0, 29]) {
    b.rect(x, 8, 3, 8, m.legs.base);
    b.vline(x, 8, 15, m.legs.lt);
    b.vline(x + 2, 8, 15, m.legs.dk);
    b.hline(x, x + 2, 15, m.legs.dd);
  }
  if (!back) {
    // Caixote de ferramentas sob o lado direito (tábuas com cinta de ferro).
    frontFace(b, 19, 8, 10, 8, m.ped);
    b.vline(22, 8, 15, m.ped.dk);
    b.vline(25, 8, 15, m.ped.dk);
    b.hline(19, 28, 11, '#5a5550');
    b.set(20, 11, '#8f949a');
    b.set(27, 11, '#8f949a');
  }
  // Tampo (12 linhas) + espessura da borda (2 linhas).
  topFace(b, 0, -6, 32, 12, m.top);
  woodGrain(b, 1, -5, 30, 10, m.top, seed);
  b.hline(0, 31, 6, m.edge.base);
  b.hline(0, 31, 7, m.edge.dk);
  b.set(0, 6, m.edge.lt);
}

/** Objetos sobre a mesa (variações por semente). Retorna o retângulo da tela principal e o da secundária. */
function deskTop(s: BufSprite, seed: number, tone: DeskItemTone): { screen: Box; screen2?: Box } {
  const b = s.buf;
  const r = rngOf(seed, 11);
  const v = seed % 6;
  const mugC = pick(r, MUG_COLORS);
  let screen: Box;
  let screen2: Box | undefined;
  switch (v) {
    case 1: {
      screen = monitorFront(b, 2, -17, 16, 11);
      screen2 = monitorFront(b, 18, -16, 13, 10);
      staticScreen(b, screen2, 'sheet', seed);
      keyboard(b, 6, -1, 11, tone);
      mouse(b, 20, 0, tone);
      mug(b, 26, -2, mugC);
      break;
    }
    case 2: {
      screen = monitorFront(b, 5, -17, 16, 11);
      // Tomo aberto de pé à direita (página com runas).
      b.rect(22, -9, 9, 6, '#5a2a1c');
      b.hline(22, 30, -9, '#7a3a26');
      screen2 = { x: 23, y: -8, w: 7, h: 4 };
      staticScreen(b, screen2, 'ide', seed);
      b.rect(21, -3, 11, 2, '#e2d2a4');
      b.hline(21, 31, -2, '#b8a272');
      b.set(26, -3, '#7a3a26');
      b.hline(22, 31, -1, tone === 'onLight' ? 'rgba(40,46,70,0.3)' : 'rgba(60,40,40,0.2)');
      keyboard(b, 8, -1, 10, tone);
      smallSucculent(b, 1, -3);
      break;
    }
    case 3: {
      screen = monitorFront(b, 8, -17, 16, 11);
      // Selos de cera pregados na laje.
      b.rect(22, -15, 2, 2, '#9c2f25');
      b.rect(9, -15, 2, 2, '#d48a2c');
      keyboard(b, 11, -1, 10, tone);
      mouse(b, 23, 0, tone);
      photoFrame(b, 2, -5);
      papers(b, 24, -4, 6, 4, tone);
      mug(b, 3, 0, mugC);
      break;
    }
    case 4: {
      screen = monitorFront(b, 4, -17, 15, 11);
      screen2 = monitorFront(b, 19, -17, 12, 10);
      staticScreen(b, screen2, 'chart', seed);
      keyboard(b, 7, -1, 11, tone);
      mouse(b, 21, 0, tone);
      papers(b, 1, -2, 5, 4, tone);
      break;
    }
    case 5: {
      screen = monitorFront(b, 8, -17, 16, 11);
      keyboard(b, 11, -1, 10, tone);
      mouse(b, 23, 0, tone);
      // Martelo deitado sobre a bancada.
      b.hline(1, 6, -2, '#8a6239');
      b.hline(1, 6, -1, '#6b4a2b');
      b.rect(6, -4, 3, 4, '#6a645a');
      b.hline(6, 8, -4, '#8f887c');
      mug(b, 26, -3, mugC);
      pencilCup(b, 28, 2);
      break;
    }
    default: {
      screen = monitorFront(b, 8, -17, 16, 11);
      keyboard(b, 11, -1, 10, tone);
      mouse(b, 23, 0, tone);
      mug(b, 3, -2, mugC);
      papers(b, 25, -4, 6, 4, tone);
      smallSucculent(b, 26, 2);
      break;
    }
  }
  return { screen, screen2 };
}

/** Tom dos objetos conforme o tampo: no branco, um degrau mais escuros e com sombra firme. */
function itemTone(variant: string | undefined): DeskItemTone {
  return variant === 'white' ? 'onLight' : 'light';
}

export function desk(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(2, 1, 20);
  const m = deskMats(variant);
  deskBody(s, m, seed, false);
  const scr = deskTop(s, seed, itemTone(variant));
  s.buf.outline();
  deskShadow(s.buf);
  s.rects = { screen: rectAt(s, scr.screen.x, scr.screen.y, scr.screen.w, scr.screen.h) };
  if (scr.screen2) s.rects.screen2 = rectAt(s, scr.screen2.x, scr.screen2.y, scr.screen2.w, scr.screen2.h);
  return { base: s };
}

export function deskBack(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(2, 1, 12);
  const m = deskMats(variant);
  const b = s.buf;
  deskBody(s, m, seed, true);
  const r = rngOf(seed, 12);
  const v = seed % 4;
  const mugC = pick(r, MUG_COLORS);
  const tone = itemTone(variant);
  // Verso em plástico claro; na mesa escura (nogueira), cinza médio para não brilhar demais.
  const plastic = variant === 'dark' ? 'mid' : 'light';
  if (v === 1) {
    monitorBack(b, 2, -7, 15, 10, plastic);
    monitorBack(b, 17, -6, 13, 9, plastic);
  } else {
    monitorBack(b, 8, -7, 16, 10, plastic);
    if (v === 2) smallSucculent(b, 26, 0);
    else papers(b, 25, -1, 6, 4, tone);
    if (v === 3) photoFrame(b, 2, -3);
    else mug(b, 2, 0, mugC);
  }
  b.outline();
  deskShadow(b);
  return { base: s };
}

// ------------------------------------------------------------------ cadeiras

// Assentos de pele/couro estendidos numa armação de madeira.
const CHAIR_COLORS: Readonly<Record<string, string>> = {
  black: '#4a3a2c', // couro escuro
  blue: '#7a6a58', // pele de lobo
  red: '#8a3a2a', // couro tingido
  green: '#5a6a3a', // lona de musgo
  gray: '#a08a6a', // pele clara
};

function chairRamp(variant: string | undefined): Ramp {
  return ramp(CHAIR_COLORS[variant ?? 'black'] ?? CHAIR_COLORS.black, 0.07);
}

/** Pernas de galho amarradas com corda (três pés + travessa). */
function starBase(b: BufSprite['buf']): void {
  const wood = '#6b4a2b';
  const lite = '#8a6239';
  for (const x of [3, 7, 12]) {
    b.vline(x, 9, 15, wood);
    b.set(x, 9, lite);
  }
  b.hline(3, 12, 12, lite);
  b.set(7, 12, '#c9b483');
  b.set(8, 12, '#c9b483');
}

export function officeChair(variant: string | undefined): BufFurniture {
  const c = chairRamp(variant);
  // Base: assento visto por trás + base estrela (o encosto fica no `front`).
  const base = floorSheet(1, 1, 6);
  const b = base.buf;
  starBase(b);
  b.rect(2, 4, 12, 6, c.lt);
  b.hline(3, 12, 4, c.hi);
  b.hline(2, 13, 8, c.base);
  b.hline(2, 13, 9, c.dk);
  b.set(2, 4, c.base);
  b.set(13, 4, c.base);
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  // Frente: encosto baixo e estreito — cobre a lombar de quem senta e deixa ombros e braços à mostra.
  const front = floorSheet(1, 1, 6);
  const f = front.buf;
  f.rect(4, 7, 8, 6, c.base);
  f.hline(5, 10, 6, c.lt);
  f.hline(4, 11, 7, c.lt);
  f.set(5, 7, c.hi);
  f.set(6, 7, c.hi);
  f.vline(4, 8, 11, c.lt);
  f.vline(11, 7, 12, c.dk);
  f.hline(5, 10, 9, c.dk);
  f.hline(5, 10, 10, c.dk);
  f.hline(4, 11, 12, c.dd);
  f.rect(7, 13, 2, 1, '#6b4a2b');
  f.outline();
  return { base, front };
}

export function officeChairFront(variant: string | undefined): BufFurniture {
  const c = chairRamp(variant);
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  starBase(b);
  // Encosto ao norte (de frente para a câmera).
  b.rect(3, -6, 10, 10, c.base);
  b.hline(4, 11, -7, c.lt);
  b.rect(4, -5, 8, 7, c.lt);
  b.hline(5, 10, -5, c.hi);
  b.vline(12, -6, 3, c.dk);
  b.hline(3, 12, 3, c.dd);
  b.rect(7, 4, 2, 2, '#6b4a2b');
  // Assento.
  b.rect(2, 5, 12, 5, c.lt);
  b.hline(3, 12, 5, c.hi);
  b.hline(2, 13, 9, c.dk);
  b.hline(2, 13, 10, c.dd);
  for (const x of [1, 13]) {
    b.rect(x, 3, 2, 5, '#6b4a2b');
    b.set(x, 3, '#8a6239');
  }
  b.outline();
  contact(b, 1, 13, 14, 3, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ estantes e arquivos

export function bookshelf(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 22);
  const b = s.buf;
  const w = M.oak;
  const r = rngOf(seed, 21);
  // Corpo: laterais, topo e fundo.
  topFace(b, 0, -21, 32, 3, w);
  b.rect(0, -18, 32, 34, w.dk);
  b.rect(2, -17, 28, 31, shade(w.dd, -0.12));
  b.vline(0, -18, 15, w.lt);
  b.vline(1, -18, 15, w.base);
  b.vline(30, -18, 15, w.base);
  b.vline(31, -18, 15, w.dd);
  // Prateleiras.
  const shelves = [-8, 3, 15];
  for (const y of shelves) {
    b.hline(1, 30, y, w.lt);
    b.hline(1, 30, y + 1, w.dk);
  }
  b.hline(0, 31, 15, w.dd);
  // Conteúdo de cada prateleira (apoiado na prateleira de baixo).
  shelves.forEach((shelf, i) => {
    const bottom = shelf - 1;
    let x = 3;
    while (x < 29) {
      const kind = r();
      if (kind < 0.12 && x < 25) {
        // Vaso pequeno com planta.
        pot(b, x, bottom - 3, 4, 4, M.ceramic);
        foliage(b, x + 2, bottom - 5, 2.5, 2, M.leaf, seed + x + i * 7);
        x += 5;
      } else if (kind < 0.2 && x < 24) {
        // Caixa de arquivo.
        const bc = pick(r, ['#e9e4d6', '#c9a46e', '#9fb6cf']);
        b.rect(x, bottom - 4, 5, 5, bc);
        b.hline(x, x + 4, bottom - 4, shade(bc, 0.1));
        b.rect(x + 1, bottom - 2, 3, 1, shade(bc, -0.2));
        x += 6;
      } else if (kind < 0.26 && x < 26) {
        // Troféu.
        b.rect(x + 1, bottom - 4, 3, 2, '#f2c14e');
        b.set(x, bottom - 4, '#d9a42e');
        b.set(x + 4, bottom - 4, '#d9a42e');
        b.set(x + 2, bottom - 2, '#d9a42e');
        b.rect(x + 1, bottom - 1, 3, 2, '#6b4a32');
        x += 6;
      } else {
        // Grupo de livros com alturas variadas (um às vezes inclinado).
        const n = 2 + Math.floor(r() * 4);
        for (let k = 0; k < n && x < 29; k++) {
          const bw = 1 + Math.floor(r() * 2);
          const bh = 6 + Math.floor(r() * 4);
          book(b, x, bottom - bh + 1, bw, bh, pick(r, ACCENTS));
          x += bw;
        }
        if (r() < 0.3 && x < 26) {
          b.line(x, bottom, x + 3, bottom - 6, pick(r, ACCENTS), 1);
          b.line(x + 1, bottom, x + 4, bottom - 6, pick(r, ACCENTS), 1);
          x += 5;
        } else x += 1;
      }
    }
  });
  b.outline();
  contact(b, -1, 13, 34, 4, 0.22);
  return { base: s };
}

export function binderShelf(seed: number): BufFurniture {
  const s = floorSheet(1, 1, 22);
  const b = s.buf;
  const w = M.oakDark;
  const r = rngOf(seed, 23);
  topFace(b, 0, -21, 16, 3, w);
  b.rect(0, -18, 16, 34, w.dk);
  b.rect(1, -17, 14, 31, '#3a2a1c');
  b.vline(0, -18, 15, w.lt);
  b.vline(15, -18, 15, w.dd);
  const shelves = [-8, 3, 15];
  for (const y of shelves) {
    b.hline(1, 14, y, w.lt);
    b.hline(1, 14, y + 1, w.dk);
  }
  const tops = [-17, -6, 5];
  // Rolos de pergaminho amarrados com fitas coloridas.
  const binders = ['#e2d2a4', '#d8c79c', '#eadcb4', '#cfbf90', '#e2d2a4', '#d8c79c', '#eadcb4'];
  const ribbons = ['#9c2f25', '#2f7a78', '#e0b23c', '#5f8a3a'];
  tops.forEach((top, i) => {
    const bottom = shelves[i] - 1;
    const h = bottom - top + 1;
    if (i === 2 && r() < 0.6) {
      // Caixas de papelão na prateleira de baixo.
      b.rect(2, bottom - 6, 6, 7, M.cardboard.base);
      b.hline(2, 7, bottom - 6, M.cardboard.lt);
      b.rect(3, bottom - 4, 4, 1, '#5a5550');
      b.rect(8, bottom - 5, 6, 6, M.cardboard.dk);
      b.hline(8, 13, bottom - 5, M.cardboard.base);
      b.rect(9, bottom - 3, 4, 1, '#5a5550');
      return;
    }
    let x = 2;
    while (x < 14) {
      const c = pick(r, binders);
      const bh = Math.min(h - 1, 8 + Math.floor(r() * 2));
      b.rect(x, bottom - bh + 1, 2, bh, c);
      b.vline(x, bottom - bh + 1, bottom, shade(c, 0.1));
      const rib = pick(r, ribbons);
      b.set(x, bottom - bh + 3, rib);
      b.set(x + 1, bottom - bh + 3, rib);
      b.set(x + 1, bottom - 1, shade(c, -0.2));
      x += 2;
      if (r() < 0.12) x += 1;
    }
  });
  b.outline();
  contact(b, 0, 13, 16, 4, 0.22);
  return { base: s };
}

export function filingCabinet(): BufFurniture {
  // Baú de madeira empilhado (três gavetões com cintas e argolas de ferro).
  const s = floorSheet(1, 1, 8);
  const b = s.buf;
  const m = M.oak;
  topFace(b, 1, -7, 14, 4, m);
  frontFace(b, 1, -3, 14, 19, m);
  woodGrain(b, 1, -3, 14, 19, m, 3, true);
  for (const y of [3, 9]) {
    b.hline(1, 14, y, '#4f5459');
    b.hline(1, 14, y + 1, m.dk);
  }
  for (const y of [-1, 5, 11]) {
    b.set(7, y, '#8f949a');
    b.set(8, y, '#8f949a');
    b.set(7, y + 1, '#4f5459');
    b.set(8, y + 1, '#4f5459');
  }
  b.vline(1, -3, 15, '#4f5459');
  b.vline(14, -3, 15, '#4f5459');
  smallSucculent(b, 9, -9);
  b.outline();
  contact(b, 0, 13, 16, 4, 0.22);
  return { base: s };
}

export function printer(): BufFurniture {
  // Pequena forja de pedra: base de pedra, boca com brasas e chaminé curta com fole ao lado.
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  const st = M.stone;
  frontFace(b, 0, 2, 16, 14, st);
  for (const y of [5, 9, 13]) b.hline(1, 14, y, st.dk);
  for (const [x, y] of [[4, 3], [10, 7], [6, 11], [12, 3]] as const) b.vline(x, y, y + 1, st.dk);
  topFace(b, 0, -11, 16, 6, st);
  frontFace(b, 0, -5, 16, 7, st);
  // Boca da forja com brasas.
  b.rect(3, -4, 10, 5, '#2a1d14');
  b.hline(4, 11, 0, '#e08a2c');
  b.hline(5, 10, -1, '#f0b040');
  b.set(7, -2, '#ffe08a');
  b.set(9, -1, '#ffd060');
  // Chaminé.
  b.rect(10, -16, 4, 6, st.dk);
  b.hline(10, 13, -16, st.lt);
  // Fole de couro.
  b.rect(1, -10, 5, 3, '#7b4f2c');
  b.hline(1, 5, -10, '#9a6a40');
  b.set(6, -9, '#4f5459');
  b.outline();
  contact(b, -1, 13, 18, 4, 0.22);
  return { base: s };
}

export function trashBin(): BufFurniture {
  // Balde de madeira com aros de ferro e cavacos.
  const s = floorSheet(1, 1, 2);
  const b = s.buf;
  const m = M.oak;
  for (let y = 7; y <= 15; y++) {
    const inset = y > 13 ? 1 : 0;
    b.hline(4 + inset, 11 - inset, y, m.base);
    b.set(4 + inset, y, m.lt);
    b.set(11 - inset, y, m.dk);
  }
  for (const x of [6, 9]) b.vline(x, 8, 14, m.dk);
  b.hline(4, 11, 9, '#4f5459');
  b.hline(5, 10, 14, '#4f5459');
  b.ellipse(8, 6.5, 4.5, 2, m.lt);
  b.ellipse(8, 6.6, 3.5, 1.3, '#3a2a1c');
  b.rect(6, 5, 3, 2, '#d9b88e');
  b.set(8, 5, '#b98a55');
  b.set(9, 6, '#e2d2a4');
  b.outline();
  contact(b, 3, 14, 10, 2, 0.22);
  return { base: s };
}

// ------------------------------------------------------------------ plantas

export function plantSmall(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  const v = variant ?? 'fern';
  if (v === 'succulent') {
    pot(b, 4, 9, 8, 7, M.ceramic);
    b.rect(5, 9, 6, 1, '#5b4636');
    // Roseta azulada: pétalas grossas em camadas.
    const g = ramp('#7fbf9f', 0.08);
    const petals: [number, number, number, number][] = [[3, 8, 6, 5], [13, 8, 10, 5], [5, 5, 7, 3], [11, 5, 9, 3], [8, 3, 8, 6], [4, 7, 8, 6], [12, 7, 8, 6]];
    petals.forEach(([x1, y1, x0, y0], i) => leafBlade(b, x0, y0 + 2, x1, y1, 3, i < 2 ? ramp(g.dk, 0.08) : g, true));
    b.set(8, 5, g.hi);
    b.set(7, 6, g.lt);
  } else if (v === 'flower') {
    pot(b, 4, 9, 8, 7, M.terracotta);
    b.rect(5, 9, 6, 1, '#5b4636');
    const g = M.leaf;
    for (const [x1, y1] of [[2, 6], [14, 5], [5, 2], [11, 2], [8, 4]] as const) leafBlade(b, 8, 9, x1, y1, 3, g, x1 < 8);
    const petals = pick(rngOf(seed, 5), ['#f26d8a', '#f2c14e', '#ffffff', '#b07ae8']);
    for (const [x, y] of [[4, 1], [10, 0], [7, 3], [12, 4], [3, 5]] as const) {
      b.set(x, y, petals);
      b.set(x + 1, y, shade(petals, 0.12));
      b.set(x, y + 1, shade(petals, -0.12));
      b.set(x + 1, y + 1, '#f7d154');
    }
  } else {
    pot(b, 4, 9, 8, 7, M.terracotta);
    b.rect(5, 9, 6, 1, '#5b4636');
    // Samambaia: frondes arqueadas em lâminas finas.
    const g = M.leaf;
    const fr: [number, number, number][] = [[0, 7, 0], [16, 7, 0], [2, 1, 1], [14, 1, 0], [5, -3, 1], [11, -3, 1], [8, -5, 1], [-1, 11, 0], [17, 11, 0]];
    fr.forEach(([x1, y1, light]) => leafBlade(b, 8, 9, x1, y1, 2.6, light ? g : ramp(g.dk, 0.07), x1 < 8));
    b.set(8, -5, g.hi);
  }
  b.outline();
  contact(b, 3, 14, 10, 2, 0.24);
  return { base: s };
}

export function plantTall(variant: string | undefined, seed: number): BufFurniture {
  const s = floorSheet(1, 1, 24, 6);
  const b = s.buf;
  const v = variant ?? 'ficus';
  if (v === 'bonsai') {
    // Bonsai: suporte baixo de madeira, vaso-bandeja cerâmico e copa em "nuvens".
    const st = M.walnut;
    topFace(b, 1, 7, 14, 3, st);
    frontFace(b, 1, 10, 14, 3, st);
    for (const x of [2, 12]) b.rect(x, 13, 2, 3, st.dd);
    const tray = ramp('#4f6a8f', 0.07);
    b.rect(3, 4, 10, 1, tray.lt);
    b.rect(3, 5, 10, 2, tray.base);
    b.hline(4, 11, 4, '#5b4636');
    b.vline(12, 5, 6, tray.dk);
    b.hline(4, 11, 6, tray.dk);
    // Tronco retorcido com raízes aparentes.
    const tr = ramp('#7a5a40', 0.08);
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
  } else if (v === 'palm') {
    pot(b, 3, 6, 10, 10, M.ceramic);
    b.rect(4, 6, 8, 1, '#5b4636');
    const g = M.leaf;
    const dark = ramp(M.leaf.dk, 0.07);
    for (const sx of [6, 8, 10]) b.line(8, 6, sx, -4, '#86a04f', 1);
    // Frondes pinadas (de trás, escuras; da frente, claras) abrindo em leque.
    const fronds: [number, number, number, number, Ramp][] = [
      [7, -3, -2, -20, dark], [9, -3, 17, -19, dark], [7, -2, -5, -8, g], [9, -2, 21, -8, g], [8, -3, 8, -23, g],
    ];
    for (const [x0, y0, x1, y1, m] of fronds) bigLeaf(b, x0, y0, x1, y1, 6, m, 'pinnate');
  } else if (v === 'monstera') {
    pot(b, 3, 6, 10, 10, M.terracotta);
    b.rect(4, 6, 8, 1, '#5b4636');
    const g = ramp('#43995a', 0.08);
    const dark = ramp('#2f7a45', 0.08);
    // Folhas grandes recortadas, das de trás para as da frente, com hastes.
    const leaves: [number, number, number, number, number, Ramp][] = [
      [7, -7, 1, -17, 9, dark], [9, -7, 16, -16, 9, dark], [8, -6, 9, -21, 9, g],
      [6, 1, -3, -6, 9, g], [10, 1, 19, -5, 9, g], [8, 3, 6, -5, 7, dark],
    ];
    for (const [x0, y0] of leaves) b.line(8, 6, x0, y0, '#2f6b3d');
    for (const [x0, y0, x1, y1, w, m] of leaves) bigLeaf(b, x0, y0, x1, y1, w, m, 'monstera');
  } else {
    // Ficus: copa cheia em camadas sobre tronco fino.
    pot(b, 3, 6, 10, 10, M.ceramic);
    b.rect(4, 6, 8, 1, '#5b4636');
    const tr = '#7a5a3c';
    b.line(8, 6, 8, -4, tr, 1);
    b.line(7, 6, 7, 0, '#8e6b48', 1);
    b.line(8, -1, 5, -5, tr, 1);
    b.line(8, -3, 11, -6, tr, 1);
    foliage(b, 8, -10, 7, 5.5, M.leafDark, seed + 7);
    foliage(b, 6, -13, 4.6, 3.6, M.leaf, seed + 8);
    foliage(b, 11.5, -9, 3.8, 3.2, M.leaf, seed + 9);
    foliage(b, 4, -7, 3.2, 2.6, M.leaf, seed + 10);
  }
  b.outline();
  contact(b, 2, 14, 12, 3, 0.24);
  return { base: s };
}

// ------------------------------------------------------------------ divisórias de vidro

export function glassPartition(variant: string | undefined): BufFurniture {
  // Cerca de paliçada: troncos pontudos amarrados (separa áreas do acampamento).
  const v = variant ?? 'h';
  const s = floorSheet(1, 1, 22, 2);
  const b = s.buf;
  const log = M.oak;
  if (v === 'v') {
    // Norte-sul: vista de cima é uma faixa de topos de tronco (sem contorno para emendar).
    const cols = ['#4e3420', '#8a6239', '#b98a55', '#d9b88e', '#b98a55', '#8a6239', '#6b4a2b', '#3f2a18'];
    cols.forEach((c, i) => b.vline(4 + i, -16, 15, c));
    for (let y = -16; y < 16; y += 4) b.hline(5, 10, y, '#5a3f26');
    underRect(b, 12, -16, 2, 32, 'rgba(36,24,14,0.14)');
    return { base: s };
  }
  if (v === 'end') {
    // Ponta: poste mais grosso com topo pontudo e amarração.
    b.rect(5, -16, 6, 32, log.base);
    b.vline(5, -16, 15, log.lt);
    b.vline(10, -16, 15, log.dk);
    b.hline(6, 9, -17, log.lt);
    b.hline(7, 8, -18, log.hi);
    b.hline(5, 10, -6, '#c9b483');
    b.hline(5, 10, 6, '#c9b483');
    b.outline();
    contact(b, 3, 13, 10, 4, 0.2);
    return { base: s };
  }
  // 'h': leste-oeste — 4 troncos de 4px com pontas, amarrados por duas cordas.
  for (let i = 0; i < 4; i++) {
    const x = i * 4;
    const top = -14 - ((i * 5) % 3);
    b.rect(x, top, 4, 16 - top, log.base);
    b.vline(x, top, 15, log.lt);
    b.vline(x + 3, top, 15, log.dk);
    b.hline(x + 1, x + 2, top - 1, log.lt);
    b.set(x + 1, top - 2, log.hi);
  }
  b.hline(0, 15, -4, '#c9b483');
  b.hline(0, 15, 8, '#c9b483');
  b.hline(0, 15, 15, log.dd);
  b.outline();
  for (let y = 0; y < b.h; y++) {
    b.clear(-1, y - b.oy);
    b.clear(16, y - b.oy);
  }
  contact(b, 0, 14, 16, 3, 0.16);
  return { base: s };
}

// ------------------------------------------------------------------ reunião e apoio

export function meetingTable(seed: number): BufFurniture {
  const s = floorSheet(3, 2, 10);
  const b = s.buf;
  // Mesa de guerra: tampo de tábuas com um mapa aberto no meio.
  const m = M.oak;
  const r = rngOf(seed, 31);
  for (const x of [2, 43]) {
    b.rect(x, 21, 3, 11, M.walnut.base);
    b.vline(x, 21, 31, M.walnut.lt);
    b.vline(x + 2, 21, 31, M.walnut.dk);
  }
  topFace(b, 0, -4, 48, 24, m);
  b.hline(0, 47, 20, m.base);
  b.hline(0, 47, 21, m.dk);
  woodGrain(b, 1, -3, 46, 22, m, seed);
  // Mapa de pergaminho no centro, com rio, montanhas e marcadores.
  b.rect(4, 2, 40, 10, '#e2d2a4');
  b.hline(4, 43, 2, '#c9b483');
  b.hline(4, 43, 11, '#b8a272');
  b.line(6, 9, 40, 4, '#5f8aa8', 1);
  for (const x of [12, 16, 30]) {
    b.set(x, 4, '#7a6a58');
    b.hline(x - 1, x + 1, 5, '#7a6a58');
  }
  b.rect(21, 5, 2, 2, '#9c2f25');
  b.rect(26, 7, 2, 2, '#2f7a78');
  b.set(24, 6, '#e0b23c');
  // Notebooks e objetos (variam por semente).
  const laptop = (x: number, y: number, facing: 'up' | 'down') => {
    // Tomos abertos (de pé, virados para a câmera) ou fechados (capa de couro).
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
  // Copos de água / canecas.
  mug(b, 18, 14, pick(r, MUG_COLORS));
  // Velas.
  b.rect(29, -1, 2, 3, '#efe6cc');
  b.set(29, -2, '#f6c04a');
  b.rect(16, -2, 2, 3, '#efe6cc');
  b.set(16, -3, '#f6c04a');
  b.outline();
  contact(b, -1, 28, 50, 5, 0.22);
  underRect(b, 4, 22, 40, 8, 'rgba(36,24,14,0.18)');
  return { base: s };
}

export function stool(): BufFurniture {
  // Toco de árvore com anéis no topo.
  const s = floorSheet(1, 1, 2);
  const b = s.buf;
  const bark = M.walnut;
  b.rect(4, 6, 8, 9, bark.base);
  b.vline(4, 6, 14, bark.lt);
  b.vline(11, 6, 14, bark.dk);
  b.vline(7, 8, 13, bark.dk);
  b.set(3, 14, bark.dk);
  b.set(12, 14, bark.dk);
  b.ellipse(8, 6, 4.5, 2.2, '#d9b88e');
  b.ellipse(8, 6, 2.6, 1.2, '#c49a68');
  b.set(8, 6, '#a87a48');
  b.outline();
  contact(b, 3, 13, 10, 3, 0.22);
  return { base: s };
}

export function floorLamp(): BufFurniture {
  // Tocha alta num poste de madeira com braseiro de ferro.
  const s = floorSheet(1, 1, 26);
  const b = s.buf;
  b.hline(5, 10, 14, '#4f5459');
  b.hline(6, 9, 13, '#6a645a');
  b.vline(8, -16, 13, '#6b4a2b');
  b.vline(7, -16, 13, '#8a6239');
  b.hline(6, 9, -2, '#c9b483');
  // Braseiro.
  b.rect(4, -18, 8, 3, '#4f5459');
  b.hline(4, 11, -18, '#8f949a');
  b.set(4, -16, '#3a3630');
  b.set(11, -16, '#3a3630');
  // Chamas.
  b.hline(5, 10, -19, '#e08a2c');
  b.hline(6, 9, -20, '#f0b040');
  b.hline(6, 8, -21, '#f6c04a');
  b.set(7, -22, '#ffe08a');
  b.set(8, -23, '#fff2b0');
  b.outline();
  contact(b, 3, 13, 10, 3, 0.22);
  s.rects = { glow: rectAt(s, 4, -22, 8, 6) };
  return { base: s };
}

export function waterCooler(): BufFurniture {
  // Barril de água num suporte, com torneira de madeira e concha pendurada.
  const s = floorSheet(1, 1, 20);
  const b = s.buf;
  const st = M.oakDark;
  // Suporte.
  b.rect(3, 4, 2, 12, st.base);
  b.rect(11, 4, 2, 12, st.base);
  b.hline(3, 12, 10, st.lt);
  // Balde embaixo.
  b.rect(6, 11, 4, 4, M.oak.base);
  b.hline(6, 9, 12, '#4f5459');
  // Barril deitado de pé.
  const m = M.oak;
  for (let y = -14; y <= 3; y++) {
    const bulge = y > -11 && y < 0 ? 1 : 0;
    b.hline(3 - bulge, 12 + bulge, y, m.base);
    b.set(3 - bulge, y, m.lt);
    b.set(12 + bulge, y, m.dk);
  }
  for (const x of [6, 9]) b.vline(x, -13, 2, m.dk);
  for (const y of [-12, -5, 2]) b.hline(2, 13, y, '#4f5459');
  b.ellipse(7.5, -14.5, 4.5, 1.5, m.lt);
  b.ellipse(7.5, -14.5, 3, 0.8, '#5f8aa8');
  // Torneira.
  b.rect(7, 4, 2, 2, '#6b4a2b');
  b.set(8, 6, '#7fb0d0');
  // Concha.
  b.vline(14, -8, -3, '#8a6239');
  b.rect(13, -3, 3, 2, '#6b4a2b');
  b.outline();
  contact(b, 1, 13, 14, 4, 0.22);
  return { base: s };
}
