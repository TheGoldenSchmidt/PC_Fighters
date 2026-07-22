// Baut eine 3D-Figur rein aus den `visual`-Daten einer Karte (keine figur-
// spezifische Logik). Primitive werden zu benannten Bausteinen zusammengesetzt;
// der Animations-Player adressiert sie später über ihre id.
//
// Auto-Fit: jede Figur wird auf eine einheitliche Zielhöhe skaliert und mittig
// auf den Boden (y=0) gesetzt – so passt sie zur Slot-Skalierung im Battlefield.

import * as THREE from 'three';
import type { DetailLevel, Visual, VisualPart } from '@pcf/engine';

/** Muss zu NOMINAL_HEIGHT in Battlefield3D passen. */
export const FIGURE_HEIGHT = 1.8;

export interface BuiltFigure {
  /** Wurzel der Figur; von Animationen als Baustein "root" adressiert. */
  root: THREE.Group;
  /** Baustein-id → Objekt (inkl. "root"). */
  parts: Map<string, THREE.Object3D>;
}

// ---- Geteilter Geometrie-Cache (Geometrien teilbar, Materialien nicht) ----
const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const DETAIL: Record<DetailLevel, { ico: number; seg: number }> = {
  low: { ico: 0, seg: 6 },
  mid: { ico: 1, seg: 10 },
  high: { ico: 2, seg: 16 }
};

const numOf = (s: number | number[] | undefined): number =>
  typeof s === 'number' ? s : Array.isArray(s) ? (s[0] ?? 1) : 1;

function tripleOf(s: number | number[] | undefined): [number, number, number] {
  if (typeof s === 'number') return [s, s, s];
  if (Array.isArray(s)) return [s[0] ?? 1, s[1] ?? s[0] ?? 1, s[2] ?? s[0] ?? 1];
  return [1, 1, 1];
}

function buildGeometry(part: VisualPart, detail: DetailLevel): THREE.BufferGeometry | null {
  const d = DETAIL[detail];
  const s = part.size;
  switch (part.shape) {
    case 'group':
      return null;
    case 'ico': {
      const r = numOf(s);
      return geo(`i${r},${d.ico}`, () => new THREE.IcosahedronGeometry(r, d.ico));
    }
    case 'sph': {
      const r = numOf(s);
      const a = part.arc;
      const key = `s${r},${d.seg}${a ? ',' + a.join(',') : ''}`;
      return geo(key, () =>
        a
          ? new THREE.SphereGeometry(r, d.seg, Math.max(4, d.seg - 2), a[0], a[1], a[2], a[3])
          : new THREE.SphereGeometry(r, d.seg, Math.max(4, d.seg - 1))
      );
    }
    case 'box': {
      const [x, y, z] = tripleOf(s);
      return geo(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z));
    }
    case 'cyl': {
      const [rt, rb, h] = tripleOf(s);
      return geo(`c${rt},${rb},${h},${d.seg}`, () => new THREE.CylinderGeometry(rt, rb, h, d.seg));
    }
    case 'cone': {
      const arr = Array.isArray(s) ? s : [numOf(s), numOf(s)];
      const r = arr[0] ?? 1;
      const h = arr[1] ?? 1;
      return geo(`k${r},${h},${d.seg}`, () => new THREE.ConeGeometry(r, h, Math.max(4, d.seg - 2)));
    }
    case 'capsule': {
      const arr = Array.isArray(s) ? s : [numOf(s), numOf(s)];
      const r = arr[0] ?? 1;
      const len = arr[1] ?? 1;
      const cap = Math.max(2, Math.round(d.seg / 3));
      return geo(`p${r},${len},${d.seg}`, () => new THREE.CapsuleGeometry(r, len, cap, d.seg));
    }
    case 'torus': {
      const arr = Array.isArray(s) ? s : [numOf(s), numOf(s)];
      const r = arr[0] ?? 1;
      const tube = arr[1] ?? 0.3;
      return geo(`t${r},${tube},${d.seg}`, () => new THREE.TorusGeometry(r, tube, Math.max(4, d.seg - 4), d.seg));
    }
  }
}

function resolveColor(color: string | undefined, palette?: Record<string, string>): string {
  if (!color) return '#888888';
  if (color.startsWith('#')) return color;
  return palette?.[color] ?? '#888888';
}

function makeMaterial(part: VisualPart, palette?: Record<string, string>): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: resolveColor(part.color, palette),
    flatShading: true,
    roughness: part.roughness ?? 0.85,
    metalness: part.metalness ?? 0.05,
    transparent: part.transparent ?? false,
    opacity: part.opacity ?? 1
  });
}

export function buildFigure(visual: Visual): BuiltFigure {
  const detail = visual.detailLevel ?? 'mid';
  const model = new THREE.Group();
  const parts = new Map<string, THREE.Object3D>();
  parts.set('root', model);

  const objs = new Map<string, THREE.Object3D>();
  for (const part of visual.parts) {
    let obj: THREE.Object3D;
    if (part.shape === 'group') {
      obj = new THREE.Group();
    } else {
      const g = buildGeometry(part, part.detail ?? detail)!;
      const m = new THREE.Mesh(g, makeMaterial(part, visual.palette));
      m.castShadow = true;
      obj = m;
    }
    if (part.pos) obj.position.set(part.pos[0], part.pos[1], part.pos[2]);
    if (part.rot) obj.rotation.set(part.rot[0], part.rot[1], part.rot[2]);
    if (part.scale !== undefined) {
      if (typeof part.scale === 'number') obj.scale.setScalar(part.scale);
      else obj.scale.set(part.scale[0], part.scale[1], part.scale[2]);
    }
    objs.set(part.id, obj);
    parts.set(part.id, obj);
  }

  // Hierarchie erst nach dem Erzeugen aufbauen (parent darf später kommen).
  for (const part of visual.parts) {
    const obj = objs.get(part.id)!;
    const parent = part.parent && part.parent !== 'root' ? objs.get(part.parent) : undefined;
    (parent ?? model).add(obj);
  }

  // Auto-Fit auf einheitliche Zielhöhe, mittig, Füße bei y=0.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetH = FIGURE_HEIGHT * (visual.height ?? 1);
  const s = size.y > 0 ? targetH / size.y : 1;
  model.scale.setScalar(s);
  model.position.set(-center.x * s, -box.min.y * s, -center.z * s);

  return { root: model, parts };
}
