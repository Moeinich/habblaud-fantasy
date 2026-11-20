// Kit de desenho de móveis (puro): materiais, caixas 3/4, sombras de contato e pequenos objetos.
// Convenção 3/4: topo mais claro (lt) com aresta frontal brilhante (hi), face frontal em base/dk,
// luz vindo de cima/esquerda (lado direito mais escuro).
import { mulberry32 } from '../../../../shared/hash';
import { mix, ramp, shade, type Ramp } from '../core/color';
import type { PixelBuf } from '../core/pixbuf';

export const M = {
  // Acampamento de fantasia: madeira bruta, pedra, ferro, couro, pergaminho e ouro.
  oak: ramp('#b98a55', 0.07),
  oakDark: ramp('#8a6239', 0.07),
  white: ramp('#d9cba8', 0.05), // bétula/pergaminho
  walnut: ramp('#5e3f27', 0.07),
  steel: ramp('#8f949a', 0.07), // ferro forjado
  steelDark: ramp('#4f5459', 0.07),
  graphite: ramp('#3b3530', 0.065),
  plastic: ramp('#cdb48a', 0.05), // couro claro
  stone: ramp('#a8a49a', 0.05),
  terracotta: ramp('#a8582f', 0.07),
  ceramic: ramp('#b89a72', 0.06), // barro cozido
  leaf: ramp('#4f7d3a', 0.08),
  leafDark: ramp('#2f5528', 0.07),
  cardboard: ramp('#a7804f', 0.06), // caixote
  blueFabric: ramp('#7a2e25', 0.07), // tecido vermelho tribal
  orange: ramp('#e08a2c', 0.07), // brasa
  gold: ramp('#e0b23c', 0.08),
  leather: ramp('#7b4f2c', 0.07),
  moss: ramp('#5f7a3a', 0.07),
} as const;

/** Cores de acento (estandartes, livros, objetos): tons terrosos e tribais. */
export const ACCENTS = ['#9c2f25', '#d48a2c', '#5f8a3a', '#2f7a78', '#e0b23c', '#6a4a8a', '#b8572c', '#8a6239'] as const;

/** Fundo padrão da "tela" (laje rúnica apagada) e o brilho das runas. */
export const SCREEN_BG = '#2c3a2e';
export const SCREEN_GLOW = '#7fe0a0';

export type Rng = () => number;

export function rngOf(seed: number, salt = 0): Rng {
  return mulberry32(((seed * 2654435761) ^ (salt * 40503) ^ 0x5bd1e995) >>> 0);
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

/** Face de cima (tampo): base clara, aresta de trás um pouco mais escura e aresta frontal brilhante. */
export function topFace(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp): void {
  b.rect(x, y, w, h, m.lt);
  if (h > 2) b.hline(x, x + w - 1, y, m.base);
  b.hline(x, x + w - 1, y + h - 1, m.hi);
}

/** Face frontal: base, com a última linha escura e bordas laterais sombreadas. */
export function frontFace(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp): void {
  b.rect(x, y, w, h, m.base);
  b.hline(x, x + w - 1, y + h - 1, m.dk);
  b.vline(x + w - 1, y, y + h - 1, m.dk);
  if (h > 1) b.hline(x, x + w - 1, y, m.base);
}

/** Textura sutil de veios de madeira num retângulo (linhas horizontais interrompidas). */
export function woodGrain(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp, seed: number, vertical = false): void {
  const r = rngOf(seed, 7);
  if (vertical) {
    for (let xx = x + 2; xx < x + w - 1; xx += 3 + Math.floor(r() * 2)) {
      const y0 = y + Math.floor(r() * h);
      const len = 2 + Math.floor(r() * (h - 1));
      for (let yy = y0; yy < Math.min(y + h, y0 + len); yy++) b.set(xx, yy, m.base);
    }
    return;
  }
  for (let yy = y + 1; yy < y + h - 1; yy += 2 + Math.floor(r() * 2)) {
    const x0 = x + Math.floor(r() * w);
    const len = 3 + Math.floor(r() * (w / 2));
    for (let xx = x0; xx < Math.min(x + w, x0 + len); xx++) b.set(xx, yy, m.base);
  }
}

/** Sombra de contato retangular arredondada, composta por baixo. */
export function contact(b: PixelBuf, x: number, y: number, w: number, h: number, alpha = 0.2): void {
  const c = `rgba(36,24,14,${alpha})`;
  const c2 = `rgba(36,24,14,${alpha * 0.55})`;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const corner = (xx === x || xx === x + w - 1) && (yy === y || yy === y + h - 1);
      if (corner) continue;
      const edge = xx === x || xx === x + w - 1 || yy === y + h - 1;
      b.under(xx, yy, edge ? c2 : c);
    }
  }
}

/** Retângulo composto por baixo do que já existe (sombras em áreas vazadas). */
export function underRect(b: PixelBuf, x: number, y: number, w: number, h: number, c: string): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) b.under(xx, yy, c);
}

/** Vidro translúcido azulado com reflexos diagonais. */
export function glass(
  b: PixelBuf,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { alpha?: number; streaks?: boolean; period?: number; offset?: number } = {},
): void {
  const a = opts.alpha ?? 0.42;
  b.rect(x, y, w, h, `rgba(196,214,190,${a})`);
  if (opts.streaks === false) return;
  // Reflexos: faixas diagonais (de baixo/esquerda para cima/direita).
  const period = opts.period ?? 9;
  for (let k = -h + (opts.offset ?? 0); k < w; k += period) {
    for (let i = 0; i < h; i++) {
      const xx = x + k + (h - 1 - i);
      const yy = y + i;
      if (xx >= x && xx < x + w) b.set(xx, yy, 'rgba(255,255,255,0.42)');
      if (xx + 1 >= x && xx + 1 < x + w) b.set(xx + 1, yy, 'rgba(255,255,255,0.22)');
    }
  }
  b.hline(x, x + w - 1, y, 'rgba(255,255,255,0.35)');
}

// ------------------------------------------------------------------ objetos pequenos

