// Autorenwerkzeug: erzeugt die gemeinsamen Grundgerueste und kleinen Varianten
// fuer die noch fehlenden Kreaturen der sechs Startdecks.
//
// Vorhandene, bereits abgenommene Figuren liefern die Morphologie der Basen.
// Die Quelldateien bleiben unangetastet. Ein neues Insektenmodell wird zuerst
// ueber die Figuren-Werkstatt als buff_shroom.json gebaut und danach ebenfalls
// in eine Base plus kleine Variante ueberfuehrt.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const DATA = join(ROOT, 'packages', 'engine', 'src', 'data');
const FIGURES = join(DATA, 'figures');
const BASES = join(DATA, 'figure-bases');
const PROFILES = join(DATA, 'animation-profiles');

const write = process.argv.includes('--write');
const includeInsect = process.argv.includes('--include-insect');
const unknown = process.argv.slice(2).filter((arg) => !['--write', '--include-insect'].includes(arg));
if (unknown.length > 0) throw new Error(`Unbekannte Option: ${unknown.join(', ')}`);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readExistingVariant = (cardId) => {
  const source = readJson(join(FIGURES, `${cardId}.json`));
  if (!source.baseId) return undefined;
  const { cardId: _cardId, ...variant } = source;
  return variant;
};
const saveJson = (path, value) => {
  if (write) writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`${write ? 'geschrieben' : 'geplant'}: ${path}`);
};

const bases = [
  {
    baseId: 'bird',
    sourceId: 'adler',
    attachments: {
      head: 'kopf', leftHand: 'fluegelL', rightHand: 'fluegelR',
      back: 'rumpf', weapon: 'schnabelOben', mount: 'root'
    }
  },
  {
    baseId: 'canid',
    sourceId: 'wolf',
    attachments: {
      head: 'head', leftHand: 'legFL', rightHand: 'legFR',
      back: 'body', weapon: 'jawLower', mount: 'root'
    }
  },
  {
    baseId: 'felid',
    sourceId: 'luchs',
    attachments: {
      head: 'kopf', leftHand: 'vorderbeinL', rightHand: 'vorderbeinR',
      back: 'torso', weapon: 'kiefer', mount: 'root'
    }
  },
  {
    baseId: 'snake',
    sourceId: 'schlange',
    attachments: {
      head: 'kopf', leftHand: 'koerper', rightHand: 'koerper',
      back: 'rumpfMitte', weapon: 'kiefer', mount: 'root'
    }
  },
  {
    baseId: 'mammal-quadruped',
    sourceId: 'ratte',
    attachments: {
      head: 'kopf', leftHand: 'beinVL', rightHand: 'beinVR',
      back: 'rumpf', weapon: 'kiefer', mount: 'root'
    }
  },
  {
    baseId: 'heavy-quadruped',
    sourceId: 'triceratops',
    attachments: {
      head: 'headRig', leftHand: 'foreLegL', rightHand: 'foreLegR',
      back: 'torsoRig', weapon: 'noseHorn', mount: 'root'
    }
  },
  {
    baseId: 'nut',
    sourceId: 'wall_nut',
    attachments: {
      head: 'head', leftHand: 'handL', rightHand: 'handR',
      back: 'back', weapon: 'weapon', mount: 'mount'
    }
  }
];

if (includeInsect) {
  bases.push({
    baseId: 'insect',
    sourceId: 'buff_shroom',
    attachments: {
      head: 'kopf', leftHand: 'beinVornL', rightHand: 'beinVornR',
      back: 'thorax', weapon: 'stachel', mount: 'root'
    }
  });
}

for (const spec of bases) {
  const sourcePath = join(FIGURES, `${spec.sourceId}.json`);
  if (!existsSync(sourcePath)) throw new Error(`Quellfigur fehlt: ${sourcePath}`);
  const source = readJson(sourcePath);
  const profileId = spec.baseId;
  const existingBasePath = join(BASES, `${spec.baseId}.json`);
  const existingProfilePath = join(PROFILES, `${profileId}.json`);
  const visual = source.visual ?? (existsSync(existingBasePath) ? readJson(existingBasePath).visual : undefined);
  const animations = source.animations ?? (
    existsSync(existingProfilePath) ? readJson(existingProfilePath).animations : undefined
  );
  if (!visual) throw new Error(`${spec.sourceId}: vollständige visual-Daten und bestehende Base fehlen.`);
  saveJson(join(BASES, `${spec.baseId}.json`), {
    baseId: spec.baseId,
    rigId: spec.baseId,
    attachments: spec.attachments,
    visual,
    ...(animations ? { animationProfileId: profileId } : {})
  });
  if (animations) {
    saveJson(join(PROFILES, `${profileId}.json`), {
      profileId,
      animations
    });
  }
}

const humanPalette = {
  hearty: {
    uniform: '#596b78', uniformDark: '#303a43', uniformLight: '#8ca0ac',
    cloth: '#26323b', accent: '#e05a47'
  },
  brainy: {
    uniform: '#5b4b7d', uniformDark: '#332a48', uniformLight: '#9382b8',
    cloth: '#262238', accent: '#65d3d1'
  },
  beastly: {
    uniform: '#8b552f', uniformDark: '#4b2f22', uniformLight: '#c47a3c',
    cloth: '#292521', accent: '#f2c14e'
  },
  sneaky: {
    uniform: '#344b4b', uniformDark: '#182828', uniformLight: '#617b72',
    cloth: '#151d22', accent: '#52d6c5'
  }
};

