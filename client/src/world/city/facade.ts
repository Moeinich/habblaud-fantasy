// Fachada procedural das casas da cidade, no tema de acampamento de fantasia (pixel art com contorno marrom-escuro,
// 3–4 tons por material, luz de cima/esquerda): toras, tábuas, pau a pique, pedra bruta e pedra rúnica; telhados de
// palha, telha de madeira ou ardósia; janelas com venezianas e luz de vela; tochas, braseiros e estandartes.
//
// Em 3/4 a câmera só vê a face SUL das casas. A fileira de baixo do quarteirão tem a porta ao sul: vemos a frente
// (térreo com as bancas, o portão e a placa). A fileira de cima tem a porta ao norte: vemos o telhado com o toldo da
// entrada na borda norte e, embaixo, a face dos fundos (janelas, andaime com escada, porta dos fundos). Nos dois casos
// o desenho cabe inteiro no lote (12 tiles de fundo): a fileira de cima encosta o topo na calçada norte e a de baixo
// encosta a base na calçada sul, então nenhuma casa cobre calçada nem rua.
//
// Modelo puro (`facadeModel`: andares, "+N", janelas acesas e piscando, estilo) e o sprite em cache por chave
// (`facadeSprites`): base + camada emissiva (o que brilha à noite: janelas acesas, placa, tochas, runas).
import { mulberry32 } from '../../../../shared/hash';
import { tr } from '../../../../shared/i18n';
import type { WorldBuildingPublic, WorldTheme } from '../../../../shared/world/protocol';
import { pixelText, pixelTextWidth } from '../../art/pixelfont';
import { renderSeasonalProp, type SeasonalProp } from '../../art/seasonal';

/** Medidas da fachada (px de mundo). */
export const FACADE = {
  /** Largura do prédio: 12 tiles (o lote tem 14; 1 tile de beco de cada lado). */
  w: 192,
  /** Sombra à direita (no beco). */
  shadow: 6,
  /** Telhado visto de cima + beiral. */
  roof: 26,
  /** Cada andar (janelas). */
  floor: 11,
  /** Térreo (vitrine, porta e letreiro na frente; porta de serviço nos fundos). */
  ground: 30,
  /** A fachada desenha até 12 andares; acima disso, placa "+N" no telhado. */
  maxFloors: 12,
  /** Janelas por andar. */
  cols: 11,
  /** Primeira janela (x) e passo entre janelas. */
  winX: 11,
  winPitch: 16,
  winW: 10,
  winH: 7,
} as const;

/**
 * Estilos de fachada (cor, material, detalhes), escolhidos pela semente do lote. O tema é um acampamento de fantasia:
 * o `pattern` diz o material da parede e, por tabela, o do telhado.
 * - `brick`: toras empilhadas (cabana, casa comprida, forja); telhado de palha.
 * - `panel`: tábuas em pé (torre de vigia, salão); telhado de telhas de madeira.
 * - `stucco`: pau a pique com vigas escuras (enxaimel, casa de barro); telhado de palha.
 * - `stone`: pedra bruta (fortaleza); telhado de ardósia.
 * - `glass`: pedra escura com runas que brilham (torre arcana); telhado de ardósia.
 */
export interface FacadeStyle {
  name: string;
  /** Tons da parede, do mais escuro ao mais claro. */
  wall: [string, string, string, string];
  pattern: 'brick' | 'panel' | 'stucco' | 'glass' | 'stone';
  /** Vigas, cantoneiras e peitoris (madeira ou pedra). */
  trim: [string, string];
  /** Telhado visto de cima: base e realce. */
  roof: [string, string];
  /** Cor de destaque (estandarte, toldo de pano, placa). */
  accent: [string, string];
  /** Batente das janelas. */
  frame: string;
}

export const FACADE_STYLES: readonly FacadeStyle[] = [
  { name: 'cabana de toras', wall: ['#4a2e1c', '#6b4429', '#855636', '#a06c45'], pattern: 'brick', trim: ['#3b2618', '#5a3c26'], roof: ['#b08a3e', '#d2ac58'], accent: ['#8e2a22', '#b8402f'], frame: '#2a1a10' },
  { name: 'casa comprida', wall: ['#6e5132', '#8c6a43', '#a8835a', '#c29d70'], pattern: 'brick', trim: ['#4a3420', '#6b4d30'], roof: ['#6a4a2c', '#8a6640'], accent: ['#1f6b62', '#2f8f82'], frame: '#33231a' },
  { name: 'torre de vigia', wall: ['#4f4a42', '#6a635a', '#837b70', '#9c9488'], pattern: 'panel', trim: ['#3a2a1e', '#5a4330'], roof: ['#4a3a2e', '#66503e'], accent: ['#b07a1c', '#d89a2c'], frame: '#241a12' },
  { name: 'enxaimel', wall: ['#a89678', '#c2b192', '#d6c7a8', '#e6dbc0'], pattern: 'stucco', trim: ['#3a2618', '#5a3d27'], roof: ['#a8823a', '#c9a254'], accent: ['#9a2f24', '#c4463a'], frame: '#2e1e14' },
  { name: 'torre arcana', wall: ['#24253a', '#30324c', '#3e405e', '#525476'], pattern: 'glass', trim: ['#5b5a70', '#7a7990'], roof: ['#2a2c3e', '#3c3f56'], accent: ['#5a3a9e', '#7f5cd0'], frame: '#16161f' },
  { name: 'forja', wall: ['#2b1f18', '#3a2a20', '#4a3628', '#5e4532'], pattern: 'brick', trim: ['#4a4a50', '#6a6a72'], roof: ['#3a3634', '#545050'], accent: ['#c4581c', '#ee7a2a'], frame: '#16100c' },
  { name: 'cabana de musgo', wall: ['#4a4a2c', '#5e5c36', '#747244', '#8c8a56'], pattern: 'panel', trim: ['#3a2c1c', '#58432a'], roof: ['#4f6a2c', '#6a8a3a'], accent: ['#c9b27a', '#e4d29c'], frame: '#262014' },
  { name: 'fortaleza de pedra', wall: ['#5c5850', '#76716a', '#8e897f', '#a8a397'], pattern: 'stone', trim: ['#4a453e', '#68625a'], roof: ['#3e4450', '#56606e'], accent: ['#2a4f8e', '#3d6ab4'], frame: '#2a241e' },
  { name: 'salão de guerra', wall: ['#4a1f18', '#622a20', '#7a382a', '#934836'], pattern: 'panel', trim: ['#8a6a2a', '#c49a3c'], roof: ['#3a2a22', '#55402f'], accent: ['#c49a3c', '#e8c25a'], frame: '#1e100c' },
  { name: 'casa de barro', wall: ['#8a5a32', '#a46d3e', '#bc8450', '#d09c66'], pattern: 'stucco', trim: ['#4a2e1a', '#6a4528'], roof: ['#b89448', '#d8b462'], accent: ['#1f6b6e', '#2f9294'], frame: '#2e1c10' },
];

/** Variações por lote (estilo × ordem das janelas acesas): o cache não cresce com o número de lotes. */
export const FACADE_VARIANTS = 40;

/** Níveis de luz (proporção de janelas acesas em oitavos). */
export const LIT_LEVELS = 8;

export type FacadeSide = 'front' | 'back';