/** Sombra suave de objeto pousado numa superfície (1px, à direita/abaixo). */
const SURFACE_SHADOW = 'rgba(60,40,40,0.2)';
/** Sombra de contato mais firme para objetos sobre tampo branco (senão eles "somem" no branco). */
const SURFACE_SHADOW_LIGHT = 'rgba(40,46,70,0.3)';

/**
 * Tom dos objetos de mesa: 'light' (padrão, sobre madeira), 'onLight' (um degrau mais escuro e com
 * sombra mais firme, para tampo branco) ou 'dark'.
 */
export type DeskItemTone = 'light' | 'onLight' | 'dark';

/** Caneco de madeira com cinta de ferro e espuma (4x4). `color` tinge levemente a madeira. */
export function mug(b: PixelBuf, x: number, y: number, color: string): void {
  const wood = mix('#8a6239', color, 0.18);
  b.hline(x + 1, x + 3, y + 3, SURFACE_SHADOW);
  b.hline(x, x + 2, y, '#f1e6c8');
  b.set(x + 1, y, '#e0c98a');
  b.rect(x, y + 1, 3, 2, wood);
  b.set(x, y + 1, shade(wood, 0.14));
  b.hline(x, x + 2, y + 2, '#5a5550');
  b.set(x + 3, y + 1, shade(wood, -0.15));
  b.set(x + 3, y + 2, shade(wood, -0.22));
}

/** Pergaminhos: folha de baixo deslocada e folha de cima com linhas de tinta e ponta enrolada. */
export function papers(b: PixelBuf, x: number, y: number, w = 6, h = 4, tone: DeskItemTone = 'light'): void {
  const on = tone === 'onLight';
  b.hline(x + 1, x + w, y + h, on ? SURFACE_SHADOW_LIGHT : SURFACE_SHADOW);
  if (on) b.vline(x + w, y, y + h - 1, SURFACE_SHADOW_LIGHT);
  b.rect(x + 1, y - 1, w, h, '#c9b483');
  b.rect(x, y, w, h, '#eadcb4');
  b.hline(x, x + w - 1, y + h - 1, '#c2a874');
  b.vline(x + w - 1, y, y + h - 1, '#d4bf8c');
  for (let i = 1; i < h - 1; i++) b.hline(x + 1, x + 1 + Math.max(1, w - 3 - (i % 2)), y + i, '#7a5a3a');
}

/** Tábua rúnica de pedra (onde o trabalhador "digita"): pedra com runas entalhadas. */
export function keyboard(b: PixelBuf, x: number, y: number, w = 10, tone: DeskItemTone = 'light'): void {
  const pal =
    tone === 'dark'
      ? { base: '#4a4640', key: '#6c665c', edge: '#2f2b26', sh: SURFACE_SHADOW }
      : { base: '#9a948a', key: '#c4bcae', edge: '#6a645a', sh: tone === 'onLight' ? SURFACE_SHADOW_LIGHT : SURFACE_SHADOW };
  b.hline(x + 1, x + w, y + 3, pal.sh);
  b.rect(x, y, w, 3, pal.base);
  for (let i = 0; i < w - 1; i += 2) {
    b.set(x + 1 + i, y, pal.key);
    b.set(x + i, y + 1, pal.key);
  }
  b.set(x + Math.floor(w / 2), y + 1, '#7fe0a0');
  b.hline(x, x + w - 1, y + 2, pal.edge);
}

/** Pedra rúnica pequena (2x2) ao lado da tábua. */
export function mouse(b: PixelBuf, x: number, y: number, tone: DeskItemTone = 'light'): void {
  const dark = tone === 'dark';
  b.hline(x + 1, x + 2, y + 2, tone === 'onLight' ? SURFACE_SHADOW_LIGHT : SURFACE_SHADOW);
  b.rect(x, y, 2, 2, dark ? '#4a4640' : '#a8a296');
  b.set(x + 1, y + 1, dark ? '#2f2b26' : '#6a645a');
  b.set(x, y, '#7fe0a0');
}

// ------------------------------------------------------------------ factions (Horde / Alliance / Elf)

/**
 * Faction of a piece of furniture, one per race: Horde (dark timber, hide, iron, bone), Alliance (oak, blue, gold,
 * stone) or Elf (living moonwood, silver filigree, violet cloth, teal leaves and moonlight).
 */
export type Faction = 'horde' | 'alliance' | 'elf';

/** Paletas das facções (rampas prontas para os móveis). */
export const FACTION = {
  horde: {
    red: ramp('#9c2f25', 0.08),
    redLt: ramp('#b8402e', 0.08),
    hide: ramp('#b08a5a', 0.07),
    timber: ramp('#4e3420', 0.07),
    iron: ramp('#3a3a40', 0.07),
    bone: ramp('#e8dcc0', 0.05),
  },
  alliance: {
    blue: ramp('#2f4f9c', 0.08),
    blueLt: ramp('#3d63b8', 0.08),
    gold: ramp('#e0b23c', 0.08),
    stone: ramp('#9c968a', 0.06),
    plaster: ramp('#e6dcc4', 0.05),
    oak: ramp('#8a6239', 0.07),
  },
  elf: {
    /** Living moonwood: dark violet-brown bark. */
    bark: ramp('#5a4058', 0.07),
    /** Polished heartwood (tabletops, panels). */
    heart: ramp('#86687e', 0.06),
    violet: ramp('#6a3f8a', 0.08),
    teal: ramp('#2f8a86', 0.08),
    leaf: ramp('#4f9a78', 0.08),
    silver: ramp('#c4ccd8', 0.06),
    /** Moonlight glow. */
    moon: '#9ff0e6',
  },
} as const;

/** Rebite de ferro (2 px: brilho em cima à esquerda, sombra embaixo). */
export function rivet(b: PixelBuf, x: number, y: number, light = '#9a9aa2', dark = '#2a2a2e'): void {
  b.set(x, y, light);
  b.set(x + 1, y + 1, dark);
}

