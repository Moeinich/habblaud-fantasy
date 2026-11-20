// Itens montados na parede norte. Coordenadas de desenho: x = 0 na borda esquerda do trecho,
// y = 0 na linha do rodapé; a face da parede vai de y = -32 (topo, com a tampa até -28) a 0.
import { ramp, shade } from '../core/color';
import { rectAt, wallSheet, type BufFurniture } from '../core/sprite';
import { ACCENTS, M, book, foliage, glass, mug, pick, pot, rngOf, smallSucculent } from './kit';

/** Sombra suave projetada na parede (abaixo/direita do objeto). */
function wallShadow(b: import('../core/pixbuf').PixelBuf, x: number, y: number, w: number, h: number): void {
  for (let yy = y + 1; yy <= y + h; yy++) b.under(x + w, yy, 'rgba(36,24,14,0.2)');
  for (let xx = x + 1; xx <= x + w; xx++) b.under(xx, y + h, 'rgba(36,24,14,0.2)');
}

export function whiteboard(): BufFurniture {
  const s = wallSheet(3);
  const b = s.buf;
  const frame = M.oakDark;
  const x = 2;
  const y = -27;
  const w = 44;
  const h = 19;
  b.rect(x, y, w, h, frame.base);
  b.hline(x, x + w - 1, y, frame.hi);
  b.vline(x, y, y + h - 1, frame.lt);
  b.vline(x + w - 1, y, y + h - 1, frame.dk);
  b.hline(x, x + w - 1, y + h - 1, frame.dk);
  // Couro esticado (o mapa de guerra), com cravos de ferro nos cantos.
  b.rect(x + 1, y + 1, w - 2, h - 2, '#b89a72');
  for (const [cx, cy] of [[x + 1, y + 1], [x + w - 2, y + 1], [x + 1, y + h - 2], [x + w - 2, y + h - 2]] as const) b.set(cx, cy, '#4f5459');
  // Bandeja com pincéis e apagador.
  b.rect(x + 3, y + h, w - 6, 2, frame.base);
  b.hline(x + 3, x + w - 4, y + h, frame.lt);
  for (const [i, c] of [[0, '#9c2f25'], [3, '#2f7a78'], [6, '#2a1d14'], [9, '#5f8a3a']] as const) {
    b.rect(x + 8 + i, y + h - 1, 2, 1, c);
  }
  // Adaga cravada na moldura.
  b.hline(x + w - 14, x + w - 9, y + h - 1, '#8f949a');
  b.rect(x + w - 16, y + h - 2, 2, 2, '#6b4a2b');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 3);
  s.rects = { board: rectAt(s, x + 2, y + 2, w - 4, h - 4) };
  return { base: s };
}

export function windowItem(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const fr = M.oakDark;
  const x = 2;
  const y = -27;
  const w = 28;
  const h = 19;
  // Moldura (o vidro fica transparente: o mundo desenha o céu antes).
  b.rect(x, y, w, 2, fr.lt);
  b.rect(x, y + h - 2, w, 2, fr.base);
  b.rect(x, y, 2, h, fr.lt);
  b.rect(x + w - 2, y, 2, h, fr.base);
  b.hline(x, x + w - 1, y, fr.hi);
  b.vline(x + w - 1, y, y + h - 1, fr.dk);
  // Montantes.
  b.rect(x + 13, y + 2, 2, h - 4, fr.base);
  b.vline(x + 14, y + 2, y + h - 3, fr.dk);
  b.hline(x + 2, x + w - 3, y + 2, 'rgba(40,50,70,0.25)');
  // Vidro: só reflexos semitransparentes.
  const gx = x + 2;
  const gy = y + 2;
  const gw = w - 4;
  const gh = h - 4;
  for (const off of [3, 16]) {
    b.line(gx + off + 6, gy, gx + off, gy + gh - 1, 'rgba(255,255,255,0.28)');
    b.line(gx + off + 7, gy, gx + off + 1, gy + gh - 1, 'rgba(255,255,255,0.16)');
  }
  // Peitoril.
  b.rect(x - 1, y + h, w + 2, 2, fr.lt);
  b.hline(x - 1, x + w, y + h, fr.hi);
  b.hline(x - 1, x + w, y + h + 1, fr.dk);
  // Venezianas de tábua abertas dos lados.
  for (const sx of [x - 5, x + w + 1]) {
    b.rect(sx, y, 4, h, M.oak.base);
    b.vline(sx, y, y + h - 1, M.oak.lt);
    b.vline(sx + 3, y, y + h - 1, M.oak.dk);
    b.hline(sx, sx + 3, y + 4, '#4f5459');
    b.hline(sx, sx + 3, y + h - 5, '#4f5459');
  }
  b.outline();
  wallShadow(b, x - 1, y, w + 2, h + 3);
  s.rects = { glass: rectAt(s, gx, gy, gw, gh) };
  return { base: s };
}