const nutShellParts = [
  'lobeL', 'lobeR', 'bottomLobeL', 'bottomLobeR', 'crownL', 'crownR',
  'seamMain', 'seamTop', 'seamBottom',
  'grooveL1', 'grooveL2', 'grooveL3', 'grooveL4', 'grooveL5',
  'grooveR1', 'grooveR2', 'grooveR3', 'grooveR4', 'grooveR5',
  'curlLTop', 'curlRTop', 'curlLBottom', 'curlRBottom',
  'backKnobL', 'backKnobR', 'backGrooveL', 'backGrooveR',
  'foreheadPlate', 'foreheadRidge'
];

const variants = {
  baseball_zombie: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.hearty, skin: '#96aa83', skinShade: '#6f805f', hair: '#343a2e' },
    removeParts: [
      'hueftpanzer', 'rockschossL', 'rockschossR', 'brustschutz', 'brustKante',
      'brustNieteL', 'brustNieteR', 'schulterpolsterL', 'schulterpolsterR',
      'tabard', 'tabardSaum', 'schwertKnauf', 'parierstange', 'schwertKlinge',
      'klingenRille', 'schwertSpitze', 'buckler'
    ],
    patchParts: [
      { id: 'uniformTorso', scale: [1.08, 1.04, 1.12], color: 'uniform' },
      { id: 'knieL', scale: [0.68, 0.68, 0.68], color: 'uniformDark' },
      { id: 'knieR', scale: [0.68, 0.68, 0.68], color: 'uniformDark' },
      { id: 'armreifL', scale: [0.42, 0.42, 0.42], color: 'uniformDark' },
      { id: 'armreifR', scale: [0.42, 0.42, 0.42], color: 'uniformDark' },
      { id: 'schwertHeft', scale: [1.2, 1.8, 1.2], color: 'leatherDark' }
    ],
    addParts: [
      { id: 'bunkerLampe', shape: 'cyl', size: [0.055, 0.055, 0.08], pos: [0, 0.18, 0.24], rot: [1.5708, 0, 0], parent: '@head', color: 'accent', emissive: '#5a271f' },
      { id: 'jackenFront', shape: 'box', size: [0.43, 0.47, 0.07], pos: [0, 0.3, 0.23], parent: '@back', color: 'uniform', roughness: 0.9 },
      { id: 'jackenSaum', shape: 'box', size: [0.45, 0.07, 0.12], pos: [0, 0.05, 0.08], parent: '@back', color: 'uniformDark', roughness: 0.92 },
      { id: 'bunkerGuertel', shape: 'box', size: [0.47, 0.07, 0.1], pos: [0, 0.12, 0.12], parent: '@back', color: 'cloth' },
      { id: 'bunkerTascheL', shape: 'box', size: [0.13, 0.15, 0.08], pos: [-0.14, 0.17, 0.29], parent: '@back', color: 'uniformDark', roughness: 0.92 },
      { id: 'bunkerTascheR', shape: 'box', size: [0.13, 0.15, 0.08], pos: [0.14, 0.17, 0.29], parent: '@back', color: 'uniformDark', roughness: 0.92 },
      { id: 'bunkerSchlagstock', shape: 'cyl', size: [0.05, 0.05, 0.52], pos: [0, 0.27, 0], parent: '@weapon', color: 'metalDark', metalness: 0.35 },
      { id: 'bunkerFunkgeraet', shape: 'box', size: [0.18, 0.27, 0.1], pos: [0, 0.08, 0.02], rot: [0, 0, 0.08], parent: '@leftHand', color: 'uniformDark' },
      { id: 'bunkerFunkDisplay', shape: 'box', size: [0.1, 0.07, 0.02], pos: [0, 0.07, 0.065], parent: 'bunkerFunkgeraet', color: 'accent', emissive: '#421c18' },
      { id: 'bunkerFunkAntenne', shape: 'cyl', size: [0.012, 0.012, 0.18], pos: [0.065, 0.18, 0], parent: 'bunkerFunkgeraet', color: 'metalDark' }
    ],
    animations: {
      attack: {
        duration: 0.72,
        tracks: [
          { part: 'root', prop: 'pos.z', keys: [[0, 0], [0.12, -0.18], [0.36, -0.18], [0.44, 0.78], [0.5, 0.78], [0.6, 0], [0.72, 0]] },
          { part: 'oberkoerper', prop: 'rot.y', keys: [[0, 0], [0.12, -0.52], [0.36, -0.52], [0.44, 0.66], [0.5, 0.66], [0.6, 0], [0.72, 0]] },
          { part: 'schwertArm', prop: 'rot.x', keys: [[0, 0], [0.12, -1.2], [0.36, -1.2], [0.44, 0.92], [0.5, 0.92], [0.6, 0], [0.72, 0]] },
          { part: 'schwertArm', prop: 'rot.z', keys: [[0, 0], [0.12, -1.25], [0.36, -1.25], [0.44, 1.26], [0.5, 1.26], [0.6, 0], [0.72, 0]] },
          { part: 'schwertGriff', prop: 'rot.z', keys: [[0, 0], [0.12, -0.5], [0.36, -0.5], [0.44, 0.64], [0.5, 0.64], [0.6, 0], [0.72, 0]] },
          { part: 'schildArm', prop: 'rot.x', keys: [[0, 0], [0.12, 0.28], [0.36, 0.28], [0.44, -0.24], [0.5, -0.24], [0.6, 0], [0.72, 0]] }
        ]
      }
    }
  },
  drum_major: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.brainy, uniform: '#6b4d3b', uniformLight: '#a97d55', accent: '#f0d36b' },
    addParts: [
      { id: 'dozentenBrille', shape: 'torus', size: [0.075, 0.012], pos: [-0.075, 0.02, 0.225], rot: [1.5708, 0, 0], parent: '@head', color: 'metalDark' },
      { id: 'dozentenBrilleR', shape: 'torus', size: [0.075, 0.012], pos: [0.075, 0.02, 0.225], rot: [1.5708, 0, 0], parent: '@head', color: 'metalDark' },
      { id: 'vorlesungsBuch', shape: 'box', size: [0.35, 0.28, 0.075], pos: [-0.38, -0.36, 0.22], rot: [0.1, 0.18, -0.15], parent: '@leftHand', color: 'uniformDark' }
    ]
  },
  fliessbandarbeiter: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.beastly, uniform: '#d87424', uniformLight: '#f6a23b', accent: '#ffe36b' },
    addParts: [
      { id: 'warnstreifen', shape: 'box', size: [0.46, 0.075, 0.035], pos: [0, 0.25, 0.29], parent: '@back', color: 'accent' },
      { id: 'nietzange', shape: 'box', size: [0.1, 0.34, 0.08], pos: [0, 0.22, 0], parent: '@weapon', color: 'metalDark', metalness: 0.7 }
    ]
  },
  flugblatt_verteiler: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.brainy, uniform: '#466f82', uniformLight: '#79a9b7', accent: '#f2e7bf' },
    addParts: [
      { id: 'flugblattStapel', shape: 'box', size: [0.34, 0.24, 0.1], pos: [-0.36, -0.34, 0.25], rot: [0.1, 0.2, -0.18], parent: '@leftHand', color: 'eyeWhite' },
      { id: 'umhaengetasche', shape: 'box', size: [0.42, 0.32, 0.16], pos: [0.28, 0.08, -0.2], rot: [0.08, 0, -0.08], parent: '@back', color: 'leather' }
    ]
  },
  medic: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.hearty, uniform: '#d9ded8', uniformDark: '#596669', uniformLight: '#f0f3ea', accent: '#d94343' },
    addParts: [
      { id: 'sanitaetsKoffer', shape: 'box', size: [0.42, 0.34, 0.18], pos: [0, 0.12, -0.26], parent: '@back', color: 'uniformLight' },
      { id: 'kreuzQuer', shape: 'box', size: [0.23, 0.07, 0.035], pos: [0, 0.15, -0.36], parent: '@back', color: 'accent' },
      { id: 'kreuzHoch', shape: 'box', size: [0.07, 0.23, 0.035], pos: [0, 0.15, -0.36], parent: '@back', color: 'accent' }
    ]
  },
  mini_ninja: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.sneaky, uniform: '#20252e', uniformDark: '#090d13', uniformLight: '#3c4653', skin: '#c39172', accent: '#52d6c5' },
    addParts: [
      { id: 'botenMaske', shape: 'box', size: [0.3, 0.13, 0.08], pos: [0, -0.08, 0.22], parent: '@head', color: 'cloth' },
      { id: 'nachtPaket', shape: 'box', size: [0.38, 0.44, 0.2], pos: [0, 0.12, -0.25], parent: '@back', color: 'uniformDark' }
    ]
  },
  pied_piper: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.beastly, uniform: '#7b4329', uniformLight: '#b76831', metal: '#c37d42', accent: '#f3c65c' },
    addParts: [
      { id: 'kesselRing', shape: 'torus', size: [0.22, 0.045], pos: [0, 0.08, -0.3], rot: [1.5708, 0, 0], parent: '@back', color: 'metal', metalness: 0.65 },
      { id: 'dampfVentil', shape: 'cyl', size: [0.055, 0.055, 0.2], pos: [0.18, 0.2, -0.27], parent: '@back', color: 'metalDark', metalness: 0.7 }
    ]
  },
  skunk_punk: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.beastly, uniform: '#3a2f42', uniformDark: '#17131c', uniformLight: '#6a4968', skin: '#91a77c', skinShade: '#647354', hair: '#d44a87', accent: '#f0cb3e' },
    addParts: [
      { id: 'punkIro1', shape: 'cone', size: [0.07, 0.3], pos: [0, 0.27, -0.06], rot: [0, 0, 0.08], parent: '@head', color: 'hair' },
      { id: 'punkIro2', shape: 'cone', size: [0.07, 0.28], pos: [0, 0.25, 0.03], parent: '@head', color: 'hair' },
      { id: 'punkIro3', shape: 'cone', size: [0.065, 0.24], pos: [0, 0.22, 0.12], rot: [0, 0, -0.08], parent: '@head', color: 'hair' }
    ]
  },
  smelly_zombie: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.sneaky, uniform: '#31433a', uniformDark: '#15231e', uniformLight: '#617d65', accent: '#c6e64d' },
    addParts: [
      { id: 'tunnelLampe', shape: 'cyl', size: [0.06, 0.06, 0.09], pos: [0, 0.17, 0.25], rot: [1.5708, 0, 0], parent: '@head', color: 'accent', emissive: '#526a18' },
      { id: 'atemFilterL', shape: 'cyl', size: [0.05, 0.07, 0.11], pos: [-0.1, -0.09, 0.24], rot: [1.5708, 0, 0], parent: '@head', color: 'metalDark' },
      { id: 'atemFilterR', shape: 'cyl', size: [0.05, 0.07, 0.11], pos: [0.1, -0.09, 0.24], rot: [1.5708, 0, 0], parent: '@head', color: 'metalDark' }
    ]
  },
  cardboard_robot_zombie: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.brainy, uniform: '#8a7352', uniformDark: '#4d402f', uniformLight: '#bca06f', skin: '#777d81', skinShade: '#50575c', accent: '#65d3d1' },
    patchParts: [{ id: '@head', scale: [1.1, 1.02, 1.05] }],
    addParts: [
      { id: 'kartonHelm', shape: 'box', size: [0.52, 0.5, 0.46], pos: [0, 0.02, 0.01], parent: '@head', color: 'uniformLight' },
      { id: 'roboterAntenne', shape: 'cyl', size: [0.025, 0.025, 0.28], pos: [0, 0.38, 0], parent: '@head', color: 'metalDark', metalness: 0.6 },
      { id: 'antennenKugel', shape: 'ico', size: 0.07, pos: [0, 0.55, 0], parent: '@head', color: 'accent', emissive: '#17494b' }
    ]
  },
  dolphin_rider: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.beastly, uniform: '#315d6b', uniformDark: '#18353d', uniformLight: '#5e91a0', accent: '#f2b84b' },
    height: 0.9,
    addParts: [
      { id: 'schwimmPontonL', shape: 'capsule', size: [0.18, 1.15], pos: [-0.42, 0.25, 0], rot: [1.5708, 0, 0], parent: '@mount', color: 'uniformLight' },
      { id: 'schwimmPontonR', shape: 'capsule', size: [0.18, 1.15], pos: [0.42, 0.25, 0], rot: [1.5708, 0, 0], parent: '@mount', color: 'uniformLight' },
      { id: 'schwimmDeck', shape: 'box', size: [1.05, 0.1, 0.72], pos: [0, 0.3, 0], parent: '@mount', color: 'metalDark', metalness: 0.55 },
      { id: 'heckPropeller', shape: 'torus', size: [0.2, 0.045], pos: [0, 0.35, -0.62], rot: [1.5708, 0, 0], parent: '@mount', color: 'accent', metalness: 0.5 }
    ]
  },
  fishy_imp: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.sneaky, uniform: '#2b6170', uniformLight: '#5b99a5', accent: '#efcc55' },
    height: 0.7,
    patchParts: [{ id: '@head', scale: [1.24, 1.18, 1.16] }],
    addParts: [
      { id: 'hinterhofTasche', shape: 'box', size: [0.42, 0.34, 0.2], pos: [0, 0.12, -0.25], parent: '@back', color: 'uniformDark' },
      { id: 'fischAbzeichen', shape: 'ico', size: 0.09, pos: [0.16, 0.3, 0.3], scale: [1.5, 0.7, 0.35], parent: '@back', color: 'accent' }
    ]
  },
  imp: {
    baseId: 'humanoid-standard',
    palette: { ...humanPalette.sneaky, uniform: '#5b3a61', uniformLight: '#8a5c8e', accent: '#5de0bd' },
    height: 0.68,
    patchParts: [{ id: '@head', scale: [1.25, 1.2, 1.18] }],
    addParts: [
      { id: 'gassenPaket', shape: 'box', size: [0.38, 0.38, 0.22], pos: [0, 0.1, -0.26], parent: '@back', color: 'uniformDark' },
      { id: 'botenFeder', shape: 'cone', size: [0.045, 0.28], pos: [0.18, 0.28, 0], rot: [0, 0, -0.35], parent: '@head', color: 'accent' }
    ]
  },

  button_mushroom: {
    baseId: 'bird',
    palette: {
      goldbraun: '#25232e', federDunkel: '#0d0c12', federHell: '#6f4c82',
      schokolade: '#08070b', nackenGold: '#51405b', brustGold: '#372d42',
      schnabel: '#b9a45d', schnabelDunkel: '#746334', iris: '#e7518c', fussGold: '#6f4c82'
    },
    height: 0.62,
    addParts: [
      { id: 'kraehenKamm1', shape: 'cone', size: [0.07, 0.3], pos: [0, 0.3, -0.12], rot: [0, 0, 0.2], parent: '@head', color: 'federHell' },
      { id: 'kraehenKamm2', shape: 'cone', size: [0.065, 0.25], pos: [0, 0.28, -0.02], parent: '@head', color: 'federHell' }
    ],
    animations: {
      attack: {
        duration: 0.72,
        tracks: [
          { part: 'root', prop: 'pos.z', keys: [[0, 0], [0.18, -0.18], [0.4, 0.7], [0.56, 0.72], [0.72, 0]] },
          { part: 'root', prop: 'pos.y', keys: [[0, 0], [0.18, 0.1], [0.4, -0.08], [0.56, -0.05], [0.72, 0]] },
          { part: 'rumpf', prop: 'rot.x', keys: [[0, 0], [0.18, 0.18], [0.4, -0.28], [0.56, -0.2], [0.72, 0]] },
          { part: 'kopf', prop: 'rot.x', keys: [[0, 0], [0.18, 0.12], [0.4, -0.24], [0.56, -0.18], [0.72, 0]] },
          { part: 'fluegelL', prop: 'rot.z', keys: [[0, 0], [0.18, 0.95], [0.4, -0.72], [0.56, -0.45], [0.72, 0]] },
          { part: 'fluegelR', prop: 'rot.z', keys: [[0, 0], [0.18, -0.95], [0.4, 0.72], [0.56, 0.45], [0.72, 0]] },
          { part: 'schnabelUnten', prop: 'rot.x', keys: [[0, 0], [0.18, 0.08], [0.4, 0.46], [0.56, 0.28], [0.72, 0]] }
        ]
      }
    }
  },
  bellflower: {
    baseId: 'bird',
    palette: {
      goldbraun: '#b98c45', federDunkel: '#654726', federHell: '#f0d28d',
      nackenGold: '#e4c479', brustGold: '#c7974d', schnabel: '#d98b35',
      schnabelDunkel: '#8a5426', iris: '#30486a', fussGold: '#c98c42'
    },
    height: 0.48,
    patchParts: [{ id: '@head', scale: [0.88, 0.88, 0.92] }],
    addParts: [{ id: 'lichtGloeckchen', shape: 'cone', size: [0.09, 0.18], pos: [0, -0.18, -0.12], rot: [3.14159, 0, 0], parent: '@head', color: 'federHell', emissive: '#5b431d' }]
  },
  mixed_nuts: {
    baseId: 'nut',
    palette: {
      shell: '#765022', shellLight: '#ad7d3a', shellHighlight: '#e0b45d',
      shellDark: '#36210e', groove: '#241309', limb: '#4b2d15', sole: '#21130c',
      eyeWhite: '#f2e6c8', iris: '#c48623', pupil: '#15110b', glint: '#fff2c5',
      mouth: '#1c0e09', cheek: '#9b5425', pistachio: '#84a83e', cream: '#d7b979'
    },
    height: 0.74,
    patchParts: [
      { id: 'shellRig', scale: [0.83, 0.86, 0.83] },
      { id: 'armRigL', pos: [-0.66, 0.1, 0.01] },
      { id: 'armRigR', pos: [0.66, 0.1, 0.01] }
    ],
    addParts: [
      { id: 'mixHaselnuss', shape: 'ico', size: 0.25, pos: [0.68, -0.08, 0.04], scale: [0.92, 1.18, 0.84], parent: 'shellRig', color: 'shellLight', roughness: 1 },
      { id: 'mixHaselnussKappe', shape: 'cone', size: [0.22, 0.18], pos: [0.68, 0.2, 0.02], parent: 'shellRig', color: 'shellDark', roughness: 1 },
      { id: 'mixPistazieL', shape: 'ico', size: 0.25, pos: [-0.72, -0.04, 0.03], rot: [0, -0.38, 0.18], scale: [0.48, 1.15, 0.72], parent: 'shellRig', color: 'cream', roughness: 1 },
      { id: 'mixPistazieR', shape: 'ico', size: 0.25, pos: [-0.48, -0.04, 0.03], rot: [0, 0.38, -0.18], scale: [0.48, 1.15, 0.72], parent: 'shellRig', color: 'cream', roughness: 1 },
      { id: 'mixPistazienKern', shape: 'ico', size: 0.2, pos: [-0.6, -0.06, 0.13], scale: [0.62, 1.05, 0.52], parent: 'shellRig', color: 'pistachio', roughness: 0.92 },
      { id: 'solarNussMarke', shape: 'torus', size: [0.115, 0.024], pos: [0, -0.08, 0.38], rot: [1.5708, 0, 0], parent: '@head', color: 'shellHighlight', metalness: 0.25 }
    ]
  },
  sunflower: {
    baseId: 'bird',
    palette: {
      goldbraun: '#7a5b35', federDunkel: '#37291f', federHell: '#e3c789',
      nackenGold: '#b48e51', brustGold: '#98703c', schnabel: '#c68b38',
      schnabelDunkel: '#765027', iris: '#dfb640', fussGold: '#aa7a3a'
    },
    height: 0.64,
    patchParts: [{ id: '@head', scale: [1.13, 1.08, 1.06] }],
    addParts: [
      { id: 'eulenScheibeL', shape: 'torus', size: [0.2, 0.045], pos: [-0.16, 0.02, 0.23], rot: [1.5708, 0, 0], parent: '@head', color: 'federHell' },
      { id: 'eulenScheibeR', shape: 'torus', size: [0.2, 0.045], pos: [0.16, 0.02, 0.23], rot: [1.5708, 0, 0], parent: '@head', color: 'federHell' },
      { id: 'eulenHornL', shape: 'cone', size: [0.08, 0.3], pos: [-0.18, 0.28, -0.02], rot: [0, 0, 0.28], parent: '@head', color: 'federDunkel' },
      { id: 'eulenHornR', shape: 'cone', size: [0.08, 0.3], pos: [0.18, 0.28, -0.02], rot: [0, 0, -0.28], parent: '@head', color: 'federDunkel' }
    ]
  },

  peashooter: {
    baseId: 'canid',
    palette: { main: '#596a45', dark: '#29351f', cream: '#b6b78d', nose: '#171b13', tooth: '#efe8d7' },
    removeParts: ['tailFluffL', 'tailFluffR', 'tailFluffC'],
    patchParts: [
      { id: 'tailBase', rot: [-1.08, 0, 0.38], scale: [1.12, 1.18, 1.12] },
      { id: 'tail', rot: [-0.18, 0, -0.12], scale: [1.22, 1.48, 1.22] },
      { id: 'tailTip', rot: [-0.08, 0, -0.15], scale: [1.1, 1.55, 1.1] },
      { id: 'eyeWhiteL', pos: [-0.22, 1.16, 1.51], scale: [1.32, 1.2, 1.15] },
      { id: 'eyeWhiteR', pos: [0.22, 1.16, 1.51], scale: [1.32, 1.2, 1.15] },
      { id: 'pupilL', pos: [-0.22, 1.15, 1.585], scale: [1.18, 1.25, 1.05] },
      { id: 'pupilR', pos: [0.22, 1.15, 1.585], scale: [1.18, 1.25, 1.05] },
      { id: 'earInnerL', color: 'cream', scale: [1.18, 1.05, 1.18] },
      { id: 'earInnerR', color: 'cream', scale: [1.18, 1.05, 1.18] }
    ],
    addParts: [
      { id: 'rudelHalstuch', shape: 'torus', size: [0.24, 0.045], pos: [0, 0.02, 0.1], rot: [1.5708, 0, 0], parent: '@head', color: 'cream' },
      { id: 'rudelMarke', shape: 'ico', size: 0.095, pos: [0, -0.12, 0.29], scale: [1.15, 1.05, 0.45], parent: '@head', color: '#f0cf46', metalness: 0.45 },
      { id: 'rudelMarkeKralleL', shape: 'cone', size: [0.026, 0.11], pos: [-0.035, 0.015, 0.07], rot: [0, 0, -0.24], parent: 'rudelMarke', color: 'dark' },
      { id: 'rudelMarkeKralleR', shape: 'cone', size: [0.026, 0.11], pos: [0.035, 0.015, 0.07], rot: [0, 0, 0.24], parent: 'rudelMarke', color: 'dark' },
      { id: 'rudelFlankenMarke', shape: 'ico', size: 0.16, pos: [0.5, 0.08, 0.03], scale: [0.24, 1.25, 0.95], parent: '@back', color: '#f0cf46', metalness: 0.35 },
      { id: 'rudelFlankenKralle', shape: 'cone', size: [0.035, 0.16], pos: [0.08, 0.02, 0], rot: [0, 0, 0.35], parent: 'rudelFlankenMarke', color: 'cream' }
    ],
    animations: {
      attack: {
        duration: 0.7,
        tracks: [
          { part: 'root', prop: 'pos.z', keys: [[0, 0], [0.18, -0.2], [0.4, 0.74], [0.54, 0.76], [0.7, 0]] },
          { part: 'root', prop: 'pos.y', keys: [[0, 0], [0.18, -0.08], [0.4, 0.03], [0.54, 0.01], [0.7, 0]] },
          { part: 'head', prop: 'rot.x', keys: [[0, 0], [0.18, 0.22], [0.4, -0.3], [0.54, -0.2], [0.7, 0]] },
          { part: 'jawLower', prop: 'rot.x', keys: [[0, 0], [0.18, 0.1], [0.4, 0.62], [0.54, 0.16], [0.7, 0]] },
          { part: 'earL', prop: 'rot.z', keys: [[0, 0], [0.18, -0.22], [0.4, 0.14], [0.7, 0]] },
          { part: 'earR', prop: 'rot.z', keys: [[0, 0], [0.18, 0.22], [0.4, -0.14], [0.7, 0]] },
          { part: 'tailBase', prop: 'rot.z', keys: [[0, 0], [0.18, 0.36], [0.4, -0.42], [0.54, -0.24], [0.7, 0]] }
        ]
      }
    }
  },
  torchwood: {
    baseId: 'felid',
    palette: {
      fellRost: '#9f7044', fellSand: '#bd8b55', fellHell: '#d3a975',
      fellWeiss: '#ead7b6', fleck: '#4e3525', iris: '#6dc9a8', nase: '#4f2b2b'
    },
    addParts: [{ id: 'rudelBand', shape: 'torus', size: [0.23, 0.04], pos: [0, -0.02, 0.1], rot: [1.5708, 0, 0], parent: '@head', color: 'iris' }],
    animations: {
      attack: {
        duration: 0.76,
        tracks: [
          { part: 'root', prop: 'pos.z', keys: [[0, 0], [0.22, -0.24], [0.4, 0.82], [0.58, 0.7], [0.76, 0]] },
          { part: 'root', prop: 'pos.y', keys: [[0, 0], [0.22, -0.18], [0.4, 0.42], [0.58, 0.04], [0.76, 0]] },
          { part: 'torso', prop: 'rot.x', keys: [[0, 0], [0.22, 0.3], [0.4, -0.26], [0.58, 0.1], [0.76, 0]] },
          { part: 'kopf', prop: 'rot.x', keys: [[0, 0], [0.22, 0.26], [0.4, -0.32], [0.58, -0.06], [0.76, 0]] },
          { part: 'vorderbeinL', prop: 'rot.x', keys: [[0, 0], [0.22, 0.68], [0.4, -1.08], [0.58, -0.4], [0.76, 0]] },
          { part: 'vorderbeinR', prop: 'rot.x', keys: [[0, 0], [0.22, 0.6], [0.4, -0.94], [0.58, -0.34], [0.76, 0]] },
          { part: 'hinterbeinL', prop: 'rot.x', keys: [[0, 0], [0.22, -0.38], [0.4, 0.3], [0.58, -0.16], [0.76, 0]] },
          { part: 'hinterbeinR', prop: 'rot.x', keys: [[0, 0], [0.22, -0.32], [0.4, 0.26], [0.58, -0.12], [0.76, 0]] }
        ]
      }
    }
  },
  smashing_pumpkin: {
    baseId: 'snake',
    palette: {
      scale: '#6f874d', scaleDark: '#3e6032', scaleLight: '#a6ba68',
      belly: '#d8c77b', pattern: '#f0c83f', patternDark: '#a67d22',
      eye: '#e4b94e', pupil: '#15170e', mouth: '#6a2931'
    },
    patchParts: [
      { id: 'eyeWhiteL', pos: [-0.18, 0.075, 0.225], scale: [1.2, 1.34, 0.62], color: 'scaleLight' },
      { id: 'eyeWhiteR', pos: [0.18, 0.075, 0.225], scale: [1.2, 1.34, 0.62], color: 'scaleLight' },
      { id: 'pupilL', pos: [-0.18, 0.075, 0.315], scale: [1.2, 1.2, 1.2] },
      { id: 'pupilR', pos: [0.18, 0.075, 0.315], scale: [1.2, 1.2, 1.2] }
    ],
    addParts: [
      { id: 'kobraHaubeMitte', shape: 'ico', size: 0.42, pos: [0, -0.02, -0.11], scale: [1.15, 1.18, 0.24], parent: '@head', color: 'scaleDark' },
      { id: 'kobraHaubeL', shape: 'ico', size: 0.42, pos: [-0.28, -0.02, -0.1], scale: [0.62, 1.12, 0.26], parent: '@head', color: 'scaleDark' },
      { id: 'kobraHaubeR', shape: 'ico', size: 0.42, pos: [0.28, -0.02, -0.1], scale: [0.62, 1.12, 0.26], parent: '@head', color: 'scaleDark' },
      { id: 'kobraSonneMitte', shape: 'ico', size: 0.11, pos: [0, -0.01, 0.13], scale: [1.2, 1.4, 0.24], parent: 'kobraHaubeMitte', color: 'pattern' },
      { id: 'kobraSonneL', shape: 'ico', size: 0.085, pos: [-0.04, 0.05, 0.14], scale: [0.9, 1.45, 0.22], parent: 'kobraHaubeL', color: 'pattern' },
      { id: 'kobraSonneR', shape: 'ico', size: 0.085, pos: [0.04, 0.05, 0.14], scale: [0.9, 1.45, 0.22], parent: 'kobraHaubeR', color: 'pattern' }
    ],
    animations: {
      attack: {
        duration: 0.78,
        tracks: [
          { part: 'root', prop: 'pos.z', keys: [[0, 0], [0.22, -0.28], [0.46, 0.84], [0.6, 0.82], [0.78, 0]] },
          { part: 'rumpfHinten', prop: 'rot.y', keys: [[0, 0], [0.22, 0.24], [0.46, -0.18], [0.78, 0]] },
          { part: 'rumpfMitte', prop: 'rot.y', keys: [[0, 0], [0.22, -0.32], [0.46, 0.22], [0.78, 0]] },
          { part: 'rumpfVorn', prop: 'rot.y', keys: [[0, 0], [0.22, 0.38], [0.46, -0.18], [0.78, 0]] },
          { part: 'halsBasis', prop: 'rot.x', keys: [[0, 0], [0.22, 0.28], [0.46, -0.34], [0.6, -0.22], [0.78, 0]] },
          { part: 'halsMitte', prop: 'rot.x', keys: [[0, 0], [0.22, 0.36], [0.46, -0.42], [0.6, -0.28], [0.78, 0]] },
          { part: 'halsOben', prop: 'rot.x', keys: [[0, 0], [0.22, 0.42], [0.46, -0.52], [0.6, -0.3], [0.78, 0]] },
          { part: 'kopf', prop: 'rot.x', keys: [[0, 0], [0.22, 0.28], [0.46, -0.34], [0.6, -0.2], [0.78, 0]] },
          { part: 'kiefer', prop: 'rot.x', keys: [[0, 0], [0.22, 0.06], [0.46, 0.58], [0.6, 0.24], [0.78, 0]] }
        ]
      }
    }
  },

  small_nut: {
    baseId: 'nut',
    palette: {
      shell: '#8a5526', shellLight: '#b97935', shellHighlight: '#d59c4e',
      shellDark: '#42240f', groove: '#29150a', limb: '#5a3216', sole: '#24140c',
      eyeWhite: '#eee4ce', iris: '#46707a', pupil: '#101516', glint: '#e9fbf7',
      mouth: '#1c0e09', cheek: '#8d4b22', cap: '#5c3517'
    },
    height: 0.5,
    removeParts: nutShellParts,
    patchParts: [
      { id: 'shellRig', scale: [0.76, 0.76, 0.76] },
      { id: 'armRigL', pos: [-0.49, 0.03, 0.02], scale: [0.82, 0.82, 0.82] },
      { id: 'armRigR', pos: [0.49, 0.03, 0.02], scale: [0.82, 0.82, 0.82] },
      { id: 'legRigL', pos: [-0.23, 0.31, 0], scale: [0.82, 0.82, 0.82] },
      { id: 'legRigR', pos: [0.23, 0.31, 0], scale: [0.82, 0.82, 0.82] }
    ],
    addParts: [
      { id: 'hazelnutBody', shape: 'ico', size: 0.57, pos: [0, 0.03, -0.02], scale: [0.84, 1.03, 0.74], parent: 'shellRig', color: 'shell', roughness: 1 },
      { id: 'hazelnutCap', shape: 'cone', size: [0.42, 0.26], pos: [0, 0.58, -0.04], parent: 'shellRig', color: 'cap', roughness: 1 },
      { id: 'hazelnutRidgeL', shape: 'capsule', size: [0.026, 0.5], pos: [-0.26, 0.02, 0.38], rot: [0, 0, -0.18], parent: 'shellRig', color: 'shellDark' },
      { id: 'hazelnutRidgeR', shape: 'capsule', size: [0.026, 0.5], pos: [0.26, 0.02, 0.38], rot: [0, 0, 0.18], parent: 'shellRig', color: 'shellDark' }
    ]
  },
  pismashio: {
    baseId: 'nut',
    palette: {
      shell: '#d0b27b', shellLight: '#ead6a6', shellHighlight: '#f3e2bb',
      shellDark: '#79613b', groove: '#594729', limb: '#6f5430', sole: '#2b2115',
      eyeWhite: '#f2ecd8', iris: '#4f7345', pupil: '#121712', glint: '#efffe8',
      mouth: '#26170e', cheek: '#b2874f', kernel: '#76983d'
    },
    height: 0.58,
    removeParts: nutShellParts,
    patchParts: [
      { id: 'shellRig', scale: [0.86, 0.88, 0.86] },
      { id: 'armRigL', pos: [-0.62, 0.08, 0.01] },
      { id: 'armRigR', pos: [0.62, 0.08, 0.01] }
    ],
    addParts: [
      { id: 'pistachioShellL', shape: 'ico', size: 0.57, pos: [-0.25, 0.02, -0.03], rot: [0, -0.42, 0.15], scale: [0.52, 1.1, 0.74], parent: 'shellRig', color: 'shell', roughness: 1 },
      { id: 'pistachioShellR', shape: 'ico', size: 0.57, pos: [0.25, 0.02, -0.03], rot: [0, 0.42, -0.15], scale: [0.52, 1.1, 0.74], parent: 'shellRig', color: 'shellLight', roughness: 1 },
      { id: 'pistachioKernel', shape: 'ico', size: 0.47, pos: [0, -0.02, 0.04], scale: [0.65, 0.98, 0.56], parent: 'shellRig', color: 'kernel', roughness: 0.94 },
      { id: 'pistachioSplitL', shape: 'capsule', size: [0.025, 0.62], pos: [-0.08, 0.05, 0.38], rot: [0, 0, -0.18], parent: 'shellRig', color: 'groove' },
      { id: 'pistachioSplitR', shape: 'capsule', size: [0.025, 0.62], pos: [0.08, 0.05, 0.38], rot: [0, 0, 0.18], parent: 'shellRig', color: 'groove' }
    ]
  },
  seedling: {
    baseId: 'mammal-quadruped',
    palette: { fell: '#171918', fellHell: '#ece8d8', fellDunkel: '#080909', bauch: '#bdb7a5', haut: '#4b4745', hautHell: '#8b817a', nase: '#181717' },
    height: 0.52,
    addParts: [
      { id: 'stinktierStreifen', shape: 'box', size: [0.12, 0.05, 0.72], pos: [0, 0.15, -0.08], parent: '@back', color: 'fellHell' },
      { id: 'buschSchwanz1', shape: 'ico', size: 0.24, pos: [0, 0.12, 0], scale: [0.75, 1.4, 0.8], parent: 'ruteBasis', color: 'fellDunkel' },
      { id: 'buschSchwanz2', shape: 'ico', size: 0.2, pos: [0, 0.39, 0], scale: [0.75, 1.35, 0.8], parent: 'ruteBasis', color: 'fellHell' }
    ]
  },
  zapricot: {
    baseId: 'mammal-quadruped',
    palette: { fell: '#66706f', fellHell: '#aeb5ae', fellDunkel: '#2a3030', bauch: '#c8c1aa', haut: '#64605c', hautHell: '#9d958b', nase: '#242729' },
    height: 0.54,
    addParts: [
      { id: 'waschbaerMaskeL', shape: 'ico', size: 0.09, pos: [-0.105, 0.04, 0.22], scale: [1.3, 0.75, 0.35], parent: '@head', color: 'fellDunkel' },
      { id: 'waschbaerMaskeR', shape: 'ico', size: 0.09, pos: [0.105, 0.04, 0.22], scale: [1.3, 0.75, 0.35], parent: '@head', color: 'fellDunkel' },
      { id: 'rutenRing1', shape: 'torus', size: [0.07, 0.022], pos: [0, 0.14, 0], parent: 'ruteBasis', color: 'fellDunkel' },
      { id: 'rutenRing2', shape: 'torus', size: [0.06, 0.02], pos: [0, 0.32, 0], parent: 'ruteBasis', color: 'fellDunkel' }
    ]
  },
  spineapple: {
    baseId: 'mammal-quadruped',
    palette: { fell: '#6a553e', fellHell: '#a78b63', fellDunkel: '#30271f', bauch: '#b9a27f', haut: '#7d6858', hautHell: '#aa8f78', nase: '#2e2624' },
    height: 0.58,
    addParts: Array.from({ length: 9 }, (_, index) => ({
      id: `stachel${index + 1}`,
      shape: 'cone',
      size: [0.045 + (index % 3) * 0.008, 0.36 + (index % 2) * 0.1],
      pos: [((index % 3) - 1) * 0.17, 0.18 + Math.floor(index / 3) * 0.02, 0.22 - Math.floor(index / 3) * 0.24],
      rot: [-0.15 + Math.floor(index / 3) * 0.15, 0, ((index % 3) - 1) * -0.16],
      parent: '@back', color: 'fellHell'
    }))
  },
  sting_bean: {
    baseId: 'mammal-quadruped',
    palette: { fell: '#765846', fellHell: '#b58c6c', fellDunkel: '#3a2e28', bauch: '#d3b695', haut: '#7a6457', hautHell: '#b69a86', nase: '#342927', zahn: '#fff1cf' },
    height: 0.68,
    patchParts: [
      { id: '@back', scale: [1.55, 1.12, 1.28] },
      { id: '@head', scale: [1.28, 1.18, 1.12] },
      { id: 'ruteBasis', scale: [0.15, 0.15, 0.15] }
    ],
    addParts: [
      { id: 'walrossHauerL', shape: 'cone', size: [0.06, 0.38], pos: [-0.09, -0.2, 0.37], rot: [3.14159, 0, -0.08], parent: '@head', color: 'zahn' },
      { id: 'walrossHauerR', shape: 'cone', size: [0.06, 0.38], pos: [0.09, -0.2, 0.37], rot: [3.14159, 0, 0.08], parent: '@head', color: 'zahn' }
    ]
  },
  wall_nut: {
    ...(readExistingVariant('wall_nut') ?? { baseId: 'nut' })
  }
};

// Diese Varianten wurden nach dem ersten Batch visuell abgenommen und von Hand
// identitaetsspezifisch verfeinert. Ein erneuter Generatorlauf darf sie nicht
// wieder auf die fruehe Minimalvariante zuruecksetzen.
for (const cardId of ['fishy_imp', 'sting_bean', 'wall_nut']) {
  const existing = readExistingVariant(cardId);
  if (existing) variants[cardId] = existing;
}

if (includeInsect) {
  variants.buff_shroom = {
    baseId: 'insect',
    palette: { wildYellow: '#f2c230', yellowLight: '#ffd95a', chitinBlack: '#171515', wing: '#75b9c4' }
  };
}

for (const [cardId, variant] of Object.entries(variants)) {
  saveJson(join(FIGURES, `${cardId}.json`), { cardId, ...variant });
}

console.log(`${Object.keys(variants).length} Varianten und ${bases.length} Basen ${write ? 'erzeugt' : 'geprueft'}.`);