/** Cinta de ferro horizontal com rebites nas pontas (sobre madeira). */
export function ironBand(b: PixelBuf, x0: number, x1: number, y: number, rivets = true): void {
  b.hline(x0, x1, y, '#3a3a40');
  if (rivets) {
    b.set(x0 + 1, y, '#8a8a94');
    b.set(x1 - 1, y, '#8a8a94');
  }
}

/**
 * Presa/chifre de osso curvo: nasce em (x, y) e sobe `len` px, entortando para `dir` (-1 esquerda,
 * 1 direita). Aresta clara à esquerda, sombra à direita e ponta mais clara.
 */
export function tusk(b: PixelBuf, x: number, y: number, len: number, dir: -1 | 1): void {
  const bone = FACTION.horde.bone;
  for (let i = 0; i < len; i++) {
    const t = i / Math.max(1, len - 1);
    const xx = x + Math.round(dir * t * t * Math.max(1, len * 0.45));
    const yy = y - i;
    const thick = i < len - 2;
    b.set(xx, yy, i === len - 1 ? bone.hi : bone.lt);
    if (thick) b.set(xx + 1, yy, bone.dk);
  }
}

/** Vela de sebo (2 px de largura) com chama; `h` = altura da cera. */
export function candle(b: PixelBuf, x: number, y: number, h = 3): void {
  b.rect(x, y - h + 1, 2, h, '#efe6cc');
  b.vline(x + 1, y - h + 1, y, '#cfc2a0');
  b.set(x, y - h + 1, '#fff6dc');
  b.set(x, y - h, '#f6a63a');
  b.set(x, y - h - 1, '#ffe08a');
  b.set(x + 1, y - h, '#e07a2a');
}

/** Caveira cartunesca (5x4) com vela derretida em cima. (x, y) = canto superior esquerdo do crânio. */
export function skullCandle(b: PixelBuf, x: number, y: number): void {
  const bone = FACTION.horde.bone;
  b.rect(x, y, 5, 3, bone.lt);
  b.hline(x + 1, x + 3, y + 3, bone.base);
  b.hline(x, x + 4, y, bone.hi);
  b.vline(x + 4, y + 1, y + 2, bone.dk);
  b.set(x + 1, y + 1, '#2a1d14');
  b.set(x + 3, y + 1, '#2a1d14');
  b.set(x + 2, y + 2, bone.dk);
  b.set(x + 1, y + 3, '#2a1d14');
  b.set(x + 3, y + 3, '#2a1d14');
  // Vela.
  b.rect(x + 1, y - 2, 2, 2, '#efe6cc');
  b.set(x + 3, y - 1, '#efe6cc');
  b.set(x + 1, y - 3, '#f6a63a');
  b.set(x + 1, y - 4, '#ffe08a');
}

/** Machado de mão deitado (lâmina de ferro à direita). (x, y) = ponta do cabo. */
export function handAxe(b: PixelBuf, x: number, y: number): void {
  b.hline(x, x + 6, y, '#8a6239');
  b.hline(x, x + 6, y + 1, '#5a3c22');
  b.set(x + 2, y, '#c9b483');
  b.rect(x + 6, y - 2, 3, 5, '#5a5a62');
  b.vline(x + 9, y - 2, y + 2, '#c4c8d0');
  b.set(x + 6, y - 2, '#8a8a94');
}

/** Tinteiro de ouro com pena branca (Aliança). (x, y) = base. */
export function quillInk(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y - 1, 3, 2, '#2a2a3a');
  b.hline(x, x + 2, y - 2, '#e0b23c');
  b.set(x + 2, y, '#1a1a24');
  b.line(x + 1, y - 2, x + 4, y - 6, '#f4efe2');
  b.set(x + 4, y - 5, '#d8d0bc');
  b.set(x + 3, y - 5, '#ffffff');
}

/**
 * Pano/estandarte pendurado (desenha por cima, sem apagar o fundo): barra inferior recortada em "V"
 * (`notch`, padrão) e franja opcional na barra.
 */
export function drape(
  b: PixelBuf,
  x: number,
  y: number,
  w: number,
  h: number,
  cloth: Ramp,
  opts: { fringe?: string; notch?: boolean } = {},
): void {
  const notch = opts.notch !== false;
  const mid = (w - 1) / 2;
  for (let i = 0; i < w; i++) {
    const xx = x + i;
    // Comprimento da coluna: no "V", o meio é 2 px mais curto que as pontas.
    const cut = notch ? Math.max(0, 2 - Math.round(Math.abs(i - mid) * (4 / Math.max(2, w)))) : 0;
    const bottom = y + h - 1 - cut;
    const c = i === 0 ? cloth.lt : i === w - 1 ? cloth.dk : cloth.base;
    b.vline(xx, y, bottom, c);
    b.set(xx, y, cloth.dk);
    if (opts.fringe && i % 2 === 0) b.set(xx, bottom, opts.fringe);
  }
}

/** Estilo da laje/espelho de "tela": pedra neutra (padrão), Horda (laje com presas) ou Aliança (espelho dourado). */
export type ScreenStyle = 'stone' | Faction;

