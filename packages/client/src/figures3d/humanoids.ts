// Humanoide (Menschen, Sozis, Arbeiter, Obdachlose, Studenten).
//
// buildHumanoid(cfg) baut ein detailliertes zweibeiniges Modell mit
// geschichtetem Torso, getrenntem Kopf (Schädel/Kiefer/Nase/Augen/Brauen/Haar),
// Ober-/Unterarmen samt Händen und Ober-/Unterschenkeln samt Stiefeln. Ein
// Requisiten-System hängt Werkzeuge/Waffen/Objekte an; `crowd` klont kleinere
// Kopien dahinter (Menschenmengen). Idle/Walk/Attack laufen über Clips.

import * as THREE from 'three';
import {
  type Rig,
  type Clip,
  box,
  sph,
  cyl,
  cone,
  mat,
  mesh,
  group,
  track,
  wave
} from './core';

export type PropName =
  | 'sword' | 'shield' | 'staff' | 'banner' | 'flyer' | 'fist' | 'moneybag'
  | 'wrench' | 'toolbox' | 'megaphone' | 'book' | 'coffee' | 'backpack'
  | 'bottleBag' | 'craneHook' | 'ballot' | 'ladle' | 'clipboard' | 'torch' | 'can';

export type AttackStyle =
  | 'swing' | 'thrust' | 'bannerWave' | 'megaphone' | 'bookThrow' | 'stand';

export interface HumanoidCfg {
  skin: number;
  cloth: number;
  accent: number;
  pants?: number;
  hair?: number;
  beard?: boolean;
  build?: 'slim' | 'normal' | 'bulky' | 'hunched';
  headgear?: 'kettle' | 'greathelm' | 'plume' | 'beanie' | 'cap' | 'hood' | 'hardhat' | 'none';
  cape?: number; // Umhangfarbe
  crowd?: 2 | 3;
  props?: PropName[];
  leftProps?: PropName[]; // Requisiten in der linken Hand (Default: Schild)
  attack?: AttackStyle;
  scale?: number;
}

const STEEL = 0x9aa7b8;
const WOOD = 0x8a6a45;

