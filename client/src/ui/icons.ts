// Ícones da interface em pixel art (mapas de pixels -> SVG com bordas nítidas), coerentes com o escritório.
// Cada '#' é um pixel pintado com currentColor; renderizados a 2 px de tela por pixel.

function pixelPaths(rows: readonly string[], palette: Readonly<Record<string, string>>): string {
  let out = '';
  for (const [ch, color] of Object.entries(palette)) {
    let d = '';
    rows.forEach((row, y) => {
      // Agrupa pixels consecutivos da linha num único retângulo.
      let x = 0;
      while (x < row.length) {
        if (row[x] !== ch) {
          x++;
          continue;
        }
        let run = 1;
        while (row[x + run] === ch) run++;
        d += `M${x} ${y}h${run}v1h-${run}z`;
        x += run;
      }
    });
    if (d) out += `<path fill="${color}" d="${d}"/>`;
  }
  return out;
}

export function pixelIcon(rows: readonly string[], palette: Readonly<Record<string, string>> = { '#': 'currentColor' }, cls = 'ui-px-icon'): string {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  return `<svg class="${cls}" width="${w * 2}" height="${h * 2}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${pixelPaths(rows, palette)}</svg>`;
}

export const ICONS = {
  overview: pixelIcon([
    '###....###',
    '#........#',
    '#........#',
    '...####...',
    '...#..#...',
    '...#..#...',
    '...####...',
    '#........#',
    '#........#',
    '###....###',
  ]),
  zoomIn: pixelIcon([
    '..........',
    '....##....',
    '....##....',
    '....##....',
    '.########.',
    '.########.',
    '....##....',
    '....##....',
    '....##....',
    '..........',
  ]),
  zoomOut: pixelIcon([
    '..........',
    '..........',
    '..........',
    '..........',
    '.########.',
    '.########.',
    '..........',
    '..........',
    '..........',
    '..........',
  ]),
  sidebar: pixelIcon([
    '##########',
    '#..#.....#',
    '#..#.....#',
    '#..#.....#',
    '#..#.....#',
    '#..#.....#',
    '#..#.....#',
    '#..#.....#',
    '#..#.....#',
    '##########',
  ]),
  feed: pixelIcon([
    '##########',
    '#........#',
    '#........#',
    '#........#',
    '##########',
    '#.##.###.#',
    '#........#',
    '#.##.##..#',
    '#........#',
    '##########',
  ]),
  settings: pixelIcon([
    '....##....',
    '.#.####.#.',
    '..######..',
    '.###..###.',
    '####..####',
    '####..####',
    '.###..###.',
    '..######..',
    '.#.####.#.',
    '....##....',
  ]),
  help: pixelIcon([
    '..######..',
    '.##....##.',
    '.##....##.',
    '......##..',
    '.....##...',
    '....##....',
    '....##....',
    '..........',
    '....##....',
    '....##....',
  ]),
  maximize: pixelIcon([
    '..........',
    '.####.....',
    '.##.......',
    '.#.#......',
    '.#........',
    '........#.',
    '......#.#.',
    '.......##.',
    '.....####.',
    '..........',
  ]),
  restore: pixelIcon([
    '..........',
    '...#......',
    '...#......',
    '.###......',
    '..........',
    '..........',
    '......###.',
    '......#...',
    '......#...',
    '..........',
  ]),
  pencil: pixelIcon([
    '.......##.',
    '......#..#',
    '.....#..#.',
    '....#..#..',
    '...#..#...',
    '..#..#....',
    '.#..#.....',
    '.#.#......',
    '.##.......',
    '..........',
  ]),
  close: pixelIcon([
    '..........',
    '.##....##.',
    '.###..###.',
    '..######..',
    '...####...',
    '...####...',
    '..######..',
    '.###..###.',
    '.##....##.',
    '..........',
  ]),
  search: pixelIcon([
    '.####.....',
    '#....#....',
    '#....#....',
    '#....#....',
    '#....#....',
    '.####.....',
    '.....##...',
    '......##..',
    '.......##.',
    '........#.',
  ]),
  copy: pixelIcon([
    '...#######',
    '...#.....#',
    '...#.....#',
    '#######..#',
    '#.....#..#',
    '#.....#..#',
    '#.....####',
    '#.....#...',
    '#.....#...',
    '#######...',
  ]),
  check: pixelIcon([
    '..........',
    '.........#',
    '........##',
    '.......##.',
    '#.....##..',
    '##...##...',
    '.##.##....',
    '..###.....',
    '...#......',
    '..........',
  ]),
  follow: pixelIcon([
    '....##....',
    '....##....',
    '..######..',
    '.#......#.',
    '##..##..##',
    '##..##..##',
    '.#......#.',
    '..######..',
    '....##....',
    '....##....',
  ]),
  center: pixelIcon([
    '###....###',
    '#........#',
    '#........#',
    '....##....',
    '...####...',
    '...####...',
    '....##....',
    '#........#',
    '#........#',
    '###....###',
  ]),
  hand: pixelIcon([
    '...#.#....',
    '..#.#.#...',
    '..#.#.#.#.',
    '..#.#.#.#.',
    '..#######.',
    '#.#######.',
    '##.######.',
    '.########.',
    '..######..',
    '...####...',
  ]),
  warn: pixelIcon([
    '....##....',
    '...####...',
    '...#..#...',
    '..##..##..',
    '..##..##..',
    '.###..###.',
    '.########.',
    '####..####',
    '##########',
    '..........',
  ]),
  clock: pixelIcon([
    '..######..',
    '.#......#.',
    '#....#...#',
    '#....#...#',
    '#....###.#',
    '#........#',
    '#........#',
    '.#......#.',
    '..######..',
    '..........',
  ]),
  // Ampulheta (esperando o shell): moldura na cor do texto e areia âmbar caindo.
  hourglass: pixelIcon(
    [
      '#########',
      '.#sssss#.',
      '.#sssss#.',
      '..#sss#..',
      '...#s#...',
      '...#s#...',
      '..#.s.#..',
      '.#..s..#.',
      '.#.sss.#.',
      '#########',
    ],
    { '#': 'currentColor', s: '#f7c76b' },
  ),
  // Janela de terminal com o prompt ">_".
  terminal: pixelIcon([
    '##########',
    '#........#',
    '#.#......#',
    '#..#.....#',
    '#...#....#',
    '#..#.....#',
    '#.#..###.#',
    '#........#',
    '##########',
  ]),
  /** Pessoa com um +: novo agente (o + sozinho já é o "aproximar" da câmera). */
  newAgent: pixelIcon(['..##......', '.####.....', '.####...#.', '..##...###', '........#.', '.####.....', '######....', '######....']),
  delivery: pixelIcon(['...####...', '..#....#..', '.#......#.', '##########', '#....#...#', '#...###..#', '#....#...#', '#........#', '##########']),
  chevronLeft: pixelIcon(['....##', '...##.', '..##..', '.##...', '..##..', '...##.', '....##']),
  chevronRight: pixelIcon(['##....', '.##...', '..##..', '...##.', '..##..', '.##...', '##....']),
  mic: pixelIcon(['...##...', '..####..', '..####..', '..####..', '#.####.#', '#..##..#', '.#....#.', '..####..', '...##...', '..####..']),
  stopRec: pixelIcon(['........', '.######.', '.######.', '.######.', '.######.', '.######.', '.######.', '........']),
  attach: pixelIcon(['...###..', '..#...#.', '..#.#.#.', '..#.#.#.', '..#.#.#.', '..#.#.#.', '..#...#.', '...###..']),
  lock: pixelIcon(['..####..', '.##..##.', '.#....#.', '.#....#.', '########', '###..###', '###..###', '########', '########']),
  chevronDown: pixelIcon(['#......#', '##....##', '.##..##.', '..####..', '...##...']),
  chevronUp: pixelIcon(['...##...', '..####..', '.##..##.', '##....##', '#......#']),
  arrowDown: pixelIcon(['...##...', '...##...', '...##...', '#######.', '.#####..', '..###...', '...#....'].map((r) => r.padEnd(8, '.'))),
  /** Cidade do Habblaud World (botão Mundo): prédios de alturas diferentes. */
  city: pixelIcon(['......##..', '..##..##..', '..##.####.', '####.#..#.', '#..#.####.', '####.#..#.', '#..#.####.', '####.#..#.', '##########']),
  /** O escritório (botão de volta da cidade): um prédio com porta. */
  office: pixelIcon(['..######..', '..#.##.#..', '..######..', '..#.##.#..', '..######..', '..#.##.#..', '..##..##..', '..##..##..', '##########']),
} as const;

