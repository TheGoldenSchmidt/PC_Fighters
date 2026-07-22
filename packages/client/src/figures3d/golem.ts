// Fallback-Golem für unbekannte Karten-ids und den Fund-Token.
// Farbe wird aus der cardId gehasht; detaillierter als ein reiner Steinblock.

import * as THREE from 'three';
import { type Rig, type Clip, ico, box, sph, mat, mesh, group, track, wave } from './core';

export function buildGolem(cardId: string): Rig {
  let h = 0;
  for (let i = 0; i < cardId.length; i++) h = (h * 31 + cardId.charCodeAt(i)) >>> 0;
  const color = new THREE.Color().setHSL((h % 360) / 360, 0.4, 0.5).getHex();
  const stone = mat(color, { rough: 1 });
  const stoneDark = mat(new THREE.Color().setHSL((h % 360) / 360, 0.4, 0.38).getHex(), { rough: 1 });
  const node = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};

  const body = group(node, 0, 0.72, 0);
  parts.body = body;
  const core = mesh(ico(0.42, 1), stone, 0, 0.18, 0);
  core.scale.set(1, 1.1, 0.85);
  body.add(core);
  // Gesteinsbrocken als Schulterpanzer
  body.add(mesh(ico(0.16, 0), stoneDark, -0.34, 0.42, 0));
  body.add(mesh(ico(0.16, 0), stoneDark, 0.34, 0.42, 0));

  const head = group(body, 0, 0.62, 0);
  parts.head = head;
  head.add(mesh(ico(0.22, 0), stone, 0, 0, 0));
  head.add(mesh(sph(0.045, 6), mat(0xffffff, { emissive: 0xaad4ff, emissiveIntensity: 0.9 }), -0.09, 0.02, 0.16));
  head.add(mesh(sph(0.045, 6), mat(0xffffff, { emissive: 0xaad4ff, emissiveIntensity: 0.9 }), 0.09, 0.02, 0.16));

  for (const side of [-1, 1] as const) {
    const arm = group(body, 0.4 * side, 0.4, 0);
    parts[side < 0 ? 'armL' : 'armR'] = arm;
    arm.add(mesh(box(0.18, 0.5, 0.2), stone, 0, -0.25, 0));
    arm.add(mesh(ico(0.16, 0), stoneDark, 0, -0.52, 0)); // Faust
  }
  for (const side of [-1, 1] as const) {
    const leg = group(node, 0.18 * side, 0.72, 0);
    parts[side < 0 ? 'legL' : 'legR'] = leg;
    leg.add(mesh(box(0.22, 0.6, 0.24), stone, 0, -0.32, 0));
  }

  const idle: Clip = {
    duration: 3.2,
    tracks: [
      wave('body', 'pos.y', 0.02, 3.2),
      wave('head', 'rot.y', 0.22, 3.0, 0.2),
      wave('armL', 'rot.x', 0.06, 3.2),
      wave('armR', 'rot.x', 0.06, 3.2, 0.5),
      wave('head', 'emissive', 0.3, 2.4, 0, 0)
    ]
  };
  const walk: Clip = {
    duration: 0.8,
    tracks: [
      wave('legL', 'rot.x', 0.5, 0.8),
      wave('legR', 'rot.x', 0.5, 0.8, 0.5),
      wave('armL', 'rot.x', 0.4, 0.8, 0.5),
      wave('armR', 'rot.x', 0.4, 0.8),
      wave('body', 'pos.y', 0.03, 0.8)
    ]
  };
  const attack: Clip = {
    duration: 0.5,
    tracks: [
      track('armR', 'rot.x', [[0, 0], [0.2, -2.0], [0.36, 0.6], [0.5, 0]]),
      track('body', 'rot.x', [[0, 0], [0.2, -0.1], [0.36, 0.18], [0.5, 0]])
    ]
  };

  return { node, parts, clips: { idle, attack, walk }, melee: true };
}