export interface FacadeModel {
  side: FacadeSide;
  variant: number;
  style: number;
  /** Andares desenhados (0..12) e os que sobram para a placa "+N". */
  drawn: number;
  plus: number;
  state: 'online' | 'away';
  theme: WorldTheme;
  /** Modo discreto: sem contagens (luz média fixa, nada piscando). */
  discreet: boolean;
  /** Oitavos de janelas acesas (0..8). */
  litLevel: number;
  /** Índices (na grade de janelas desenhadas) das acesas e das que piscam (`waiting`). */
  lit: number[];
  waiting: number[];
  /** Altura total do sprite (px). */
  height: number;
}

/** Altura (px) do prédio com `floors` andares desenhados. */
export function facadeHeight(floors: number): number {
  const drawn = Math.max(0, Math.min(FACADE.maxFloors, Math.floor(floors)));
  return FACADE.roof + drawn * FACADE.floor + FACADE.ground;
}

/** Ordem determinística em que as janelas acendem (embaralhadas pela variante). */
export function windowOrder(variant: number, count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  const rng = mulberry32((variant * 2654435761) >>> 0);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * O que a fachada mostra de um prédio. Janelas acesas na proporção `working / total` (em oitavos); as `waiting`
 * piscam (as próximas na ordem, ao menos uma se alguém espera); `away` apaga tudo; modo discreto (sem `agents`) acende
 * metade, sem piscar.
 */
export function facadeModel(b: Pick<WorldBuildingPublic, 'floors' | 'state' | 'theme' | 'agents'>, side: FacadeSide, seed: number): FacadeModel {
  const floors = Number.isFinite(b.floors) ? Math.max(0, Math.floor(b.floors)) : 0;
  const drawn = Math.min(FACADE.maxFloors, floors);
  const plus = Math.max(0, floors - FACADE.maxFloors);
  const variant = (seed >>> 0) % FACADE_VARIANTS;
  const count = drawn * FACADE.cols;
  const state = b.state === 'online' ? 'online' : 'away';
  const discreet = !b.agents;
  let litLevel = 0;
  let waitingN = 0;
  if (state === 'online') {
    if (!b.agents) litLevel = LIT_LEVELS / 2;
    else {
      const total = Math.max(0, b.agents.total);
      if (total > 0) {
        const working = Math.max(0, Math.min(total, b.agents.working));
        litLevel = Math.round((working / total) * LIT_LEVELS);
        if (working > 0 && litLevel === 0) litLevel = 1;
        const waiting = Math.max(0, Math.min(total, b.agents.waiting));
        if (waiting > 0) waitingN = Math.max(1, Math.round((waiting / total) * count));
      }
    }
  }
  const order = windowOrder(variant, count);
  const litN = Math.round((count * litLevel) / LIT_LEVELS);
  const lit = order.slice(0, litN);
  const waiting = order.slice(litN, Math.min(count, litN + waitingN));
  const theme: WorldTheme = b.theme === 'halloween' || b.theme === 'christmas' ? b.theme : 'none';
  return { side, variant, style: variant % FACADE_STYLES.length, drawn, plus, state, theme, discreet, litLevel, lit, waiting, height: facadeHeight(drawn) };
}

/** Chave do cache do sprite (tudo o que muda o desenho; o nome, a bandeira e os likes ficam fora: são texto na tela). */
export function facadeKey(m: FacadeModel): string {
  return `${m.side}|${m.variant}|${m.drawn}|${Math.min(99, m.plus)}|${m.state}|${m.theme}|${m.litLevel}`;
}

/** Retângulo (px, no sprite) da janela `i` da grade desenhada (andar 0 = o de baixo). */
export function windowRect(m: Pick<FacadeModel, 'drawn'>, i: number): { x: number; y: number; w: number; h: number } {
  const col = i % FACADE.cols;
  const fromBottom = Math.floor(i / FACADE.cols);
  const k = m.drawn - 1 - fromBottom;
  return { x: FACADE.winX + col * FACADE.winPitch, y: FACADE.roof + k * FACADE.floor + 2, w: FACADE.winW, h: FACADE.winH };
}

/** Onde fica a placa com o nome do dono (px, no sprite): o letreiro do térreo na frente; no telhado, nos fundos. */
export function signRect(m: Pick<FacadeModel, 'side' | 'height'>): { x: number; y: number; w: number; h: number } {
  if (m.side === 'front') return { x: 34, y: m.height - FACADE.ground + 2, w: FACADE.w - 68, h: 8 };
  return { x: 50, y: 11, w: FACADE.w - 100, h: 8 };
}

// ====================================================================== desenho (navegador)

export interface FacadeSprites {
  canvas: HTMLCanvasElement;
  /** O que brilha à noite (desenhado por cima depois de escurecer a cena). */
  glow: HTMLCanvasElement;
  w: number;
  h: number;
}

const cache = new Map<string, FacadeSprites>();
const CACHE_LIMIT = 600;

/** Sprite da fachada (base e camada emissiva), em cache pela chave do modelo. */
export function facadeSprites(m: FacadeModel): FacadeSprites {
  const key = facadeKey(m);
  let s = cache.get(key);
  if (s) return s;
  if (cache.size >= CACHE_LIMIT) cache.clear();
  s = paintFacade(m);
  cache.set(key, s);
  return s;
}

/** O sprite desta fachada já está pronto (desenhar não custa nada)? */
export function facadeReady(m: FacadeModel): boolean {
  return cache.has(facadeKey(m));
}

export function facadeCacheSize(): number {
  return cache.size;
}

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

const OUTLINE = '#2a1c14';
/** Luz de vela e lareira (janelas acesas, portas abertas). */
const WARM = ['#b8621e', '#f09a3a', '#ffc65a', '#ffe7a6'] as const;
/** Janela apagada: venezianas de madeira fechadas. */
const SHUTTER = ['#24170f', '#3a2618', '#4e3522', '#6c4c32'] as const;
const IRON = ['#2a2a2e', '#4a4a52', '#7a7a84'] as const;

const seasonal = new Map<SeasonalProp, HTMLCanvasElement>();
function seasonalCanvas(kind: SeasonalProp): HTMLCanvasElement {
  let c = seasonal.get(kind);
  if (!c) {
    const { buf } = renderSeasonalProp(kind);
    c = document.createElement('canvas');
    c.width = buf.w;
    c.height = buf.h;
    c.getContext('2d')!.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0);
    seasonal.set(kind, c);
  }
  return c;
}

