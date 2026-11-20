// Copa, lounge, banheiro e recepção. Coordenadas de desenho = footprint (base em y = h*TILE).
import { mix, ramp, shade, type Ramp } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';
import { floorSheet, rectAt, type BufFurniture } from '../core/sprite';
import { M, contact, foliage, frontFace, glass, monitorBack, mug, papers, pick, pot, rngOf, topFace, underRect, woodGrain } from './kit';

// ------------------------------------------------------------------ copa

// Cozinha do acampamento: armário de tábuas e tampo de pedra.
const CAB = ramp('#9a7048', 0.07);
const TOP = ramp('#a8a49a', 0.05);

/** Remove o contorno lateral (x = -1 e x = 16) para módulos que se encaixam lado a lado. */
function seamless(b: PixelBuf, w = 16): void {
  for (let y = -b.oy; y < b.h - b.oy; y++) {
    b.clear(-1, y);
    b.clear(w, y);
  }
}

/** Bancada encostada na parede norte: tampo claro e gabinete de madeira. */
function counterBase(b: PixelBuf, kind: 'plain' | 'drawers' | 'doors'): void {
  // Gabinete.
  frontFace(b, 0, 5, 16, 11, CAB);
  b.vline(0, 5, 15, CAB.lt);
  b.vline(15, 5, 13, CAB.dd);
  b.rect(1, 14, 14, 2, '#3f2a18');
  b.hline(1, 14, 14, '#2f1f12');
  if (kind === 'drawers') {
    for (const y of [8, 11]) {
      b.hline(1, 14, y, CAB.dd);
      b.hline(1, 14, y + 1, CAB.lt);
    }
    for (const y of [6, 9, 12]) b.rect(6, y, 4, 1, '#4f5459');
  } else if (kind === 'doors') {
    b.vline(7, 6, 13, CAB.dd);
    b.vline(8, 6, 13, CAB.lt);
    b.rect(5, 8, 1, 3, '#4f5459');
    b.rect(10, 8, 1, 3, '#4f5459');
  } else {
    b.rect(12, 8, 1, 3, '#4f5459');
    b.hline(1, 14, 6, CAB.lt);
  }
  // Tampo de pedra clara com borda.
  topFace(b, 0, -3, 16, 7, TOP);
  b.hline(0, 15, 4, TOP.dk);
  b.hline(0, 15, 3, TOP.hi);
  for (const [x, y] of [[3, -1], [11, 1], [7, 0]] as const) b.set(x, y, TOP.base);
}

export function counter(variant: string | undefined): BufFurniture {
  const s = floorSheet(1, 1, 6);
  counterBase(s.buf, variant === 'drawers' ? 'drawers' : 'plain');
  s.buf.outline();
  seamless(s.buf);
  contact(s.buf, 0, 14, 16, 3, 0.2);
  return { base: s };
}