/** Laje rúnica de pedra num cavalete de madeira, vista de frente: moldura de pedra, "tela" (retângulo retornado), pés. */
export function monitorFront(
  b: PixelBuf,
  x: number,
  y: number,
  w = 16,
  h = 11,
  style: ScreenStyle = 'stone',
): { x: number; y: number; w: number; h: number } {
  if (style === 'horde') return hordeTablet(b, x, y, w, h);
  if (style === 'alliance') return allianceMirror(b, x, y, w, h);
  if (style === 'elf') return elfMoonpane(b, x, y, w, h);
  const body = '#6a645a';
  b.hline(x + 3, x + w - 2, y + h + 3, SURFACE_SHADOW);
  b.rect(x, y, w, h, body);
  b.hline(x, x + w - 1, y, '#8f887c');
  b.vline(x, y, y + h - 1, '#7c766a');
  b.hline(x, x + w - 1, y + h - 1, '#4a453e');
  b.vline(x + w - 1, y, y + h - 1, '#55504a');
  // Lascas na pedra.
  b.set(x + 2, y, '#55504a');
  b.set(x + w - 4, y + h - 1, '#3a3630');
  const sx = x + 1;
  const sy = y + 1;
  const sw = w - 2;
  const sh = h - 2;
  // Fundo padrão = runas apagadas (o mundo desenha o conteúdo animado por cima).
  b.rect(sx, sy, sw, sh, SCREEN_BG);
  b.rect(sx, sy, sw, 1, '#344636');
  for (let i = 0; i < sh; i++) b.set(sx + sw - 3 - i, sy + i, '#36493a');
  // Cristal aceso no canto (equivalente ao LED).
  b.set(x + w - 2, y + h - 1, '#7fe0a0');
  // Cavalete de madeira: duas pernas e travessa.
  const cx = x + Math.floor(w / 2) - 1;
  b.vline(cx - 2, y + h, y + h + 2, '#6b4a2b');
  b.vline(cx + 3, y + h, y + h + 2, '#6b4a2b');
  b.hline(cx - 2, cx + 3, y + h + 1, '#8a6239');
  return { x: sx, y: sy, w: sw, h: sh };
}

/** Fundo apagado da "tela" (runas mortas), comum aos estilos. */
function screenBg(b: PixelBuf, sx: number, sy: number, sw: number, sh: number): void {
  b.rect(sx, sy, sw, sh, SCREEN_BG);
  b.rect(sx, sy, sw, 1, '#344636');
  for (let i = 0; i < sh; i++) b.set(sx + sw - 3 - i, sy + i, '#36493a');
}

/**
 * Horda: laje rúnica numa moldura grossa de madeira escura, amarrada com couro, presas de osso nos
 * cantos de cima, rebites e um cristal-brasa embaixo; cavalete em "X" de troncos.
 */
function hordeTablet(b: PixelBuf, x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const t = FACTION.horde.timber;
  b.hline(x + 3, x + w - 2, y + h + 3, SURFACE_SHADOW);
  // Cavalete em X com amarração.
  const cx = x + Math.floor(w / 2) - 1;
  b.line(cx - 3, y + h + 2, cx + 2, y + h - 1, t.base);
  b.line(cx + 4, y + h + 2, cx - 1, y + h - 1, t.lt);
  b.set(cx, y + h, '#c9a46a');
  b.set(cx + 1, y + h, '#c9a46a');
  // Moldura.
  b.rect(x, y, w, h, t.base);
  b.hline(x, x + w - 1, y, t.lt);
  b.vline(x, y, y + h - 1, t.lt);
  b.hline(x, x + w - 1, y + h - 1, t.dd);
  b.vline(x + w - 1, y, y + h - 1, t.dk);
  const sx = x + 1;
  const sy = y + 1;
  const sw = w - 2;
  const sh = h - 2;
  screenBg(b, sx, sy, sw, sh);
  // Amarras de couro nas laterais (sobre a moldura).
  for (const yy of [y + 2, y + h - 3]) {
    b.set(x, yy, '#c9a46a');
    b.set(x + w - 1, yy, '#a8844e');
  }
  // Presas de osso curvando para fora nos cantos de cima.
  tusk(b, x, y - 1, 4, -1);
  tusk(b, x + w - 2, y - 1, 4, 1);
  // Brasa (equivalente ao LED) no meio da barra de baixo.
  b.set(x + Math.floor(w / 2), y + h - 1, '#ff6a2a');
  b.set(x + Math.floor(w / 2) - 1, y + h - 1, '#b8402e');
  return { x: sx, y: sy, w: sw, h: sh };
}

/**
 * Aliança: espelho de vidência numa moldura de ouro com crista em arco e gema azul no topo, pinhas
 * douradas nos cantos e pedestal de carvalho com pé dourado.
 */
function allianceMirror(b: PixelBuf, x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const g = FACTION.alliance.gold;
  const oak = FACTION.alliance.oak;
  b.hline(x + 3, x + w - 2, y + h + 3, SURFACE_SHADOW);
  // Pedestal.
  const cx = x + Math.floor(w / 2) - 1;
  b.rect(cx, y + h, 2, 2, oak.base);
  b.set(cx, y + h, oak.lt);
  b.hline(cx - 2, cx + 3, y + h + 2, g.base);
  b.set(cx - 2, y + h + 2, g.lt);
  // Moldura de ouro.
  b.rect(x, y, w, h, g.base);
  b.hline(x, x + w - 1, y, g.hi);
  b.vline(x, y, y + h - 1, g.lt);
  b.hline(x, x + w - 1, y + h - 1, g.dk);
  b.vline(x + w - 1, y, y + h - 1, g.dk);
  // Crista em arco com gema azul.
  const mx = x + Math.floor(w / 2);
  b.hline(mx - 3, mx + 2, y - 1, g.lt);
  b.hline(mx - 2, mx + 1, y - 2, g.base);
  b.set(mx - 1, y - 2, '#5a8ae0');
  b.set(mx, y - 2, '#2f4f9c');
  b.set(mx - 1, y - 3, g.hi);
  b.set(mx, y - 3, g.lt);
  // Pinhas nos cantos.
  b.set(x, y - 1, g.lt);
  b.set(x + w - 1, y - 1, g.dk);
  const sx = x + 1;
  const sy = y + 1;
  const sw = w - 2;
  const sh = h - 2;
  screenBg(b, sx, sy, sw, sh);
  // Gema de status no meio da barra de baixo.
  b.set(mx, y + h - 1, '#7fc0ff');
  return { x: sx, y: sy, w: sw, h: sh };
}

/** Silver crescent moon (5x5, tilted, horns pointing up-right). (x, y) = top-left. */
export function crescent(b: PixelBuf, x: number, y: number, c: string = FACTION.elf.silver.lt, dark: string = FACTION.elf.silver.dk): void {
  b.hline(x + 1, x + 2, y, c);
  b.hline(x, x + 1, y + 1, c);
  b.set(x, y + 2, c);
  b.hline(x, x + 1, y + 3, dark);
  b.set(x + 4, y + 3, dark);
  b.hline(x + 1, x + 3, y + 4, dark);
}