/** Desenha o enfeite sazonal com o ponto central inferior em (x, y), cortando o espaço vazio do sprite (40×64). */
function drawSeasonal(ctx: Ctx, kind: SeasonalProp, x: number, y: number): void {
  const c = seasonalCanvas(kind);
  ctx.drawImage(c, Math.round(x - 20), Math.round(y - 60));
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function paintFacade(m: FacadeModel): FacadeSprites {
  const W = FACADE.w + FACADE.shadow;
  const H = m.height;
  const [c, ctx] = canvas(W, H);
  const [g, gctx] = canvas(W, H);
  const st = FACADE_STYLES[m.style]!;
  const rng = mulberry32(((m.variant + 1) * 0x9e3779b1) >>> 0);
  const on = m.state === 'online';
  const faceTop = FACADE.roof;
  const groundTop = H - FACADE.ground;
  const fw = FACADE.w;

  // ---- sombra no beco (à direita) e contato na base
  ctx.fillStyle = 'rgba(30,20,12,0.24)';
  ctx.fillRect(fw, 6, FACADE.shadow, H - 6);
  ctx.fillStyle = 'rgba(30,20,12,0.12)';
  ctx.fillRect(fw, 10, 2, H - 10);

  // ---- paredes dos andares e térreo
  paintWall(ctx, st, 0, faceTop, fw, H - faceTop, rng);
  // vigas entre andares e esteios nas pontas
  for (let k = 0; k <= m.drawn; k++) {
    const y = faceTop + k * FACADE.floor;
    if (st.pattern === 'stone' || st.pattern === 'glass') rect(ctx, 0, y - 1, fw, 1, shade(st.wall[0], -0.2));
    else {
      rect(ctx, 0, y - 1, fw, 2, st.trim[0]);
      rect(ctx, 0, y - 1, fw, 1, st.trim[1]);
      // cavilhas nas vigas
      for (let x = 6; x < fw - 4; x += 32) rect(ctx, x, y, 1, 1, OUTLINE);
    }
  }
  paintCornerPosts(ctx, st, faceTop, H - faceTop);

  // ---- runas da torre arcana (brilham à noite)
  if (st.pattern === 'glass') paintRunes(ctx, gctx, st, m, on);

  // ---- janelas
  const litSet = new Set(m.lit);
  const count = m.drawn * FACADE.cols;
  for (let i = 0; i < count; i++) {
    const r = windowRect(m, i);
    paintWindow(ctx, st, r.x, r.y, litSet.has(i), (m.variant * 31 + i) % 7);
    if (litSet.has(i)) paintWindowGlow(gctx, r.x, r.y);
  }

  // ---- fundos: andaime com escada de mão e escudos/fardos pendurados
  if (m.side === 'back' && m.drawn > 0) {
    const left = m.variant % 2 === 0;
    const ex = left ? FACADE.winX + FACADE.winPitch - 3 : FACADE.winX + (FACADE.cols - 2) * FACADE.winPitch - 3;
    paintScaffold(ctx, ex, faceTop, m.drawn);
    for (let k = 0; k < m.drawn; k++) {
      if (rng() < 0.45) {
        const col = 2 + Math.floor(rng() * (FACADE.cols - 4));
        const r = windowRect(m, (m.drawn - 1 - k) * FACADE.cols + col);
        paintHanging(ctx, r.x + 1, r.y + r.h + 1, st, Math.floor(rng() * 3));
      }
    }
  }

  // ---- térreo
  if (m.side === 'front') paintStorefront(ctx, gctx, st, m, groundTop, on, rng);
  else paintServiceGround(ctx, gctx, st, m, groundTop, on, rng);

  // ---- telhado e beiral
  paintRoof(ctx, gctx, st, m, rng);

  // ---- tema
  paintTheme(ctx, gctx, m, groundTop);
  if (m.side === 'back') paintEntranceFromAbove(ctx, gctx, st, m);
  // fechado: tabuleta na porta (na frente) ou no toldo (nos fundos), por cima de tudo
  if (!on) paintClosedSign(ctx, fw / 2, m.side === 'front' ? groundTop + 16 : 1);

  // ---- tabuleta "+N" no telhado (madeira com cravos)
  if (m.plus > 0) {
    const text = `+${Math.min(99, m.plus)}`;
    const tw = pixelTextWidth(text);
    const px = m.side === 'front' ? fw - tw - 18 : 16;
    const py = m.side === 'front' ? 6 : 13;
    rect(ctx, px - 3, py - 3, tw + 6, 11, OUTLINE);
    rect(ctx, px - 2, py - 2, tw + 4, 9, on ? st.accent[0] : '#4e3a2c');
    rect(ctx, px - 2, py - 2, tw + 4, 1, on ? lighten(st.accent[1], 0.25) : '#6a5040');
    rect(ctx, px - 2, py - 2, 1, 1, IRON[2]);
    rect(ctx, px + tw + 1, py - 2, 1, 1, IRON[2]);
    pixelText(ctx, text, px, py, '#fff2d0');
    rect(ctx, px + tw / 2 - 1, py + 8, 2, 3, OUTLINE);
    if (on) {
      gctx.fillStyle = 'rgba(255,255,255,0.85)';
      pixelText(gctx, text, px, py, '#ffe6b0');
    }
  }
  return { canvas: c, glow: g, w: W, h: H };
}

function paintWall(ctx: Ctx, st: FacadeStyle, x: number, y: number, w: number, h: number, rng: () => number): void {
  const [d, b, l, hl] = st.wall;
  rect(ctx, x, y, w, h, b);
  switch (st.pattern) {
    case 'brick': {
      // toras deitadas: realce em cima, sombra em baixo, nós e rachaduras
      for (let yy = y; yy < y + h; yy += 4) {
        rect(ctx, x, yy, w, 1, l);
        rect(ctx, x, yy + 3, w, 1, d);
        for (let xx = x + Math.floor(rng() * 20); xx < x + w; xx += 14 + Math.floor(rng() * 22)) {
          const r = rng();
          if (r < 0.35) rect(ctx, xx, yy + 1, 2, 2, d);
          else if (r < 0.6) rect(ctx, xx, yy + 2, 5 + Math.floor(rng() * 6), 1, shade(b, -0.12));
          else rect(ctx, xx, yy + 1, 6 + Math.floor(rng() * 8), 1, hl);
        }
      }
      break;
    }
    case 'panel': {
      // tábuas em pé de largura variável, com o veio e as juntas escuras
      for (let xx = x; xx < x + w; ) {
        const pw = 5 + Math.floor(rng() * 3);
        const r = rng();
        const tone = r < 0.25 ? l : r < 0.45 ? shade(b, -0.08) : b;
        rect(ctx, xx, y, pw, h, tone);
        rect(ctx, xx, y, 1, h, d);
        rect(ctx, xx + 1, y, 1, h, shade(tone, 0.12));
        for (let k = 0; k < h / 18; k++) rect(ctx, xx + 2 + Math.floor(rng() * (pw - 3)), y + Math.floor(rng() * h), 1, 3 + Math.floor(rng() * 5), shade(tone, -0.1));
        xx += pw;
      }
      break;
    }
    case 'stucco': {
      // pau a pique: reboco claro manchado e esteios escuros entre as janelas
      for (let i = 0; i < (w * h) / 30; i++) {
        const px = x + Math.floor(rng() * w);
        const py = y + Math.floor(rng() * h);
        rect(ctx, px, py, 1 + (rng() < 0.2 ? 1 : 0), 1, rng() < 0.5 ? l : shade(b, -0.06));
      }
      for (let i = 0; i < w / 24; i++) {
        const px = x + Math.floor(rng() * w);
        const py = y + Math.floor(rng() * h);
        rect(ctx, px, py, 3, 2, d);
      }
      for (let c = 1; c < FACADE.cols; c += 2) {
        const bx = x + FACADE.winX + c * FACADE.winPitch - 4;
        rect(ctx, bx, y, 2, h, st.trim[0]);
        rect(ctx, bx, y, 1, h, st.trim[1]);
      }
      break;
    }
    case 'stone':
    case 'glass': {
      // pedra bruta em fiadas irregulares, cada bloco com um tom e um realce no topo
      const glass = st.pattern === 'glass';
      for (let yy = y, row = 0; yy < y + h; yy += 5, row++) {
        rect(ctx, x, yy + 4, w, 1, d);
        let xx = x - (row % 2 ? 6 : 0);
        while (xx < x + w) {
          const bw = 9 + Math.floor(rng() * 8);
          const r = rng();
          const tone = r < 0.25 ? l : r < 0.4 ? shade(b, -0.08) : b;
          rect(ctx, Math.max(x, xx + 1), yy, Math.min(bw - 1, x + w - xx - 1), 4, tone);
          rect(ctx, Math.max(x, xx + 1), yy, Math.min(bw - 2, x + w - xx - 1), 1, glass ? shade(tone, 0.12) : hl);
          rect(ctx, xx, yy, 1, 4, d);
          xx += bw;
        }
      }
      // musgo nas juntas de baixo
      if (!glass) for (let i = 0; i < w / 10; i++) rect(ctx, x + Math.floor(rng() * w), y + h - 2 - Math.floor(rng() * 14), 2, 1, '#5d7a3a');
      break;
    }
  }
}

/** Esteios de canto: madeira com amarras de corda, ou cunhais de pedra. */
function paintCornerPosts(ctx: Ctx, st: FacadeStyle, y: number, h: number): void {
  const fw = FACADE.w;
  const stoneish = st.pattern === 'stone' || st.pattern === 'glass';
  for (const x of [0, fw - 4]) {
    if (stoneish) {
      for (let yy = y; yy < y + h; yy += 6) {
        rect(ctx, x, yy, 4, 5, st.trim[1]);
        rect(ctx, x, yy + 5, 4, 1, OUTLINE);
        rect(ctx, x, yy, 4, 1, lighten(st.trim[1], 0.2));
      }
    } else {
      rect(ctx, x, y, 4, h, st.trim[0]);
      rect(ctx, x + 1, y, 1, h, st.trim[1]);
      rect(ctx, x + 3, y, 1, h, OUTLINE);
      for (let yy = y + 8; yy < y + h - 4; yy += 22) {
        rect(ctx, x, yy, 4, 2, '#a88a52');
        rect(ctx, x, yy + 1, 4, 1, '#6e5530');
      }
    }
  }
}

/** Runas entalhadas entre as janelas da torre arcana: violeta apagado de dia, acesas à noite se o dono está. */
function paintRunes(ctx: Ctx, g: Ctx, st: FacadeStyle, m: FacadeModel, on: boolean): void {
  const glyphs = [
    [0, 0, 1, 3],
    [0, 1, 3, 1],
    [1, 0, 1, 2],
  ];
  for (let k = 0; k < m.drawn; k++) {
    const y = FACADE.roof + k * FACADE.floor + 3;
    for (let c = 0; c < FACADE.cols - 1; c += 2) {
      const x = FACADE.winX + c * FACADE.winPitch + FACADE.winW + 1;
      const gl = glyphs[(k + c + m.variant) % glyphs.length]!;
      rect(ctx, x + gl[0]!, y + gl[1]!, gl[2]!, gl[3]!, st.accent[0]);
      rect(ctx, x + 2, y + 4, 1, 1, st.accent[1]);
      if (on) {
        g.fillStyle = st.accent[1];
        g.fillRect(x + gl[0]!, y + gl[1]!, gl[2]!, gl[3]!);
        g.fillStyle = 'rgba(160,120,255,0.25)';
        g.fillRect(x - 1, y - 1, 5, 7);
      }
    }
  }
}

function paintWindow(ctx: Ctx, st: FacadeStyle, x: number, y: number, lit: boolean, v: number): void {
  const w = FACADE.winW;
  const h = FACADE.winH;
  // batente grosso de madeira e peitoril
  rect(ctx, x - 1, y - 1, w + 2, h + 2, st.frame);
  rect(ctx, x - 1, y - 1, w + 2, 1, shade(st.frame, 0.25));
  rect(ctx, x - 2, y + h + 1, w + 4, 1, st.trim[1]);
  rect(ctx, x - 2, y + h + 2, w + 4, 1, shade(st.trim[0], -0.25));
  if (lit) {
    // luz de vela: chão quente, a lareira lá dentro e às vezes alguém
    rect(ctx, x, y, w, h, WARM[2]);
    rect(ctx, x, y, w, 2, WARM[3]);
    rect(ctx, x, y + h - 2, w, 2, WARM[1]);
    rect(ctx, x + 2 + (v % 4), y + h - 3, 2, 2, WARM[0]);
    rect(ctx, x + 2 + (v % 4), y + h - 4, 1, 1, '#fff6d8');
    if (v === 2 || v === 5) rect(ctx, x + 6 - (v % 3), y + h - 5, 2, 4, '#4e6b2e');
    // venezianas abertas para os lados
    rect(ctx, x - 2, y, 1, h, SHUTTER[2]);
    rect(ctx, x + w + 1, y, 1, h, SHUTTER[2]);
  } else {
    // venezianas fechadas: duas folhas de tábuas com a tranca de ferro
    rect(ctx, x, y, w, h, SHUTTER[1]);
    for (let xx = x + 1; xx < x + w; xx += 2) rect(ctx, xx, y, 1, h, SHUTTER[2]);
    rect(ctx, x, y, w, 1, SHUTTER[3]);
    rect(ctx, x, y + h - 1, w, 1, SHUTTER[0]);
    rect(ctx, x, y + 3, w, 1, SHUTTER[0]);
    if (v === 4) rect(ctx, x + 1, y + 1, 3, 1, '#c9a254'); // fresta de luz
  }
  // divisória (a junta das folhas) e a travessa
  rect(ctx, x + (w >> 1), y, 1, h, st.frame);
  if (!lit) rect(ctx, x + (w >> 1) - 1, y + 3, 3, 1, IRON[2]);
}

function paintWindowGlow(g: Ctx, x: number, y: number): void {
  const w = FACADE.winW;
  const h = FACADE.winH;
  g.fillStyle = WARM[2];
  g.fillRect(x, y, w, h);
  g.fillStyle = WARM[3];
  g.fillRect(x, y, w, 2);
  // brilho de fogo escapando pela janela
  g.fillStyle = 'rgba(255,170,80,0.35)';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
}

/** Andaime de madeira com escada de mão entre as plataformas (os fundos). */
function paintScaffold(ctx: Ctx, x: number, faceTop: number, floors: number): void {
  const dark = '#3a2618';
  const mid = '#7a5636';
  const hi = '#a07a4e';
  for (let k = 0; k < floors; k++) {
    const y = faceTop + k * FACADE.floor + FACADE.floor - 2;
    // plataforma de tábuas e guarda-corpo de varas
    rect(ctx, x - 2, y, 18, 1, hi);
    rect(ctx, x - 2, y + 1, 18, 1, dark);
    rect(ctx, x - 2, y - 4, 18, 1, mid);
    rect(ctx, x - 2, y - 4, 1, 5, dark);
    rect(ctx, x + 15, y - 4, 1, 5, dark);
    // amarração de corda nos cantos
    rect(ctx, x - 2, y - 3, 1, 1, '#c9a86a');
    rect(ctx, x + 15, y - 3, 1, 1, '#c9a86a');
    // escada de mão até a plataforma de baixo
    if (k < floors - 1) {
      const lx = x + (k % 2 === 0 ? 10 : 2);
      rect(ctx, lx, y + 2, 1, FACADE.floor, dark);
      rect(ctx, lx + 3, y + 2, 1, FACADE.floor, dark);
      for (let s = 3; s < FACADE.floor + 1; s += 3) rect(ctx, lx, y + s, 4, 1, hi);
    }
  }
}

/** Coisas penduradas nos fundos: escudo redondo, fardo de peles ou réstia de ervas. */
function paintHanging(ctx: Ctx, x: number, y: number, st: FacadeStyle, kind: number): void {
  if (kind === 0) {
    rect(ctx, x, y, 7, 5, OUTLINE);
    rect(ctx, x + 1, y, 5, 4, st.accent[0]);
    rect(ctx, x + 1, y, 5, 1, st.accent[1]);
    rect(ctx, x + 3, y + 1, 1, 2, '#c9c2b0');
  } else if (kind === 1) {
    rect(ctx, x, y, 7, 4, OUTLINE);
    rect(ctx, x + 1, y, 5, 3, '#8a6a48');
    rect(ctx, x + 1, y, 5, 1, '#b08c62');
    rect(ctx, x + 3, y, 1, 3, '#5a3c22');
  } else {
    rect(ctx, x + 1, y, 5, 1, '#5a3c22');
    for (let i = 0; i < 5; i += 2) rect(ctx, x + 1 + i, y + 1, 1, 3, i === 2 ? '#8a7a3a' : '#5d7a3a');
  }
}

/** Tocha de parede (suporte de ferro e chama), com o brilho na camada emissiva. */
function paintTorch(ctx: Ctx, g: Ctx, x: number, y: number, on: boolean): void {
  rect(ctx, x, y + 3, 3, 1, IRON[1]);
  rect(ctx, x + 1, y + 2, 1, 5, '#5a3c22');
  if (on) {
    rect(ctx, x, y, 3, 2, WARM[1]);
    rect(ctx, x + 1, y - 1, 1, 2, WARM[3]);
    g.fillStyle = 'rgba(255,200,110,0.95)';
    g.fillRect(x, y - 1, 3, 3);
    g.fillStyle = 'rgba(255,150,60,0.28)';
    g.fillRect(x - 4, y - 4, 11, 11);
  } else rect(ctx, x, y + 1, 3, 1, '#2a2420');
}

/** Térreo da frente: alicerce de pedra, placa, duas bancas com toldo de pano, portão de tábuas e tochas. */
function paintStorefront(ctx: Ctx, g: Ctx, st: FacadeStyle, m: FacadeModel, top: number, on: boolean, rng: () => number): void {
  const fw = FACADE.w;
  const H = m.height;
  const base = H - 2;
  // alicerce de pedras redondas na base e uma viga grossa por cima do térreo
  rect(ctx, 0, top, fw, 3, st.trim[0]);
  rect(ctx, 0, top, fw, 1, st.trim[1]);
  rect(ctx, 0, top + 3, fw, 1, OUTLINE);
  for (let x = 0; x < fw; x += 7) {
    const r = rng();
    rect(ctx, x, base - 4, 6, 4, r < 0.4 ? '#6e6a62' : r < 0.7 ? '#86817a' : '#5e5a52');
    rect(ctx, x + 1, base - 4, 4, 1, '#a8a397');
  }
  // placa de tábuas (o nome do dono é escrito por cima, na tela)
  const sign = signRect(m);
  rect(ctx, sign.x - 2, sign.y - 1, sign.w + 4, sign.h + 2, OUTLINE);
  rect(ctx, sign.x - 1, sign.y, sign.w + 2, sign.h, on ? st.accent[0] : '#4e3a2c');
  rect(ctx, sign.x - 1, sign.y, sign.w + 2, 1, on ? st.accent[1] : '#64503e');
  for (const x of [sign.x - 1, sign.x + sign.w]) rect(ctx, x, sign.y + 3, 1, 1, IRON[2]);
  // pontas da placa em rabo de andorinha (pano de estandarte)
  for (const [x, d] of [
    [sign.x - 4, -1],
    [sign.x + sign.w + 3, 1],
  ] as const) {
    rect(ctx, x, sign.y, 2, sign.h, on ? shade(st.accent[0], -0.2) : '#3e2e22');
    rect(ctx, x + d, sign.y + 2, 1, sign.h - 4, on ? shade(st.accent[0], -0.2) : '#3e2e22');
  }
  if (on) {
    g.fillStyle = 'rgba(255,220,160,0.45)';
    g.fillRect(sign.x - 1, sign.y, sign.w + 2, sign.h);
  }
  // as duas bancas dos lados do portão
  const dx0 = fw / 2 - 16;
  const dx1 = fw / 2 + 16;
  const vy = top + 12;
  const vh = base - 4 - vy - 1;
  for (const [x0, x1] of [
    [6, dx0 - 6],
    [dx1 + 6, fw - 6],
  ] as const) {
    rect(ctx, x0 - 1, vy - 1, x1 - x0 + 2, vh + 2, OUTLINE);
    if (on) {
      rect(ctx, x0, vy, x1 - x0, vh, WARM[1]);
      rect(ctx, x0, vy, x1 - x0, 2, WARM[2]);
      rect(ctx, x0, vy + vh - 3, x1 - x0, 3, WARM[0]);
      // balcão com mercadoria: barris, sacos e potes
      for (let x = x0 + 4; x < x1 - 5; x += 9 + Math.floor(rng() * 5)) {
        const k = rng();
        if (k < 0.33) {
          rect(ctx, x, vy + vh - 7, 5, 4, '#6b4429');
          rect(ctx, x, vy + vh - 6, 5, 1, IRON[1]);
        } else if (k < 0.66) {
          rect(ctx, x, vy + vh - 6, 5, 3, '#c9b27a');
          rect(ctx, x + 2, vy + vh - 7, 1, 1, '#8a7a4a');
        } else {
          rect(ctx, x + 1, vy + vh - 7, 3, 4, '#8e5a3a');
          rect(ctx, x + 1, vy + vh - 7, 3, 1, '#b07a52');
        }
      }
      g.fillStyle = WARM[1];
      g.fillRect(x0, vy, x1 - x0, vh);
      g.fillStyle = 'rgba(255,170,80,0.3)';
      g.fillRect(x0 - 2, vy - 2, x1 - x0 + 4, vh + 4);
    } else {
      // fechada com tábuas pregadas
      rect(ctx, x0, vy, x1 - x0, vh, SHUTTER[1]);
      for (let yy = vy + 1; yy < vy + vh; yy += 3) rect(ctx, x0, yy, x1 - x0, 1, SHUTTER[2]);
      rect(ctx, x0 + 2, vy + 2, x1 - x0 - 4, 2, SHUTTER[3]);
    }
    // esteios da banca
    for (let x = x0 + 16; x < x1 - 2; x += 16) rect(ctx, x, vy, 1, vh, st.frame);
    // toldo de pano listrado, preso em varas
    rect(ctx, x0 - 1, vy - 4, x1 - x0 + 2, 3, st.accent[0]);
    for (let x = x0; x < x1; x += 6) rect(ctx, x, vy - 4, 3, 3, '#e4d6b4');
    for (let x = x0; x < x1; x += 4) rect(ctx, x, vy - 1, 2, 1, st.accent[0]);
    rect(ctx, x0 - 1, vy - 5, x1 - x0 + 2, 1, '#5a3c22');
  }
  // portão de tábuas com ferragens; aberto (luz lá dentro) quando o dono está
  const dy = top + 9;
  rect(ctx, dx0 - 2, dy - 2, 36, base - dy + 2, OUTLINE);
  rect(ctx, dx0 - 1, dy - 1, 34, base - dy + 1, st.trim[0]);
  rect(ctx, dx0 - 1, dy - 1, 34, 1, st.trim[1]);
  for (const x of [dx0, fw / 2 + 1]) {
    rect(ctx, x, dy, 15, base - dy, OUTLINE);
    if (on) {
      // folha aberta encostada no batente e a luz do salão
      rect(ctx, x + 1, dy + 1, 13, base - dy - 1, WARM[2]);
      rect(ctx, x + 1, dy + 1, 13, 2, WARM[3]);
      rect(ctx, x + 1, base - 4, 13, 3, WARM[1]);
      const lx = x === dx0 ? x + 1 : x + 11;
      rect(ctx, lx, dy + 1, 3, base - dy - 1, '#6b4429');
      rect(ctx, lx, dy + 4, 3, 1, IRON[1]);
      rect(ctx, lx, base - 6, 3, 1, IRON[1]);
      g.fillStyle = WARM[2];
      g.fillRect(x + 1, dy + 1, 13, base - dy - 1);
    } else {
      rect(ctx, x + 1, dy + 1, 13, base - dy - 1, '#5a3c26');
      for (let xx = x + 1; xx < x + 14; xx += 3) rect(ctx, xx, dy + 1, 1, base - dy - 1, '#46301e');
      rect(ctx, x + 1, dy + 4, 13, 2, IRON[1]);
      rect(ctx, x + 1, base - 6, 13, 2, IRON[1]);
      rect(ctx, x + 1, dy + 4, 13, 1, IRON[2]);
      rect(ctx, x === dx0 ? x + 12 : x + 2, dy + 10, 1, 3, IRON[2]);
    }
  }
  // dintel com um crânio de chifres (o emblema do acampamento)
  const cx = fw / 2;
  rect(ctx, cx - 3, dy - 6, 6, 4, '#d8cfb8');
  rect(ctx, cx - 2, dy - 4, 1, 1, OUTLINE);
  rect(ctx, cx + 1, dy - 4, 1, 1, OUTLINE);
  rect(ctx, cx - 6, dy - 7, 3, 1, '#d8cfb8');
  rect(ctx, cx + 3, dy - 7, 3, 1, '#d8cfb8');
  rect(ctx, cx - 7, dy - 9, 1, 2, '#d8cfb8');
  rect(ctx, cx + 6, dy - 9, 1, 2, '#d8cfb8');
  // degrau de pedra
  rect(ctx, 0, base, fw, 2, shade(st.trim[0], -0.25));
  rect(ctx, dx0 - 4, base - 1, 40, 3, '#86817a');
  rect(ctx, dx0 - 4, base - 1, 40, 1, '#a8a397');
  // tochas dos dois lados do portão
  for (const x of [dx0 - 6, dx1 + 3]) paintTorch(ctx, g, x, dy + 2, on);
}

/** Térreo dos fundos: frestas altas, porta de tábuas com lampião, barris, pilha de lenha com machado. */
function paintServiceGround(ctx: Ctx, g: Ctx, st: FacadeStyle, m: FacadeModel, top: number, on: boolean, rng: () => number): void {
  const fw = FACADE.w;
  const base = m.height - 2;
  rect(ctx, 0, top, fw, 2, st.trim[0]);
  rect(ctx, 0, top, fw, 1, st.trim[1]);
  // frestas altas
  for (let x = 12; x < fw - 12; x += 22) {
    if (Math.abs(x + 5 - fw / 2) < 18) continue;
    rect(ctx, x - 1, top + 5, 12, 6, st.frame);
    const lit = on && rng() < 0.5;
    rect(ctx, x, top + 6, 10, 4, lit ? WARM[1] : SHUTTER[0]);
    rect(ctx, x, top + 6, 10, 1, lit ? WARM[3] : SHUTTER[1]);
    for (let xx = x + 3; xx < x + 10; xx += 3) rect(ctx, xx, top + 6, 1, 4, st.frame);
    if (lit) {
      g.fillStyle = WARM[2];
      g.fillRect(x, top + 6, 10, 4);
    }
  }
  // porta de tábuas com lampião em cima
  const dx = fw / 2 - 7;
  rect(ctx, dx - 1, top + 9, 16, base - top - 9, OUTLINE);
  rect(ctx, dx, top + 10, 14, base - top - 10, '#6b4429');
  for (let xx = dx + 3; xx < dx + 14; xx += 3) rect(ctx, xx, top + 10, 1, base - top - 10, '#553420');
  rect(ctx, dx, top + 12, 14, 1, IRON[1]);
  rect(ctx, dx, base - 4, 14, 1, IRON[1]);
  rect(ctx, dx + 11, top + 18, 1, 3, IRON[2]);
  rect(ctx, dx + 5, top + 5, 4, 3, IRON[0]);
  rect(ctx, dx + 6, top + 6, 2, 1, on ? WARM[3] : '#4a3a2e');
  if (on) {
    g.fillStyle = 'rgba(255,200,120,0.9)';
    g.fillRect(dx + 6, top + 6, 2, 1);
    g.fillStyle = 'rgba(255,160,70,0.25)';
    g.fillRect(dx + 3, top + 3, 8, 7);
  }
  // barris
  for (const x of [20, 30]) {
    rect(ctx, x - 1, base - 10, 9, 10, OUTLINE);
    rect(ctx, x, base - 9, 7, 9, '#7a5032');
    rect(ctx, x + 1, base - 9, 2, 9, '#946240');
    rect(ctx, x, base - 7, 7, 1, IRON[1]);
    rect(ctx, x, base - 3, 7, 1, IRON[1]);
    rect(ctx, x, base - 9, 7, 1, '#a87a52');
  }
  // pilha de lenha com um machado cravado
  const lx = fw - 44;
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 6 - row; i++) {
      const x = lx + row * 2 + i * 5;
      const y = base - 4 - row * 4;
      rect(ctx, x, y, 5, 4, OUTLINE);
      rect(ctx, x + 1, y, 3, 3, '#b08a5a');
      rect(ctx, x + 2, y + 1, 1, 1, '#7a5636');
    }
  }
  rect(ctx, lx + 14, base - 18, 1, 6, '#6b4429');
  rect(ctx, lx + 12, base - 19, 4, 2, IRON[2]);
  rect(ctx, 0, base, fw, 2, shade(st.trim[0], -0.25));
}