export function counterSink(): BufFurniture {
  // Bacia de pedra com balde d'água e concha.
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  counterBase(b, 'doors');
  b.rect(3, -1, 10, 4, '#7c766a');
  b.rect(4, 0, 8, 3, '#4f7a8a');
  b.hline(4, 11, 0, '#6a9aa8');
  b.set(9, 1, '#9ac8d0');
  b.hline(3, 12, -1, '#a8a296');
  // Balde pendurado numa haste.
  b.vline(13, -8, -2, '#6b4a2b');
  b.hline(10, 13, -8, '#6b4a2b');
  b.rect(9, -7, 3, 3, '#8a6239');
  b.hline(9, 11, -6, '#4f5459');
  b.outline();
  seamless(b);
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

export function coffeeMachine(state: number): BufFurniture {
  // Caldeirão de ferro sobre um fogareiro de pedra; state 1 = fervendo.
  const s = floorSheet(1, 1, 18);
  const b = s.buf;
  counterBase(b, 'drawers');
  const on = state >= 1;
  const iron = ramp('#3b3530', 0.08);
  // Fogareiro.
  b.rect(3, -3, 10, 3, '#6a645a');
  b.hline(3, 12, -3, '#8f887c');
  if (on) {
    b.hline(5, 10, -4, '#e08a2c');
    b.set(7, -5, '#f6c04a');
  }
  // Caldeirão.
  for (let y = -12; y <= -5; y++) {
    const half = y < -10 ? 5 : y > -7 ? 4 : 6;
    b.hline(8 - half, 7 + half, y, iron.base);
    b.set(8 - half, y, iron.lt);
    b.set(7 + half, y, iron.dk);
  }
  b.hline(2, 13, -13, iron.lt);
  b.hline(3, 12, -12, on ? '#6a8a3a' : '#4a5a2a');
  if (on) {
    b.set(5, -12, '#9ac060');
    b.set(10, -12, '#9ac060');
  }
  // Alça e concha.
  b.set(1, -11, iron.dk);
  b.set(14, -11, iron.dk);
  b.line(11, -12, 14, -17, '#8a6239', 1);
  b.outline();
  seamless(b);
  contact(b, 0, 14, 16, 3, 0.2);
  if (on) {
    for (const [x, y, a] of [[6, -14, 0.55], [9, -16, 0.45], [7, -18, 0.35]] as const) b.set(x, y, `rgba(220,240,200,${a})`);
  }
  return { base: s };
}

export function microwave(): BufFurniture {
  // Fornalha de barro (domo) com pão assando.
  const s = floorSheet(1, 1, 12);
  const b = s.buf;
  counterBase(b, 'plain');
  const clay = M.terracotta;
  for (let y = -10; y <= 1; y++) {
    const half = y < -8 ? 4 + (y + 10) : 7;
    b.hline(8 - half, 7 + half, y, clay.base);
    b.set(8 - half, y, clay.lt);
    b.set(7 + half, y, clay.dk);
  }
  b.hline(5, 10, -11, clay.lt);
  b.rect(4, -5, 8, 6, '#2a1d14');
  b.hline(5, 10, -6, clay.dd);
  b.hline(5, 10, 0, '#e08a2c');
  b.rect(6, -2, 4, 2, '#d9a050');
  b.hline(6, 9, -2, '#e8c070');
  b.outline();
  seamless(b);
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

export function fridge(): BufFurniture {
  // Despensa alta de tábuas, com carne curada e ervas penduradas por fora.
  const s = floorSheet(1, 1, 24);
  const b = s.buf;
  const m = M.oakDark;
  topFace(b, 0, -23, 16, 3, m);
  frontFace(b, 0, -20, 16, 34, m);
  woodGrain(b, 0, -20, 16, 34, m, 9, true);
  b.vline(0, -20, 13, m.hi);
  b.rect(1, 14, 14, 2, '#3f2a18');
  b.hline(0, 15, -9, '#4f5459');
  b.hline(0, 15, 6, '#4f5459');
  // Tranca de ferro.
  b.rect(12, -6, 2, 4, '#4f5459');
  b.set(12, -6, '#8f949a');
  // Pernil e ervas pendurados.
  b.vline(4, -19, -17, '#c9b483');
  b.rect(3, -16, 3, 5, '#9c4a3a');
  b.set(3, -16, '#c46a5a');
  b.vline(4, -11, -10, '#e8dcc0');
  b.vline(8, -19, -16, '#c9b483');
  b.rect(7, -15, 3, 3, '#5f8a3a');
  b.set(8, -13, '#4f7d3a');
  b.outline();
  contact(b, 0, 13, 16, 4, 0.24);
  return { base: s };
}

export function vendingMachine(): BufFurniture {
  // Banca de suprimentos: estante de caixotes com mercadorias e uma lanterna (o brilho).
  const s = floorSheet(1, 1, 24);
  const b = s.buf;
  const m = M.oak;
  topFace(b, 0, -23, 16, 3, m);
  frontFace(b, 0, -20, 16, 36, m);
  b.vline(0, -20, 15, m.lt);
  const gx = 2;
  const gy = -18;
  const gw = 12;
  const gh = 22;
  b.rect(gx, gy, gw, gh, '#3a2a1c');
  const r = rngOf(7, 61);
  const goods = ['#e0b23c', '#9c2f25', '#d9cba8', '#5f8a3a', '#b8572c', '#8f949a', '#d48a2c'];
  for (let row = 0; row < 5; row++) {
    const y = gy + 1 + row * 4;
    for (let k = 0; k < 4; k++) {
      const c = pick(r, goods);
      b.rect(gx + 1 + k * 3, y + 1, 2, 2, c);
      b.set(gx + 1 + k * 3, y + 1, shade(c, 0.2));
    }
    b.hline(gx, gx + gw - 1, y + 3, m.lt);
  }
  // Lanterna pendurada.
  b.rect(12, -22, 3, 3, '#f6c04a');
  b.set(13, -21, '#fff2b0');
  b.rect(2, 7, 12, 4, M.cardboard.base);
  b.hline(2, 13, 7, M.cardboard.lt);
  b.vline(7, 7, 10, M.cardboard.dk);
  b.outline();
  contact(b, 0, 13, 16, 4, 0.26);
  s.rects = { glow: rectAt(s, gx, gy, gw, gh) };
  return { base: s };
}

export function cafeTable(): BufFurniture {
  const s = floorSheet(1, 1, 4);
  const b = s.buf;
  b.ellipse(8, 14.5, 3.5, 1.3, '#3f2a18');
  b.rect(7, 7, 2, 7, '#6b4a2b');
  b.vline(7, 7, 13, '#8a6239');
  const t = M.oak;
  b.ellipse(8, 5.5, 7, 3.5, t.dk);
  b.ellipse(8, 4.8, 7, 3.2, t.lt);
  b.set(4, 3, t.hi);
  b.set(5, 3, t.hi);
  // Vela.
  b.rect(7, 1, 2, 3, '#efe6cc');
  b.set(7, 0, '#f6c04a');
  b.set(8, -1, '#fff2b0');
  b.outline();
  contact(b, 3, 13, 10, 3, 0.22);
  return { base: s };
}

const CAFE_SEAT = ramp('#9a7048', 0.07);

export function cafeChair(variant: string | undefined): BufFurniture {
  const v = variant ?? 'down';
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  const legs = '#4e3420';
  for (const x of [4, 11]) b.vline(x, 9, 15, legs);
  for (const x of [5, 10]) b.vline(x, 9, 13, '#6b4a2b');
  const seat = () => {
    b.rect(3, 5, 10, 4, CAFE_SEAT.lt);
    b.hline(3, 12, 5, CAFE_SEAT.hi);
    b.hline(3, 12, 8, CAFE_SEAT.dk);
    b.hline(3, 12, 9, CAFE_SEAT.dd);
  };
  const backPanel = (x: number, y: number, w: number, h: number, m: Ramp) => {
    b.rect(x, y, w, h, m.base);
    b.hline(x, x + w - 1, y, m.hi);
    b.vline(x, y, y + h - 1, m.lt);
    b.vline(x + w - 1, y, y + h - 1, m.dk);
  };
  if (v === 'down') {
    for (const x of [4, 11]) b.vline(x, -3, 5, legs);
    backPanel(3, -6, 10, 5, CAFE_SEAT);
    seat();
    b.outline();
  contact(b, 2, 13, 12, 3, 0.2);
    return { base: s };
  }
  if (v === 'up') {
    seat();
    b.outline();
    const front = floorSheet(1, 1, 10);
    const f = front.buf;
    for (const x of [4, 11]) f.vline(x, 6, 10, legs);
    f.rect(3, 3, 10, 5, CAFE_SEAT.base);
    f.hline(3, 12, 3, CAFE_SEAT.hi);
    f.hline(3, 12, 7, CAFE_SEAT.dk);
    f.vline(12, 3, 7, CAFE_SEAT.dk);
    f.outline();
    return { base: s, front };
  }
  // left/right: encosto lateral (do lado oposto ao olhar).
  seat();
  const bx = v === 'left' ? 11 : 3;
  b.vline(bx + 1, 0, 8, legs);
  backPanel(bx, -6, 2, 12, CAFE_SEAT);
  b.outline();
  return { base: s };
}

// ------------------------------------------------------------------ lounge

// Bancos forrados de peles com almofadas de lã tingida.
const SOFA = ramp('#7a6048', 0.07);
const PILLOW = ramp('#9c2f25', 0.07);

function pillow(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 6, 5, PILLOW.base);
  b.hline(x + 1, x + 4, y, PILLOW.hi);
  b.vline(x, y + 1, y + 3, PILLOW.lt);
  b.vline(x + 5, y + 1, y + 4, PILLOW.dk);
  b.hline(x + 1, x + 5, y + 4, PILLOW.dk);
  b.set(x + 2, y + 2, PILLOW.dk);
}

/** Almofada estofada (retângulo com cantos arredondados, topo iluminado e base sombreada). */
function cushion(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp, top = 1): void {
  b.rect(x, y, w, h, m.base);
  b.rect(x, y, w, top, m.lt);
  b.hline(x + 1, x + w - 2, y, m.hi);
  b.hline(x, x + w - 1, y + h - 1, m.dk);
  b.vline(x + w - 1, y + 1, y + h - 1, m.dk);
  b.vline(x, y + 1, y + h - 2, m.lt);
  b.set(x, y, m.base);
  b.set(x + w - 1, y, m.dk);
  b.set(x, y + h - 1, m.dk);
}

/** Braço enrolado do sofa/poltrona (topo arredondado + face frontal). */
function rollArm(b: PixelBuf, x: number, top: number, w: number, bottom: number): void {
  b.rect(x, top + 2, w, bottom - top - 2, SOFA.base);
  b.rect(x, top, w, 3, SOFA.lt);
  b.hline(x + 1, x + w - 2, top, SOFA.hi);
  b.hline(x, x + w - 1, top + 3, SOFA.dk);
  b.vline(x, top + 3, bottom, SOFA.lt);
  b.vline(x + w - 1, top + 1, bottom, SOFA.dk);
  b.hline(x, x + w - 1, bottom, SOFA.dd);
  b.clear(x, top);
  b.clear(x + w - 1, top);
}

function legs(b: PixelBuf, xs: readonly number[], y: number): void {
  for (const x of xs) {
    b.rect(x, y, 2, 2, '#5a4232');
    b.set(x, y, '#7a5a42');
  }
}

export function sofa(variant: string | undefined): BufFurniture {
  const up = variant === 'up';
  const s = floorSheet(3, 1, 14);
  const b = s.buf;
  if (!up) {
    // Encosto com 3 almofadas (de frente para a câmera).
    b.rect(5, -11, 38, 13, SOFA.dk);
    b.hline(6, 41, -11, SOFA.base);
    for (let i = 0; i < 3; i++) cushion(b, 6 + i * 12, -10, 12, 11, SOFA, 2);
    b.hline(6, 41, 1, SOFA.dd);
    // Assento com 3 almofadas e borda frontal clara.
    for (let i = 0; i < 3; i++) cushion(b, 6 + i * 12, 2, 12, 7, ramp(SOFA.lt, 0.06), 4);
    // Base frontal e pés.
    b.rect(5, 9, 38, 5, SOFA.dk);
    b.hline(5, 42, 9, SOFA.base);
    b.hline(5, 42, 13, SOFA.dd);
    legs(b, [7, 39], 14);
    rollArm(b, 0, -5, 6, 13);
    rollArm(b, 42, -5, 6, 13);
    legs(b, [1, 45], 14);
    pillow(b, 7, -5);
    pillow(b, 35, -5);
    b.outline();
    contact(b, -1, 13, 50, 4, 0.24);
    return { base: s };
  }
  // De costas (quem senta olha para o norte): base = braços altos + faixa do assento + só o topo
  // das almofadas; front = traseira do encosto (painel contínuo, sem divisões de assento).
  backSeat(b, 5, 42);
  pillowTop(b, 8, -3);
  pillowTop(b, 34, -3);
  rollArm(b, 0, -7, 6, 13);
  rollArm(b, 42, -7, 6, 13);
  b.outline();
  contact(b, -1, 13, 50, 4, 0.24);
  const front = floorSheet(3, 1, 14);
  const f = front.buf;
  backPanel(f, 0, 47);
  darkLegs(f, [2, 23, 44], 14);
  f.outline();
  return { base: s, front };
}

/** Faixa do assento vista por trás do encosto (topo claro, borda de trás mais escura). */
function backSeat(b: PixelBuf, x0: number, x1: number): void {
  const seat = ramp(SOFA.lt, 0.06);
  b.rect(x0, -3, x1 - x0 + 1, 5, seat.base);
  b.hline(x0, x1, -3, SOFA.base);
  b.hline(x0, x1, -2, seat.lt);
}

/** Só a parte de cima da almofada, aparecendo acima do encosto. */
function pillowTop(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 6, 4, PILLOW.base);
  b.hline(x + 1, x + 4, y, PILLOW.hi);
  b.vline(x, y + 1, y + 3, PILLOW.lt);
  b.vline(x + 5, y + 1, y + 3, PILLOW.dk);
  b.set(x, y, PILLOW.lt);
  b.set(x + 5, y, PILLOW.dk);
}