export type IconKey = keyof typeof ICONS;

/** Marca do Habblaud em pixels (usada quando /assets/brand/logo-mark.png não existe): casa de madeira com janelas à luz de tocha. */
export const FALLBACK_MARK = pixelIcon(
  [
    '.....######.....',
    '.....#rrrr#.....',
    '..############..',
    '..#llllllllll#..',
    '..#lwwlwwlbbl#..',
    '..#lwwlwwlbbl#..',
    '..#llllllllll#..',
    '..#lbblwwlwwl#..',
    '..#lbblwwlwwl#..',
    '..#llllllllll#..',
    '..#lwwlddlbbl#..',
    '..#lwwlddlbbl#..',
    '..#llllddllll#..',
    '################',
  ],
  { '#': '#2a1a0d', l: '#8a5f34', r: '#c2402f', w: '#ffc85a', b: '#e08a3a', d: '#1a110a' },
  'ui-px-icon ui-mark',
);

/**
 * Logotipo "Habblaud" em pixels, com a mesma fonte bitmap da placa da marca (assets/brand/signage.png, gerada por
 * scripts/assets/pixelart.py): a Pixelify Sans não fica nítida nesse tamanho.
 * c = "Hab" (pergaminho), t = "blaud" (dourado), s = sombra de 1 px.
 */
export const WORDMARK_ROWS = [
  'c...c.......c.....t.....tt..................t',
  'c...c.......c.....t.....st..................t',
  'c...c..ccc..cccc..tttt...t...ttt..t...t..tttt',
  'ccccc..sssc.csssc.tssst..t...ssst.t...t.tssst',
  'csssc..cccc.c...c.t...t..t...tttt.t...t.t...t',
  'c...c.csssc.c...c.t...t..t..tssst.t...t.t...t',
  'c...c.scccc.ccccs.tttts.ttt.stttt.stttt.stttt',
  's...s..ssss.ssss..ssss..sss..ssss..ssss..ssss',
] as const;

export const WORDMARK = pixelIcon(WORDMARK_ROWS, { s: 'rgba(12, 7, 3, 0.7)', c: '#f3e7c9', t: '#e9bb4f' }, 'ui-wordmark');