/** Tabuleta "Fechado" pendurada (texto no idioma de quem vê, em pixels). */
function paintClosedSign(ctx: Ctx, cx: number, y: number): void {
  const text = tr('Fechado');
  const tw = Math.min(40, pixelTextWidth(text));
  const w = tw + 6;
  const x = Math.round(cx - w / 2);
  rect(ctx, x + 2, y - 4, 1, 4, '#c9a86a');
  rect(ctx, x + w - 3, y - 4, 1, 4, '#c9a86a');
  rect(ctx, x - 1, y - 1, w + 2, 10, OUTLINE);
  rect(ctx, x, y, w, 8, '#a8784a');
  rect(ctx, x, y, w, 1, '#c99a68');
  rect(ctx, x, y + 4, w, 1, '#8e6238');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 3, y, tw, 8);
  ctx.clip();
  pixelText(ctx, text, x + 3, y + 2, '#2a1a10');
  ctx.restore();
}

/** Textura do telhado visto de cima, pelo material da parede: palha, telhas de madeira ou ardósia. */
function paintRoofSurface(ctx: Ctx, st: FacadeStyle, x: number, y: number, w: number, h: number, rng: () => number): void {
  const [b, l] = st.roof;
  rect(ctx, x, y, w, h, b);
  if (st.pattern === 'brick' || st.pattern === 'stucco') {
    // palha: fiapos verticais em camadas, com a cumeeira amarrada
    for (let i = 0; i < (w * h) / 6; i++) {
      const px = x + Math.floor(rng() * w);
      const py = y + Math.floor(rng() * h);
      rect(ctx, px, py, 1, 2 + Math.floor(rng() * 3), rng() < 0.55 ? l : shade(b, -0.18));
    }
    for (let yy = y + 5; yy < y + h; yy += 6) rect(ctx, x, yy, w, 1, shade(b, -0.22));
    rect(ctx, x, y + 1, w, 2, shade(b, -0.3));
    for (let xx = x + 6; xx < x + w; xx += 12) rect(ctx, xx, y + 1, 2, 2, '#6e5530');
  } else {
    // telhas (madeira) ou lajotas de ardósia, em fiadas desencontradas
    const tile = st.pattern === 'panel' ? 6 : 8;
    for (let yy = y, row = 0; yy < y + h; yy += 3, row++) {
      rect(ctx, x, yy + 2, w, 1, shade(b, -0.25));
      for (let xx = x - (row % 2 ? tile / 2 : 0); xx < x + w; xx += tile) {
        const r = rng();
        if (r < 0.3) rect(ctx, Math.max(x, xx + 1), yy, tile - 1, 2, l);
        else if (r < 0.4) rect(ctx, Math.max(x, xx + 1), yy, tile - 1, 2, shade(b, -0.1));
        rect(ctx, Math.max(x, xx), yy, 1, 2, shade(b, -0.25));
      }
    }
    if (st.pattern === 'panel') for (let i = 0; i < w / 14; i++) rect(ctx, x + Math.floor(rng() * w), y + Math.floor(rng() * h), 2, 1, '#5d7a3a');
  }
}

