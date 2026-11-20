// Temas de sala (puros): paletas de acampamento rústico, bem distintas. Sementes consecutivas (slots vizinhos)
// recebem temas diferentes; a ordem da lista alterna famílias de cor de propósito.
import type { RoomTheme } from './api';

const THEMES: readonly RoomTheme[] = [
  // Acampamento: palha, terra batida, lajes e peles; paredes de paliçada, tábuas e pedra.
  { carpet: '#b89a62', carpet2: '#a98c56', wall: { base: '#8a6239', trim: '#4e3420', pattern: 'wood_panel' }, accent: '#9c2f25', deskVariant: 'wood', chairVariant: 'red' },
  { carpet: '#8f7a5c', carpet2: '#836f52', wall: { base: '#9c968a', trim: '#5c574e', pattern: 'brick' }, accent: '#d48a2c', deskVariant: 'dark', chairVariant: 'black' },
  { carpet: '#7c8a5a', carpet2: '#707e50', wall: { base: '#7a5a38', trim: '#3f2a18', pattern: 'wood_panel' }, accent: '#5f8a3a', deskVariant: 'wood', chairVariant: 'green' },
  { carpet: '#9a8f80', carpet2: '#8e8374', wall: { base: '#a39d90', trim: '#625c52', pattern: 'tiles' }, accent: '#6a4a8a', deskVariant: 'dark', chairVariant: 'gray' },
  { carpet: '#a8825a', carpet2: '#9c774f', wall: { base: '#8f6a44', trim: '#4e3420', pattern: 'stripes' }, accent: '#b8572c', deskVariant: 'wood', chairVariant: 'red' },
  { carpet: '#8a9a88', carpet2: '#7e8e7c', wall: { base: '#94968c', trim: '#545a50', pattern: 'brick' }, accent: '#2f7a78', deskVariant: 'white', chairVariant: 'green' },
  { carpet: '#6e6458', carpet2: '#645a4e', wall: { base: '#6e5a44', trim: '#33251a', pattern: 'wood_panel' }, accent: '#e0b23c', deskVariant: 'dark', chairVariant: 'black' },
  { carpet: '#b0956e', carpet2: '#a48963', wall: { base: '#a39a86', trim: '#665e4c', pattern: 'plain' }, accent: '#9c2f25', deskVariant: 'white', chairVariant: 'black' },
  { carpet: '#94a07a', carpet2: '#88946e', wall: { base: '#866544', trim: '#46301d', pattern: 'stripes' }, accent: '#2f7a78', deskVariant: 'wood', chairVariant: 'blue' },
  { carpet: '#9a8266', carpet2: '#8e775b', wall: { base: '#8c8678', trim: '#4e4a40', pattern: 'brick' }, accent: '#d48a2c', deskVariant: 'dark', chairVariant: 'gray' },
];

export const THEME_COUNT = THEMES.length;

export function roomTheme(seed: number): RoomTheme {
  const n = THEMES.length;
  const t = THEMES[((Math.floor(seed) % n) + n) % n];
  return { ...t, wall: { ...t.wall } };
}