/**
 * Traseira do encosto (vista de trás): painel contínuo em 2 tons mais escuros que o assento, com
 * borda superior arredondada (rolo claro + vivo escuro), laterais sombreadas e base mais escura.
 * Ocupa y = 1..13 do footprint (cobre o tronco de quem senta; a cabeça fica à mostra).
 */
function backPanel(f: PixelBuf, x0: number, x1: number): void {
  const back = SOFA.dk;
  const deep = SOFA.dd;
  // Rolo superior arredondado.
  f.hline(x0 + 3, x1 - 3, 1, SOFA.lt);
  f.hline(x0 + 1, x1 - 1, 2, SOFA.base);
  f.hline(x0 + 4, x0 + 9, 2, SOFA.lt);
  f.hline(x0, x1, 3, SOFA.base);
  f.set(x0 + 2, 1, SOFA.base);
  f.set(x1 - 2, 1, SOFA.base);
  // Vivo sob o rolo e face traseira lisa.
  f.hline(x0, x1, 4, deep);
  f.rect(x0, 5, x1 - x0 + 1, 7, back);
  // Leve curvatura: a parte de cima da face pega um pouco mais de luz.
  f.hline(x0, x1, 5, mix(back, SOFA.base, 0.45));
  f.hline(x0, x1, 6, mix(back, SOFA.base, 0.2));
  f.vline(x0, 4, 12, SOFA.base);
  f.vline(x1, 3, 12, deep);
  // Base mais escura (sombra embaixo do estofado).
  f.hline(x0, x1, 12, deep);
  f.hline(x0, x1, 13, shade(deep, -0.05));
}

