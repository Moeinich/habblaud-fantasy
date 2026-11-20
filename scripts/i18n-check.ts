// Checks the translations: lists the texts passed to tr() without a translation and the translations left over
// (the PT text changed or left the code). Usage: npm run i18n:check [-- en|es|fr]
// A missing translation does not fail (the text just shows in PT). What fails (exit 1) is Portuguese text in code
// OUTSIDE tr(): it would reach the user (or the logs) untranslated. See findPortugueseLiterals.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { EN } from '../shared/locales/en';
import { ES } from '../shared/locales/es';
import { FR } from '../shared/locales/fr';

const ROOT = join(import.meta.dirname, '..');
const DIRS = ['client/src', 'shared', 'server', 'scripts'];
const DICTS: Record<string, Readonly<Record<string, string>>> = { en: EN, es: ES, fr: FR };

/** Primeiro argumento literal de cada tr('...') do código (sem os testes). */
export function collectKeys(root = ROOT): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  const re = /\btr\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules' && name !== 'dist' && name !== 'locales') walk(p);
      } else if (p.endsWith('.ts') && !p.endsWith('.test.ts') && name !== 'i18n-check.ts') {
        const src = readFileSync(p, 'utf8');
        for (const m of src.matchAll(re)) {
          const key = unescapeJs(m[2]);
          const line = src.slice(0, m.index).split('\n').length;
          keys.set(key, [...(keys.get(key) ?? []), `${relative(root, p)}:${line}`]);
        }
      }
    }
  };
  for (const d of DIRS) walk(join(root, d));
  return keys;
}

/** Letters that only show up in Portuguese text (none of them in plain English). */
const PT_CHARS = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/;

/**
 * Files allowed to hold Portuguese outside tr(): proper names, language names, internal ids, dev-only previews and
 * the Habblaud World folders (shared/world, server/world), which are not touched here.
 */
const PT_ALLOWED = [
  /^shared\/names\.ts$/,
  /^shared\/i18n\.ts$/,
  /^shared\/world\//,
  /^server\/world\//,
  /^server\/test\//,
  /^shared\/demo\//,
  /^client\/src\/art\/preview\.ts$/,
  /^client\/src\/world\/debug\.ts$/,
  /^client\/src\/world\/city\/facade\.ts$/,
  /^client\/src\/world\/sim\/sim\.ts$/,
  /^client\/src\/net\/world-stream\.ts$/,
  /^scripts\/(shot|world-shots)\.mjs$/,
  /^scripts\/assets\//,
];

/**
 * Text pieces of the string and template literals in `src` (comments and regex literals skipped). For a template
 * literal only the text outside `${}` counts. `trArg` = the literal is the first argument of tr().
 */
export function stringLiterals(src: string): Array<{ text: string; index: number; trArg: boolean }> {
  const out: Array<{ text: string; index: number; trArg: boolean }> = [];
  const regexAfterChar = /[(,=:[!&|?{};+\-*%<>~^]/;
  const regexAfterWord = /\b(return|typeof|case|in|of|delete|void|throw|new|yield|await)\s*$/;
  const isTrArg = (at: number) => /\btr\(\s*$/.test(src.slice(Math.max(0, at - 40), at));
  const readQuoted = (start: number): number => {
    const q = src[start];
    let j = start + 1;
    while (j < src.length && src[j] !== q && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
    out.push({ text: src.slice(start + 1, j), index: start, trArg: isTrArg(start) });
    return j + 1;
  };
  const readTemplate = (start: number): number => {
    let j = start + 1;
    let text = '';
    const trArg = isTrArg(start);
    while (j < src.length && src[j] !== '`') {
      if (src[j] === '\\') {
        text += src.slice(j, j + 2);
        j += 2;
      } else if (src[j] === '$' && src[j + 1] === '{') {
        text += ' ';
        j = lex(j + 2, true);
      } else text += src[j++];
    }
    out.push({ text, index: start, trArg });
    return j + 1;
  };
  /** Code from `from`; with `untilBrace`, stops after the `}` that closes a `${`. Returns where it stopped. */
  function lex(from: number, untilBrace: boolean): number {
    let i = from;
    let lastSig = '';
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      const n = src[i + 1];
      if (c === '/' && n === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && n === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end < 0 ? src.length : end + 2;
        continue;
      }
      if (c === '"' || c === "'") {
        i = readQuoted(i);
        lastSig = 'a';
        continue;
      }
      if (c === '`') {
        i = readTemplate(i);
        lastSig = 'a';
        continue;
      }
      if (c === '/' && (lastSig === '' || regexAfterChar.test(lastSig) || regexAfterWord.test(src.slice(Math.max(0, i - 12), i)))) {
        // Regex literal: up to the closing slash outside a character class.
        let j = i + 1;
        let cls = false;
        while (j < src.length && src[j] !== '\n') {
          if (src[j] === '\\') j++;
          else if (src[j] === '[') cls = true;
          else if (src[j] === ']') cls = false;
          else if (src[j] === '/' && !cls) break;
          j++;
        }
        i = j + 1;
        lastSig = 'a';
        continue;
      }
      if (untilBrace) {
        if (c === '{') depth++;
        else if (c === '}') {
          if (depth === 0) return i + 1;
          depth--;
        }
      }
      if (!/\s/.test(c)) lastSig = /[\w$)\]]/.test(c) ? 'a' : c;
      i++;
    }
    return i;
  }
  lex(0, false);
  return out;
}

/** Portuguese literals outside tr() in the product code (file:line and the text). */
export function findPortugueseLiterals(root = ROOT): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules' && name !== 'dist' && name !== 'locales') walk(p);
        continue;
      }
      if (!/\.(ts|mjs)$/.test(p) || p.endsWith('.test.ts') || name === 'i18n-check.ts') continue;
      const rel = relative(root, p).split('\\').join('/');
      if (PT_ALLOWED.some((re) => re.test(rel))) continue;
      const src = readFileSync(p, 'utf8');
      for (const lit of stringLiterals(src)) {
        if (lit.trArg || !PT_CHARS.test(lit.text)) continue;
        const line = src.slice(0, lit.index).split('\n').length;
        found.push(`${rel}:${line}  ${JSON.stringify(lit.text.slice(0, 80))}`);
      }
    }
  };
  for (const d of DIRS) walk(join(root, d));
  return found;
}

function unescapeJs(s: string): string {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, e: string) => {
    if (e === 'n') return '\n';
    if (e === 't') return '\t';
    if (e.startsWith('u{')) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
    if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
    return e;
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('i18n-check.ts')) {
  const only = process.argv[2];
  const keys = collectKeys();
  for (const [lang, dict] of Object.entries(DICTS)) {
    if (only && only !== lang) continue;
    const missing = [...keys.keys()].filter((k) => !(k in dict));
    const stale = Object.keys(dict).filter((k) => !keys.has(k));
    console.log(`${lang}: ${keys.size - missing.length}/${keys.size} textos traduzidos`);
    for (const k of missing) console.log(`  sem tradução: ${JSON.stringify(k)}  (${keys.get(k)![0]})`);
    for (const k of stale) console.log(`  sobrando:     ${JSON.stringify(k)}`);
  }
  const pt = findPortugueseLiterals();
  console.log(pt.length ? `Portuguese text outside tr(): ${pt.length}` : 'Portuguese text outside tr(): none');
  for (const f of pt) console.log(`  ${f}`);
  if (pt.length) process.exitCode = 1;
}
