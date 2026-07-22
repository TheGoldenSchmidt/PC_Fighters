// Säugetiere auf vier Beinen (Katzen, Hunde/Wölfe, Bär, Nager).
//
// buildQuadruped(cfg) baut einen dichten Ico-Körper mit Kopf (Wangen, cremefarbene
// Schnauze, Nase), Ohren mit Innenseite, optionalen Schnurrhaaren/Mähne/Ohrbüscheln
// und glühenden Augen, vier Beinen mit Pfoten und einem Schwanz. `pack` klont
// kleinere Kopien (Meute). Idle/Walk/Attack laufen über Clips.

import * as THREE from 'three';
import { type Rig, type Clip, sph, cyl, cone, box, ico, mat, mesh, group, track, wave } from './core';

export type QuadKind = 'cat' | 'dog' | 'bear' | 'rodent';
export type QuadAttack = 'bite' | 'roar' | 'pounce';

export interface QuadCfg {
  kind: QuadKind;
  fur: number;
  belly?: number;
  scale: number;
  eyes?: number; // glühende Augen (Puma/Alphawolf)
  mane?: boolean; // Nackenkamm (Alphawolf)
  tufts?: boolean; // Ohrbüschel (Luchs)
  whiskers?: boolean; // Schnurrhaare (Katzen)
  tail: 'thin' | 'bushy' | 'stub' | 'long';
  pack?: 2 | 3;
  attack?: QuadAttack;
}