/** Small two-leaf sprig (teal-green) growing from (x, y) upwards; `dir` = side the top leaf leans to. */
export function leafSprig(b: PixelBuf, x: number, y: number, dir: -1 | 1 = 1): void {
  const l = FACTION.elf.leaf;
  b.vline(x, y - 2, y, FACTION.elf.bark.lt);
  b.set(x - dir, y - 1, l.base);
  b.set(x - dir * 2, y - 2, l.lt);
  b.set(x + dir, y - 3, l.lt);
  b.set(x + dir * 2, y - 3, l.hi);
  b.set(x + dir, y - 2, l.dk);
}

/** Moon lantern (Elf, replaces candles): silver hook, violet-capped glass orb with a teal moonlight core. (x, y) = top-left, 4x6. */
export function moonLantern(b: PixelBuf, x: number, y: number): void {
  const e = FACTION.elf;
  b.set(x + 1, y, e.silver.lt);
  b.set(x + 2, y, e.silver.dk);
  b.hline(x, x + 3, y + 1, e.violet.base);
  b.set(x, y + 1, e.violet.lt);
  b.rect(x, y + 2, 4, 3, '#4fc8c0');
  b.set(x + 1, y + 2, e.moon);
  b.set(x + 1, y + 3, '#ffffff');
  b.set(x + 2, y + 3, e.moon);
  b.set(x + 3, y + 4, '#2f8a86');
  b.hline(x, x + 3, y + 5, e.silver.dk);
  b.set(x, y + 5, e.silver.base);
}

/**
 * Elf: moonwell scrying pane in an arched frame of living moonwood. The arch grows two leafy shoots at the top
 * corners and carries a silver crescent at the crown; the stand is a pair of roots splaying on the desk.
 */
function elfMoonpane(b: PixelBuf, x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const e = FACTION.elf;
  const t = e.bark;
  b.hline(x + 3, x + w - 2, y + h + 3, SURFACE_SHADOW);
  // Roots: a short trunk under the pane splitting into two roots.
  const cx = x + Math.floor(w / 2) - 1;
  b.rect(cx, y + h, 2, 2, t.base);
  b.set(cx, y + h, t.lt);
  b.line(cx - 1, y + h + 1, cx - 4, y + h + 2, t.base);
  b.line(cx + 2, y + h + 1, cx + 5, y + h + 2, t.dk);
  b.set(cx - 4, y + h + 2, t.lt);
  // Frame of bark (rectangle) plus a 2-row arch on top.
  b.rect(x, y, w, h, t.base);
  b.hline(x + 1, x + w - 2, y - 1, t.lt);
  b.hline(x + 3, x + w - 4, y - 2, t.base);
  b.set(x + 2, y - 2, t.lt);
  b.set(x + w - 3, y - 2, t.dk);
  b.hline(x, x + w - 1, y, t.lt);
  b.vline(x, y, y + h - 1, t.lt);
  b.hline(x, x + w - 1, y + h - 1, t.dd);
  b.vline(x + w - 1, y, y + h - 1, t.dk);
  // Bark grooves on the side posts.
  b.set(x, y + 3, t.base);
  b.set(x + w - 1, y + 5, t.dd);
  const sx = x + 1;
  const sy = y + 1;
  const sw = w - 2;
  const sh = h - 2;
  screenBg(b, sx, sy, sw, sh);
  // Faint moonwater sheen on the top row of the pane.
  b.hline(sx, sx + sw - 1, sy, '#2e4a4c');
  // Silver crescent at the crown of the arch.
  const mx = x + Math.floor(w / 2);
  b.hline(mx - 2, mx, y - 3, e.silver.lt);
  b.set(mx - 3, y - 2, e.silver.base);
  b.set(mx + 1, y - 3, e.silver.dk);
  b.set(mx - 1, y - 2, e.moon);
  // Leafy shoots curling out of the top corners.
  b.set(x - 1, y - 1, e.leaf.base);
  b.set(x - 1, y - 2, e.leaf.lt);
  b.set(x, y - 2, e.leaf.hi);
  b.set(x + w, y - 1, e.leaf.dk);
  b.set(x + w, y - 2, e.leaf.base);
  b.set(x + w - 1, y - 2, e.leaf.lt);
  // Vine wrapping the left post.
  b.set(x, y + 2, e.leaf.base);
  b.set(x, y + h - 3, e.leaf.dk);
  // Moon gem (status light) in the bottom rail.
  b.set(mx, y + h - 1, e.moon);
  b.set(mx - 1, y + h - 1, '#4fc8c0');
  return { x: sx, y: sy, w: sw, h: sh };
}

/** Back of the elf pane: pale heartwood panel in a bark frame, silver crescent emblem and a carved leaf vine. */
function elfMoonpaneBack(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  const e = FACTION.elf;
  const t = e.bark;
  const panel = e.heart;
  const cx = x + Math.floor(w / 2);
  b.hline(x + 2, x + w - 1, y + h + 3, SURFACE_SHADOW_LIGHT);
  b.rect(cx - 1, y + h, 2, 2, t.base);
  b.line(cx - 2, y + h + 1, cx - 4, y + h + 2, t.base);
  b.line(cx + 1, y + h + 1, cx + 3, y + h + 2, t.dk);
  b.rect(x, y, w, h, t.base);
  b.hline(x, x + w - 1, y, t.lt);
  b.hline(x, x + w - 1, y + h - 1, t.dd);
  b.vline(x + w - 1, y, y + h - 1, t.dk);
  // Pale heartwood (the back must read as a back: never dark like the face).
  b.rect(x + 1, y + 1, w - 2, h - 2, panel.lt);
  b.hline(x + 1, x + w - 2, y + 1, panel.hi);
  b.vline(x + w - 2, y + 1, y + h - 2, panel.base);
  b.hline(x + 1, x + w - 2, y + h - 2, panel.base);
  // Carved vine along the bottom with leaves.
  for (let xx = x + 2; xx < x + w - 2; xx++) b.set(xx, y + h - 3 - ((xx >> 1) & 1), (xx & 3) === 0 ? e.leaf.base : panel.dk);
  // Silver crescent emblem in the middle.
  crescent(b, cx - 2, y + 1, e.silver.hi, e.silver.dk);
  b.set(cx + 1, y + 3, e.moon);
  // Leaf tips at the corners, flush with the frame (nothing above it: it must not cover the lap of whoever sits behind).
  b.set(x, y, e.leaf.lt);
  b.set(x + w - 1, y, e.leaf.dk);
}