/** Pés escuros (vistos por trás). */
function darkLegs(b: PixelBuf, xs: readonly number[], y: number): void {
  for (const x of xs) {
    b.rect(x, y, 2, 2, '#3b2d24');
    b.set(x, y, '#54402f');
  }
}

export function armchair(variant: string | undefined): BufFurniture {
  const v = variant ?? 'down';
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  if (v === 'down' || v === 'up') {
    if (v === 'down') {
      b.rect(3, -10, 10, 12, SOFA.dk);
      cushion(b, 3, -9, 10, 10, SOFA, 2);
      cushion(b, 3, 2, 10, 7, ramp(SOFA.lt, 0.06), 4);
      b.rect(3, 9, 10, 5, SOFA.dk);
      b.hline(3, 12, 9, SOFA.base);
      rollArm(b, 0, -4, 4, 13);
      rollArm(b, 12, -4, 4, 13);
      legs(b, [1, 13], 14);
      b.outline();
      contact(b, -1, 13, 18, 4, 0.24);
      return { base: s };
    }
    // De costas: mesma leitura do sofá (braços altos, assento atrás do encosto, encosto contínuo).
    backSeat(b, 3, 12);
    rollArm(b, 0, -6, 4, 13);
    rollArm(b, 12, -6, 4, 13);
    b.outline();
    contact(b, -1, 13, 18, 4, 0.24);
    const front = floorSheet(1, 1, 14);
    const f = front.buf;
    backPanel(f, 0, 15);
    darkLegs(f, [1, 13], 14);
    f.outline();
    return { base: s, front };
  }
  // Lateral: encosto do lado oposto ao olhar, braço baixo na frente.
  const left = v === 'left';
  const bx = left ? 11 : 0;
  cushion(b, 1, 2, 14, 8, ramp(SOFA.lt, 0.06), 5);
  b.rect(1, 9, 14, 5, SOFA.dk);
  b.hline(1, 14, 9, SOFA.base);
  b.rect(bx, -10, 5, 24, SOFA.base);
  b.rect(bx, -10, 5, 2, SOFA.lt);
  b.hline(bx + 1, bx + 3, -10, SOFA.hi);
  b.vline(bx, -8, 13, SOFA.lt);
  b.vline(bx + 4, -8, 13, SOFA.dk);
  b.clear(bx, -10);
  b.clear(bx + 4, -10);
  b.hline(bx, bx + 4, 13, SOFA.dd);
  legs(b, [1, 13], 14);
  b.outline();
  contact(b, -1, 13, 18, 4, 0.24);
  return { base: s };
}