/** Telhado visto de cima: beiral com cabeças de caibro, e em cima chaminé, braseiro, estandarte, chifres ou fardos. */
function paintRoof(ctx: Ctx, g: Ctx, st: FacadeStyle, m: FacadeModel, rng: () => number): void {
  const fw = FACADE.w;
  const R = FACADE.roof;
  const on = m.state === 'online';
  rect(ctx, 0, 0, fw, R - 5, OUTLINE);
  paintRoofSurface(ctx, st, 1, 1, fw - 2, R - 6, rng);
  // beiral: viga com as cabeças dos caibros
  rect(ctx, 0, R - 5, fw, 4, st.trim[0]);
  rect(ctx, 0, R - 5, fw, 1, st.trim[1]);
  for (let x = 5; x < fw - 3; x += 12) {
    rect(ctx, x, R - 4, 3, 3, st.trim[1]);
    rect(ctx, x, R - 2, 3, 1, OUTLINE);
  }
  rect(ctx, 0, R - 2, fw, 1, shade(st.trim[0], -0.35));
  rect(ctx, 0, R - 1, fw, 1, 'rgba(30,20,12,0.35)');
  // coisas no telhado
  const slots = m.side === 'back' ? [14, 150] : [14, 60, 120, 160];
  for (const sx of slots) {
    const r = rng();
    const x = sx + Math.floor(rng() * 10);
    if (r < 0.35) {
      // chaminé de pedra com fumaça
      rect(ctx, x, 5, 10, 11, OUTLINE);
      rect(ctx, x + 1, 6, 8, 9, '#76716a');
      rect(ctx, x + 1, 6, 8, 2, '#a8a397');
      rect(ctx, x + 1, 10, 4, 1, '#5c5850');
      rect(ctx, x + 5, 13, 4, 1, '#5c5850');
      rect(ctx, x + 3, 6, 4, 2, '#1e1814');
      ctx.fillStyle = 'rgba(200,196,190,0.55)';
      ctx.fillRect(x + 4, 2, 3, 3);
      ctx.fillRect(x + 6, 0, 3, 2);
    } else if (r < 0.6) {
      // braseiro de vigia (a chama brilha à noite)
      rect(ctx, x + 1, 9, 10, 6, OUTLINE);
      rect(ctx, x + 2, 9, 8, 4, IRON[1]);
      rect(ctx, x + 2, 9, 8, 1, IRON[2]);
      rect(ctx, x + 3, 15, 1, 2, IRON[0]);
      rect(ctx, x + 8, 15, 1, 2, IRON[0]);
      if (on) {
        rect(ctx, x + 3, 6, 6, 3, WARM[1]);
        rect(ctx, x + 4, 4, 4, 3, WARM[2]);
        rect(ctx, x + 5, 3, 2, 2, WARM[3]);
        g.fillStyle = 'rgba(255,190,100,0.95)';
        g.fillRect(x + 3, 3, 6, 6);
        g.fillStyle = 'rgba(255,140,50,0.3)';
        g.fillRect(x - 2, 0, 16, 14);
      } else {
        rect(ctx, x + 3, 8, 6, 1, '#3a302a');
        rect(ctx, x + 4, 7, 2, 1, '#5a4a40');
      }
    } else if (r < 0.8) {
      // fardos de feno amarrados
      for (const [ox, oy] of [
        [0, 8],
        [7, 8],
        [3, 4],
      ] as const) {
        rect(ctx, x + ox, oy, 8, 6, OUTLINE);
        rect(ctx, x + ox + 1, oy, 6, 5, '#d2ac58');
        rect(ctx, x + ox + 1, oy, 6, 1, '#ead08a');
        rect(ctx, x + ox + 3, oy, 1, 5, '#8a6a2a');
      }
    } else {
      // crânio de chifres pregado na cumeeira
      rect(ctx, x + 4, 6, 6, 5, '#d8cfb8');
      rect(ctx, x + 4, 10, 6, 1, '#a89e86');
      rect(ctx, x + 5, 8, 1, 1, OUTLINE);
      rect(ctx, x + 8, 8, 1, 1, OUTLINE);
      rect(ctx, x, 5, 4, 1, '#e8e0cc');
      rect(ctx, x + 10, 5, 4, 1, '#e8e0cc');
      rect(ctx, x - 1, 2, 1, 3, '#e8e0cc');
      rect(ctx, x + 14, 2, 1, 3, '#e8e0cc');
    }
  }
  if (rng() < 0.6) {
    // mastro com estandarte (a ponta do mastro brilha à noite)
    const ax = m.side === 'back' ? 176 : 100 + Math.floor(rng() * 40);
    rect(ctx, ax, 0, 1, 16, '#4a3020');
    rect(ctx, ax + 1, 1, 7, 6, st.accent[0]);
    rect(ctx, ax + 1, 1, 7, 1, st.accent[1]);
    rect(ctx, ax + 6, 6, 2, 1, st.accent[0]);
    rect(ctx, ax + 3, 3, 2, 2, '#e4d6b4');
    rect(ctx, ax, 0, 1, 1, on ? WARM[3] : '#8a7a5a');
    if (on) {
      g.fillStyle = WARM[3];
      g.fillRect(ax, 0, 1, 1);
    }
  }
}

