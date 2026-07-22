// Vögel (Sperling, Krähe, Möwe, Taube, Eule, Falke, Adler, Schwarm) und der
// Flugsaurier Pteranodon.
//
// buildBird(cfg) variiert über Größe, Schnabelform, Flügelspannweite, Federkleid
// und Augen. Vögel schweben auf der Stelle (kein Boden-Kontakt). `flock` klont
// kleinere Kopien; `pterosaur` gibt Kamm + ledrige Flügel statt Gefieder.

import * as THREE from 'three';
import { type Rig, type Clip, sph, cyl, cone, box, ico, mat, mesh, group, track, wave } from './core';

export type BeakShape = 'small' | 'straight' | 'hook' | 'long';

export interface BirdCfg {
  body: number;
  belly?: number;
  beak?: number;
  size: number;
  beakShape?: BeakShape;
  wingSpan?: number;
  owl?: boolean;
  flock?: 2 | 3;
  pterosaur?: boolean;
  eyes?: number;
  crest?: number; // Kammfarbe (Pteranodon)
}

function addBeak(head: THREE.Group, shape: BeakShape, s: number, color: number) {
  const beakM = mat(color, { rough: 0.5 });
  switch (shape) {
    case 'small':
      head.add(mkCone(beakM, 0.045 * s, 0.14 * s, 0, -0.01 * s, 0.17 * s));
      break;
    case 'straight':
      head.add(mkCone(beakM, 0.05 * s, 0.22 * s, 0, -0.01 * s, 0.2 * s));
      break;
    case 'long':
      head.add(mkCone(beakM, 0.045 * s, 0.34 * s, 0, -0.02 * s, 0.26 * s));
      break;
    case 'hook': {
      head.add(mkCone(beakM, 0.06 * s, 0.2 * s, 0, 0.0, 0.18 * s));
      head.add(mesh(sph(0.05 * s, 6), beakM, 0, -0.05 * s, 0.26 * s)); // Hakenspitze
      break;
    }
  }
}

function mkCone(m: THREE.Material, r: number, h: number, x: number, y: number, z: number): THREE.Mesh {
  const me = mesh(cone(r, h, 8), m, x, y, z);
  me.rotation.x = Math.PI / 2;
  return me;
}

function buildOneBird(cfg: BirdCfg, parts: Record<string, THREE.Object3D> | null): THREE.Group {
  const node = new THREE.Group();
  const s = cfg.size;
  const bodyM = mat(cfg.body);
  const lightM = mat(cfg.belly ?? 0xd9c9a8);
  const eyeM = mat(cfg.eyes ?? 0x14141c, cfg.eyes ? { emissive: cfg.eyes, emissiveIntensity: 0.6 } : {});
  const span = (cfg.wingSpan ?? 0.55) * s;

  const bodyG = group(node, 0, 0.9 * s, 0);
  if (parts) parts.body = bodyG;
  bodyG.rotation.x = -0.2;
  const torso = mesh(ico(0.24 * s, 1), bodyM);
  torso.scale.set(0.9, 1, 1.15);
  bodyG.add(torso);
  bodyG.add(mesh(ico(0.16 * s, 1), lightM, 0, -0.08 * s, 0.12 * s));

  // Kopf
  const head = group(bodyG, 0, 0.22 * s, 0.12 * s);
  if (parts) parts.head = head;
  head.add(mesh(ico(cfg.owl ? 0.18 * s : 0.14 * s, 1), cfg.owl ? lightM : bodyM));
  addBeak(head, cfg.beakShape ?? 'small', s, cfg.beak ?? 0xf0a832);
  const eyeR = cfg.owl ? 0.06 * s : 0.035 * s;
  head.add(mesh(sph(eyeR, 6), eyeM, -0.08 * s, 0.04 * s, 0.1 * s));
  head.add(mesh(sph(eyeR, 6), eyeM, 0.08 * s, 0.04 * s, 0.1 * s));
  if (cfg.owl) {
    // Federohren + Gesichtsscheibe
    head.add(mesh(cone(0.04 * s, 0.14 * s, 5), bodyM, -0.1 * s, 0.18 * s, -0.02 * s));
    head.add(mesh(cone(0.04 * s, 0.14 * s, 5), bodyM, 0.1 * s, 0.18 * s, -0.02 * s));
    const discM = mat(0xf2ede0);
    for (const dx of [-0.08, 0.08]) {
      const disc = mesh(sph(0.07 * s, 7), discM, dx * s, 0.04 * s, 0.09 * s);
      disc.scale.set(1, 1, 0.4);
      head.add(disc);
    }
  }
  if (cfg.crest) {
    // Pteranodon-Kamm nach hinten
    const crest = mesh(cone(0.1 * s, 0.4 * s, 4), mat(cfg.crest), 0, 0.08 * s, -0.16 * s);
    crest.rotation.x = -1.2;
    head.add(crest);
  }

  // Flügel: Schulter-Pivots
  for (const side of [-1, 1] as const) {
    const wing = group(bodyG, 0.16 * s * side, 0.08 * s, -0.02 * s);
    if (parts) parts[side < 0 ? 'wingL' : 'wingR'] = wing;
    if (cfg.pterosaur) {
      // ledrige Flügel: langer Spann-Arm + Membran
      const arm = mesh(box(span, 0.04 * s, 0.12 * s), bodyM, (span / 2) * side, 0, 0);
      wing.add(arm);
      const membrane = mesh(box(span * 0.9, 0.03 * s, 0.5 * s), mat(cfg.body, { rough: 0.6 }), (span / 2) * side, 0, -0.2 * s);
      wing.add(membrane);
    } else {
      wing.add(mesh(box(span, 0.05 * s, 0.34 * s), bodyM, (span / 2) * side, 0, 0));
      // Handschwingen
      wing.add(mesh(box(span * 0.5, 0.04 * s, 0.18 * s), lightM, (span * 0.75) * side, 0, -0.14 * s));
    }
  }

  // Schwanz + Krallen
  const tail = group(bodyG, 0, -0.04 * s, -0.24 * s);
  if (parts) parts.tail = tail;
  tail.add(mesh(box(0.2 * s, 0.04 * s, 0.3 * s), bodyM, 0, 0, -0.12 * s));
  for (const side of [-1, 1] as const) {
    bodyG.add(mesh(cyl(0.02 * s, 0.02 * s, 0.16 * s, 4), mat(cfg.beak ?? 0xf0a832), 0.07 * s * side, -0.24 * s, 0.02 * s));
  }

  return node;
}

