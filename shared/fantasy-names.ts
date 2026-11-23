// Character names in the style of each race of the camp (shared/race.ts): guttural Horde names for orcs, medieval
// Alliance names for humans, flowing night-elf names for elves and gothic Forsaken names for the undead. All of them are original (no canon Warcraft
// characters), first names only, unique across every pool and without near-duplicates, so that each character in the
// office is unmistakable. Pure (no DOM or Node): the server names the real agents with it and the demo its fake ones.
import { hash32 } from './hash';
import type { Race } from './race';

export interface PersonName {
  name: string;
  look: 'f' | 'm';
}

const ORC_F = [
  'Ushka', 'Garra', 'Shazga', 'Morka', 'Zulra', 'Grukka', 'Drezza', 'Ragha', 'Kezra', 'Urgha',
  'Bolra', 'Sharra', 'Ishva', 'Grenka', 'Thazka', 'Vosha', 'Nazra', 'Yazhka', 'Durra', 'Brekka',
  'Ogsha', 'Zelsha', 'Hagra', 'Krosha', 'Lugza', 'Torva', 'Thrakka', 'Gashna', 'Ruzka', 'Dagga',
  'Frozka', 'Mazgra', 'Nelga', 'Zubka', 'Ulgra', 'Vekka', 'Shogra', 'Gulda', 'Tusha', 'Kolgra',
  'Bazha', 'Grizka', 'Rokka', 'Uzra', 'Jaggra', 'Mogha', 'Hedra', 'Askra', 'Zinra', 'Volka',
];
const ORC_M = [
  'Grashnak', 'Durgol', 'Kargul', 'Morgash', 'Brakkar', 'Zugdor', 'Thokrul', 'Gorvak', 'Urzok', 'Skarrek',
  'Vrogan', 'Harrak', 'Grulbash', 'Toktar', 'Mogrin', 'Rakhul', 'Zarguk', 'Bolgrim', 'Krasht', 'Ushnar',
  'Dragmor', 'Gharzul', 'Lokdar', 'Nokkul', 'Fendrak', 'Vazhrog', 'Grokhar', 'Murzag', 'Hurgath', 'Krugmar',
  'Zolgar', 'Ragdush', 'Snagrok', 'Throgdar', 'Hovash', 'Korzug', 'Druzhak', 'Barruk', 'Ozdrek', 'Shakmar',
  'Thrugg', 'Bregmok', 'Grimzak', 'Dakrul', 'Tuskmar', 'Jorzak', 'Kaldrog', 'Ugdash', 'Borkhan', 'Nazgut',
];
const HUMAN_F = [
  'Elsbeth', 'Maren', 'Rosalind', 'Gwendolyn', 'Isolde', 'Mirabel', 'Beatrix', 'Cordelia', 'Adela', 'Brenna',
  'Celestine', 'Dorothea', 'Edith', 'Fiona', 'Gisela', 'Hilda', 'Imogen', 'Josslyn', 'Kerensa', 'Lenora',
  'Matilda', 'Nerys', 'Odette', 'Philippa', 'Ottilie', 'Sabine', 'Tamsin', 'Ursula', 'Viviane', 'Winifred',
  'Aveline', 'Bridget', 'Clarice', 'Delphine', 'Felicity', 'Greta', 'Helewise', 'Annora', 'Juniper', 'Agnes',
  'Cecily', 'Elowen', 'Hester', 'Leda', 'Marigold', 'Petra', 'Sybil', 'Yvaine', 'Lorelei', 'Briony',
];
const HUMAN_M = [
  'Aldric', 'Bram', 'Edwyn', 'Gawain', 'Osric', 'Roderick', 'Cedric', 'Wystan', 'Halbert', 'Garrick',
  'Tobias', 'Leofric', 'Corwin', 'Rowan', 'Baldwin', 'Hadrian', 'Percival', 'Ansel', 'Thurston', 'Gareth',
  'Emeric', 'Fenwick', 'Hollis', 'Ambrose', 'Barnaby', 'Marlow', 'Norbert', 'Oswin', 'Quentin', 'Reginald',
  'Sigmund', 'Tristan', 'Wilmot', 'Willem', 'Bertram', 'Conrad', 'Desmond', 'Everard', 'Florian', 'Lionel',
  'Harlan', 'Ivo', 'Jasper', 'Leopold', 'Rupert', 'Nevin', 'Orrin', 'Piers', 'Randolf', 'Severin',
];
const ELF_F = [
  'Shalyra', 'Ellanore', 'Ilyssa', 'Naerith', 'Velanna', 'Amaranthe', 'Luneth', 'Aeris', 'Celynne', 'Daelira',
  'Eiriel', 'Faewyn', 'Ithriel', 'Kyraleth', 'Lysenne', 'Myrthil', 'Nyssara', 'Oriana', 'Periwyn', 'Amberlis',
  'Selendra', 'Taelyn', 'Thaenya', 'Xarissa', 'Ysmera', 'Zinvael', 'Alyndra', 'Briallen', 'Caelwen', 'Delenya',
  'Evanthe', 'Feyrith', 'Moriel', 'Ilsandre', 'Lithara', 'Keshali', 'Liraen', 'Sidrael', 'Nalythe', 'Naiwen',
  'Pyrael', 'Quillara', 'Rhosyn', 'Saelune', 'Thyriss', 'Ulyana', 'Vashira', 'Wenalyn', 'Ysindra', 'Zerith',
];
const ELF_M = [
  'Faelor', 'Ilyendris', 'Thalandor', 'Velanthar', 'Ilthalas', 'Elarion', 'Sorandir', 'Thoranis', 'Aldoran', 'Belathor',
  'Caeldris', 'Dorivan', 'Eranthis', 'Galathir', 'Calithor', 'Isoreth', 'Jorathil', 'Keldorin', 'Lorvanis', 'Mytharion',
  'Nyvaris', 'Orethal', 'Pharanel', 'Rhoveth', 'Saelthar', 'Ulmeris', 'Vandrel', 'Xylen', 'Ytheron', 'Zephiran',
  'Bryndor', 'Dalvenor', 'Elothir', 'Fenwyth', 'Gaelvar', 'Hyrandel', 'Iorvath', 'Kythel', 'Lathrien', 'Maelis',
  'Nethander', 'Oskaron', 'Pheladon', 'Quorath', 'Ravendil', 'Silvaran', 'Telvarin', 'Uthalor', 'Varethos', 'Wyndral',
];

