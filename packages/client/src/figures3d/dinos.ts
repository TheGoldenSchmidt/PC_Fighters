// Dinosaurier: zweibeinige Theropoden (Compsognathus … T-Rex, Spinosaurus mit
// Segel) und vierbeinige Sauropoden/Ceratopsier/Stegosaurier.

import * as THREE from 'three';
import { type Rig, type Clip, sph, cyl, cone, box, ico, mat, mesh, group, track, wave } from './core';

// ---------------------------------------------------------------------------
// Theropoden (zweibeinig)
// ---------------------------------------------------------------------------

export interface DinoBipedCfg {
  skin: number;
  belly?: number;
  scale: number;
  sail?: boolean; // Spinosaurus
  attack?: 'chomp' | 'roar';
}

export function buildDinoBiped(cfg: DinoBipedCfg): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const s = cfg.scale;
  const skinM = mat(cfg.skin);
  const bellyM = mat(cfg.belly ?? cfg.skin);
  const toothM = mat(0xf2ede0);

  // Hüfte als Hauptpivot; Körper lehnt nach vorn, Schwanz balanciert hinten
  const body = group(node, 0, 0.82 * s, 0);
  parts.body = body;
  body.rotation.x = 0.35;
  const torso = mesh(ico(0.36 * s, 1), skinM, 0, 0, 0.05 * s);
  torso.scale.set(0.8, 0.9, 1.4);
  body.add(torso);
  body.add(mesh(box(0.4 * s, 0.4 * s, 0.5 * s), bellyM, 0, -0.12 * s, 0.2 * s));
  if (cfg.sail) {
    // Rückensegel (Spinosaurus): hohe, in z abgeflachte Membran entlang des Rückens
    const sail = mesh(cone(0.55 * s, 0.7 * s, 3), mat(cfg.belly ?? cfg.skin, { rough: 0.7 }), 0, 0.32 * s, 0.02 * s);
    sail.scale.set(1, 1, 0.14);
    body.add(sail);
  }

  // Hals + Kopf mit Ober-/Unterkiefer
  const head = group(body, 0, 0.34 * s, 0.34 * s);
  parts.head = head;
  head.rotation.x = -0.35;
  const skull = mesh(ico(0.22 * s, 1), skinM, 0, 0.04 * s, 0.06 * s);
  skull.scale.set(1, 0.9, 1.2);
  head.add(skull);
  const upper = mesh(box(0.24 * s, 0.14 * s, cfg.sail ? 0.5 * s : 0.34 * s), skinM, 0, 0.02 * s, (cfg.sail ? 0.32 : 0.24) * s);
  head.add(upper);
  const jaw = group(head, 0, -0.08 * s, 0.12 * s);
  parts.jaw = jaw;
  jaw.add(mesh(box(0.22 * s, 0.1 * s, (cfg.sail ? 0.46 : 0.3) * s), skinM, 0, 0, (cfg.sail ? 0.2 : 0.12) * s));
  // Zähne
  for (let i = 0; i < 4; i++) {
    head.add(mesh(cone(0.02 * s, 0.07 * s, 4), toothM, -0.08 + (i % 2) * 0.16, -0.04 * s, (0.2 + i * 0.06) * s));
  }
  head.add(mesh(sph(0.045 * s, 6), mat(0xffb400, { emissive: 0x6a4a00, emissiveIntensity: 0.5 }), -0.11 * s, 0.12 * s, 0.06 * s));
  head.add(mesh(sph(0.045 * s, 6), mat(0xffb400, { emissive: 0x6a4a00, emissiveIntensity: 0.5 }), 0.11 * s, 0.12 * s, 0.06 * s));

  // kleine Arme
  for (const side of [-1, 1] as const) {
    const arm = group(body, 0.24 * s * side, 0.08 * s, 0.24 * s);
    parts[side < 0 ? 'armL' : 'armR'] = arm;
    arm.rotation.x = -0.7;
    arm.add(mesh(box(0.07 * s, 0.22 * s, 0.08 * s), skinM, 0, -0.11 * s, 0));
    arm.add(mesh(cone(0.03 * s, 0.08 * s, 4), toothM, 0, -0.24 * s, 0.02 * s));
  }

  // kräftige Hinterbeine
  for (const side of [-1, 1] as const) {
    const leg = group(node, 0.18 * s * side, 0.82 * s, 0);
    parts[side < 0 ? 'legL' : 'legR'] = leg;
    leg.add(mesh(box(0.2 * s, 0.4 * s, 0.24 * s), skinM, 0, -0.2 * s, 0)); // Oberschenkel
    const shin = group(leg, 0, -0.4 * s, 0);
    shin.add(mesh(box(0.14 * s, 0.36 * s, 0.16 * s), skinM, 0, -0.18 * s, 0.02 * s));
    shin.add(mesh(box(0.2 * s, 0.08 * s, 0.3 * s), skinM, 0, -0.36 * s, 0.08 * s)); // Fuß
    for (let i = -1; i <= 1; i++) shin.add(mesh(cone(0.03 * s, 0.1 * s, 4), toothM, i * 0.06 * s, -0.4 * s, 0.22 * s));
  }

  // langer Balance-Schwanz
  const tail = group(body, 0, -0.16 * s, -0.42 * s);
  parts.tail = tail;
  const tailMesh = mesh(cone(0.2 * s, 1.1 * s, 6), skinM, 0, 0, -0.55 * s);
  tailMesh.rotation.x = -Math.PI / 2;
  tail.add(tailMesh);
  tail.rotation.x = -0.35;

  const idle: Clip = {
    duration: 3.0,
    tracks: [
      wave('body', 'pos.y', 0.02, 3.0),
      wave('head', 'rot.y', 0.14, 2.6, 0.2),
      wave('head', 'rot.x', 0.06, 3.0, 0.1, -0.35),
      wave('tail', 'rot.y', 0.12, 3.0),
      wave('jaw', 'rot.x', 0.05, 2.0, 0, 0.03),
      wave('armL', 'rot.x', 0.1, 2.4, 0, -0.7),
      wave('armR', 'rot.x', 0.1, 2.4, 0.5, -0.7)
    ]
  };
  const walk: Clip = {
    duration: 0.7,
    tracks: [
      wave('legL', 'rot.x', 0.6, 0.7),
      wave('legR', 'rot.x', 0.6, 0.7, 0.5),
      wave('body', 'pos.y', 0.05, 0.7),
      wave('body', 'rot.z', 0.04, 0.7, 0.25),
      wave('tail', 'rot.y', 0.25, 0.7)
    ]
  };
  const attack: Clip =
    (cfg.attack ?? 'chomp') === 'roar'
      ? {
          duration: 0.5,
          tracks: [
            track('body', 'rot.x', [[0, 0.35], [0.2, 0.1], [0.4, 0.25], [0.5, 0.35]]),
            track('head', 'rot.x', [[0, -0.35], [0.2, -0.9], [0.4, -0.6], [0.5, -0.35]]),
            track('jaw', 'rot.x', [[0, 0.03], [0.2, 0.7], [0.5, 0.03]]),
            track('body', 'scale', [[0, 1], [0.2, 1.1], [0.4, 1.03], [0.5, 1]]),
            track('tail', 'rot.y', [[0, 0], [0.25, 0.4], [0.5, 0]])
          ]
        }
      : {
          duration: 0.5,
          tracks: [
            track('head', 'rot.x', [[0, -0.35], [0.2, 0.1], [0.35, -0.6], [0.5, -0.35]]),
            track('jaw', 'rot.x', [[0, 0.03], [0.18, 0.7], [0.32, 0.0], [0.5, 0.03]]),
            track('body', 'rot.x', [[0, 0.35], [0.25, 0.5], [0.5, 0.35]]),
            track('tail', 'rot.y', [[0, 0], [0.3, 0.3], [0.5, 0]])
          ]
        };

  return { node, parts, clips: { idle, attack, walk }, melee: true };
}