/** Conteúdo estático de uma tela secundária (2º monitor / notebook). */
export type StaticScreen = 'sheet' | 'ide' | 'chart';

/**
 * Tela secundária "ligada" com conteúdo fixo um pouco escurecido (~60–75% do brilho da principal):
 * planilha, editor ou painel com gráfico. Quebra o bloco escuro das ilhas de mesas sem competir
 * com a tela animada principal.
 */
export function staticScreen(b: PixelBuf, r: { x: number; y: number; w: number; h: number }, kind: StaticScreen, seed: number): void {
  const { x, y, w, h } = r;
  const rnd = rngOf(seed, 41);
  if (kind === 'sheet') {
    // Livro-razão de pergaminho: cabeçalho vermelho, colunas de tinta e marcas de ouro.
    b.rect(x, y, w, h, '#d8c79c');
    b.hline(x, x + w - 1, y, '#9c2f25');
    b.vline(x, y + 1, y + h - 1, '#b8a272');
    for (let yy = y + 2; yy < y + h; yy += 2) b.hline(x + 1, x + w - 1, yy, '#c4b084');
    for (let xx = x + 4; xx < x + w; xx += 4) b.vline(xx, y + 1, y + h - 1, '#c4b084');
    for (let k = 0; k < 3; k++) {
      const cx = x + 1 + 4 * Math.floor(rnd() * Math.max(1, Math.floor((w - 1) / 4)));
      const cy = y + 1 + 2 * Math.floor(rnd() * Math.max(1, Math.floor((h - 1) / 2)));
      b.rect(cx, cy, Math.min(3, x + w - cx), 1, pick(rnd, ['#5f8a3a', '#b8862c', '#7a3a2a']));
    }
    return;
  }
  if (kind === 'chart') {
    // Pilhas de ouro crescendo sobre a pedra escura.
    b.rect(x, y, w, h, '#2c3328');
    b.hline(x + 1, x + Math.max(1, Math.floor(w / 2)), y + 1, '#8a9a7a');
    const base = y + h - 1;
    b.hline(x, x + w - 1, base, '#4a5240');
    const cols = ['#e0b23c', '#c08a2c', '#f0d070'];
    for (let xx = x + 1, i = 0; xx < x + w - 1; xx += 2, i++) {
      const bh = Math.max(1, Math.min(h - 3, 1 + Math.floor(rnd() * (h - 3)) + Math.floor(i / 2)));
      b.vline(xx, base - bh, base - 1, cols[i % cols.length]);
    }
    return;
  }
  // Runas brilhando em linhas, em tons esmaecidos de verde, âmbar e violeta.
  const syn = ['#5fae7a', '#8ac0a0', '#b8a05a', '#7a9a5a', '#9a7ab0', '#6ab0a8'];
  b.rect(x, y, w, h, '#26302a');
  b.vline(x, y, y + h - 1, '#2e3a32');
  for (let yy = y + 1; yy < y + h; yy += 2) {
    let cx = x + 2 + Math.floor(rnd() * 3);
    const tokens = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < tokens && cx < x + w - 1; k++) {
      const tw = Math.min(1 + Math.floor(rnd() * 4), x + w - 1 - cx);
      b.hline(cx, cx + tw - 1, yy, pick(rnd, syn));
      cx += tw + 1;
    }
  }
}

/**
 * Verso da laje rúnica (para desk_back): pedra lisa com cinta de couro, entalhe central e cavalete.
 * Nunca escura como a face — o verso tem que ler como verso.
 */
export function monitorBack(
  b: PixelBuf,
  x: number,
  y: number,
  w = 16,
  h = 10,
  tone: 'light' | 'mid' = 'light',
  style: ScreenStyle = 'stone',
): void {
  if (style === 'horde') return hordeTabletBack(b, x, y, w, h);
  if (style === 'alliance') return allianceMirrorBack(b, x, y, w, h);
  if (style === 'elf') return elfMoonpaneBack(b, x, y, w, h);
  const p =
    tone === 'mid'
      ? { hi: '#a8a296', lt: '#958f84', base: '#827c71', dk: '#6a645a', line: '#3f3a33' }
      : { hi: '#c4bcae', lt: '#b2ab9e', base: '#a09a8e', dk: '#857f74', line: '#4f4a42' };
  const cx = x + Math.floor(w / 2);
  b.hline(x + 2, x + w - 1, y + h + 3, SURFACE_SHADOW_LIGHT);
  // Cavalete.
  b.vline(cx - 3, y + h - 1, y + h + 2, '#6b4a2b');
  b.vline(cx + 2, y + h - 1, y + h + 2, '#6b4a2b');
  b.hline(cx - 3, cx + 2, y + h + 1, '#8a6239');
  // Pedra.
  b.rect(x, y, w, h, p.base);
  b.hline(x + 1, x + w - 2, y + 1, p.lt);
  b.vline(x + 1, y + 1, y + h - 2, p.lt);
  b.vline(x + w - 2, y + 1, y + h - 2, p.dk);
  b.hline(x + 1, x + w - 2, y + h - 2, p.dk);
  b.hline(x, x + w - 1, y, p.hi);
  b.vline(x, y + 1, y + h - 1, p.line);
  b.vline(x + w - 1, y + 1, y + h - 1, p.line);
  b.hline(x, x + w - 1, y + h - 1, p.line);
  // Cinta de couro atravessando e entalhe (marca do clã) no meio.
  b.hline(x + 1, x + w - 2, y + h - 4, '#6b4423');
  b.hline(x + 1, x + w - 2, y + h - 3, '#5a381c');
  b.set(cx - 1, y + 2, p.line);
  b.set(cx, y + 3, p.line);
  b.set(cx + 1, y + 2, p.line);
}

