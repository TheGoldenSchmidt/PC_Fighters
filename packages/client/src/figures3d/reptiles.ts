// Reptilien: Echsen (Eidechse/Gecko/Waran), Schlangen (inkl. Kobra/Klapperschlange/
// Ur-Schlange), Schildkröte und Krokodil.

import * as THREE from 'three';
import { type Rig, type Clip, sph, cyl, cone, box, ico, mat, mesh, group, track, wave } from './core';

// ---------------------------------------------------------------------------
// Echsen
// ---------------------------------------------------------------------------

export interface LizardCfg {
  skin: number;
  belly?: number;
  scale: number;
  frill?: boolean; // Nackenkamm (Waran größer)
}

export function buildLizard(cfg: LizardCfg): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const s = cfg.scale;
  const skinM = mat(cfg.skin);
  const bellyM = mat(cfg.belly ?? cfg.skin);

  const body = group(node, 0, 0.24 * s, 0);
  parts.body = body;
  const torso = mesh(ico(0.26 * s, 1), skinM, 0, 0, 0);
  torso.scale.set(0.8, 0.62, 1.5);
  body.add(torso);
  body.add(mesh(box(0.34 * s, 0.1 * s, 0.7 * s), bellyM, 0, -0.12 * s, 0));
  // Rückenschuppen
  for (let i = 0; i < 4; i++) {
    body.add(mesh(cone(0.05 * s, 0.12 * s, 4), skinM, 0, 0.16 * s, (0.2 - i * 0.16) * s));
  }

  const head = group(body, 0, 0.02 * s, 0.42 * s);
  parts.head = head;
  head.add(mesh(ico(0.16 * s, 1), skinM, 0, 0.02 * s, 0.04 * s));
  head.add(mesh(box(0.16 * s, 0.08 * s, 0.22 * s), skinM, 0, -0.02 * s, 0.2 * s)); // Schnauze/Kiefer
  head.add(mesh(sph(0.035 * s, 6), mat(0xffd23e, { emissive: 0x6a5200, emissiveIntensity: 0.4 }), -0.08 * s, 0.08 * s, 0.08 * s));
  head.add(mesh(sph(0.035 * s, 6), mat(0xffd23e, { emissive: 0x6a5200, emissiveIntensity: 0.4 }), 0.08 * s, 0.08 * s, 0.08 * s));
  const tongue = mesh(box(0.02 * s, 0.015 * s, 0.14 * s), mat(0xd64545), 0, -0.03 * s, 0.34 * s);
  parts.tongue = tongue;
  head.add(tongue);
  if (cfg.frill) {
    const fr = mesh(cone(0.28 * s, 0.1 * s, 8), mat(cfg.belly ?? cfg.skin), 0, 0.02 * s, -0.08 * s);
    fr.rotation.x = Math.PI / 2;
    head.add(fr);
  }

  // vier gespreizte Beine
  for (const [name, lx, lz, ang] of [
    ['legFL', -0.22, 0.3, -0.6],
    ['legFR', 0.22, 0.3, 0.6],
    ['legBL', -0.22, -0.28, -0.6],
    ['legBR', 0.22, -0.28, 0.6]
  ] as const) {
    const leg = group(body, lx * s, -0.08 * s, lz * s);
    parts[name] = leg;
    leg.rotation.z = ang;
    leg.add(mesh(box(0.09 * s, 0.24 * s, 0.1 * s), skinM, 0, -0.12 * s, 0));
    leg.add(mesh(box(0.12 * s, 0.04 * s, 0.14 * s), bellyM, 0, -0.24 * s, 0.03 * s));
  }

  const tail = group(body, 0, 0, -0.44 * s);
  parts.tail = tail;
  const lizTail = mesh(cone(0.14 * s, 0.7 * s, 6), skinM, 0, 0, -0.35 * s);
  lizTail.rotation.x = -Math.PI / 2;
  tail.add(lizTail);

  const idle: Clip = {
    duration: 2.6,
    tracks: [
      wave('body', 'rot.y', 0.06, 2.6),
      wave('body', 'pos.y', 0.01, 2.6, 0.25),
      wave('head', 'rot.y', 0.2, 2.0, 0.2),
      wave('tail', 'rot.y', 0.4, 2.2, 0),
      wave('tongue', 'pos.z', 0.05, 0.8, 0, 0.02)
    ]
  };
  const walk: Clip = {
    duration: 0.44,
    tracks: [
      wave('body', 'rot.y', 0.12, 0.44),
      wave('tail', 'rot.y', 0.5, 0.44),
      wave('legFL', 'rot.x', 0.5, 0.44),
      wave('legFR', 'rot.x', 0.5, 0.44, 0.5),
      wave('legBL', 'rot.x', 0.5, 0.44, 0.5),
      wave('legBR', 'rot.x', 0.5, 0.44)
    ]
  };
  const attack: Clip = {
    duration: 0.5,
    tracks: [
      track('body', 'pos.z', [[0, 0], [0.3, 0.18], [0.5, 0]]),
      track('head', 'rot.x', [[0, 0], [0.3, 0.5], [0.5, 0]])
    ]
  };
  return { node, parts, clips: { idle, attack, walk }, melee: true };
}

