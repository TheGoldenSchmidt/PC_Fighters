// Objekt-/Struktur-Karten ohne Lebewesen (Werkzeugkiste, Suppenküche, Zelt,
// Solidaritätskasse, Labor-Formel, Fakultäts-Gebäude, Fund-Kiste).
//
// Diese Karten „laufen" nicht und machen keinen Ausfallschritt (melee=false).
// Idle = leichtes Wabern/Glühen, Attack = Puls (Skalierung + Emissive).

import * as THREE from 'three';
import { type Rig, type Clip, box, sph, cyl, cone, mat, mesh, group, track, wave } from './core';

export type StructureKind =
  | 'toolbox' | 'soupStand' | 'tent' | 'strongbox' | 'lab' | 'building' | 'crate';

export interface StructureCfg {
  kind: StructureKind;
  main: number;
  accent: number;
  glow?: number;
}

export function buildStructure(cfg: StructureCfg): Rig {
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  const mainM = mat(cfg.main, { rough: 0.7, metal: 0.15 });
  const accentM = mat(cfg.accent, { rough: 0.6, metal: 0.2 });

  // body: Pivot leicht über dem Boden, damit der Attack-Puls sauber skaliert
  const body = group(node, 0, 0.02, 0);
  parts.body = body;

  switch (cfg.kind) {
    case 'toolbox': {
      body.add(mesh(box(0.9, 0.5, 0.6), mainM, 0, 0.35, 0));
      body.add(mesh(box(0.94, 0.12, 0.64), accentM, 0, 0.62, 0));
      const handle = mesh(cyl(0.04, 0.04, 0.5, 8), mat(0x3a4756, { metal: 0.5 }), 0, 0.82, 0);
      handle.rotation.z = Math.PI / 2;
      body.add(handle);
      // Werkzeuge, die herausragen
      body.add(mesh(box(0.06, 0.4, 0.06), mat(0x9aa7b8, { metal: 0.6 }), -0.25, 0.85, 0.1));
      body.add(mesh(box(0.05, 0.34, 0.05), mat(0xc0632f), 0.22, 0.82, -0.1));
      break;
    }
    case 'soupStand': {
      // Topf auf einem Stand mit Dampf-Andeutung
      body.add(mesh(cyl(0.5, 0.42, 0.5, 14), accentM, 0, 0.9, 0)); // Topf
      body.add(mesh(cyl(0.54, 0.54, 0.08, 14), mat(0x8a939c, { metal: 0.5 }), 0, 1.14, 0)); // Rand
      // Beine des Stands
      for (const [x, z] of [[-0.4, 0.3], [0.4, 0.3], [-0.4, -0.3], [0.4, -0.3]] as const) {
        body.add(mesh(box(0.08, 0.6, 0.08), mat(0x5a4a35), x, 0.3, z));
      }
      const steam = group(body, 0, 1.2, 0);
      parts.glow = steam;
      steam.add(mesh(sph(0.16, 8), mat(0xf2ede0, { emissive: cfg.glow ?? 0xffd9a0, emissiveIntensity: 0.3, opacity: 0.6 }), 0, 0.12, 0));
      break;
    }
    case 'tent': {
      // Zeltplane über zwei Stützen + Feuerstelle
      const canvas = mesh(cone(0.8, 0.9, 4), mainM, 0, 0.75, 0);
      canvas.rotation.y = Math.PI / 4;
      body.add(canvas);
      body.add(mesh(box(1.4, 0.06, 0.06), mat(0x5a4a35), 0, 1.16, 0));
      // Eingangsklappe
      body.add(mesh(box(0.4, 0.5, 0.02), accentM, 0, 0.25, 0.56));
      const fire = group(body, 0.7, 0.12, 0.4);
      parts.glow = fire;
      fire.add(mesh(cone(0.12, 0.28, 8), mat(0xff8a2c, { emissive: 0xff6a1c, emissiveIntensity: 1 }), 0, 0.14, 0));
      break;
    }
    case 'strongbox': {
      body.add(mesh(box(0.8, 0.7, 0.6), mainM, 0, 0.4, 0));
      body.add(mesh(box(0.84, 0.16, 0.64), accentM, 0, 0.2, 0));
      // Münzschlitz + Schloss (glühend)
      const lock = mesh(sph(0.1, 8), mat(0xf2c531, { emissive: cfg.glow ?? 0xffcf4a, emissiveIntensity: 0.4 }), 0, 0.42, 0.32);
      body.add(lock);
      parts.glow = lock;
      body.add(mesh(box(0.2, 0.03, 0.02), mat(0x2a2a2a), 0, 0.6, 0.31));
      break;
    }
    case 'lab': {
      // Kolben mit blubbernder Flüssigkeit auf einem Tisch
      body.add(mesh(box(0.9, 0.1, 0.6), mat(0x6a6f78, { metal: 0.4 }), 0, 0.6, 0)); // Tisch
      for (const [x, z] of [[-0.36, 0.22], [0.36, 0.22], [-0.36, -0.22], [0.36, -0.22]] as const) {
        body.add(mesh(box(0.06, 0.6, 0.06), mat(0x4a4f58), x, 0.3, z));
      }
      const flask = group(body, 0, 0.65, 0);
      parts.glow = flask;
      flask.add(mesh(cone(0.2, 0.3, 10), mat(0xbfe6ff, { glass: true }), 0, 0.15, 0));
      flask.add(mesh(cyl(0.05, 0.05, 0.16, 8), mat(0xbfe6ff, { glass: true }), 0, 0.36, 0));
      flask.add(mesh(sph(0.14, 8), mat(cfg.glow ?? 0x8affa0, { emissive: cfg.glow ?? 0x8affa0, emissiveIntensity: 0.5, opacity: 0.85 }), 0, 0.1, 0));
      break;
    }
    case 'building': {
      // Institutsgebäude mit Säulen + Giebel
      body.add(mesh(box(1.3, 1.0, 0.8), mainM, 0, 0.6, 0));
      for (let i = 0; i < 4; i++) {
        body.add(mesh(cyl(0.09, 0.09, 1.0, 10), mat(0xe8e2d4), -0.5 + i * 0.33, 0.6, 0.44));
      }
      const ped = mesh(box(1.5, 0.16, 0.9), accentM, 0, 1.18, 0);
      body.add(ped);
      const roof = mesh(cone(0.9, 0.4, 3), accentM, 0, 1.42, 0);
      roof.rotation.y = Math.PI / 2;
      body.add(roof);
      body.add(mesh(box(0.9, 0.16, 0.1), accentM, 0, 0.1, 0.42)); // Stufen
      break;
    }
    case 'crate': {
      body.add(mesh(box(0.6, 0.55, 0.55), mainM, 0, 0.32, 0));
      // Lattenkreuz
      body.add(mesh(box(0.64, 0.06, 0.06), accentM, 0, 0.42, 0.28));
      body.add(mesh(box(0.06, 0.55, 0.06), accentM, 0, 0.32, 0.3));
      const glow = mesh(sph(0.08, 7), mat(0xffe28a, { emissive: cfg.glow ?? 0xffd766, emissiveIntensity: 0.4 }), 0, 0.62, 0);
      body.add(glow);
      parts.glow = glow;
      break;
    }
  }

  const idle: Clip = {
    duration: 3.5,
    tracks: [wave('body', 'pos.y', 0.012, 3.5), wave('body', 'rot.z', 0.01, 3.5, 0.25)]
  };
  if (parts.glow) {
    idle.tracks.push(wave('glow', 'emissive', 0.5, 2.2, 0, 0.5));
    idle.tracks.push(wave('glow', 'pos.y', 0.03, 2.2, 0.3));
  }

  const attack: Clip = {
    duration: 0.5,
    tracks: [track('body', 'scale', [[0, 1], [0.18, 1.08], [0.4, 0.98], [0.5, 1]])]
  };
  if (parts.glow) attack.tracks.push(track('glow', 'emissive', [[0, 0], [0.15, 1.4], [0.5, 0]]));

  return { node, parts, clips: { idle, attack }, melee: false };
}
