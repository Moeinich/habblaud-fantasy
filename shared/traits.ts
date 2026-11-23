// Personality traits of the office characters (client/src/world/social/persona.ts draws 2 or 3 per seed): the ids,
// the pairs that clash and the translated (tr) labels. Pure: no Node or DOM.
//
// The labels are nouns ("Competition", "Vanity"): they do not depend on anyone's gender.
import { tr } from './i18n';

export const TRAIT_IDS = [
  'competicao', 'apostas', 'games', 'series', 'fofoca', 'vaidade', 'cafeina', 'piadas', 'esporte', 'timidez',
  'economia', 'sonecas', 'calma', 'leitura',
] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

/** Pairs of traits that do not go together in the same person. */
export const TRAIT_CLASHES: readonly (readonly [TraitId, TraitId])[] = [
  ['timidez', 'piadas'],
  ['timidez', 'fofoca'],
  ['apostas', 'economia'],
  ['esporte', 'sonecas'],
  ['calma', 'competicao'],
];

export interface Trait {
  id: TraitId;
  emoji: string;
  label: string;
  /** One sentence explaining the effect in the office (a tooltip in the interface). */
  desc: string;
}

/** In the order of TRAIT_IDS (a test checks it: personaFor's draw depends on it). */
export const TRAITS: Readonly<Record<TraitId, Trait>> = {
  competicao: { id: 'competicao', emoji: '🏆', label: tr('Competition'), desc: tr('Loves to compete: challenges coworkers at ping-pong, video games and rock-paper-scissors.') },
  apostas: { id: 'apostas', emoji: '🎲', label: tr('Betting'), desc: tr('Takes any bet and bets big at rock-paper-scissors.') },
  games: { id: 'games', emoji: '🎮', label: tr('Games'), desc: tr('Lives on the lounge console and the arcade machines — and usually wins.') },
  series: { id: 'series', emoji: '📺', label: tr('TV & shows'), desc: tr('Never misses a show on the lounge TV (ideally with popcorn).') },
  fofoca: { id: 'fofoca', emoji: '🗣️', label: tr('Gossip'), desc: tr('Strikes up chats in the kitchen and knows everything going on in the rooms.') },
  vaidade: { id: 'vaidade', emoji: '💄', label: tr('Vanity'), desc: tr('Stops by the bathroom mirror to freshen up whenever possible.') },
  cafeina: { id: 'cafeina', emoji: '☕', label: tr('Caffeine'), desc: tr('Runs on coffee: the kitchen coffee maker is a second home.') },
  piadas: { id: 'piadas', emoji: '😂', label: tr('Jokes'), desc: tr('Cracks a joke in every chat and gets the group laughing.') },
  esporte: { id: 'esporte', emoji: '🏓', label: tr('Sports'), desc: tr('Plays ping-pong, stretches and cheers for soccer on TV.') },
  timidez: { id: 'timidez', emoji: '🙈', label: tr('Shyness'), desc: tr('Keeps to themselves: reads, looks out the window and joins fewer groups.') },
  economia: { id: 'economia', emoji: '💰', label: tr('Thrift'), desc: tr('Penny-pincher: bets small and sometimes dodges the bet.') },
  sonecas: { id: 'sonecas', emoji: '😴', label: tr('Naps'), desc: tr('Any couch or beanbag becomes a bed.') },
  calma: { id: 'calma', emoji: '🧘', label: tr('Calm'), desc: tr('Zen: stretches, the window and quiet chats.') },
  leitura: { id: 'leitura', emoji: '📚', label: tr('Reading'), desc: tr('Always has a book from the shelf (or a phone) in hand.') },
};

export function isTraitId(v: unknown): v is TraitId {
  return typeof v === 'string' && (TRAIT_IDS as readonly string[]).includes(v);
}

/** The two traits don't go together in the same person (TRAIT_CLASHES, in both directions). */
export function traitsClash(a: TraitId, b: TraitId): boolean {
  return TRAIT_CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
