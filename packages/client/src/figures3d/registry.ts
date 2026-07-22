// Karten-id → Modell-Rig. Jede Kreatur-Karte und jeder Token wird hier einem
// Archetyp-Bauer + Konfiguration zugeordnet. Unbekannte ids fallen auf den
// farb-gehashten Golem zurück.

import { type Rig } from './core';
import { buildHumanoid } from './humanoids';
import { buildStructure } from './structures';
import { buildQuadruped } from './mammals';
import { buildBird } from './birds';
import { buildLizard, buildSnake, buildTurtle, buildCrocodile } from './reptiles';
import { buildDinoBiped, buildDinoQuadruped } from './dinos';
import { buildGolem } from './golem';

type Builder = () => Rig;

const REGISTRY: Record<string, Builder> = {
  // ---------------------------------------------------------------- humans
  rekrut: () => buildHumanoid({ skin: 0xe8b98a, cloth: 0x6b7a8f, accent: 0x8a6a45, headgear: 'kettle', props: ['sword'] }),
  schildwache: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x4a6a9a, accent: 0x3b82f6, headgear: 'kettle', props: ['sword'], leftProps: ['shield'] }),
  feldscherin: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0xe8e2d4, accent: 0xc94f4f, hair: 0x6a4a2a, props: ['staff'], attack: 'stand' }),
  bannertraeger: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x8f5a3a, accent: 0xd6a23e, hair: 0x3a2b1c, props: ['banner'], attack: 'bannerWave' }),
  ritter: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x9aa7b8, accent: 0x6a7686, build: 'bulky', headgear: 'greathelm', props: ['sword'], leftProps: ['shield'] }),
  kommandantin: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x35507a, accent: 0xd6a23e, headgear: 'plume', cape: 0x7c2d3e, props: ['sword'], attack: 'thrust' }),

  // ----------------------------------------------------------------- sozis
  flugblatt_verteiler: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0xb23b3b, accent: 0xe8e8e8, hair: 0x2a1a12, props: ['flyer'] }),
  streikposten: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x8f2f2f, accent: 0xd6a23e, headgear: 'beanie', props: ['fist'] }),
  solidaritaetskasse: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0xb23b3b, accent: 0xd6a23e, hair: 0x3a2b1c, props: ['moneybag'] }),
  basisdemokratie: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0xa33636, accent: 0xe8e8e8, crowd: 3, props: ['ballot'], attack: 'stand' }),
  gewerkschaftssekretaerin: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0xb23b3b, accent: 0x2a2a2a, hair: 0x5a3a24, props: ['megaphone'], attack: 'megaphone' }),
  generalstreik: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x8f2f2f, accent: 0xd6a23e, crowd: 3, props: ['fist'], attack: 'stand' }),
  die_massen: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0xb23b3b, accent: 0xd6a23e, build: 'bulky', crowd: 3, props: ['fist'] }),

  // -------------------------------------------------------------- arbeiter
  lehrling: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0xc98a3b, accent: 0x6a6f78, headgear: 'hardhat', props: ['wrench'] }),
  fliessbandarbeiter: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0xb5762a, accent: 0x4a4f58, headgear: 'hardhat', props: ['wrench'] }),
  werkzeugkiste: () => buildStructure({ kind: 'toolbox', main: 0xc98a3b, accent: 0x4a4f58 }),
  schichtwechsel: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0xc98a3b, accent: 0x6a6f78, headgear: 'hardhat', props: ['wrench'] }),
  vorarbeiter: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0xb5762a, accent: 0xd6a23e, build: 'bulky', headgear: 'hardhat', props: ['banner'], attack: 'bannerWave' }),
  kranfuehrer: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0xc98a3b, accent: 0x6a6f78, headgear: 'hardhat', props: ['craneHook'], attack: 'stand' }),
  betriebsrat: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x8a6a3a, accent: 0x4a4f58, crowd: 2, props: ['clipboard'], attack: 'stand' }),
  stahlgiesser: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0xb5762a, accent: 0xff8a2c, build: 'bulky', headgear: 'hardhat', props: ['ladle'] }),

  // ------------------------------------------------------------ obdachlose
  streuner: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x7a6f5d, accent: 0x5a4a35, build: 'hunched', headgear: 'beanie', hair: 0x3a2b1c, beard: true, props: ['can'] }),
  pfandsammler: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x6a7a5d, accent: 0x5a4a35, build: 'hunched', headgear: 'beanie', hair: 0x3a2b1c, beard: true, props: ['bottleBag'] }),
  der_alte_hund: () =>
    buildQuadruped({ kind: 'dog', fur: 0x8a7a5a, belly: 0xc6b89a, scale: 0.82, tail: 'bushy' }),
  improvisiertes_lager: () => buildStructure({ kind: 'tent', main: 0x8a6a45, accent: 0x9a5a3a, glow: 0xff6a1c }),
  schrottsammlerin: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x7a6f5d, accent: 0x4a5a6a, build: 'hunched', headgear: 'cap', hair: 0x5a3a24, props: ['torch'] }),
  suppenkueche: () => buildStructure({ kind: 'soupStand', main: 0x9a5a3a, accent: 0x8a8f6a, glow: 0xffd9a0 }),
  ueberlebenskuenstler: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x6a5d4a, accent: 0x8a4a2a, build: 'hunched', headgear: 'hood', beard: true, props: ['torch'] }),
  meute_der_vergessenen: () =>
    buildQuadruped({ kind: 'dog', fur: 0x5a5040, belly: 0x8a7f6a, scale: 0.82, tail: 'bushy', pack: 3 }),

  // -------------------------------------------------------------- studenten
  erstsemester: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x6a5acd, accent: 0xe8e8e8, build: 'slim', hair: 0x3a2b1c, props: ['book', 'backpack'], attack: 'stand' }),
  nachhilfe: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x5a4aad, accent: 0xe8e8e8, build: 'slim', hair: 0x2a1a12, props: ['book'], attack: 'stand' }),
  koffein_junkie: () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x6a5acd, accent: 0xb5462f, build: 'slim', headgear: 'beanie', props: ['coffee'] }),
  gruppenarbeit: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x6a5acd, accent: 0xe8e8e8, build: 'slim', crowd: 3, props: ['book'], attack: 'stand' }),
  experimentelle_formel: () => buildStructure({ kind: 'lab', main: 0x6a6f78, accent: 0x8a7fcd, glow: 0x8affa0 }),
  bibliothekar: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x4a3a8a, accent: 0xd6a23e, hair: 0x8a8a8a, beard: true, props: ['book'], attack: 'bookThrow' }),
  doktorandin: () =>
    buildHumanoid({ skin: 0xd9a06e, cloth: 0x5a4aad, accent: 0x1a1a2a, build: 'slim', headgear: 'cap', hair: 0x2a1a12, props: ['book'], attack: 'stand' }),
  die_fakultaet: () => buildStructure({ kind: 'building', main: 0x8a7fcd, accent: 0xe8e2d4 }),

  // --------------------------------------------------------------- animals
  ratte: () => buildQuadruped({ kind: 'rodent', fur: 0x8d7b6a, belly: 0xb5a694, scale: 0.5, tail: 'thin', whiskers: true }),
  wolf: () => buildQuadruped({ kind: 'dog', fur: 0x8b8f98, belly: 0xc6c9cf, scale: 0.85, tail: 'bushy' }),
  schlange: () => buildSnake({ skin: 0x4e9d4e, dark: 0x2f6d38 }),
  adler: () =>
    buildBird({ body: 0x6a4a2a, belly: 0xe8dcc0, beak: 0xf0a832, size: 1.0, beakShape: 'hook', wingSpan: 0.72 }),
  baer: () => buildQuadruped({ kind: 'bear', fur: 0x6e4f33, belly: 0x9a7a55, scale: 1.25, tail: 'stub' }),
  alphawolf: () =>
    buildQuadruped({ kind: 'dog', fur: 0x3d4048, belly: 0x6a6e78, scale: 1.0, tail: 'bushy', eyes: 0xff3b30, mane: true, attack: 'roar' }),

  // ---------------------------------------------------------------- katzen
  streunerkatze: () => buildQuadruped({ kind: 'cat', fur: 0x9a9a9a, belly: 0xd8d8d8, scale: 0.55, tail: 'long', whiskers: true }),
  getigerter: () => buildQuadruped({ kind: 'cat', fur: 0xc98a3b, belly: 0xe8cba0, scale: 0.6, tail: 'long', whiskers: true }),
  hauskater: () => buildQuadruped({ kind: 'cat', fur: 0x6e6e78, belly: 0xb0b0bc, scale: 0.6, tail: 'long', whiskers: true }),
  schwarze_katze: () => buildQuadruped({ kind: 'cat', fur: 0x24242c, belly: 0x3a3a44, scale: 0.6, tail: 'long', whiskers: true, eyes: 0x8aff8a }),
  katzenmutter: () => buildQuadruped({ kind: 'cat', fur: 0xb98a5a, belly: 0xe0c69a, scale: 0.68, tail: 'long', whiskers: true }),
  luchs: () =>
    buildQuadruped({ kind: 'cat', fur: 0xb08a5a, belly: 0xe8dcc0, scale: 0.85, tail: 'stub', whiskers: true, tufts: true, attack: 'pounce' }),
  wildkatze: () => buildQuadruped({ kind: 'cat', fur: 0x8a6a3a, belly: 0xc9a870, scale: 0.8, tail: 'long', whiskers: true }),
  der_puma: () => buildQuadruped({ kind: 'cat', fur: 0xc9a06a, belly: 0xe8d4a8, scale: 0.95, tail: 'long', whiskers: true, eyes: 0xffd23e, attack: 'pounce' }),

  // ----------------------------------------------------------------- voegel
  spatz: () => buildBird({ body: 0x8a6a4a, belly: 0xd9c9a8, size: 0.6, beakShape: 'small' }),
  kraehe: () => buildBird({ body: 0x1e1e28, belly: 0x2a2a34, beak: 0x33333f, size: 0.85, beakShape: 'straight' }),
  moewe: () => buildBird({ body: 0xe8e8ee, belly: 0xffffff, beak: 0xf0a832, size: 0.9, beakShape: 'straight', wingSpan: 0.8 }),
  taubenschwarm: () => buildBird({ body: 0x8a94a8, belly: 0xc6ccd8, size: 0.8, beakShape: 'small', flock: 2 }),
  eule: () => buildBird({ body: 0x8a6a4a, belly: 0xd9c9a8, size: 0.9, beakShape: 'hook', owl: true, eyes: 0xffb400 }),
  falke: () => buildBird({ body: 0x7a5a3a, belly: 0xe8dcc0, beak: 0xf0c040, size: 0.95, beakShape: 'hook', wingSpan: 0.75 }),
  adler_voegel: () => buildBird({ body: 0x5a3a24, belly: 0xf2ede0, beak: 0xf0a832, size: 1.05, beakShape: 'hook', wingSpan: 0.82 }),
  der_schwarm: () => buildBird({ body: 0x5a6472, belly: 0x8a94a0, size: 0.85, beakShape: 'small', flock: 3 }),

  // -------------------------------------------------------------- reptilien
  eidechse: () => buildLizard({ skin: 0x5a9c4a, belly: 0x9ac67a, scale: 0.6 }),
  gecko: () => buildLizard({ skin: 0x7ac06a, belly: 0xd9e8b0, scale: 0.55 }),
  klapperschlange: () => buildSnake({ skin: 0xb08a4a, dark: 0x7a5a2a, rattle: true }),
  schildkroete: () => buildTurtle(),
  koenig_der_kobras: () => buildSnake({ skin: 0x4a9c5a, dark: 0x2a6a3a, hood: true }),
  waran: () => buildLizard({ skin: 0x6a6a4a, belly: 0x9a9a6a, scale: 0.9, frill: true }),
  krokodil: () => buildCrocodile(),
  uralte_schlange: () => buildSnake({ skin: 0x3a7a4a, dark: 0x24502e, big: true }),

  // ----------------------------------------------------------------- dinos
  compsognathus: () => buildDinoBiped({ skin: 0x8a9a4a, belly: 0xc9c98a, scale: 0.5 }),
  velociraptor: () => buildDinoBiped({ skin: 0x9a7a4a, belly: 0xd9c9a8, scale: 0.72 }),
  triceratops: () => buildDinoQuadruped({ kind: 'frill', skin: 0x6a8a5a, belly: 0x9ab07a, scale: 0.95 }),
  stegosaurus: () => buildDinoQuadruped({ kind: 'plates', skin: 0x5a7a5a, belly: 0x8a6a3a, scale: 0.95 }),
  pteranodon: () => buildBird({ body: 0x8a6a4a, belly: 0xc9a980, size: 1.0, beakShape: 'long', wingSpan: 0.95, pterosaur: true, crest: 0xc0503a }),
  spinosaurus: () => buildDinoBiped({ skin: 0x5a6a8a, belly: 0x8a9ab0, scale: 1.0, sail: true }),
  tyrannosaurus_rex: () => buildDinoBiped({ skin: 0x6a5a3a, belly: 0x9a8a5a, scale: 1.15, attack: 'roar' }),
  brachiosaurus: () => buildDinoQuadruped({ kind: 'longneck', skin: 0x7a8a5a, belly: 0xa0b080, scale: 1.05 }),

  // ----------------------------------------------------------------- token
  'token:Kätzchen': () => buildQuadruped({ kind: 'cat', fur: 0xc9a06a, belly: 0xe8d4a8, scale: 0.4, tail: 'long', whiskers: true }),
  'token:Taube': () => buildBird({ body: 0x8a94a8, belly: 0xc6ccd8, size: 0.5, beakShape: 'small' }),
  'token:Rekrut-Token': () =>
    buildHumanoid({ skin: 0xe8b98a, cloth: 0x6b7a8f, accent: 0x8a6a45, headgear: 'kettle', props: ['sword'], scale: 0.85 }),
  'token:Fund-Token': () => buildStructure({ kind: 'crate', main: 0x8a6a45, accent: 0x5a4a35, glow: 0xffd766 })
};

export function buildRig(cardId: string): Rig {
  const make = REGISTRY[cardId];
  if (make) return make();
  return buildGolem(cardId);
}