export function clock(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const cx = 8;
  const cy = -21.5;
  // Escudo redondo com mostrador de bronze (o relógio do acampamento).
  b.ellipse(cx, cy, 6.5, 6.5, '#5e3f27');
  b.ellipse(cx, cy, 5.5, 5.5, '#c9a45a');
  b.ellipse(cx - 1, cy - 1, 3, 3, '#e0c070');
  for (const [dx, dy] of [[0, -5], [5, 0], [0, 4], [-5, 0]] as const) b.set(Math.floor(cx + dx), Math.floor(cy + dy), '#4f5459');
  b.outline();
  wallShadow(b, 1, -29, 14, 14);
  s.rects = { face: rectAt(s, 3, -27, 10, 10) };
  return { base: s };
}

export function poster(variant: string | undefined): BufFurniture {
  // Estandartes de tecido pendurados numa vara, com emblemas originais do clã.
  const s = wallSheet(1);
  const b = s.buf;
  const x = 2;
  const y = -28;
  const w = 12;
  const h = 16;
  const v = variant ?? 'code';
  const cloth: Record<string, string> = {
    code: '#2f4a3a', coffee: '#7a2e25', rocket: '#2a3a5a', cat: '#5a3a6a', bug: '#8a6a2a', ship_it: '#2f6a68',
  };
  const c = cloth[v] ?? cloth.code;
  // Vara.
  b.hline(x - 1, x + w, y - 1, '#6b4a2b');
  b.set(x - 2, y - 1, '#8a6239');
  b.set(x + w + 1, y - 1, '#8a6239');
  // Pano com ponta em V.
  b.rect(x, y, w, h - 3, c);
  for (let i = 0; i < 3; i++) {
    b.hline(x + i * 2, x + w - 1 - i * 2, y + h - 3 + i, c);
  }
  b.vline(x, y, y + h - 4, shade(c, 0.12));
  b.vline(x + w - 1, y, y + h - 4, shade(c, -0.15));
  b.hline(x, x + w - 1, y + 1, '#c9a45a');
  const ix = x + 2;
  const iy = y + 3;
  const gold = '#e0b23c';
  const bone = '#e8dcc0';
  switch (v) {
    case 'coffee': {
      // Machado de duas lâminas.
      b.vline(ix + 4, iy, iy + 8, '#8a6239');
      b.rect(ix + 1, iy + 1, 3, 3, bone);
      b.rect(ix + 5, iy + 1, 3, 3, bone);
      b.set(ix, iy + 2, bone);
      b.set(ix + 8, iy + 2, bone);
      break;
    }
    case 'rocket': {
      // Lua crescente e estrelas.
      b.rect(ix + 2, iy + 1, 4, 6, '#e8e2c0');
      b.rect(ix + 4, iy + 1, 3, 5, c);
      b.set(ix + 7, iy, '#f7e7a1');
      b.set(ix + 1, iy + 8, '#f7e7a1');
      break;
    }
    case 'cat': {
      // Cabeça de lobo estilizada.
      b.set(ix + 1, iy + 1, bone);
      b.set(ix + 6, iy + 1, bone);
      b.rect(ix + 1, iy + 2, 6, 4, bone);
      b.rect(ix + 3, iy + 6, 2, 2, bone);
      b.set(ix + 2, iy + 3, '#9c2f25');
      b.set(ix + 5, iy + 3, '#9c2f25');
      break;
    }
    case 'bug': {
      // Bigorna.
      b.rect(ix + 1, iy + 2, 7, 2, '#3b3530');
      b.set(ix, iy + 2, '#3b3530');
      b.rect(ix + 3, iy + 4, 3, 2, '#3b3530');
      b.rect(ix + 2, iy + 6, 5, 1, '#3b3530');
      b.hline(ix + 1, ix + 7, iy + 2, '#6a645a');
      break;
    }
    case 'ship_it': {
      // Árvore sagrada.
      b.vline(ix + 4, iy + 4, iy + 8, '#5e3f27');
      b.rect(ix + 1, iy + 1, 7, 3, '#7fae5a');
      b.rect(ix + 2, iy, 5, 1, '#9ac870');
      break;
    }
    default: {
      // Presas cruzadas sobre escudo.
      b.rect(ix + 1, iy + 1, 6, 6, gold);
      b.rect(ix + 2, iy + 2, 4, 4, shade(gold, -0.2));
      b.line(ix, iy + 8, ix + 7, iy, bone);
      b.line(ix + 7, iy + 8, ix, iy, bone);
      break;
    }
  }
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  return { base: s };
}