// ---------------------------------------------------------------------------
// Schlangen
// ---------------------------------------------------------------------------

export interface SnakeCfg {
  skin: number;
  dark?: number;
  scale?: number;
  hood?: boolean; // Kobra
  rattle?: boolean; // Klapperschlange
  big?: boolean; // Uralte Schlange
}

export function buildSnake(cfg: SnakeCfg): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const s = (cfg.scale ?? 1) * (cfg.big ? 1.35 : 1);
  const green = mat(cfg.skin);
  const dark = mat(cfg.dark ?? 0x2f6d38);

  // Aufgerollter Körper: dichtere Ringsegmente
  const coil = group(node, 0, 0.1 * s, 0);
  parts.coil = coil;
  const segN = 12;
  for (let i = 0; i < segN; i++) {
    const a = (i / segN) * Math.PI * 2;
    const r = 0.3 * s;
    coil.add(mesh(sph(0.13 * s, 7), i % 2 ? green : dark, Math.cos(a) * r, 0, Math.sin(a) * r));
  }

  const neck = group(node, 0, 0.16 * s, 0.1 * s);
  parts.neck = neck;
  neck.add(mesh(cyl(0.09 * s, 0.13 * s, 0.45 * s, 8), green, 0, 0.22 * s, 0));
  const neckTop = group(neck, 0, 0.46 * s, 0.02 * s);
  parts.neckTop = neckTop;
  neckTop.add(mesh(cyl(0.07 * s, 0.09 * s, 0.32 * s, 8), green, 0, 0.14 * s, 0));

  const head = group(neckTop, 0, 0.32 * s, 0.02 * s);
  parts.head = head;
  head.add(mesh(ico(0.13 * s, 1), dark, 0, 0.02 * s, 0.03 * s));
  head.add(mesh(box(0.13 * s, 0.07 * s, 0.18 * s), dark, 0, -0.01 * s, 0.14 * s));
  head.add(mesh(sph(0.035 * s, 6), mat(0xffd23e, { emissive: 0x8a6a00, emissiveIntensity: 0.6 }), -0.06 * s, 0.07 * s, 0.08 * s));
  head.add(mesh(sph(0.035 * s, 6), mat(0xffd23e, { emissive: 0x8a6a00, emissiveIntensity: 0.6 }), 0.06 * s, 0.07 * s, 0.08 * s));
  const tongue = mesh(box(0.02 * s, 0.015 * s, 0.16 * s), mat(0xd64545), 0, -0.01 * s, 0.26 * s);
  parts.tongue = tongue;
  head.add(tongue);

  if (cfg.hood) {
    // Kobra-Haube hinter dem Kopf (spreizt beim Signature-Angriff)
    const hood = group(neckTop, 0, 0.18 * s, -0.02 * s);
    parts.hood = hood;
    const h = mesh(cone(0.28 * s, 0.12 * s, 10), green, 0, 0, 0);
    h.rotation.x = Math.PI / 2;
    h.scale.set(1, 1, 0.5);
    hood.add(h);
  }
  if (cfg.rattle) {
    const rattle = group(coil, 0.3 * s, 0.05 * s, 0);
    parts.rattle = rattle;
    for (let i = 0; i < 3; i++) rattle.add(mesh(cone(0.06 * s - i * 0.012 * s, 0.08 * s, 6), dark, 0, 0.06 * s + i * 0.07 * s, 0));
  }

  const idle: Clip = {
    duration: 2.4,
    tracks: [
      wave('neck', 'rot.z', 0.18, 2.4),
      wave('neck', 'rot.x', 0.1, 2.0, 0.1, -0.06),
      wave('neckTop', 'rot.z', 0.22, 2.4, 0.25),
      wave('head', 'rot.y', 0.35, 1.8, 0.2),
      wave('coil', 'rot.y', 0.1, 3.0),
      wave('tongue', 'pos.z', 0.06, 0.6, 0, 0.03)
    ]
  };
  if (parts.rattle) idle.tracks.push(wave('rattle', 'rot.z', 0.5, 0.3, 0));

  const attack: Clip = cfg.hood
    ? {
        duration: 0.5,
        tracks: [
          track('hood', 'scale', [[0, 1], [0.2, 1.5], [0.4, 1.3], [0.5, 1]]),
          track('neck', 'rot.x', [[0, -0.06], [0.2, -0.5], [0.4, 0.3], [0.5, -0.06]]),
          track('head', 'rot.x', [[0, 0], [0.4, 0.5], [0.5, 0]])
        ]
      }
    : {
        duration: 0.5,
        tracks: [
          track('neck', 'rot.x', [[0, -0.06], [0.3, -0.6], [0.42, 0.5], [0.5, -0.06]]),
          track('head', 'rot.x', [[0, 0], [0.42, 0.6], [0.5, 0]])
        ]
      };

  return { node, parts, clips: { idle, attack }, melee: false };
}