function buildOne(cfg: QuadCfg, parts: Record<string, THREE.Object3D> | null): THREE.Group {
  const node = new THREE.Group();
  const s = cfg.scale;
  const furM = mat(cfg.fur);
  const bellyM = mat(cfg.belly ?? cfg.fur);
  const creamM = mat(cfg.belly ?? 0xd9c9a8);
  const eyeM = mat(cfg.eyes ?? 0x14141c, cfg.eyes ? { emissive: cfg.eyes, emissiveIntensity: 0.8 } : {});
  const noseM = mat(0x2b2b33);
  const innerEarM = mat(0xd8a0a8);

  const bear = cfg.kind === 'bear';
  const rodent = cfg.kind === 'rodent';

  // Körper: gestreckter Ico (dichter als eine Box), Pivot fürs Auf-und-ab
  const body = group(node, 0, 0.5 * s, 0);
  if (parts) parts.body = body;
  const torso = mesh(ico(0.34 * s, 1), furM, 0, 0, 0);
  torso.scale.set(0.8, 0.82, 1.4);
  body.add(torso);
  const belly = mesh(ico(0.28 * s, 1), bellyM, 0, -0.16 * s, 0.04 * s);
  belly.scale.set(0.72, 0.6, 1.2);
  body.add(belly);
  if (cfg.mane) {
    body.add(mesh(cone(0.18 * s, 0.34 * s, 6), furM, 0, 0.24 * s, 0.16 * s));
    body.add(mesh(cone(0.15 * s, 0.28 * s, 6), furM, 0, 0.22 * s, -0.04 * s));
  }

  // Hals + Kopf (Pivot am Hals: Schnüffeln/Beißen)
  const head = group(body, 0, 0.18 * s, 0.42 * s);
  if (parts) parts.head = head;
  const skull = mesh(ico(0.24 * s, 1), furM, 0, 0.06 * s, 0.04 * s);
  skull.scale.set(1, 0.92, 1);
  head.add(skull);
  // Wangen
  head.add(mesh(sph(0.1 * s, 7), furM, -0.15 * s, -0.02 * s, 0.02 * s));
  head.add(mesh(sph(0.1 * s, 7), furM, 0.15 * s, -0.02 * s, 0.02 * s));
  // Schnauze (cremefarben) + Nase
  const snoutLen = bear ? 0.24 : rodent ? 0.3 : 0.22;
  head.add(mesh(box(0.17 * s, 0.15 * s, snoutLen * s), creamM, 0, -0.02 * s, (0.2 + snoutLen / 2) * s));
  head.add(mesh(sph(0.05 * s, 6), noseM, 0, 0.02 * s, (0.22 + snoutLen) * s));
  // Augen + Brauen
  head.add(mesh(sph(0.05 * s, 6), eyeM, -0.1 * s, 0.12 * s, 0.2 * s));
  head.add(mesh(sph(0.05 * s, 6), eyeM, 0.1 * s, 0.12 * s, 0.2 * s));
  // Ohren mit Innenseite
  const earR = bear ? 0.1 : 0.08;
  for (const side of [-1, 1] as const) {
    if (bear || rodent) {
      head.add(mesh(sph(earR * s * (rodent ? 1.4 : 1), 7), furM, 0.14 * s * side, 0.26 * s, -0.02 * s));
      head.add(mesh(sph(earR * 0.6 * s * (rodent ? 1.4 : 1), 6), innerEarM, 0.14 * s * side, 0.27 * s, 0.01 * s));
    } else {
      const ear = mesh(cone(0.08 * s, 0.22 * s, 5), furM, 0.13 * s * side, 0.3 * s, -0.01 * s);
      head.add(ear);
      head.add(mesh(cone(0.045 * s, 0.14 * s, 5), innerEarM, 0.13 * s * side, 0.3 * s, 0.02 * s));
      if (cfg.tufts) head.add(mesh(cone(0.02 * s, 0.14 * s, 4), furM, 0.13 * s * side, 0.46 * s, -0.02 * s));
    }
  }
  // Schnurrhaare
  if (cfg.whiskers) {
    for (const side of [-1, 1] as const) {
      for (const dy of [-0.02, 0.02]) {
        const wh = mesh(cyl(0.004 * s, 0.004 * s, 0.28 * s, 3), noseM, 0.16 * s * side, dy * s, (0.24 + snoutLen) * s);
        wh.rotation.z = Math.PI / 2;
        wh.rotation.y = 0.3 * side;
        head.add(wh);
      }
    }
  }

  // Vier Beine (Ober-/Unterbein + Pfote), Pivots oben für den Trab
  const legDefs: [string, number, number][] = [
    ['legFL', -0.18, 0.34],
    ['legFR', 0.18, 0.34],
    ['legBL', -0.18, -0.32],
    ['legBR', 0.18, -0.32]
  ];
  for (const [name, lx, lz] of legDefs) {
    const leg = group(body, lx * s, -0.16 * s, lz * s);
    if (parts) parts[name] = leg;
    leg.add(mesh(box(0.12 * s, 0.22 * s, 0.13 * s), furM, 0, -0.11 * s, 0));
    leg.add(mesh(box(0.11 * s, 0.16 * s, 0.12 * s), furM, 0, -0.28 * s, 0.01 * s));
    leg.add(mesh(box(0.13 * s, 0.06 * s, 0.16 * s), creamM, 0, -0.36 * s, 0.03 * s)); // Pfote
  }

  // Schwanz
  const tail = group(body, 0, 0.06 * s, -0.46 * s);
  if (parts) parts.tail = tail;
  if (cfg.tail === 'thin') {
    tail.add(mesh(cyl(0.02 * s, 0.035 * s, 0.5 * s, 6), mat(0xc98f96), 0, 0.05 * s, -0.24 * s));
    tail.rotation.x = 1.1;
  } else if (cfg.tail === 'bushy') {
    tail.add(mesh(cone(0.11 * s, 0.55 * s, 6), furM, 0, 0.12 * s, -0.22 * s));
    tail.add(mesh(sph(0.09 * s, 6), creamM, 0, 0.24 * s, -0.44 * s)); // helle Spitze
    tail.rotation.x = 1.7;
  } else if (cfg.tail === 'long') {
    tail.add(mesh(cyl(0.04 * s, 0.05 * s, 0.6 * s, 6), furM, 0, 0.05 * s, -0.3 * s));
    tail.add(mesh(sph(0.06 * s, 6), mat(0x1a1a1a), 0, 0.08 * s, -0.6 * s)); // dunkle Spitze
    tail.rotation.x = 1.3;
  } else {
    tail.add(mesh(sph(0.09 * s, 6), furM));
  }

  return node;
}