export function painting(seed: number): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const fr = M.oakDark;
  const x = 3;
  const y = -27;
  const w = 26;
  const h = 17;
  b.rect(x, y, w, h, fr.base);
  b.hline(x, x + w - 1, y, fr.hi);
  b.vline(x, y, y + h - 1, fr.lt);
  b.vline(x + w - 1, y, y + h - 1, fr.dk);
  b.hline(x, x + w - 1, y + h - 1, fr.dk);
  const ax = x + 2;
  const ay = y + 2;
  const aw = w - 4;
  const ah = h - 4;
  // Paisagem padrão: céu, sol, montanhas e lago.
  const r = rngOf(seed, 41);
  const warm = r() < 0.5;
  for (let i = 0; i < ah; i++) b.hline(ax, ax + aw - 1, ay + i, shade(warm ? '#f6c48a' : '#9fd3f0', -i * 0.012));
  b.ellipse(ax + 15, ay + 3, 2, 2, warm ? '#fff2c2' : '#fffbe6');
  const mt = warm ? '#7a5a8a' : '#5a7fa8';
  for (let i = 0; i < aw; i++) {
    const hh = Math.round(3 + 2.5 * Math.sin(i * 0.55 + seed) + 1.5 * Math.sin(i * 1.3));
    b.vline(ax + i, ay + ah - 4 - hh, ay + ah - 4, mt);
    b.set(ax + i, ay + ah - 4 - hh, shade(mt, 0.15));
  }
  b.rect(ax, ay + ah - 4, aw, 4, warm ? '#4f8a6a' : '#3f7fb0');
  b.hline(ax + 3, ax + 9, ay + ah - 3, 'rgba(255,255,255,0.5)');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  s.rects = { art: rectAt(s, ax, ay, aw, ah) };
  return { base: s };
}

export function tv(): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const x = 1;
  const y = -27;
  const w = 30;
  const h = 18;
  // Espelho d'água / pedra de vidência em moldura de pedra.
  b.rect(x, y, w, h, '#6a645a');
  b.hline(x, x + w - 1, y, '#8f887c');
  b.hline(x, x + w - 1, y + h - 1, '#3a3630');
  b.rect(x + 1, y + 1, w - 2, h - 3, '#1c2620');
  b.line(x + 20, y + 1, x + 12, y + h - 3, 'rgba(255,255,255,0.08)');
  b.line(x + 22, y + 1, x + 14, y + h - 3, 'rgba(255,255,255,0.05)');
  b.set(x + w - 3, y + h - 2, '#7fe0a0');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  s.rects = { tv: rectAt(s, x + 1, y + 1, w - 2, h - 3) };
  return { base: s };
}

