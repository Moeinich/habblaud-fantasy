// Room themes (pure): every project room belongs to one race (shared/race.ts), and theme `i` belongs to
// `RACES[i % 4]` — 0 human, 1 elf, 2 orc, 3 undead, 4 human, ... — so there are three themes per race and
// consecutive seeds always land on different races. Neighbouring entries never share carpet or accent.
// - Human (Alliance): cut stone, whitewashed plaster with oak beams, blue/gold trim, `wood`/`white` desks,
//   `blue`/`gray` chairs, royal-blue carpets.
// - Elf (night-elf grove): living moonwood, mossy moonstone, silver crescents, `moonwood` desks, `violet`/`teal`
//   chairs, violet/plum carpets.
// - Orc (Horde): spiked palisade logs, dark rough stone, red bands, `dark` desks, `red`/`black`/`green` chairs,
//   warm hide carpets.
// - Undead (Forsaken crypt): cold slate and grave stone, iron, bone, grave violet and pumpkin orange, `dark` desks,
//   `black` chairs, purple carpets, dressed for Halloween all year (render/seasonal.ts areaTheme). Their furniture is the Horde's (the Forsaken are Horde).
// Carpet colours double as rug colours, which is how surfaces/rug.ts picks a look: cool blue = heraldic runner
// (human), violet/plum = leaf-woven moon runner (elf), warm = hide rug (orc);
// undead rooms force a grave-cloth crypt runner (RugPatch.style).
import { RACES, ROOM_THEME_COUNT, themeIndexOfSeed, type Race } from '../../../shared/race';
import type { RoomTheme } from './api';

/** Faction of a room's furniture and surfaces: one per race. */
export type Faction = 'horde' | 'alliance' | 'elf';

const FACTION_OF_RACE: Readonly<Record<Race, Faction>> = { human: 'alliance', elf: 'elf', orc: 'horde', undead: 'horde' };

const THEMES: readonly RoomTheme[] = [
  // 0 Human: whitewashed half-timber, royal blue runner.
  { carpet: '#3d5a8c', carpet2: '#34507e', wall: { base: '#e2d6ba', trim: '#2f4f9c', pattern: 'stripes' }, accent: '#3d63b8', deskVariant: 'wood', chairVariant: 'blue' },
  // 1 Elf: living moonwood trunks with vines and a silver crescent band, violet runner, teal moonlight.
  { carpet: '#74407e', carpet2: '#683a72', wall: { base: '#4e3a52', trim: '#2c2236', pattern: 'grove' }, accent: '#4fc8c0', deskVariant: 'moonwood', chairVariant: 'violet' },
  // 2 Orc: palisade logs with red bands (also the Great Hall floor, seed 110 → 110 % 12 = 2).
  { carpet: '#9c4a30', carpet2: '#8a3f28', wall: { base: '#6e4a2c', trim: '#3a2416', pattern: 'wood_panel' }, accent: '#b8402e', deskVariant: 'dark', chairVariant: 'red' },
  // 3 Undead: cold slate blocks with a grave-violet trim, purple crypt runner, pumpkin-orange accent.
  { carpet: '#3e2650', carpet2: '#36204a', wall: { base: '#3e3848', trim: '#7a4ab0', pattern: 'brick' }, accent: '#e07a2a', deskVariant: 'dark', chairVariant: 'black' },
  // 4 Human: dressed grey stone with a blue/gold frieze.
  { carpet: '#56688c', carpet2: '#4c5e80', wall: { base: '#a8a294', trim: '#2f4f9c', pattern: 'tiles' }, accent: '#e0b23c', deskVariant: 'white', chairVariant: 'gray' },
  // 5 Elf: mossy carved moonstone with moon glyphs, plum runner, lavender accent.
  { carpet: '#643a6a', carpet2: '#58345e', wall: { base: '#7a7088', trim: '#3a3046', pattern: 'moonstone' }, accent: '#b48ae0', deskVariant: 'moonwood', chairVariant: 'teal' },
  // 6 Orc: dark rough stone, hide rug.
  { carpet: '#a8825a', carpet2: '#9a754e', wall: { base: '#6a625a', trim: '#3a3a40', pattern: 'brick' }, accent: '#d4782c', deskVariant: 'dark', chairVariant: 'black' },
  // 7 Undead: dressed grave stone with a pumpkin-orange frieze, plum-black runner, violet accent.
  { carpet: '#4a2c5a', carpet2: '#40264e', wall: { base: '#4e4658', trim: '#c8641e', pattern: 'tiles' }, accent: '#b07ae0', deskVariant: 'dark', chairVariant: 'black' },
  // 8 Human: plain plaster, oak trim, deep royal blue.
  { carpet: '#2f4f9c', carpet2: '#29468c', wall: { base: '#ddd0b0', trim: '#8a6239', pattern: 'plain' }, accent: '#5a82d0', deskVariant: 'wood', chairVariant: 'blue' },
  // 9 Elf: paler silver-barked grove, wine-plum runner, teal chairs, moss-green accent.
  { carpet: '#6a3a5e', carpet2: '#5e3454', wall: { base: '#86788a', trim: '#3a2c40', pattern: 'grove' }, accent: '#7ad0a0', deskVariant: 'moonwood', chairVariant: 'teal' },
  // 10 Orc: palisade with blood-red lashing, fel-green accent.
  { carpet: '#8a3a2c', carpet2: '#7a3226', wall: { base: '#7a5a38', trim: '#9c2f25', pattern: 'wood_panel' }, accent: '#6fa03a', deskVariant: 'dark', chairVariant: 'green' },
  // 11 Undead: soot-dark plaster with violet trim, dusk-purple runner, candle-yellow accent.
  { carpet: '#34223e', carpet2: '#2e1e38', wall: { base: '#2e2a36', trim: '#9a6ad0', pattern: 'plain' }, accent: '#ffc04a', deskVariant: 'dark', chairVariant: 'black' },
];

if (THEMES.length !== ROOM_THEME_COUNT) throw new Error('theme.ts: THEMES must have ROOM_THEME_COUNT entries');

export const THEME_COUNT = THEMES.length;

export function roomTheme(seed: number): RoomTheme {
  const t = THEMES[themeIndexOfSeed(seed)];
  return { ...t, wall: { ...t.wall } };
}

/** Race of the theme picked for `seed` (theme `i` = `RACES[i % 4]`). */
export function themeRace(seed: number): Race {
  return RACES[themeIndexOfSeed(seed) % RACES.length];
}

/** Faction (furniture/surface flavour) of the theme picked for `seed`. */
export function themeFaction(seed: number): Faction {
  return FACTION_OF_RACE[themeRace(seed)];
}
