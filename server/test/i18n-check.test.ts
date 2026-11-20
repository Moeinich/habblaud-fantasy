import { describe, expect, it } from 'vitest';
import { stringLiterals } from '../../scripts/i18n-check';

const texts = (src: string) => stringLiterals(src).map((l) => ({ text: l.text, trArg: l.trArg }));

describe('i18n-check: string literals', () => {
  it('finds quoted and template text, marking tr() arguments', () => {
    expect(texts(`log('Olá'); tr('Pensando'); x = \`a \${b} ção\`;`)).toEqual([
      { text: 'Olá', trArg: false },
      { text: 'Pensando', trArg: true },
      { text: 'a   ção', trArg: false },
    ]);
  });

  it('skips comments and regex literals, also inside ${}', () => {
    const src = `// não\n/* também não */\nconst r = /'ação'/g;\nconst q = \`'\${s.replace(/'/g, \`'\\\\''\`)}'\`;`;
    expect(texts(src).some((l) => /ç/.test(l.text))).toBe(false);
  });

  it('a division is not a regex', () => {
    expect(texts(`const x = a / 2; const y = 'é';`)).toEqual([{ text: 'é', trArg: false }]);
  });
});