// ---------------------------------------------------------------------------
// Vierbeiner (Triceratops / Stegosaurus / Brachiosaurus)
// ---------------------------------------------------------------------------

export interface DinoQuadCfg {
  skin: number;
  belly?: number;
  scale: number;
  kind: 'frill' | 'plates' | 'longneck';
}

export function buildDinoQuadruped(cfg: DinoQuadCfg): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const s = cfg.scale;
  const skinM = mat(cfg.skin);
  const bellyM = mat(cfg.belly ?? cfg.skin);
  const boneM = mat(0xe8ddc4);

  const bodyH = cfg.kind === 'longneck' ? 0.85 * s : 0.6 * s;
  const body = group(node, 0, bodyH, 0);
  parts.body = body;
  const torso = mesh(ico(0.42 * s, 1), skinM, 0, 0, 0);
  torso.scale.set(0.85, 0.85, 1.5);
  body.add(torso);
  body.add(mesh(box(0.5 * s, 0.2 * s, 0.9 * s), bellyM, 0, -0.28 * s, 0));

  if (cfg.kind === 'plates') {
    // Stegosaurus: Rückenplatten + Schwanzstacheln
    for (let i = 0; i < 5; i++) {
      const plate = mesh(cone(0.16 * s, 0.34 * s, 4), mat(cfg.belly ?? 0x8a5a3a), 0, 0.34 * s, (0.4 - i * 0.2) * s);
      plate.scale.set(1, 1, 0.35);
      body.add(plate);
    }
  }

  // Hals + Kopf
  const neckLen = cfg.kind === 'longneck' ? 1.1 * s : 0.3 * s;
  const neck = group(body, 0, cfg.kind === 'longneck' ? 0.2 * s : 0.05 * s, 0.4 * s);
  parts.neck = neck;
  if (cfg.kind === 'longneck') {
    neck.rotation.x = -0.9;
    neck.add(mesh(cyl(0.13 * s, 0.2 * s, neckLen, 8), skinM, 0, neckLen / 2, 0));
  } else {
    neck.add(mesh(cyl(0.2 * s, 0.24 * s, neckLen, 8), skinM, 0, neckLen / 2, 0.02 * s));
  }
  const head = group(neck, 0, neckLen, cfg.kind === 'longneck' ? 0 : 0.02 * s);
  parts.head = head;
  if (cfg.kind === 'longneck') head.rotation.x = 0.9;
  head.add(mesh(ico(0.18 * s, 1), skinM, 0, 0, 0.06 * s));
  head.add(mesh(box(0.18 * s, 0.12 * s, 0.24 * s), skinM, 0, -0.03 * s, 0.2 * s)); // Schnauze
  head.add(mesh(sph(0.035 * s, 6), mat(0x14141c), -0.09 * s, 0.06 * s, 0.14 * s));
  head.add(mesh(sph(0.035 * s, 6), mat(0x14141c), 0.09 * s, 0.06 * s, 0.14 * s));

  if (cfg.kind === 'frill') {
    // Triceratops: Nackenschild + drei Hörner
    const frill = mesh(cyl(0.4 * s, 0.4 * s, 0.06 * s, 12), mat(cfg.belly ?? 0x8a6a45), 0, 0.08 * s, -0.16 * s);
    frill.rotation.x = Math.PI / 2 + 0.3;
    head.add(frill);
    head.add(mesh(cone(0.05 * s, 0.28 * s, 6), boneM, 0, 0.16 * s, 0.24 * s)); // Nasenhorn
    for (const side of [-1, 1] as const) {
      const horn = mesh(cone(0.05 * s, 0.4 * s, 6), boneM, 0.12 * s * side, 0.2 * s, 0.1 * s);
      horn.rotation.x = -0.6;
      head.add(horn);
    }
  }

  // vier Säulenbeine (vorne höher bei longneck)
  const frontH = cfg.kind === 'longneck' ? 0.5 * s : 0.34 * s;
  const backH = 0.34 * s;
  for (const [name, x, z, h] of [
    ['legFL', -0.24, 0.34, frontH],
    ['legFR', 0.24, 0.34, frontH],
    ['legBL', -0.24, -0.34, backH],
    ['legBR', 0.24, -0.34, backH]
  ] as const) {
    const leg = group(body, x * s, -0.2 * s, z * s);
    parts[name] = leg;
    leg.add(mesh(box(0.18 * s, h, 0.2 * s), skinM, 0, -h / 2, 0));
    leg.add(mesh(box(0.2 * s, 0.08 * s, 0.24 * s), skinM, 0, -h, 0.02 * s));
  }

  // Schwanz
  const tail = group(body, 0, -0.05 * s, -0.5 * s);
  parts.tail = tail;
  const tailLen = cfg.kind === 'longneck' ? 1.2 * s : 0.8 * s;
  const tailMesh = mesh(cone(0.2 * s, tailLen, 6), skinM, 0, 0, -tailLen / 2);
  tailMesh.rotation.x = -Math.PI / 2;
  tail.add(tailMesh);
  if (cfg.kind === 'plates') {
    for (const side of [-1, 1] as const) {
      const spike = mesh(cone(0.03 * s, 0.24 * s, 5), boneM, 0.08 * s * side, 0.05 * s, -tailLen * 0.85);
      spike.rotation.x = -1.9;
      spike.rotation.z = side * 0.4;
      tail.add(spike);
    }
  }

  const longneck = cfg.kind === 'longneck';
  const idle: Clip = {
    duration: 3.4,
    tracks: [
      wave('body', 'pos.y', 0.015, 3.4),
      wave('neck', 'rot.z', 0.06, 3.4, 0.1, longneck ? 0 : 0),
      wave('neck', 'rot.x', 0.05, 3.0, 0.2, longneck ? -0.9 : 0),
      wave('head', 'rot.y', 0.18, 2.6, 0.2),
      wave('tail', 'rot.y', 0.18, 3.0)
    ]
  };
  const walk: Clip = {
    duration: 0.8,
    tracks: [
      wave('legFL', 'rot.x', 0.4, 0.8),
      wave('legFR', 'rot.x', 0.4, 0.8, 0.5),
      wave('legBL', 'rot.x', 0.4, 0.8, 0.5),
      wave('legBR', 'rot.x', 0.4, 0.8),
      wave('body', 'pos.y', 0.03, 0.8),
      wave('tail', 'rot.y', 0.2, 0.8)
    ]
  };
  const attack: Clip = longneck
    ? {
        // Brachiosaurus: Hals-Stampfer nach vorn-unten
        duration: 0.5,
        tracks: [
          track('neck', 'rot.x', [[0, -0.9], [0.25, -0.3], [0.4, -1.1], [0.5, -0.9]]),
          track('body', 'pos.y', [[0, 0], [0.3, -0.05], [0.5, 0]])
        ]
      }
    : {
        // Triceratops/Stegosaurus: Kopf-/Körperstoß nach vorn
        duration: 0.5,
        tracks: [
          track('body', 'pos.z', [[0, 0], [0.3, 0.2], [0.5, 0]]),
          track('neck', 'rot.x', [[0, 0], [0.25, 0.3], [0.5, 0]]),
          track('head', 'rot.x', [[0, 0], [0.25, 0.4], [0.5, 0]]),
          track('tail', 'rot.y', [[0, 0], [0.25, 0.35], [0.5, 0]])
        ]
      };

  return { node, parts, clips: { idle, attack, walk }, melee: true };
}