/** Fundos: a entrada fica ao norte, então o toldo de pano sai da borda do telhado, com a placa logo atrás. */
function paintEntranceFromAbove(ctx: Ctx, g: Ctx, st: FacadeStyle, m: FacadeModel): void {
  const fw = FACADE.w;
  const on = m.state === 'online';
  const sign = signRect(m);
  rect(ctx, sign.x - 2, sign.y - 1, sign.w + 4, sign.h + 2, OUTLINE);
  rect(ctx, sign.x - 1, sign.y, sign.w + 2, sign.h, on ? st.accent[0] : '#4e3a2c');
  rect(ctx, sign.x - 1, sign.y, sign.w + 2, 1, on ? st.accent[1] : '#64503e');
  for (const x of [sign.x - 1, sign.x + sign.w]) rect(ctx, x, sign.y + 3, 1, 1, IRON[2]);
  if (on) {
    g.fillStyle = 'rgba(255,220,160,0.45)';
    g.fillRect(sign.x - 1, sign.y, sign.w + 2, sign.h);
  }
  // toldo de couro listrado, preso em duas varas
  const ax0 = fw / 2 - 22;
  rect(ctx, ax0 - 1, 0, 46, 10, OUTLINE);
  for (let x = 0; x < 44; x++) {
    const stripe = Math.floor(x / 4) % 2 === 0;
    rect(ctx, ax0 + x, 0, 1, 9, stripe ? st.accent[0] : '#c9b28a');
  }
  rect(ctx, ax0, 0, 44, 2, 'rgba(255,240,210,0.3)');
  rect(ctx, ax0, 7, 44, 2, 'rgba(30,20,12,0.3)');
  for (let x = ax0; x < ax0 + 44; x += 4) rect(ctx, x + 1, 9, 2, 1, st.accent[0]);
  // tochas nas varas da entrada
  for (const x of [ax0 + 2, ax0 + 39]) {
    rect(ctx, x, 1, 2, 2, on ? WARM[2] : '#4a3a2e');
    if (on) {
      g.fillStyle = 'rgba(255,190,100,0.95)';
      g.fillRect(x, 1, 2, 2);
      g.fillStyle = 'rgba(255,140,50,0.25)';
      g.fillRect(x - 3, 0, 8, 6);
    }
  }
}