export function coffeeTable(seed: number): BufFurniture {
  const s = floorSheet(2, 1, 6);
  const b = s.buf;
  const w = ramp('#5e3f27', 0.06);
  for (const x of [2, 28]) {
    b.rect(x, 9, 2, 5, w.dd);
  }
  topFace(b, 1, 1, 30, 8, w);
  woodGrain(b, 2, 2, 28, 6, w, seed);
  b.hline(1, 30, 9, w.base);
  b.hline(1, 30, 10, w.dk);
  // Fruteira.
  b.ellipse(11, 4, 4, 2, '#e2d2a4');
  b.ellipse(11, 4.6, 3, 1.3, '#c9b483');
  for (const [x, y, c] of [[9, 2, '#d48a2c'], [11, 2, '#9c2f25'], [13, 3, '#d48a2c'], [10, 3, '#5f8a3a']] as const) {
    b.rect(x, y, 2, 2, c);
    b.set(x, y, shade(c, 0.2));
  }
  // Revistas.
  b.rect(19, 3, 8, 5, '#9c2f25');
  b.rect(20, 2, 7, 5, '#e2d2a4');
  b.rect(21, 3, 4, 2, '#9c2f25');
  b.hline(21, 25, 6, '#7a5a3a');
  if (seed % 2) mug(b, 4, 4, '#f2c14e');
  b.outline();
  contact(b, 0, 12, 32, 4, 0.22);
  return { base: s };
}