// ---------------------------------------------------------------------------
// Schildkröte
// ---------------------------------------------------------------------------

export function buildTurtle(): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const shellM = mat(0x5a7d3a, { rough: 0.8 });
  const shellDark = mat(0x3f5a28);
  const skinM = mat(0x8a9a5a);

  const body = group(node, 0, 0.3, 0);
  parts.body = body;
  const shell = mesh(ico(0.5, 1), shellM, 0, 0.06, 0);
  shell.scale.set(1, 0.6, 1.2);
  body.add(shell);
  // Panzerplatten
  for (const [x, z] of [[0, 0], [0.22, 0.2], [-0.22, 0.2], [0.22, -0.2], [-0.22, -0.2], [0, 0.34], [0, -0.34]] as const) {
    body.add(mesh(cone(0.12, 0.06, 6), shellDark, x, 0.3, z));
  }
  body.add(mesh(box(0.86, 0.16, 1.0), mat(0xc9b98a), 0, -0.16, 0)); // Plastron

  const head = group(body, 0, -0.02, 0.5);
  parts.head = head;
  const turtleNeck = mesh(cyl(0.1, 0.12, 0.3, 8), skinM, 0, 0, 0.1);
  turtleNeck.rotation.x = Math.PI / 2;
  head.add(turtleNeck);
  head.add(mesh(ico(0.14, 1), skinM, 0, 0.02, 0.28));
  head.add(mesh(sph(0.03, 6), mat(0x14141c), -0.06, 0.06, 0.36));
  head.add(mesh(sph(0.03, 6), mat(0x14141c), 0.06, 0.06, 0.36));

  // Stummelbeine
  for (const [name, x, z] of [['legFL', -0.34, 0.32], ['legFR', 0.34, 0.32], ['legBL', -0.34, -0.32], ['legBR', 0.34, -0.32]] as const) {
    const leg = group(body, x, -0.18, z);
    parts[name] = leg;
    leg.add(mesh(box(0.16, 0.2, 0.18), skinM, 0, -0.08, 0));
  }
  const tail = group(body, 0, -0.04, -0.5);
  parts.tail = tail;
  const turtleTail = mesh(cone(0.07, 0.24, 6), skinM, 0, 0, -0.1);
  turtleTail.rotation.x = -Math.PI / 2;
  tail.add(turtleTail);

  const idle: Clip = {
    duration: 3.4,
    tracks: [
      wave('body', 'pos.y', 0.012, 3.4),
      wave('head', 'rot.y', 0.25, 2.6, 0.2),
      wave('head', 'pos.z', 0.03, 3.0, 0.3),
      wave('tail', 'rot.y', 0.2, 3.0)
    ]
  };
  const walk: Clip = {
    duration: 0.7,
    tracks: [
      wave('legFL', 'rot.x', 0.5, 0.7),
      wave('legFR', 'rot.x', 0.5, 0.7, 0.5),
      wave('legBL', 'rot.x', 0.5, 0.7, 0.5),
      wave('legBR', 'rot.x', 0.5, 0.7),
      wave('body', 'pos.y', 0.02, 0.7)
    ]
  };
  const attack: Clip = {
    duration: 0.5,
    tracks: [
      track('head', 'pos.z', [[0, 0], [0.25, 0.24], [0.5, 0]]),
      track('head', 'rot.x', [[0, 0], [0.25, 0.4], [0.5, 0]])
    ]
  };
  return { node, parts, clips: { idle, attack, walk }, melee: true };
}