/** Enfeites do tema do dono: Halloween (abóboras, teias, morcegos, lanternas roxas) e Natal (neve, lanternas, guirlanda, árvore). */
function paintTheme(ctx: Ctx, g: Ctx, m: FacadeModel, groundTop: number): void {
  if (m.theme === 'none') {
    if (m.side === 'front') {
      // barril d'água e caixote dos dois lados da entrada
      const fw = FACADE.w;
      const base = m.height - 2;
      const bx = fw / 2 - 27;
      rect(ctx, bx, base - 9, 8, 9, OUTLINE);
      rect(ctx, bx + 1, base - 8, 6, 8, '#7a5032');
      rect(ctx, bx + 2, base - 8, 1, 8, '#946240');
      rect(ctx, bx + 1, base - 6, 6, 1, IRON[1]);
      rect(ctx, bx + 1, base - 2, 6, 1, IRON[1]);
      rect(ctx, bx + 1, base - 8, 6, 1, '#3f6f8e');
      const cx = fw / 2 + 20;
      rect(ctx, cx, base - 8, 8, 8, OUTLINE);
      rect(ctx, cx + 1, base - 7, 6, 7, '#a07a4e');
      rect(ctx, cx + 1, base - 7, 6, 1, '#c49a68');
      rect(ctx, cx + 1, base - 4, 6, 1, '#6b4a30');
      rect(ctx, cx + 3, base - 7, 1, 7, '#6b4a30');
    }
    return;
  }
  const fw = FACADE.w;
  const R = FACADE.roof;
  const on = m.state === 'online';
  const xmas = m.theme === 'christmas';
  if (xmas) {
    // neve no telhado e no beiral
    ctx.fillStyle = '#f4f8fb';
    for (let x = 2; x < fw - 2; x += 1) {
      const k = Math.sin(x * 0.35) + Math.sin(x * 0.11);
      if (k > -0.4) ctx.fillRect(x, 2, 1, 2 + (k > 0.8 ? 1 : 0));
    }
    ctx.fillRect(0, R - 6, fw, 2);
    ctx.fillStyle = '#dbe6ee';
    ctx.fillRect(0, R - 4, fw, 1);
    for (let x = 6; x < fw - 6; x += 23) ctx.fillRect(x, 6 + (x % 7), 6, 2);
  }
  // cordão de lanternas sob o beiral (emissivo)
  const colors = xmas ? ['#ff5a5a', '#ffd76a', '#6ad1ff', '#7be07b'] : ['#b06ae6', '#ff9a3c'];
  for (let x = 4, i = 0; x < fw - 2; x += 6, i++) {
    const y = R + (i % 2);
    rect(ctx, x, y - 1, 1, 1, OUTLINE);
    rect(ctx, x, y, 2, 2, colors[i % colors.length]!);
    if (on) {
      g.fillStyle = colors[i % colors.length]!;
      g.fillRect(x, y, 2, 2);
      g.globalAlpha = 0.35;
      g.fillRect(x - 1, y - 1, 4, 4);
      g.globalAlpha = 1;
    }
  }
  if (!xmas) {
    // teias nos cantos de cima e morcegos no beiral
    ctx.strokeStyle = 'rgba(230,220,240,0.8)';
    ctx.lineWidth = 1;
    for (const side of [1, -1]) {
      const x = side === 1 ? 4.5 : fw - 4.5;
      const y = R + 0.5;
      ctx.beginPath();
      for (const [dx, dy] of [[9, 0], [7, 5], [0, 9]]) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + side * dx!, y + dy!);
      }
      ctx.moveTo(x + side * 4, y);
      ctx.lineTo(x + side * 3, y + 3);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
    }
    for (const x of [40, 132]) {
      const y = R - 9;
      rect(ctx, x, y, 3, 2, '#47344f');
      rect(ctx, x - 3, y - 1, 3, 2, '#47344f');
      rect(ctx, x + 3, y - 1, 3, 2, '#47344f');
      rect(ctx, x + 1, y, 1, 1, '#f5b95f');
    }
  }
  const base = m.height - 2;
  if (m.side === 'front') {
    if (xmas) {
      // guirlanda de pinho sobre o portão e árvore ao lado da entrada
      paintGarland(ctx, g, fw / 2 - 19, groundTop + 6, 38, on);
      drawSeasonal(ctx, 'tree', fw - 30, base + 2);
      drawSeasonal(ctx, 'gift', fw - 52, base + 2);
    } else {
      drawSeasonal(ctx, 'pumpkin', fw / 2 - 28, base + 2);
      drawSeasonal(ctx, 'pumpkin', fw / 2 + 28, base + 2);
      if (m.drawn > 0) drawSeasonal(ctx, 'ghost', 30, groundTop + 6);
    }
  } else {
    // nos fundos, o enfeite fica junto à porta
    if (xmas) {
      paintGarland(ctx, g, fw / 2 - 10, groundTop + 6, 20, on);
      drawSeasonal(ctx, 'tree', fw / 2 + 30, base + 2);
    } else {
      drawSeasonal(ctx, 'pumpkin', fw / 2 - 22, base + 2);
      drawSeasonal(ctx, 'pumpkin', fw / 2 + 22, base + 2);
    }
  }
}