export function pingpongTable(): BufFurniture {
  const s = floorSheet(3, 2, 8);
  const b = s.buf;
  const t = ramp('#7a5a38', 0.07);
  // Pernas.
  for (const x of [4, 42]) {
    b.rect(x, 22, 2, 9, '#4e3420');
    b.vline(x, 22, 30, '#6b4a2b');
  }
  b.rect(22, 22, 4, 7, '#4e3420');
  // Tampo.
  b.rect(0, -4, 48, 25, t.lt);
  b.hline(0, 47, 20, t.dk);
  b.hline(0, 47, 21, t.dd);
  b.rect(0, 22, 48, 1, '#3f2a18');
  // Linhas brancas: borda e linha central (ao longo do comprimento).
  b.hline(0, 47, -4, '#e2d2a4');
  b.hline(0, 47, 19, '#e2d2a4');
  b.vline(0, -4, 19, '#e2d2a4');
  b.vline(47, -4, 19, '#e2d2a4');
  b.hline(1, 46, 7, 'rgba(244,246,248,0.8)');
  // Rede (corre norte-sul no meio), com altura.
  for (let y = -8; y <= 18; y++) {
    b.set(23, y, y % 2 ? 'rgba(240,244,248,0.55)' : 'rgba(40,46,60,0.45)');
    b.set(24, y, 'rgba(40,46,60,0.35)');
  }
  b.hline(22, 25, -9, '#4e3420');
  b.hline(22, 25, 19, '#4e3420');
  b.vline(22, -9, 15, '#e2d2a4');
  b.outline();
  contact(b, 0, 27, 48, 5, 0.22);
  return { base: s };
}

// Sacos de grãos de juta (tons de estopa, com uma faixa tingida).
const BEANBAG: Readonly<Record<string, string>> = { red: '#a8805a', blue: '#9a8a6a', yellow: '#c4a46a', green: '#8a8a5a' };

export function beanbag(variant: string | undefined): BufFurniture {
  const m = ramp(BEANBAG[variant ?? 'red'] ?? BEANBAG.red, 0.08);
  const s = floorSheet(1, 1, 6);
  const b = s.buf;
  b.ellipse(8, 9, 7.5, 6, m.dk);
  b.ellipse(7.6, 8, 7, 5.5, m.base);
  b.ellipse(7.2, 6.5, 5, 3.5, m.lt);
  b.ellipse(8, 7.5, 3.5, 2, m.base);
  b.set(4, 4, m.hi);
  b.set(5, 3, m.hi);
  b.set(6, 3, m.hi);
  b.hline(4, 12, 14, m.dd);
  b.outline();
  contact(b, 0, 12, 16, 4, 0.24);
  return { base: s };
}

