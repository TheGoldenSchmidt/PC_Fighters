// Datengetriebener Keyframe-Player. Eine Animation ist eine Liste von Tracks;
// jeder Track adressiert einen benannten Baustein und eine Eigenschaft und
// enthält Keyframes [zeit, wert]. Ein Idle-Loop läuft dauerhaft; Einzel-Klips
// (entrance/attack/hit/death) legen sich additiv darüber. Kein Code pro Karte.

import * as THREE from 'three';
import type { AnimationClip, AnimationTrack, Animations } from '@pcf/engine';

export interface AnimationPlayer {
  /** Pro Frame aufrufen; `nowMs` = performance.now(). */
  update(nowMs: number): void;
  /** Klip auslösen (idle läuft automatisch als Loop). */
  play(name: string): void;
  isDeathFinished(nowMs: number): boolean;
}

interface Base {
  p: THREE.Vector3;
  r: THREE.Euler;
  s: THREE.Vector3;
}

/** Smoothstep-Interpolation zwischen den Keyframes, geklemmt an den Enden. */
function sampleTrack(keys: [number, number][], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i];
    const [b, vb] = keys[i + 1];
    if (t >= a && t <= b) {
      let u = (t - a) / (b - a);
      u = u * u * (3 - 2 * u);
      return va + (vb - va) * u;
    }
  }
  return last[1];
}

function addAxis(target: THREE.Vector3 | THREE.Euler, axis: string, v: number): void {
  if (axis === 'x') target.x += v;
  else if (axis === 'y') target.y += v;
  else if (axis === 'z') target.z += v;
}

export function createAnimationPlayer(
  parts: Map<string, THREE.Object3D>,
  clips: Animations,
  opts: { reducedMotion?: boolean } = {}
): AnimationPlayer {
  const base = new Map<string, Base>();
  for (const [name, obj] of parts) {
    base.set(name, { p: obj.position.clone(), r: obj.rotation.clone(), s: obj.scale.clone() });
  }

  // Materialien einsammeln (Ausgangs-Deckkraft merken, Emissive nullen).
  const root = parts.get('root')!;
  const baseOpacity = new Map<THREE.Material, number>();
  const mats: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      mats.push(o.material);
      if (!baseOpacity.has(o.material)) baseOpacity.set(o.material, o.material.opacity);
      o.material.emissive.setRGB(0, 0, 0);
      o.material.emissiveIntensity = 0;
    }
  });

  const idle = clips.idle;
  const reduce = opts.reducedMotion ?? false;
  let idleStart = 0;
  let dead = false;
  let oneShots: { name: string; clip: AnimationClip; start: number }[] = [];

  function applyTrack(tr: AnimationTrack, v: number): void {
    const part = parts.get(tr.part);
    if (!part) return;
    const dot = tr.prop.indexOf('.');
    const type = dot < 0 ? tr.prop : tr.prop.slice(0, dot);
    const axis = dot < 0 ? '' : tr.prop.slice(dot + 1);
    if (type === 'pos') addAxis(part.position, axis, v);
    else if (type === 'rot') addAxis(part.rotation, axis, v);
    else if (type === 'scale') part.scale.multiplyScalar(v);
    else if (type === 'emissive')
      part.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          o.material.emissive.setRGB(1, 1, 1);
          o.material.emissiveIntensity = Math.max(o.material.emissiveIntensity, v);
        }
      });
    else if (type === 'opacity')
      part.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
          o.material.transparent = true;
          o.material.opacity = (baseOpacity.get(o.material) ?? 1) * v;
        }
      });
  }

  return {
    play(name) {
      const clip = clips[name];
      if (!clip) return;
      const now = performance.now() / 1000;
      if (name === 'death') {
        dead = true;
        oneShots = oneShots.filter((o) => o.name !== 'death');
        oneShots.push({ name, clip, start: now });
      } else if (name === 'entrance') {
        dead = false;
        oneShots = oneShots.filter((o) => o.name !== 'death');
        idleStart = now;
        oneShots.push({ name, clip, start: now });
      } else {
        oneShots.push({ name, clip, start: now });
      }
    },
    isDeathFinished(nowMs) {
      const death = clips.death;
      const os = oneShots.find((o) => o.name === 'death');
      if (!death || !os) return false;
      return nowMs / 1000 - os.start >= death.duration;
    },
    update(nowMs) {
      const now = nowMs / 1000;
      // Auf Basis-Transform zurücksetzen, Material-Effekte neutralisieren.
      for (const [name, b] of base) {
        const p = parts.get(name);
        if (!p) continue;
        p.position.copy(b.p);
        p.rotation.copy(b.r);
        p.scale.copy(b.s);
      }
      for (const m of mats) {
        m.emissiveIntensity = 0;
        m.opacity = baseOpacity.get(m) ?? 1;
      }

      const active: [AnimationClip, number][] = [];
      if (!dead && idle && !reduce) {
        const dur = idle.duration;
        const lt = (((now - idleStart) % dur) + dur) % dur;
        active.push([idle, lt]);
      }
      oneShots = oneShots.filter((os) => {
        const dur = os.clip.duration;
        let lt = now - os.start;
        if (lt > dur) {
          if (os.name === 'death') lt = dur;
          else return false;
        }
        active.push([os.clip, lt]);
        return true;
      });

      for (const [clip, lt] of active) {
        for (const tr of clip.tracks) applyTrack(tr, sampleTrack(tr.keys, lt));
      }
    }
  };
}
