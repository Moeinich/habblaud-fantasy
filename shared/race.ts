// Races of the camp (pure, no DOM or Node). Every project room belongs to one race, picked from the room seed
// (`RoomInfo.seed` = hash32(room id)), and the room is flavored for it: orc rooms are Horde (palisade logs, hide,
// iron, blood red), human rooms are Alliance (cut stone, half-timber, royal blue and gold) and elf rooms are
// night-elf groves (living moonwood, moss, silver and violet, moonlight teal), and undead rooms are Forsaken crypts
// (cold slate, iron, bone, sickly green and violet), whose people are skeletons. The agents of a room are drawn as
// that race and get a name in its style, so the room and its people always match.
import { hash32 } from './hash';

export type Race = 'human' | 'elf' | 'orc' | 'undead';

export const RACES: readonly Race[] = ['human', 'elf', 'orc', 'undead'];

/**
 * Number of room themes (client/src/art/theme.ts). Theme `i` belongs to `RACES[i % 4]`, so there are three themes
 * per race. Fixed seeds used by shared areas rely on this: the Great Hall floor uses seed 110 (110 % 12 = 2, orc).
 */
export const ROOM_THEME_COUNT = 12;

/** Theme index for a room seed (0..ROOM_THEME_COUNT-1). */
export function themeIndexOfSeed(seed: number): number {
  const n = ROOM_THEME_COUNT;
  return ((Math.floor(seed) % n) + n) % n;
}

/** Race of the room theme picked for `seed`. */
export function raceOfSeed(seed: number): Race {
  return RACES[themeIndexOfSeed(seed) % RACES.length];
}

/** Race of a room by its id (the server sets `RoomInfo.seed = hash32(id)`). */
export function raceOfRoom(roomId: string): Race {
  return raceOfSeed(hash32(roomId));
}