export function lightSwitch(variant: string | undefined): BufFurniture {
  // Arandela de ferro com vela (acesa ou apagada).
  const s = wallSheet(1);
  const b = s.buf;
  const on = (variant ?? 'on') === 'on';
  b.rect(7, -15, 3, 2, '#4f5459');
  b.vline(8, -17, -15, '#4f5459');
  b.rect(7, -20, 3, 3, '#efe6cc');
  if (on) {
    b.set(8, -21, '#f6c04a');
    b.set(8, -22, '#fff2b0');
  } else b.set(8, -21, '#3a3630');
  b.outline();
  return { base: s };
}

export function elevator(state: number): BufFurniture {
  // Elevador de corda e roldana: armação de troncos, plataforma e portão de grade que sobe.
  const s = wallSheet(2, 2);
  const b = s.buf;
  const st = Math.max(0, Math.min(4, Math.round(state)));
  const frame = M.oakDark;
  b.rect(0, -28, 32, 28, frame.base);
  b.hline(0, 31, -28, frame.hi);
  b.vline(0, -28, -1, frame.lt);
  b.vline(31, -28, -1, frame.dk);
  // Roldana no alto.
  const lit = st > 0;
  b.ellipse(16, -26, 3, 1.5, '#4f5459');
  b.set(16, -26, lit ? '#e0b23c' : '#8f949a');
  // Poço interno com luz de tocha.
  const ix = 3;
  const iy = -23;
  const iw = 26;
  const ih = 23;
  b.rect(ix, iy, iw, ih, '#3a2a1c');
  b.rect(ix, iy, iw, 3, '#5a3f26');
  b.vline(ix + 4, iy, iy + ih - 5, '#c9b483');
  b.vline(ix + iw - 5, iy, iy + ih - 5, '#c9b483');
  b.rect(ix + 1, iy + ih - 5, iw - 2, 2, M.oak.base);
  b.hline(ix + 1, ix + iw - 2, iy + ih - 5, M.oak.lt);
  b.rect(ix + 11, iy + 5, 3, 3, lit ? '#f6c04a' : '#6a4a2a');
  b.rect(ix, iy + ih - 3, iw, 3, '#5e3f27');
  // Portão de grade: sobe 5px por estado.
  const gateTop = iy + st * 5;
  if (gateTop < iy + ih) {
    for (let gx = ix; gx < ix + iw; gx += 3) b.vline(gx, gateTop, iy + ih - 1, '#6b4a2b');
    for (let gy = gateTop + 2; gy < iy + ih; gy += 5) b.hline(ix, ix + iw - 1, gy, '#8a6239');
  }
  // Alavanca lateral.
  b.rect(29, -15, 2, 4, '#4f5459');
  b.set(29, -14, lit ? '#e0b23c' : '#6a645a');
  b.outline();
  return { base: s };
}

export function doorFrame(): BufFurniture {
  const s = wallSheet(2, 3);
  const b = s.buf;
  const tr = M.oakDark;
  // Batentes laterais e verga.
  b.rect(-2, -27, 3, 27, tr.base);
  b.vline(-2, -27, -1, tr.hi);
  b.vline(0, -26, -1, tr.dk);
  b.rect(31, -27, 3, 27, tr.base);
  b.vline(31, -26, -1, tr.dk);
  b.vline(33, -27, -1, tr.dd);
  b.rect(-2, -30, 36, 3, tr.lt);
  b.hline(-2, 33, -30, tr.hi);
  b.hline(1, 30, -27, 'rgba(36,24,14,0.4)');
  b.outline();
  return { base: s };
}

export function sign(): BufFurniture {
  const s = wallSheet(3);
  const b = s.buf;
  const x = 3;
  const y = -28;
  const w = 42;
  const h = 11;
  // Tábua entalhada pendurada por correntes.
  const fr = M.walnut;
  b.vline(x + 4, y - 3, y - 1, '#4f5459');
  b.vline(x + w - 5, y - 3, y - 1, '#4f5459');
  b.rect(x, y, w, h, fr.base);
  b.hline(x, x + w - 1, y, fr.lt);
  b.hline(x, x + w - 1, y + h - 1, fr.dd);
  b.rect(x + 1, y + 1, w - 2, h - 2, '#d9b88e');
  b.hline(x + 1, x + w - 2, y + 1, '#e8cca2');
  b.hline(x + 1, x + w - 2, y + h - 2, '#b98a55');
  for (const [px, py] of [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]] as const) b.set(px, py, '#4f5459');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  s.rects = { sign: rectAt(s, x + 4, y + 2, w - 8, h - 4) };
  return { base: s };
}