export function arcade(): BufFurniture {
  const s = floorSheet(1, 1, 24);
  const b = s.buf;
  const m = ramp('#5e3f27', 0.07);
  frontFace(b, 1, -20, 14, 36, m);
  b.vline(1, -20, 15, m.lt);
  // Letreiro aceso.
  b.rect(1, -22, 14, 4, '#f2c14e');
  b.hline(1, 14, -22, '#fff2b0');
  for (const x of [3, 5, 8, 10, 12]) b.set(x, -20, '#9c2f25');
  // Tela.
  b.rect(2, -17, 12, 9, '#2a1d14');
  const screen = { x: 3, y: -16, w: 10, h: 7 };
  b.rect(screen.x, screen.y, screen.w, screen.h, '#26302a');
  b.rect(5, -13, 2, 2, '#7fe0a0');
  b.rect(9, -15, 2, 1, '#d48a2c');
  b.set(8, -11, '#f2c14e');
  // Painel de controle inclinado.
  b.rect(1, -7, 14, 4, m.hi);
  b.hline(1, 14, -4, m.dk);
  b.rect(4, -7, 2, 2, '#9c2f25');
  b.set(4, -7, '#ff9a9a');
  b.vline(5, -5, -4, '#3f2a18');
  for (const [x, c] of [[9, '#9c2f25'], [11, '#f2c14e'], [13, '#4cae6a']] as const) b.set(x, -6, c);
  // Porta de fichas.
  b.rect(5, 2, 6, 6, m.dd);
  b.set(6, 4, '#f2a03d');
  b.set(9, 4, '#f2a03d');
  // Arte lateral.
  b.line(2, 13, 6, 9, '#9c2f25');
  b.line(3, 13, 7, 9, '#2f7a78');
  b.outline();
  contact(b, 0, 13, 16, 4, 0.26);
  s.rects = { screen: rectAt(s, screen.x, screen.y, screen.w, screen.h) };
  return { base: s };
}

// ------------------------------------------------------------------ banheiro

export function toiletStall(state: number): BufFurniture {
  const occupied = state >= 1;
  const panel = ramp('#8a6239', 0.06);
  const rail = ramp('#6b4a2b', 0.06);
  const s = floorSheet(2, 2, 26, 3, 4);
  const b = s.buf;
  // Interior: sombra no piso e vaso ao fundo.
  const c = ramp('#a8a49a', 0.045);
  b.rect(11, -7, 10, 6, c.base);
  b.hline(11, 20, -7, c.hi);
  b.hline(11, 20, -2, c.dk);
  b.rect(14, -6, 4, 1, '#8a6239');
  b.ellipse(16, 3, 5.5, 4, c.dk);
  b.ellipse(16, 2.5, 5, 3.6, c.lt);
  b.ellipse(16, 3, 3, 2.2, '#7c766a');
  b.ellipse(16, 3.2, 2, 1.4, '#4a3a2a');
  // Papel higiênico na divisória esquerda.
  b.rect(3, 2, 3, 3, '#e2d2a4');
  b.set(5, 4, '#c9b483');
  b.vline(3, 2, 4, '#4f5459');
  // Divisórias laterais (topo visto de cima, de y=-22 até a frente).
  for (const x of [0, 29]) {
    b.rect(x, -22, 3, 34, panel.base);
    b.vline(x, -22, 11, panel.lt);
    b.vline(x + 2, -22, 11, panel.dk);
    b.hline(x, x + 2, -22, rail.hi);
  }
  b.outline();
  underRect(b, 2, 0, 28, 12, 'rgba(30,34,52,0.12)');
  // Frente: painel com porta (cobre o interior).
  const front = floorSheet(2, 2, 26, 3, 4);
  const f = front.buf;
  f.rect(0, 10, 32, 20, panel.base);
  f.rect(0, 9, 32, 2, rail.lt);
  f.hline(0, 31, 9, rail.hi);
  f.vline(0, 11, 29, panel.lt);
  f.vline(31, 11, 29, panel.dk);
  f.hline(0, 31, 29, panel.dk);
  // Pés metálicos (vão inferior).
  for (const x of [1, 30]) f.rect(x, 30, 1, 2, '#4f5459');
  if (occupied) {
    f.rect(7, 12, 18, 17, panel.lt);
    f.vline(7, 12, 28, panel.dk);
    f.vline(24, 12, 28, panel.dd);
    f.hline(7, 24, 12, panel.hi);
    f.rect(21, 18, 2, 3, '#6b4a2b');
    f.rect(21, 15, 2, 2, '#9c2f25');
  } else {
    // Porta entreaberta: vão escuro à direita e folha estreita em perspectiva.
    f.rect(19, 12, 6, 17, '#3f2a18');
    f.rect(20, 13, 4, 15, '#5e3f27');
    f.rect(7, 12, 12, 17, panel.lt);
    f.vline(7, 12, 28, panel.dk);
    f.vline(18, 12, 28, panel.dk);
    f.hline(7, 18, 12, panel.hi);
    f.rect(16, 18, 2, 3, '#6b4a2b');
    f.rect(21, 15, 2, 2, '#5fd07a');
  }
  f.outline();
  return { base: s, front };
}