/** Ein Requisit an eine Hand/Arm-Gruppe hängen. Gibt animierbare Sub-Parts zurück. */
function addProp(hand: THREE.Group, name: PropName, cfg: HumanoidCfg, parts: Record<string, THREE.Object3D>) {
  const accentM = mat(cfg.accent, { metal: 0.35, rough: 0.5 });
  const steelM = mat(STEEL, { metal: 0.7, rough: 0.35 });
  const woodM = mat(WOOD);
  switch (name) {
    case 'sword': {
      const g = group(hand, 0, -0.05, 0.06);
      g.add(mesh(box(0.05, 0.1, 0.16), steelM, 0, 0, 0.02));
      g.add(mesh(box(0.035, 0.04, 0.6), steelM, 0, 0, 0.38));
      g.rotation.x = -0.5;
      break;
    }
    case 'shield': {
      const g = group(hand, -0.06, -0.02, 0.05);
      g.add(mesh(cyl(0.26, 0.26, 0.06, 12), accentM));
      g.rotation.x = Math.PI / 2;
      g.add(mesh(sph(0.07), steelM, 0, 0.05, 0));
      break;
    }
    case 'staff': {
      const g = group(hand, 0, -0.05, 0.05);
      g.add(mesh(cyl(0.03, 0.03, 1.1, 8), woodM, 0, 0.3, 0));
      const glow = mesh(sph(0.09, 8), mat(0xfff3c0, { emissive: 0xffd766, emissiveIntensity: 1 }), 0, 0.88, 0);
      g.add(glow);
      parts.staffGlow = glow;
      break;
    }
    case 'banner': {
      const g = group(hand, 0, -0.05, 0.05);
      g.add(mesh(cyl(0.03, 0.03, 1.6, 8), woodM, 0, 0.5, 0));
      const cloth = group(g, 0, 1.05, 0.28);
      cloth.add(mesh(box(0.04, 0.4, 0.55), accentM));
      parts.banner = cloth;
      break;
    }
    case 'flyer': {
      const g = group(hand, 0, -0.05, 0.08);
      g.add(mesh(box(0.02, 0.24, 0.18), mat(0xf2ede0), 0, 0, 0));
      g.rotation.x = -0.4;
      break;
    }
    case 'fist':
      hand.add(mesh(sph(0.12, 8), mat(cfg.skin)));
      break;
    case 'moneybag': {
      const g = group(hand, 0, -0.06, 0.06);
      g.add(mesh(sph(0.14, 8), mat(0x8a6f3a)));
      g.add(mesh(cyl(0.05, 0.07, 0.06, 8), mat(0x5f4a25), 0, 0.12, 0));
      break;
    }
    case 'wrench': {
      const g = group(hand, 0, -0.08, 0.05);
      g.add(mesh(box(0.05, 0.34, 0.05), steelM, 0, 0.1, 0));
      g.add(mesh(box(0.12, 0.1, 0.06), steelM, 0, 0.28, 0));
      g.rotation.x = -0.3;
      break;
    }
    case 'toolbox': {
      const g = group(hand, 0, -0.16, 0.04);
      g.add(mesh(box(0.34, 0.2, 0.24), mat(cfg.accent, { metal: 0.4, rough: 0.5 })));
      g.add(mesh(box(0.36, 0.05, 0.26), mat(0x3a4756, { metal: 0.5 }), 0, 0.12, 0));
      const handle = mesh(cyl(0.02, 0.02, 0.16, 6), steelM, 0, 0.2, 0);
      handle.rotation.z = Math.PI / 2;
      g.add(handle);
      break;
    }
    case 'megaphone': {
      const g = group(hand, 0.02, 0.0, 0.14);
      g.add(mesh(cyl(0.05, 0.05, 0.1, 10), mat(0x333a45, { metal: 0.4 }), 0, 0, 0));
      const bell = mesh(cone(0.16, 0.22, 12), mat(0xd6483b, { emissive: 0xff5a3c, emissiveIntensity: 0 }), 0, 0, 0.16);
      bell.rotation.x = Math.PI / 2;
      g.add(bell);
      g.rotation.x = -0.5;
      parts.megaphone = g;
      break;
    }
    case 'book': {
      const g = group(hand, 0, -0.04, 0.08);
      g.add(mesh(box(0.24, 0.06, 0.18), mat(cfg.accent)));
      g.add(mesh(box(0.22, 0.02, 0.16), mat(0xf2ede0), 0, 0.04, 0));
      parts.book = g;
      break;
    }
    case 'coffee': {
      const g = group(hand, 0, -0.04, 0.06);
      g.add(mesh(cyl(0.06, 0.05, 0.14, 10), mat(0xf2ede0)));
      g.add(mesh(cyl(0.062, 0.062, 0.03, 10), mat(0xb5462f), 0, 0.06, 0));
      break;
    }
    case 'ladle': {
      const g = group(hand, 0, -0.1, 0.05);
      g.add(mesh(cyl(0.02, 0.02, 0.4, 6), steelM, 0, 0.12, 0));
      g.add(mesh(sph(0.09, 8), steelM, 0, 0.3, 0.02));
      g.rotation.x = -0.4;
      break;
    }
    case 'clipboard': {
      const g = group(hand, 0, -0.05, 0.08);
      g.add(mesh(box(0.2, 0.02, 0.26), mat(0x6a4a2a)));
      g.add(mesh(box(0.17, 0.03, 0.22), mat(0xf2ede0), 0, 0.02, 0));
      g.rotation.x = -0.5;
      break;
    }
    case 'torch': {
      const g = group(hand, 0, -0.05, 0.06);
      g.add(mesh(cyl(0.025, 0.03, 0.5, 6), woodM, 0, 0.18, 0));
      g.add(mesh(cone(0.09, 0.22, 8), mat(0xffa53c, { emissive: 0xff7a1c, emissiveIntensity: 1 }), 0, 0.5, 0));
      break;
    }
    case 'ballot': {
      const g = group(hand, 0, -0.04, 0.08);
      g.add(mesh(box(0.14, 0.16, 0.02), mat(0xf2ede0)));
      g.rotation.x = -0.3;
      break;
    }
    case 'can': {
      const g = group(hand, 0, -0.05, 0.06);
      g.add(mesh(cyl(0.06, 0.06, 0.12, 10), mat(0xb9c2c9, { metal: 0.5, rough: 0.4 })));
      break;
    }
    case 'craneHook': {
      const g = group(hand, 0, -0.06, 0.05);
      g.add(mesh(cyl(0.014, 0.014, 0.42, 5), steelM, 0, 0.08, 0)); // Kette/Stange
      g.add(mesh(cyl(0.05, 0.05, 0.14, 8), steelM, 0, -0.18, 0)); // Block
      const barb = mesh(cone(0.04, 0.12, 6), steelM, 0.05, -0.28, 0);
      barb.rotation.z = 0.6;
      g.add(barb);
      break;
    }
    case 'backpack':
      // am Rücken, siehe unten
      break;
    case 'bottleBag':
      // Pfand-Beutel am Rücken, siehe unten
      break;
  }
}