/** Guirlanda de pinho (verde com laços vermelhos e luzinhas) sobre a porta. */
function paintGarland(ctx: Ctx, g: Ctx, x: number, y: number, w: number, on: boolean): void {
  for (let i = 0; i < w; i++) {
    const sag = Math.round(Math.sin((i / w) * Math.PI) * 3);
    rect(ctx, x + i, y + sag, 1, 3, i % 3 === 0 ? '#245644' : '#347653');
    if (i % 6 === 3) {
      rect(ctx, x + i, y + sag + 2, 2, 2, ['#ffd76a', '#ff5a5a', '#6ad1ff'][(i / 6) % 3 | 0]!);
      if (on) {
        g.fillStyle = '#ffe9a8';
        g.fillRect(x + i, y + sag + 2, 2, 2);
      }
    }
  }
  for (const bx of [x - 1, x + w - 3]) {
    rect(ctx, bx, y - 1, 4, 3, '#c93945');
    rect(ctx, bx + 1, y + 2, 1, 3, '#a82d42');
    rect(ctx, bx + 2, y + 2, 1, 2, '#a82d42');
  }
}

// ------------------------------------------------------------------ cores

function hexRgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const v = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${v(r)}${v(g)}${v(b)}`;
}

/** Escurece (k < 0) ou clareia (k > 0) uma cor hex. */
function shade(c: string, k: number): string {
  const [r, g, b] = hexRgb(c);
  if (k < 0) return toHex(r * (1 + k), g * (1 + k), b * (1 + k));
  return toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k);
}

function lighten(c: string, k: number): string {
  return shade(c, Math.abs(k));
}
