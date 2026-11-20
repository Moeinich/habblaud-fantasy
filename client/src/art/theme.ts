// Room themes (pure): each project room belongs to a faction. Even entries are Alliance (cut stone, whitewashed
// plaster with oak beams, blue/gold trim, `wood`/`white` desks, `blue`/`gray` chairs); odd entries are Horde
// (spiked palisade logs, dark rough stone, red bands, `dark` desks, `red`/`black`/`green` chairs). Consecutive
// seeds therefore always land on different factions, and neighbouring entries never share carpet or accent.
// Carpet colours double as rug colours: Horde carpets are warm (hide/rust) and Alliance ones cool (royal blue),
// which is how surfaces/rug.ts picks a hide rug vs. a heraldic runner.
import type { RoomTheme } from './api';

export type Faction = 'horde' | 'alliance';

const THEMES: readonly RoomTheme[] = [
  // 0 Alliance: whitewashed half-timber, royal blue runner.
  { carpet: '#3d5a8c', carpet2: '#34507e', wall: { base: '#e2d6ba', trim: '#2f4f9c', pattern: 'stripes' }, accent: '#3d63b8', deskVariant: 'wood', chairVariant: 'blue' },
  // 1 Horde: palisade logs with red bands (also the faction of the Great Hall floor, seed 101).
  { carpet: '#9c4a30', carpet2: '#8a3f28', wall: { base: '#6e4a2c', trim: '#3a2416', pattern: 'wood_panel' }, accent: '#b8402e', deskVariant: 'dark', chairVariant: 'red' },
  // 2 Alliance: dressed grey stone with a blue/gold frieze.
  { carpet: '#56688c', carpet2: '#4c5e80', wall: { base: '#a8a294', trim: '#2f4f9c', pattern: 'tiles' }, accent: '#e0b23c', deskVariant: 'white', chairVariant: 'gray' },
  // 3 Horde: dark rough stone, hide rug.
  { carpet: '#a8825a', carpet2: '#9a754e', wall: { base: '#6a625a', trim: '#3a3a40', pattern: 'brick' }, accent: '#d4782c', deskVariant: 'dark', chairVariant: 'black' },
  // 4 Alliance: plain plaster, oak trim.
  { carpet: '#2f4f9c', carpet2: '#29468c', wall: { base: '#ddd0b0', trim: '#8a6239', pattern: 'plain' }, accent: '#5a82d0', deskVariant: 'wood', chairVariant: 'blue' },
  // 5 Horde: palisade with blood-red lashing, fel-green accent.
  { carpet: '#8a3a2c', carpet2: '#7a3226', wall: { base: '#7a5a38', trim: '#9c2f25', pattern: 'wood_panel' }, accent: '#6fa03a', deskVariant: 'dark', chairVariant: 'green' },
  // 6 Alliance: grey stone, teal-blue runner.
  { carpet: '#46667c', carpet2: '#3e5c70', wall: { base: '#9c968a', trim: '#2f4f9c', pattern: 'tiles' }, accent: '#d4a838', deskVariant: 'white', chairVariant: 'blue' },
  // 7 Horde: dark stone, red trim, tan hide.
  { carpet: '#b08a5a', carpet2: '#a07c50', wall: { base: '#5e5850', trim: '#9c2f25', pattern: 'brick' }, accent: '#9c2f25', deskVariant: 'dark', chairVariant: 'red' },
  // 8 Alliance: half-timber with dark oak, slate-blue runner.
  { carpet: '#62719c', carpet2: '#58678e', wall: { base: '#e6dcc4', trim: '#5a4028', pattern: 'stripes' }, accent: '#2f7a9c', deskVariant: 'wood', chairVariant: 'gray' },
  // 9 Horde: blackened palisade, brown hide, bone accent.
  { carpet: '#7a4a34', carpet2: '#6c412e', wall: { base: '#5e4028', trim: '#2a1c12', pattern: 'wood_panel' }, accent: '#c9a45a', deskVariant: 'dark', chairVariant: 'black' },
];

export const THEME_COUNT = THEMES.length;

function index(seed: number): number {
  const n = THEMES.length;
  return ((Math.floor(seed) % n) + n) % n;
}

export function roomTheme(seed: number): RoomTheme {
  const t = THEMES[index(seed)];
  return { ...t, wall: { ...t.wall } };
}

/** Faction of the theme picked for `seed` (odd entries = Horde, even = Alliance). */
export function themeFaction(seed: number): Faction {
  return index(seed) % 2 === 1 ? 'horde' : 'alliance';
}
