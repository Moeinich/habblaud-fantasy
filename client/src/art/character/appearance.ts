// Deterministic appearance from a seed (pure, no DOM). The draw and the palettes live in shared/appearance-flat.ts;
// this module re-exports them and keeps what only the character editor needs.
import { ACCESSORIES, BOTTOM_STYLES, FACIAL_HAIR, HAIR_STYLES, TOP_STYLES, type PartKey } from '../../../../shared/appearance';
import {
  ACC_COLORS,
  BOTTOMS,
  EYES,
  HAIR_FUN,
  HAIR_NATURAL,
  JACKET_COLORS,
  LIGHT_ACCENTS,
  SHIRT_COLORS,
  SHOES,
  SKINS,
  TIE_COLORS,
  TOP_COLORS,
  type SeedAppearance,
} from '../../../../shared/appearance-flat';
import type { Appearance, TopStyle } from '../api';
import { tr } from '../../../../shared/i18n';

export { appearanceFromSeed, SKINS } from '../../../../shared/appearance-flat';
export type { BottomStyle, FacialHair } from '../../../../shared/appearance-flat';

// The shape in shared/appearance-flat.ts and the art's (art/api.ts) must not drift apart.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sameAppearance: Same<SeedAppearance, Appearance> = true;
void _sameAppearance;

/** Stable key of an appearance (for the sprite cache). */
export function appearanceKey(a: Appearance): string {
  return [
    a.skin, a.hair, a.hairStyle, a.eyes, a.top, a.topAccent, a.topStyle, a.bottom, a.shoes, a.accessory,
    a.accessoryColor, a.lanyard ?? '-', a.look, a.facialHair ?? '-', a.bottomStyle ?? '-',
  ].join('|');
}

// ------------------------------------------------------------------ character editor

const uniq = (list: readonly string[]): readonly string[] => [...new Set(list)];
const colorsOf = (pairs: readonly (readonly [string, number])[]): string[] => pairs.map(([c]) => c);
const ACCENTS = uniq([...LIGHT_ACCENTS, ...TOP_COLORS]);

/** Top and detail colours for each style: the same ones the random roll uses. */
function topPalettes(style: TopStyle): { top: readonly string[]; topAccent: readonly string[] } {
  switch (style) {
    case 'shirt_tie':
      return { top: SHIRT_COLORS, topAccent: TIE_COLORS };
    case 'jacket':
      return { top: JACKET_COLORS, topAccent: ACCENTS };
    default:
      return { top: TOP_COLORS, topAccent: ACCENTS };
  }
}

export type EditorOptions = Readonly<Record<PartKey, readonly string[]>>;

/** Options for each piece in the character editor, given the current appearance (clothes colours depend on the style). */
export function editorOptions(a: Appearance): EditorOptions {
  const top = topPalettes(a.topStyle);
  return {
    skin: SKINS,
    hair: [...colorsOf(HAIR_NATURAL), ...HAIR_FUN],
    hairStyle: HAIR_STYLES,
    eyes: uniq(EYES),
    top: top.top,
    topAccent: top.topAccent,
    topStyle: TOP_STYLES,
    bottom: colorsOf(BOTTOMS),
    bottomStyle: BOTTOM_STYLES,
    shoes: colorsOf(SHOES),
    accessory: ACCESSORIES,
    accessoryColor: ACC_COLORS[a.accessory],
    facialHair: FACIAL_HAIR,
  };
}

const TALL_HAIR: readonly string[] = ['afro', 'bun', 'mohawk', 'pigtails'];
const SHORT_HAIR: readonly string[] = ['bald', 'buzz'];

/** A combination the random roll avoids (the editor disables the option): returns the reason, or undefined if allowed. */
export function editorConflict(a: Appearance, key: PartKey, value: string): string | undefined {
  if (key === 'accessory') {
    if ((value === 'cap' || value === 'beanie') && TALL_HAIR.includes(a.hairStyle)) return tr('Doesn\'t go with this hair');
    if (value === 'bow' && SHORT_HAIR.includes(a.hairStyle)) return tr('Doesn\'t go with this hair');
  }
  if (key === 'hairStyle') {
    if ((a.accessory === 'cap' || a.accessory === 'beanie') && TALL_HAIR.includes(value)) return tr('Doesn\'t go with the cap or beanie');
    if (a.accessory === 'bow' && SHORT_HAIR.includes(value)) return tr('Doesn\'t go with the bow');
  }
  return undefined;
}

/** After switching a style: colours that don't exist in the new palette fall back to its first one. */
export function fitToOptions(a: Appearance): Appearance {
  const o = editorOptions(a);
  const fit = (v: string, list: readonly string[]): string => (list.includes(v) ? v : list[0]);
  return { ...a, top: fit(a.top, o.top), topAccent: fit(a.topAccent, o.topAccent), accessoryColor: fit(a.accessoryColor, o.accessoryColor) };
}