export function buildQuadruped(cfg: QuadCfg): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  node.add(buildOne(cfg, parts));

  // Meute: kleinere Kopien seitlich versetzt (nur Optik, keine Eigenanimation)
  if (cfg.pack) {
    const packG = group(node, 0, 0, 0);
    parts.pack = packG;
    const memberCfg: QuadCfg = { ...cfg, pack: undefined, scale: cfg.scale * 0.72 };
    const m1 = buildOne(memberCfg, null);
    m1.position.set(-0.55 * cfg.scale, 0, -0.3 * cfg.scale);
    m1.rotation.y = 0.4;
    packG.add(m1);
    const m2 = buildOne(memberCfg, null);
    m2.position.set(0.5 * cfg.scale, 0, -0.4 * cfg.scale);
    m2.rotation.y = -0.5;
    packG.add(m2);
    if (cfg.pack === 3) {
      const m3 = buildOne({ ...memberCfg, scale: cfg.scale * 0.6 }, null);
      m3.position.set(0.05 * cfg.scale, 0, -0.7 * cfg.scale);
      packG.add(m3);
    }
  }

  const idle: Clip = {
    duration: 2.8,
    tracks: [
      wave('body', 'pos.y', 0.02, 2.8),
      wave('head', 'rot.x', 0.1, 2.8, 0.15),
      wave('head', 'rot.y', 0.2, 2.8, 0.3),
      wave('tail', 'rot.z', 0.35, 2.4, 0),
      wave('legFL', 'rot.x', 0.04, 2.8),
      wave('legBR', 'rot.x', 0.04, 2.8, 0.5)
    ]
  };
  if (parts.pack) idle.tracks.push(wave('pack', 'pos.y', 0.03, 2.4, 0.4));

  const walk: Clip = {
    duration: 0.5,
    tracks: [
      wave('body', 'pos.y', 0.04, 0.5),
      wave('legFL', 'rot.x', 0.7, 0.5),
      wave('legFR', 'rot.x', 0.7, 0.5, 0.5),
      wave('legBL', 'rot.x', 0.7, 0.5, 0.5),
      wave('legBR', 'rot.x', 0.7, 0.5),
      wave('tail', 'rot.z', 0.4, 0.5, 0),
      wave('head', 'rot.x', 0.08, 0.5, 0.25, -0.08)
    ]
  };

  const attack = buildQuadAttack(cfg.attack ?? 'bite');
  return { node, parts, clips: { idle, attack, walk }, melee: true };
}

function buildQuadAttack(style: QuadAttack): Clip {
  switch (style) {
    case 'roar':
      // Rudel-Brüllen: Körper richtet sich auf, Kopf hoch, Puls-Skalierung
      return {
        duration: 0.5,
        tracks: [
          track('body', 'rot.x', [[0, 0], [0.2, 0.3], [0.4, 0.1], [0.5, 0]]),
          track('head', 'rot.x', [[0, 0], [0.2, -0.5], [0.4, -0.3], [0.5, 0]]),
          track('body', 'scale', [[0, 1], [0.2, 1.12], [0.4, 1.04], [0.5, 1]]),
          track('tail', 'rot.z', [[0, 0], [0.25, 0.5], [0.5, 0]])
        ]
      };
    case 'pounce':
      // Sprung: Körper duckt, dann nach vorn-oben
      return {
        duration: 0.5,
        tracks: [
          track('body', 'rot.x', [[0, 0], [0.2, -0.35], [0.45, 0.2], [0.5, 0]]),
          track('body', 'pos.y', [[0, 0], [0.2, -0.05], [0.45, 0.12], [0.5, 0]]),
          track('head', 'rot.x', [[0, 0], [0.45, 0.5], [0.5, 0.2]])
        ]
      };
    case 'bite':
    default:
      // Sprung-Biss: Körper duckt sich, Kopf stößt nach vorn
      return {
        duration: 0.5,
        tracks: [
          track('body', 'rot.x', [[0, 0], [0.35, -0.25], [0.5, 0]]),
          track('head', 'rot.x', [[0, 0], [0.35, 0.55], [0.5, 0]])
        ]
      };
  }
}