// ---------------------------------------------------------------------------
// Krokodil
// ---------------------------------------------------------------------------

export function buildCrocodile(): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const skinM = mat(0x4a6a45, { rough: 0.85 });
  const bellyM = mat(0x9aa06a);
  const toothM = mat(0xf2ede0);

  const body = group(node, 0, 0.26, 0);
  parts.body = body;
  const torso = mesh(ico(0.3, 1), skinM);
  torso.scale.set(0.85, 0.6, 1.7);
  body.add(torso);
  body.add(mesh(box(0.4, 0.1, 1.0), bellyM, 0, -0.14, 0));
  // Rückenkamm
  for (let i = 0; i < 6; i++) {
    body.add(mesh(cone(0.05, 0.14, 4), skinM, 0, 0.18, (0.4 - i * 0.16)));
  }

  // langer Kopf mit Zahnschnauze (Ober-/Unterkiefer)
  const head = group(body, 0, 0.02, 0.5);
  parts.head = head;
  const upper = group(head, 0, 0.04, 0);
  upper.add(mesh(box(0.26, 0.12, 0.6), skinM, 0, 0, 0.32));
  const lower = group(head, 0, -0.06, 0);
  parts.jaw = lower;
  lower.add(mesh(box(0.24, 0.1, 0.56), skinM, 0, 0, 0.3));
  // Zähne
  for (let i = 0; i < 5; i++) {
    upper.add(mesh(cone(0.02, 0.06, 4), toothM, -0.1 + (i % 2) * 0.2, -0.06, 0.16 + i * 0.1));
  }
  head.add(mesh(sph(0.05, 6), mat(0xffd23e, { emissive: 0x6a5200, emissiveIntensity: 0.4 }), -0.1, 0.12, 0.06));
  head.add(mesh(sph(0.05, 6), mat(0xffd23e, { emissive: 0x6a5200, emissiveIntensity: 0.4 }), 0.1, 0.12, 0.06));

  for (const [name, x, z] of [['legFL', -0.28, 0.34], ['legFR', 0.28, 0.34], ['legBL', -0.28, -0.34], ['legBR', 0.28, -0.34]] as const) {
    const leg = group(body, x, -0.1, z);
    parts[name] = leg;
    leg.rotation.z = x < 0 ? -0.5 : 0.5;
    leg.add(mesh(box(0.1, 0.22, 0.12), skinM, 0, -0.11, 0));
  }
  const tail = group(body, 0, 0.02, -0.5);
  parts.tail = tail;
  const crocTail = mesh(cone(0.18, 0.9, 4), skinM, 0, 0, -0.45);
  crocTail.rotation.x = -Math.PI / 2;
  tail.add(crocTail);

  const idle: Clip = {
    duration: 3.0,
    tracks: [
      wave('body', 'pos.y', 0.014, 3.0),
      wave('tail', 'rot.y', 0.4, 2.4),
      wave('head', 'rot.y', 0.1, 2.6, 0.2),
      wave('jaw', 'rot.x', 0.06, 2.0, 0, -0.03)
    ]
  };
  const walk: Clip = {
    duration: 0.5,
    tracks: [
      wave('body', 'rot.y', 0.06, 0.5),
      wave('tail', 'rot.y', 0.5, 0.5),
      wave('legFL', 'rot.x', 0.5, 0.5),
      wave('legFR', 'rot.x', 0.5, 0.5, 0.5),
      wave('legBL', 'rot.x', 0.5, 0.5, 0.5),
      wave('legBR', 'rot.x', 0.5, 0.5)
    ]
  };
  const attack: Clip = {
    duration: 0.5,
    tracks: [
      track('jaw', 'rot.x', [[0, -0.03], [0.2, 0.6], [0.35, -0.3], [0.5, -0.03]]),
      track('body', 'pos.z', [[0, 0], [0.3, 0.2], [0.5, 0]]),
      track('head', 'rot.x', [[0, 0], [0.3, -0.2], [0.5, 0]])
    ]
  };
  return { node, parts, clips: { idle, attack, walk }, melee: true };
}