/** Verso da laje da Horda: couro cru esticado na moldura escura, costura em X, presas e marca de garra vermelha. */
function hordeTabletBack(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  const t = FACTION.horde.timber;
  const hide = FACTION.horde.hide;
  const cx = x + Math.floor(w / 2);
  b.hline(x + 2, x + w - 1, y + h + 3, SURFACE_SHADOW_LIGHT);
  b.line(cx - 4, y + h + 2, cx + 1, y + h - 1, t.base);
  b.line(cx + 3, y + h + 2, cx - 2, y + h - 1, t.lt);
  b.rect(x, y, w, h, t.base);
  b.hline(x, x + w - 1, y, t.lt);
  b.hline(x, x + w - 1, y + h - 1, t.dd);
  b.vline(x + w - 1, y, y + h - 1, t.dk);
  // Couro esticado (claro: o verso tem que ler como verso).
  b.rect(x + 1, y + 1, w - 2, h - 2, hide.lt);
  b.hline(x + 1, x + w - 2, y + 1, hide.hi);
  b.vline(x + w - 2, y + 1, y + h - 2, hide.base);
  b.hline(x + 1, x + w - 2, y + h - 2, hide.base);
  // Costura em X nas bordas.
  for (let yy = y + 2; yy < y + h - 2; yy += 2) {
    b.set(x + 1, yy, hide.dk);
    b.set(x + w - 2, yy + 1, hide.dk);
  }
  // Marca de garra (três riscos vermelhos) à direita do centro.
  for (let k = 0; k < 3; k++) b.line(cx - 1 + k * 2, y + 2, cx + k * 2, y + h - 4, '#9c2f25');
  // Pontas de osso nos cantos, rentes à moldura (nada acima dela: não cobre o colo de quem senta atrás).
  b.set(x, y, FACTION.horde.bone.lt);
  b.set(x + w - 1, y, FACTION.horde.bone.dk);
}

/** Verso do espelho da Aliança: painel de carvalho claro com aro dourado e escudo azul no meio. */
function allianceMirrorBack(b: PixelBuf, x: number, y: number, w: number, h: number): void {
  const g = FACTION.alliance.gold;
  const panel = ramp('#c9a06a', 0.06);
  const cx = x + Math.floor(w / 2);
  b.hline(x + 2, x + w - 1, y + h + 3, SURFACE_SHADOW_LIGHT);
  b.rect(cx - 1, y + h, 2, 2, FACTION.alliance.oak.base);
  b.hline(cx - 3, cx + 2, y + h + 2, g.base);
  b.rect(x, y, w, h, g.base);
  b.hline(x, x + w - 1, y, g.hi);
  b.hline(x, x + w - 1, y + h - 1, g.dk);
  b.vline(x + w - 1, y, y + h - 1, g.dk);
  b.rect(x + 1, y + 1, w - 2, h - 2, panel.lt);
  b.hline(x + 1, x + w - 2, y + 1, panel.hi);
  b.vline(x + w - 2, y + 1, y + h - 2, panel.base);
  b.hline(x + 1, x + w - 2, y + h - 2, panel.base);
  // Escudo azul com aro de ouro.
  b.rect(cx, y + 2, 3, 3, '#2f4f9c');
  b.set(cx, y + 2, '#3d63b8');
  b.set(cx + 1, y + 5, '#2f4f9c');
  b.set(cx + 1, y + 3, g.hi);
  // Pinhas nos cantos (sem crista no meio: não pode cobrir o colo de quem senta atrás).
  b.set(x, y - 1, g.lt);
  b.set(x + w - 1, y - 1, g.dk);
}

/** Tinteiro com penas. */
export function pencilCup(b: PixelBuf, x: number, y: number): void {
  b.set(x, y - 3, '#e8e2d0');
  b.set(x + 1, y - 2, '#e8e2d0');
  b.set(x + 2, y - 3, '#9c2f25');
  b.rect(x, y - 1, 3, 3, '#3a3630');
  b.set(x, y - 1, '#5a554c');
}

/** Cogumelo de chapéu vermelho numa tigela de barro. */
export function smallSucculent(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y, 4, 3, '#a8582f');
  b.set(x + 3, y + 1, '#7e3f20');
  b.set(x + 3, y + 2, '#7e3f20');
  b.vline(x + 1, y - 2, y - 1, '#e8dcc0');
  b.hline(x, x + 2, y - 3, '#b8352a');
  b.set(x + 1, y - 4, '#d4483a');
  b.set(x + 2, y - 3, '#f0e6d0');
}

/** Vela num castiçal de ferro. */
export function photoFrame(b: PixelBuf, x: number, y: number): void {
  b.rect(x, y + 3, 4, 1, '#3a3630');
  b.rect(x + 1, y + 1, 2, 2, '#efe6cc');
  b.set(x + 1, y, '#f6c04a');
  b.set(x + 2, y, '#fff2b0');
}

export function book(b: PixelBuf, x: number, y: number, w: number, h: number, color: string): void {
  b.rect(x, y, w, h, color);
  b.vline(x, y, y + h - 1, shade(color, 0.1));
  b.vline(x + w - 1, y, y + h - 1, shade(color, -0.12));
  if (h > 4) b.hline(x, x + w - 1, y + 1, shade(color, 0.22));
  if (h > 6 && w > 1) b.hline(x, x + w - 1, y + h - 3, shade(color, 0.22));
}

/**
 * Copa/folhagem em "bolhas" (estilo tileset): massa escura de fundo e bolhas de folhas desenhadas
 * de cima para baixo, cada uma com aro claro no alto/esquerda e sombra embaixo/direita. As bolhas
 * de baixo ficam mais escuras, dando volume.
 */