export function mirror(): BufFurniture {
  const s = wallSheet(1);
  const b = s.buf;
  const x = 2;
  const y = -28;
  const w = 12;
  const h = 14;
  // Espelho de bronze polido em moldura de madeira.
  const fr = M.oakDark;
  b.rect(x, y, w, h, fr.base);
  b.hline(x, x + w - 1, y, fr.hi);
  b.vline(x + w - 1, y, y + h - 1, fr.dk);
  b.rect(x + 1, y + 1, w - 2, h - 2, '#c9a45a');
  glass(b, x + 1, y + 1, w - 2, h - 2, { alpha: 0.5 });
  b.line(x + 8, y + 1, x + 3, y + h - 2, 'rgba(255,255,255,0.75)');
  b.outline();
  wallShadow(b, x - 1, y - 1, w + 2, h + 2);
  // Vidro (sem a moldura): o mundo pode desenhar ali o reflexo de quem está diante da pia.
  s.rects = { glass: rectAt(s, x + 1, y + 1, w - 2, h - 2) };
  return { base: s };
}

export function shelfWall(seed: number): BufFurniture {
  const s = wallSheet(2);
  const b = s.buf;
  const r = rngOf(seed, 51);
  const w = M.oak;
  const plank = (y: number) => {
    b.rect(1, y, 30, 2, w.lt);
    b.hline(1, 30, y, w.hi);
    b.hline(1, 30, y + 1, w.dk);
    for (const x of [4, 26]) b.rect(x, y + 2, 2, 2, '#4f5459');
  };
  // Prateleira de cima: livros + planta; de baixo: caixas, troféu, caneca.
  plank(-19);
  plank(-9);
  let x = 3;
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const bw = 1 + Math.floor(r() * 2);
    const bh = 5 + Math.floor(r() * 3);
    book(b, x, -19 - bh, bw, bh, pick(r, ACCENTS));
    x += bw;
  }
  b.line(x, -20, x + 3, -25, pick(r, ACCENTS));
  b.line(x + 1, -20, x + 4, -25, pick(r, ACCENTS));
  pot(b, 21, -23, 5, 4, M.ceramic);
  foliage(b, 23.5, -25, 3, 2.2, M.leaf, seed + 2);
  b.line(22, -23, 20, -20, M.leaf.dk);
  b.line(25, -23, 27, -19, M.leaf.base);
  // Prateleira de baixo.
  const v = seed % 3;
  if (v === 0) {
    b.rect(3, -14, 6, 5, '#c9b483');
    b.hline(3, 8, -14, '#e2d2a4');
    b.rect(4, -12, 4, 1, '#8a6239');
    b.rect(11, -13, 3, 2, '#f2c14e');
    b.set(10, -13, '#d9a42e');
    b.set(14, -13, '#d9a42e');
    b.set(12, -11, '#d9a42e');
    b.rect(11, -10, 3, 1, '#6b4a32');
    mug(b, 18, -13, '#2f7a78');
    smallSucculent(b, 24, -12);
  } else if (v === 1) {
    for (let i = 0; i < 4; i++) book(b, 4 + i * 2, -16, 2, 7, pick(r, ACCENTS));
    b.rect(14, -13, 7, 4, '#c99a5e');
    b.hline(14, 20, -13, '#dcb27a');
    b.rect(23, -15, 4, 6, '#3b3530');
    b.rect(24, -14, 2, 2, '#7fe0a0');
  } else {
    smallSucculent(b, 4, -12);
    b.rect(10, -15, 5, 6, '#d9cba8');
    b.rect(11, -14, 3, 3, '#9c2f25');
    for (let i = 0; i < 3; i++) book(b, 18 + i * 2, -15 + (i % 2), 2, 6 - (i % 2), pick(r, ACCENTS));
  }
  b.outline();
  return { base: s };
}