/** Ein vereinfachter Mini-Humanoid für Menschenmengen (nur Rumpf + Kopf). */
function addCrowdMember(parent: THREE.Object3D, cfg: HumanoidCfg, x: number, z: number, s: number) {
  const g = group(parent, x, 0, z);
  g.scale.setScalar(s);
  const clothM = mat(cfg.cloth);
  const skinM = mat(cfg.skin);
  g.add(mesh(box(0.34, 0.7, 0.24), clothM, 0, 0.7, 0));
  g.add(mesh(box(0.36, 0.14, 0.26), mat(cfg.accent), 0, 0.42, 0));
  g.add(mesh(sph(0.16, 8), skinM, 0, 1.16, 0));
  // zwei angedeutete Beine
  g.add(mesh(box(0.13, 0.42, 0.15), mat(cfg.pants ?? cfg.cloth), -0.09, 0.2, 0));
  g.add(mesh(box(0.13, 0.42, 0.15), mat(cfg.pants ?? cfg.cloth), 0.09, 0.2, 0));
  return g;
}

export function buildHumanoid(cfg: HumanoidCfg): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const s = cfg.scale ?? 1;
  const build = cfg.build ?? 'normal';
  const w = build === 'bulky' ? 1.28 : build === 'slim' ? 0.85 : 1;
  const hunch = build === 'hunched';

  const clothM = mat(cfg.cloth);
  const pantsM = mat(cfg.pants ?? cfg.cloth);
  const skinM = mat(cfg.skin);
  const accentM = mat(cfg.accent, { metal: 0.3, rough: 0.55 });
  const bootM = mat(0x3a2e22, { rough: 0.7 });

  const bodyScale = group(node, 0, 0, 0);
  bodyScale.scale.setScalar(s);

  // ---- Beine: Hüft-Pivots (Oberschenkel + Unterschenkel + Stiefel) ----
  for (const side of [-1, 1] as const) {
    const leg = group(bodyScale, 0.13 * w * side, 0.86, 0);
    parts[side < 0 ? 'legL' : 'legR'] = leg;
    leg.add(mesh(box(0.17 * w, 0.42, 0.19), pantsM, 0, -0.21, 0));
    const shin = group(leg, 0, -0.42, 0);
    shin.add(mesh(box(0.14 * w, 0.4, 0.16), pantsM, 0, -0.2, 0));
    shin.add(mesh(box(0.17 * w, 0.1, 0.28), bootM, 0, -0.4, 0.05));
  }

  // ---- Torso (Pivot an der Hüfte, für Atmen/Nicken) ----
  const chest = group(bodyScale, 0, 0.86, 0);
  parts.chest = chest;
  if (hunch) chest.rotation.x = 0.18;
  // Rumpf geschichtet: Bauch, Brust, Schultern
  chest.add(mesh(box(0.5 * w, 0.34, 0.3 * w), clothM, 0, 0.18, 0));
  chest.add(mesh(box(0.54 * w, 0.26, 0.32 * w), clothM, 0, 0.44, 0));
  chest.add(mesh(box(0.56 * w, 0.14, 0.34 * w), accentM, 0, 0.02, 0)); // Gürtel
  chest.add(mesh(box(0.62 * w, 0.12, 0.34 * w), clothM, 0, 0.58, 0)); // Schulterstück

  // ---- Kopf (Schädel, Kiefer, Nase, Augen, Brauen, Haar, Kopfbedeckung) ----
  const head = group(chest, 0, 0.82, 0.02);
  parts.head = head;
  head.add(mesh(sph(0.2, 9), skinM, 0, 0.06, 0)); // Schädel
  head.add(mesh(box(0.24, 0.12, 0.22), skinM, 0, -0.08, 0.03)); // Kiefer
  head.add(mesh(cone(0.045, 0.09, 6), skinM, 0, 0.02, 0.19)); // Nase
  head.add(mesh(sph(0.035, 6), mat(0x1a1a22), -0.08, 0.08, 0.16)); // Augen
  head.add(mesh(sph(0.035, 6), mat(0x1a1a22), 0.08, 0.08, 0.16));
  const browM = mat(cfg.hair ?? 0x3a2b1c);
  head.add(mesh(box(0.09, 0.02, 0.03), browM, -0.08, 0.15, 0.17)); // Brauen
  head.add(mesh(box(0.09, 0.02, 0.03), browM, 0.08, 0.15, 0.17));
  if (cfg.hair !== undefined && (cfg.headgear === undefined || cfg.headgear === 'none')) {
    head.add(mesh(sph(0.21, 9), browM, 0, 0.12, -0.02)); // Haar-Kappe
  }
  if (cfg.beard) {
    head.add(mesh(box(0.2, 0.14, 0.12), browM, 0, -0.12, 0.12));
  }

  // Kopfbedeckungen
  const steelM = mat(STEEL, { metal: 0.7, rough: 0.35 });
  switch (cfg.headgear) {
    case 'kettle':
      head.add(mesh(cyl(0.22, 0.26, 0.1, 12), steelM, 0, 0.2, 0));
      break;
    case 'greathelm':
      head.add(mesh(cyl(0.21, 0.22, 0.34, 12), steelM, 0, 0.1, 0));
      head.add(mesh(box(0.32, 0.03, 0.1), mat(0x222833), 0, 0.08, 0.19));
      break;
    case 'plume':
      head.add(mesh(cyl(0.19, 0.22, 0.16, 12), accentM, 0, 0.22, 0));
      head.add(mesh(cone(0.06, 0.32, 6), mat(0xd64545), 0, 0.42, -0.05));
      break;
    case 'beanie':
      head.add(mesh(sph(0.22, 9), mat(cfg.accent), 0, 0.14, 0));
      head.add(mesh(cyl(0.22, 0.22, 0.08, 12), mat(cfg.accent), 0, 0.06, 0));
      break;
    case 'cap':
      head.add(mesh(sph(0.21, 9), mat(cfg.accent), 0, 0.14, 0));
      head.add(mesh(box(0.28, 0.03, 0.16), mat(cfg.accent), 0, 0.12, 0.18)); // Schirm
      break;
    case 'hood':
      head.add(mesh(sph(0.26, 9), mat(cfg.cloth), 0, 0.1, -0.03));
      break;
    case 'hardhat':
      head.add(mesh(sph(0.23, 10), mat(0xf2c531, { rough: 0.5 }), 0, 0.16, 0));
      head.add(mesh(cyl(0.26, 0.26, 0.04, 12), mat(0xf2c531, { rough: 0.5 }), 0, 0.08, 0));
      break;
  }

  // ---- Arme: Schulter-Pivots (Ober-/Unterarm + Hand) ----
  const hands: Record<'L' | 'R', THREE.Group> = {} as never;
  for (const side of [-1, 1] as const) {
    const key = side < 0 ? 'armL' : 'armR';
    const arm = group(chest, 0.34 * w * side, 0.5, 0);
    parts[key] = arm;
    arm.add(mesh(box(0.13, 0.3, 0.15), clothM, 0, -0.15, 0));
    const fore = group(arm, 0, -0.3, 0.0);
    fore.add(mesh(box(0.11, 0.28, 0.13), skinM, 0, -0.14, 0));
    const hand = group(fore, 0, -0.3, 0.02);
    hand.add(mesh(sph(0.08, 7), skinM));
    hands[side < 0 ? 'L' : 'R'] = hand;
  }

  // ---- Requisiten ----
  for (const p of cfg.props ?? []) addProp(hands.R, p, cfg, parts);
  for (const p of cfg.leftProps ?? []) addProp(hands.L, p, cfg, parts);

  // Rücken-Requisiten
  if (cfg.props?.includes('backpack')) {
    chest.add(mesh(box(0.34, 0.42, 0.2), mat(cfg.accent), 0, 0.3, -0.22));
  }
  if (cfg.props?.includes('bottleBag')) {
    const bag = group(chest, 0, 0.28, -0.24);
    bag.add(mesh(box(0.34, 0.46, 0.22), mat(0x6a5a3a), 0, 0, 0));
    for (let i = 0; i < 3; i++) {
      bag.add(mesh(cyl(0.04, 0.05, 0.18, 8), mat(0x4a9d6a, { glass: true }), -0.1 + i * 0.1, 0.3, 0.02));
    }
  }

  // ---- Umhang ----
  if (cfg.cape !== undefined) {
    const cape = group(chest, 0, 0.5, -0.18 * w);
    parts.cape = cape;
    cape.add(mesh(box(0.5 * w, 0.9, 0.05), mat(cfg.cape), 0, -0.38, 0));
    cape.rotation.x = 0.1;
  }

  // ---- Menschenmenge: kleinere Kopien dahinter ----
  if (cfg.crowd) {
    const crowd = group(bodyScale, 0, 0, 0);
    parts.crowd = crowd;
    addCrowdMember(crowd, cfg, -0.38, -0.3, 0.78);
    addCrowdMember(crowd, cfg, 0.4, -0.34, 0.72);
    if (cfg.crowd === 3) addCrowdMember(crowd, cfg, 0.02, -0.55, 0.68);
  }

  // ---- Clips ----
  const idle: Clip = {
    duration: 3.2,
    tracks: [
      wave('chest', 'pos.y', 0.02, 3.2),
      wave('chest', 'rot.z', 0.03, 3.2, 0.25),
      wave('head', 'rot.y', 0.16, 3.2, 0.1),
      wave('head', 'rot.x', 0.05, 3.2, 0.3),
      wave('armL', 'rot.x', 0.06, 3.2),
      wave('armR', 'rot.x', 0.06, 3.2, 0.5),
      wave('legL', 'rot.x', 0.025, 3.2),
      wave('legR', 'rot.x', 0.025, 3.2, 0.5)
    ]
  };
  if (parts.banner) idle.tracks.push(wave('banner', 'rot.y', 0.25, 3.2, 0.15));
  if (parts.cape) idle.tracks.push(wave('cape', 'rot.x', 0.06, 3.2, 0, 0.02));
  if (parts.staffGlow) idle.tracks.push(wave('staffGlow', 'emissive', 0.4, 3.2, 0, 0.4));
  if (parts.crowd) idle.tracks.push(wave('crowd', 'pos.y', 0.03, 3.2, 0.4));

  const walk: Clip = {
    duration: 0.62,
    tracks: [
      wave('legL', 'rot.x', 0.7, 0.62),
      wave('legR', 'rot.x', 0.7, 0.62, 0.5),
      wave('armL', 'rot.x', 0.5, 0.62, 0.5),
      wave('armR', 'rot.x', 0.5, 0.62),
      wave('chest', 'pos.y', 0.04, 0.62, 0, 0),
      wave('head', 'rot.x', 0.06, 0.62, 0.25)
    ]
  };

  const style: AttackStyle = cfg.attack ?? 'swing';
  const attack = buildAttackClip(style, parts);
  const melee = style === 'swing' || style === 'thrust' || style === 'bannerWave';

  return { node, parts, clips: { idle, attack, walk }, melee };
}