export function foliage(b: PixelBuf, cx: number, cy: number, rx: number, ry: number, m: Ramp, seed: number): void {
  const r = rngOf(seed, 3);
  b.ellipse(cx, cy + 0.5, rx, ry, m.dd);
  const bubbles: [number, number, number][] = [];
  const br = Math.max(1.6, Math.min(rx, ry) * 0.55);
  for (let gy = -ry + br * 0.6; gy <= ry - br * 0.4; gy += br * 1.05) {
    for (let gx = -rx + br * 0.6; gx <= rx - br * 0.4; gx += br * 1.15) {
      const jx = gx + (r() - 0.5) * br * 0.7;
      const jy = gy + (r() - 0.5) * br * 0.6;
      if ((jx / rx) ** 2 + (jy / ry) ** 2 > 0.82) continue;
      bubbles.push([cx + jx, cy + jy, br * (0.85 + r() * 0.35)]);
    }
  }
  bubbles.sort((a, c) => a[1] - c[1]);
  for (const [bx, by, rad] of bubbles) {
    const low = (by - cy) / ry; // -1 topo .. 1 base
    const left = (cx - bx) / rx;
    const body = low > 0.35 ? m.dk : low > -0.2 || left < -0.4 ? m.base : m.lt;
    for (let y = Math.floor(by - rad); y <= Math.ceil(by + rad); y++) {
      for (let x = Math.floor(bx - rad); x <= Math.ceil(bx + rad); x++) {
        const dx = (x + 0.5 - bx) / rad;
        const dy = (y + 0.5 - by) / (rad * 0.9);
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        let c = body;
        if (d > 0.4 && dx + dy * 1.3 < -0.75) c = body === m.lt ? m.hi : body === m.base ? m.lt : m.base;
        else if (d > 0.5 && dx * 0.4 + dy > 0.7) c = body === m.lt ? m.base : m.dd;
        b.set(x, y, c);
      }
    }
  }
}

/**
 * Folha grande de (x0,y0) até a ponta (x1,y1). Antes do preenchimento desenha um anel escuro
 * (borda) para separar folhas sobrepostas. `cuts`: 'monstera' (3 recortes largos) ou 'pinnate'
 * (folíolos: recortes alternados ao longo de toda a lâmina, como fronde de palmeira).
 */
export function bigLeaf(
  b: PixelBuf,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  m: Ramp,
  cuts: 'monstera' | 'pinnate' | 'none' = 'monstera',
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  const nx = -uy;
  const ny = ux;
  const steps = Math.ceil(len * 3);
  const shapeW = (t: number) => (width / 2) * Math.sin(Math.PI * Math.pow(Math.min(1, t), 0.7));
  const paint = (grow: number, color: (k: number) => string) => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const w = shapeW(t) + grow;
      for (let k = -w; k <= w; k += 0.4) {
        b.set(Math.round(x0 + ux * len * t + nx * k), Math.round(y0 + uy * len * t + ny * k), color(k));
      }
    }
    if (grow > 0) b.set(Math.round(x1 + ux * grow), Math.round(y1 + uy * grow), m.dd);
  };
  paint(0.9, () => m.dd);
  paint(0, (k) => (nx * k + ny * k < 0 ? m.lt : m.base));
  b.line(Math.round(x0), Math.round(y0), Math.round(x0 + ux * len * 0.92), Math.round(y0 + uy * len * 0.92), m.dk);
  b.set(Math.round(x0 + ux * len * 0.3 + nx * -shapeW(0.3) * 0.5), Math.round(y0 + uy * len * 0.3 + ny * -shapeW(0.3) * 0.5), m.hi);
  if (cuts === 'none') return;
  const cutList: [number, number][] =
    cuts === 'monstera'
      ? [[0.42, 1], [0.6, -1], [0.76, 1]]
      : Array.from({ length: Math.floor(len / 1.2) }, (_, i) => [0.18 + (i * 1.2) / len, i % 2 ? 1 : -1] as [number, number]).filter(([t]) => t < 0.95);
  for (const [t, side] of cutList) {
    const w = shapeW(t);
    for (let k = w * 0.35; k <= w + 0.5; k += 0.4) {
      const x = Math.round(x0 + ux * len * (t + 0.04) + nx * k * side);
      const y = Math.round(y0 + uy * len * (t + 0.04) + ny * k * side);
      if (cuts === 'pinnate') b.clear(x, y);
      else b.set(x, y, m.dd);
    }
  }
}

/** Folha alongada (lâmina) de (x0,y0) até a ponta (x1,y1), com nervura central. */
export function leafBlade(b: PixelBuf, x0: number, y0: number, x1: number, y1: number, width: number, m: Ramp, light: boolean): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len * 2);
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.5;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    for (let k = -w; k <= w; k += 0.5) b.set(Math.round(px + nx * k), Math.round(py + ny * k), k < 0 === light ? m.lt : m.base);
  }
  b.line(x0, y0, Math.round(x0 + (x1 - x0) * 0.85), Math.round(y0 + (y1 - y0) * 0.85), m.dk);
}

/** Vaso de cerâmica/terracota (topo com aro, corpo afunilado) — (x, y) = canto superior esquerdo. */
export function pot(b: PixelBuf, x: number, y: number, w: number, h: number, m: Ramp = M.terracotta): void {
  b.rect(x, y, w, 2, m.lt);
  b.hline(x, x + w - 1, y, m.hi);
  b.hline(x + 1, x + w - 2, y + 1, shade(m.dd, -0.1));
  for (let i = 2; i < h; i++) {
    const inset = i >= h - 2 ? 1 : 0;
    b.hline(x + inset, x + w - 1 - inset, y + i, m.base);
    b.set(x + inset, y + i, m.lt);
    b.set(x + w - 1 - inset, y + i, m.dk);
    if (i === h - 1) b.hline(x + inset, x + w - 1 - inset, y + i, m.dk);
  }
}