export function sink(): BufFurniture {
  const s = floorSheet(1, 1, 10);
  const b = s.buf;
  const cab = ramp('#9a7048', 0.05);
  frontFace(b, 1, 4, 14, 12, cab);
  b.vline(7, 5, 14, cab.dd);
  b.vline(8, 5, 14, cab.lt);
  b.rect(5, 8, 1, 3, '#4f5459');
  b.rect(10, 8, 1, 3, '#4f5459');
  topFace(b, 0, -3, 16, 7, ramp('#a8a49a', 0.04));
  // Cuba de louça.
  b.ellipse(8, 0.5, 5, 2.6, '#8f887c');
  b.ellipse(8, 0.8, 4, 1.8, '#4f7a8a');
  b.set(8, 1, '#2f4a52');
  // Torneira e saboneteira.
  b.rect(7, -5, 2, 3, '#6b4a2b');
  b.set(7, -5, '#e2d2a4');
  b.hline(7, 9, -6, '#6b4a2b');
  b.rect(12, -4, 2, 3, '#f2c14e');
  b.set(12, -5, '#6b4a2b');
  b.outline();
  contact(b, 0, 14, 16, 3, 0.2);
  return { base: s };
}

// ------------------------------------------------------------------ recepção

export function receptionDesk(seed: number): BufFurniture {
  const s = floorSheet(3, 1, 16);
  const b = s.buf;
  const wood = M.oak;
  const stone = ramp('#8a6239', 0.04);
  // Área de trabalho (atrás) com monitor de costas e planta.
  topFace(b, 1, -10, 46, 6, M.white);
  monitorBack(b, 8, -15, 13, 7);
  pot(b, 38, -13, 5, 4, M.ceramic);
  foliage(b, 40.5, -16, 3.5, 3, M.leaf, seed + 1);
  // Balcão frontal com faixa de acento.
  frontFace(b, 0, -2, 48, 18, wood);
  woodGrain(b, 1, -1, 46, 14, wood, seed, true);
  b.rect(0, 5, 48, 3, '#9c2f25');
  b.hline(0, 47, 5, '#c4483a');
  b.hline(0, 47, 7, '#6e1f18');
  b.rect(0, 14, 48, 2, wood.dd);
  // Tampo (prateleira de atendimento).
  topFace(b, -1, -6, 50, 5, stone);
  b.hline(-1, 48, -2, stone.dk);
  // Campainha, folhetos e caneta.
  b.rect(30, -6, 4, 2, '#d9a42e');
  b.set(31, -7, '#f2c14e');
  b.set(32, -7, '#f2c14e');
  papers(b, 4, -5, 7, 3);
  b.line(14, -4, 18, -5, '#4e3420');
  b.outline();
  contact(b, -1, 13, 50, 4, 0.24);
  return { base: s };
}

export function bench(): BufFurniture {
  const s = floorSheet(2, 1, 10);
  const b = s.buf;
  const w = M.oak;
  const frame = '#4e3420';
  // Estrutura metálica.
  for (const x of [2, 29]) {
    b.vline(x, -6, 15, frame);
    b.vline(x + 1, 8, 15, '#6b4a2b');
  }
  b.hline(2, 30, 13, frame);
  // Encosto em ripas.
  for (const y of [-6, -3]) {
    b.rect(1, y, 30, 2, w.base);
    b.hline(1, 30, y, w.lt);
  }
  // Assento em ripas.
  for (const y of [2, 5]) {
    b.rect(0, y, 32, 3, w.lt);
    b.hline(0, 31, y, w.hi);
    b.hline(0, 31, y + 2, w.dk);
  }
  b.rect(0, 8, 32, 1, w.dd);
  b.outline();
  contact(b, 0, 13, 32, 3, 0.22);
  return { base: s };
}