/** Forsaken-style names for the undead: cold, gothic and a little mournful. */
const UNDEAD_F = [
  'Morwenna', 'Grira', 'Lethpera', 'Nocora', 'Cinsella', 'Ravmira', 'Ashilde', 'Dolria', 'Hesette', 'Lisessa',
  'Malturna', 'Osova', 'Quilice', 'Sevisse', 'Taldelle', 'Umbvine', 'Widenna', 'Zelpera', 'Belora', 'Coryne',
  'Ebonmira', 'Fenilde', 'Gloamria', 'Inkessa', 'Jesturna', 'Kesabel', 'Lornova', 'Myrith', 'Nellice', 'Oreisse',
  'Ruevine', 'Thornenna', 'Veyra', 'Wisppera', 'Mormira', 'Lethette', 'Nocessa', 'Ravova', 'Ashith', 'Dolice',
  'Lisdelle', 'Malvine', 'Osenna', 'Sevora', 'Talyne', 'Umbsella', 'Velmira', 'Widilde', 'Ysria', 'Belessa',
];
const UNDEAD_M = [
  'Gravix', 'Mordric', 'Voran', 'Calok', 'Duskulf', 'Ebonorn', 'Fellath', 'Gaunteth', 'Hollowel', 'Ichorius',
  'Jarlgrim', 'Kaelwick', 'Lurkard', 'Marrmund', 'Noxdred', 'Ostren', 'Pyreas', 'Quelius', 'Roton', 'Skelmor',
  'Tombix', 'Ulmorth', 'Vexan', 'Wraithen', 'Yorrulf', 'Zarorn', 'Bramath', 'Crypteth', 'Dravel', 'Ferrius',
  'Grimvald', 'Haskwick', 'Kassard', 'Lorcmund', 'Morbdred', 'Nevren', 'Pallas', 'Raskius', 'Sorron', 'Thanevar',
  'Varnix', 'Wendric', 'Gravorn', 'Voreth', 'Calel', 'Gauntard', 'Ichordred', 'Jarlren', 'Kaelas', 'Lurkius',
];

/** Interleaves the female and male lists, so that neighbors in a pool alternate the look. */
function interleave(f: readonly string[], m: readonly string[]): readonly PersonName[] {
  const out: PersonName[] = [];
  for (let i = 0; i < Math.max(f.length, m.length); i++) {
    if (f[i]) out.push({ name: f[i], look: 'f' });
    if (m[i]) out.push({ name: m[i], look: 'm' });
  }
  return Object.freeze(out);
}

export const FANTASY_NAME_POOLS: Readonly<Record<Race, readonly PersonName[]>> = Object.freeze({
  orc: interleave(ORC_F, ORC_M),
  human: interleave(HUMAN_F, HUMAN_M),
  elf: interleave(ELF_F, ELF_M),
  undead: interleave(UNDEAD_F, UNDEAD_M),
});

const ALL_NAMES = new Set(Object.values(FANTASY_NAME_POOLS).flatMap((pool) => pool.map((p) => p.name)));

/**
 * The name comes from one of the pools, alone or with the numeric suffix that pickFantasyName adds when a pool runs
 * out ("Aldric 2"). Used to tell names picked by an older Habblaud (from another pool) apart from fantasy ones.
 */
export function isFantasyName(name: string): boolean {
  return ALL_NAMES.has(name) || ALL_NAMES.has(name.replace(/ \d+$/, ''));
}

/**
 * Deterministic name for `id` in the style of `race`, avoiding the ones in `used` (only `has` is called, so a set
 * that folds case works). When the race's pool runs out, adds a numeric suffix ("Aldric 2").
 */
export function pickFantasyName(id: string, race: Race, used: ReadonlySet<string>): PersonName {
  const pool = FANTASY_NAME_POOLS[race] ?? FANTASY_NAME_POOLS.human;
  const n = pool.length;
  const start = hash32(id) % n;
  for (let i = 0; i < n; i++) {
    const cand = pool[(start + i) % n];
    if (!used.has(cand.name)) return cand;
  }
  const base = pool[start];
  for (let k = 2; ; k++) {
    const name = `${base.name} ${k}`;
    if (!used.has(name)) return { name, look: base.look };
  }
}
