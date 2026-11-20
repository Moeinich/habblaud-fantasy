// Personality traits of the office characters (client/src/world/social/persona.ts draws 2 or 3 per seed): the ids,
// the pairs that clash and the translated (tr) labels. Pure: no Node or DOM.
//
// The labels are nouns ("Competição", "Vaidade"): they do not depend on anyone's gender.
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
  /** Uma frase explicando o efeito no escritório (dica na interface). */
  desc: string;
}

/** Na ordem de TRAIT_IDS (um teste confere: o sorteio de personaFor depende dela). */
export const TRAITS: Readonly<Record<TraitId, Trait>> = {
  competicao: { id: 'competicao', emoji: '🏆', label: tr('Competição'), desc: tr('Adora competir: desafia os colegas no ping-pong, no videogame e no jokenpô.') },
  apostas: { id: 'apostas', emoji: '🎲', label: tr('Apostas'), desc: tr('Topa qualquer aposta e aposta alto no jokenpô.') },
  games: { id: 'games', emoji: '🎮', label: tr('Games'), desc: tr('Vive no videogame do lounge e nos fliperamas — e costuma ganhar.') },
  series: { id: 'series', emoji: '📺', label: tr('Séries e TV'), desc: tr('Não perde um programa na TV do lounge (de preferência com pipoca).') },
  fofoca: { id: 'fofoca', emoji: '🗣️', label: tr('Fofoca'), desc: tr('Puxa papo na copa e sabe de tudo o que acontece nas salas.') },
  vaidade: { id: 'vaidade', emoji: '💄', label: tr('Vaidade'), desc: tr('Passa no espelho do banheiro para se arrumar sempre que pode.') },
  cafeina: { id: 'cafeina', emoji: '☕', label: tr('Cafeína'), desc: tr('Movido a café: a cafeteira da copa é a segunda casa.') },
  piadas: { id: 'piadas', emoji: '😂', label: tr('Piadas'), desc: tr('Conta piada em toda conversa e faz a roda rir.') },
  esporte: { id: 'esporte', emoji: '🏓', label: tr('Esporte'), desc: tr('Joga ping-pong, se alonga e vibra com o futebol na TV.') },
  timidez: { id: 'timidez', emoji: '🙈', label: tr('Timidez'), desc: tr('Prefere ficar na sua: lê, olha a janela e entra menos nas rodas.') },
  economia: { id: 'economia', emoji: '💰', label: tr('Economia'), desc: tr('Pão-duro: aposta pouco e às vezes foge da aposta.') },
  sonecas: { id: 'sonecas', emoji: '😴', label: tr('Sonecas'), desc: tr('Qualquer sofá ou puff vira cama.') },
  calma: { id: 'calma', emoji: '🧘', label: tr('Calma'), desc: tr('Zen: alongamentos, janela e conversas tranquilas.') },
  leitura: { id: 'leitura', emoji: '📚', label: tr('Leitura'), desc: tr('Sempre com um livro da estante (ou o celular) na mão.') },
};

export function isTraitId(v: unknown): v is TraitId {
  return typeof v === 'string' && (TRAIT_IDS as readonly string[]).includes(v);
}

/** Os dois traços não combinam na mesma pessoa (TRAIT_CLASHES, nos dois sentidos). */
export function traitsClash(a: TraitId, b: TraitId): boolean {
  return TRAIT_CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