function buildAttackClip(style: AttackStyle, parts: Record<string, THREE.Object3D>): Clip {
  switch (style) {
    case 'thrust':
      return {
        duration: 0.5,
        tracks: [
          track('armR', 'rot.x', [[0, 0], [0.15, -0.5], [0.32, -1.5], [0.5, 0]]),
          track('chest', 'rot.y', [[0, 0], [0.3, 0.22], [0.5, 0]]),
          ...(parts.cape ? [track('cape', 'rot.x', [[0, 0], [0.3, 0.5], [0.5, 0]])] : [])
        ]
      };
    case 'bannerWave':
      return {
        duration: 0.5,
        tracks: [
          track('armR', 'rot.x', [[0, 0], [0.2, -1.4], [0.38, 0.3], [0.5, 0]]),
          ...(parts.banner ? [track('banner', 'rot.z', [[0, 0], [0.25, 0.7], [0.5, 0]])] : []),
          track('chest', 'rot.x', [[0, 0], [0.2, -0.12], [0.38, 0.15], [0.5, 0]])
        ]
      };
    case 'megaphone':
      return {
        duration: 0.5,
        tracks: [
          track('chest', 'rot.x', [[0, 0], [0.2, -0.16], [0.5, 0]]),
          track('head', 'rot.x', [[0, 0], [0.2, -0.12], [0.5, 0]]),
          ...(parts.megaphone
            ? [
                track('megaphone', 'scale', [[0, 1], [0.15, 1.18], [0.35, 1.0], [0.5, 1]]),
                track('megaphone', 'emissive', [[0, 0], [0.15, 1.1], [0.5, 0]])
              ]
            : [])
        ]
      };
    case 'bookThrow':
      return {
        duration: 0.5,
        tracks: [
          track('armR', 'rot.x', [[0, 0], [0.15, -1.3], [0.32, 0.5], [0.5, 0]]),
          ...(parts.book ? [track('book', 'pos.z', [[0, 0], [0.3, 0.35], [0.5, 0]])] : []),
          track('chest', 'rot.x', [[0, 0], [0.3, 0.1], [0.5, 0]])
        ]
      };
    case 'stand':
      return {
        duration: 0.5,
        tracks: [
          track('chest', 'rot.x', [[0, 0], [0.2, -0.14], [0.5, 0]]),
          track('head', 'rot.x', [[0, 0], [0.2, -0.1], [0.5, 0]])
        ]
      };
    case 'swing':
    default:
      return {
        duration: 0.5,
        tracks: [
          track('armR', 'rot.x', [[0, 0], [0.17, -2.0], [0.32, 0.6], [0.5, 0]]),
          track('chest', 'rot.x', [[0, 0], [0.17, -0.12], [0.32, 0.22], [0.5, 0]])
        ]
      };
  }
}