export function buildBird(cfg: BirdCfg): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  node.add(buildOneBird(cfg, parts));

  if (cfg.flock) {
    const flock = group(node, 0, 0, 0);
    parts.flock = flock;
    const memberCfg: BirdCfg = { ...cfg, flock: undefined, size: cfg.size * 0.66 };
    const positions: [number, number, number][] = [
      [-0.6 * cfg.size, 0.4 * cfg.size, -0.3 * cfg.size],
      [0.55 * cfg.size, 0.25 * cfg.size, -0.4 * cfg.size]
    ];
    if (cfg.flock === 3) positions.push([0.1 * cfg.size, 0.55 * cfg.size, -0.7 * cfg.size]);
    for (const [x, y, z] of positions) {
      const m = buildOneBird(memberCfg, null);
      m.position.set(x, y, z);
      flock.add(m);
    }
  }

  const flapDur = 0.5;
  const idle: Clip = {
    duration: flapDur,
    tracks: [
      wave('wingL', 'rot.z', 0.7, flapDur, 0, -0.2),
      wave('wingR', 'rot.z', -0.7, flapDur, 0, 0.2),
      wave('body', 'pos.y', 0.06, flapDur * 3),
      wave('head', 'rot.y', 0.35, flapDur * 4, 0.2),
      wave('tail', 'rot.x', 0.12, flapDur * 3, 0.25)
    ]
  };
  if (parts.flock) idle.tracks.push(wave('flock', 'pos.y', 0.08, flapDur * 3, 0.3));

  const walk: Clip = {
    duration: 0.32,
    tracks: [
      wave('wingL', 'rot.z', 0.9, 0.32, 0, -0.2),
      wave('wingR', 'rot.z', -0.9, 0.32, 0, 0.2),
      wave('body', 'pos.y', 0.1, 0.32)
    ]
  };

  // Sturzflug-Andeutung: Körper kippt nach vorn-unten, Flügel anlegen
  const attack: Clip = {
    duration: 0.5,
    tracks: [
      track('body', 'rot.x', [[0, -0.2], [0.4, -1.0], [0.5, -0.2]]),
      track('body', 'pos.y', [[0, 0], [0.4, -0.35], [0.5, 0]]),
      track('wingL', 'rot.z', [[0, -0.2], [0.4, -1.3], [0.5, -0.2]]),
      track('wingR', 'rot.z', [[0, 0.2], [0.4, 1.3], [0.5, 0.2]])
    ]
  };

  return { node, parts, clips: { idle, attack, walk }, melee: false };
}
