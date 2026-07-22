// Fundament der prozeduralen 3D-Figuren.
//
// Enthält die Geometrie-/Material-Helfer, die Keyframe-Clip-Runtime und den
// Figure-Wrapper (Zustandsmaschine für Spawn/Angriff/Treffer/Tod). Die
// Arten-Bauer (humanoids/mammals/birds/reptiles/dinos/structures/golem)
// liefern jeweils ein `Rig` zurück, das dieser Wrapper animiert.
//
// Koordinaten-Konvention: Füße bei y=0, Blickrichtung +z. Die Battlefield-
// Komponente skaliert die Wurzel anhand der Slot-Größe / NOMINAL_HEIGHT (1.8),
// es gibt KEINE Bounding-Box-Normierung – jedes Modell muss selbst ~1.7–1.8
// Einheiten hoch gebaut werden (Tiere kleiner/größer, damit die
// Größenverhältnisse stimmen). flatShading überall (facettierter Look).

import * as THREE from 'three';

// ---- Timing (muss zur Kampf-Abspielung im GameScreen passen) ----
export const SPAWN_MS = 650;
export const ATTACK_MS = 500;
export const HIT_MS = 420;
export const DEATH_MS = 600;

export interface Figure {
  /** Wurzel-Gruppe – wird von außen positioniert und skaliert. */
  root: THREE.Group;
  /** Pro Frame aufrufen. `now` in Millisekunden (performance.now). */
  update(now: number): void;
  playSpawn(): void;
  playAttack(): void;
  playHit(): void;
  playDeath(): void;
  setExhausted(on: boolean): void;
  setWalking(on: boolean): void;
  /** true, sobald die Sterbeanimation vollständig durchgelaufen ist. */
  isDeathFinished(now: number): boolean;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Geometrie-Cache (Geometrien sind teilbar, Materialien nicht)
// ---------------------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>();
export function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const box = (w: number, h: number, d: number) =>
  geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const sph = (r: number, seg = 8) =>
  geo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg - 1)));
export const cyl = (rt: number, rb: number, h: number, seg = 10) =>
  geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
export const cone = (r: number, h: number, seg = 8) =>
  geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
/** Facettierte Kugel mit dichterer Geometrie (Icosaeder + Subdivision). */
export const ico = (r: number, detail = 1) =>
  geo(`i${r},${detail}`, () => new THREE.IcosahedronGeometry(r, detail));

export interface MatOpts {
  metal?: number;
  rough?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** Glas-/Glanz-Variante: halbtransparent. */
  glass?: boolean;
  opacity?: number;
}

export function mat(color: number | string, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const glass = opts.glass ?? false;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? (glass ? 0.15 : 0.85),
    metalness: opts.metal ?? (glass ? 0.1 : 0.05),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: glass || opts.opacity !== undefined,
    opacity: opts.opacity ?? (glass ? 0.5 : 1),
    flatShading: true
  });
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  return me;
}

export function group(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Keyframe-Clip-Runtime
// ---------------------------------------------------------------------------

/** Eine animierbare Eigenschaft eines benannten Rig-Teils. */
export type ClipProp =
  | 'pos.x' | 'pos.y' | 'pos.z'
  | 'rot.x' | 'rot.y' | 'rot.z'
  | 'scale' | 'emissive' | 'opacity';

/** Ein Keyframe-Track: [Zeit in s, Wert]-Paare für ein Teil + eine Eigenschaft. */
export interface Track {
  part: string;
  prop: ClipProp;
  keys: [number, number][];
}

/** Ein Clip: Dauer in Sekunden + Tracks. Idle läuft als Loop, Attack einmalig. */
export interface Clip {
  duration: number;
  tracks: Track[];
}

/** Bequemer Track-Konstruktor. */
export function track(part: string, prop: ClipProp, keys: [number, number][]): Track {
  return { part, prop, keys };
}

/**
 * Loop-tauglicher Sinus-Track (Atmen/Wippen/Schwingen). Erzeugt 5 Keys über
 * die Clip-Dauer; Anfangs- und Endwert sind identisch (kein Pop beim Loop).
 * `phase` in Umdrehungen (0..1), `mid` verschiebt die Mittellage.
 */
export function wave(
  part: string,
  prop: ClipProp,
  amp: number,
  duration: number,
  phase = 0,
  mid = 0
): Track {
  const keys: [number, number][] = [];
  for (let i = 0; i <= 4; i++) {
    const tt = (i / 4) * duration;
    const v = mid + amp * Math.sin(2 * Math.PI * (i / 4 + phase));
    keys.push([tt, v]);
  }
  return { part, prop, keys };
}

const smoothstep = (a: number, b: number, t: number): number => {
  const span = b - a || 1;
  const x = Math.max(0, Math.min(1, (t - a) / span));
  return x * x * (3 - 2 * x);
};

/** Wert eines Tracks zur Zeit t (Smoothstep zwischen benachbarten Keys). */
export function sampleTrack(keys: [number, number][], t: number): number {
  const n = keys.length;
  if (n === 0) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[n - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < n - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t <= t1) {
      const k = smoothstep(t0, t1, t);
      return v0 + (v1 - v0) * k;
    }
  }
  return last[1];
}

/** Internes Rig, das die Arten-Bauer zurückgeben. */
export interface Rig {
  /** Modell-Wurzel (Füße bei y=0). */
  node: THREE.Group;
  /** Benannte, animierbare Teile (Clip-Tracks referenzieren diese Keys). */
  parts: Record<string, THREE.Object3D>;
  clips: { idle: Clip; attack: Clip; walk?: Clip };
  /**
   * true (Default): Wrapper fügt beim Angriff einen Ausfallschritt nach vorn
   * hinzu (Nahkämpfer). false: Werfer/Beschwörer/Strukturen bleiben stehen.
   */
  melee?: boolean;
}

// ---------------------------------------------------------------------------
// Figure-Wrapper: Zustandsmaschine für Spawn/Angriff/Treffer/Tod + Blob-Schatten
// ---------------------------------------------------------------------------

const easeOutBack = (p: number) => {
  const c = 1.70158;
  const q = p - 1;
  return 1 + (c + 1) * q * q * q + c * q * q;
};

interface PartRec {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: THREE.Vector3;
}

interface MatRec {
  m: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  emisInt: number;
  opacity: number;
  transparent: boolean;
}

export function createFigure(
  buildRig: (cardId: string) => Rig,
  cardId: string,
  facing: 1 | -1,
  seed: number
): Figure {
  const rig = buildRig(cardId);
  const melee = rig.melee ?? true;

  const root = new THREE.Group();
  // pose: Ebene für Wrapper-Offsets (Rückstoß, Umfallen, Spawn-Skalierung)
  const pose = new THREE.Group();
  pose.rotation.y = facing === 1 ? 0 : Math.PI;
  pose.add(rig.node);
  root.add(pose);

  // Weicher Standschatten (Fake, robust und billig auf Mobilgeräten)
  const shadow = new THREE.Mesh(
    geo('shadow', () => new THREE.CircleGeometry(0.5, 16)),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  // Beschwörungsring
  const ring = new THREE.Mesh(
    geo('ring', () => new THREE.RingGeometry(0.42, 0.55, 24)),
    new THREE.MeshBasicMaterial({ color: 0xf5b74a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  root.add(ring);

  // Basispose aller benannten Teile einsammeln
  const partList: PartRec[] = [];
  for (const key of Object.keys(rig.parts)) {
    const obj = rig.parts[key];
    partList.push({
      obj,
      pos: obj.position.clone(),
      rot: obj.rotation.clone(),
      scale: obj.scale.clone()
    });
  }

  // Alle Materialien (für Treffer-Blitz, Erschöpfungs-Dimmen, Sterbe-Fade)
  const mats: MatRec[] = [];
  // Material-Listen pro benanntem Teil (für Clip-Emissive/Opacity-Tracks)
  const partMats = new Map<string, MatRec[]>();
  const matByMaterial = new Map<THREE.MeshStandardMaterial, MatRec>();
  rig.node.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      const rec: MatRec = {
        m: o.material,
        color: o.material.color.clone(),
        emissive: o.material.emissive.clone(),
        emisInt: o.material.emissiveIntensity,
        opacity: o.material.opacity,
        transparent: o.material.transparent
      };
      mats.push(rec);
      matByMaterial.set(o.material, rec);
    }
  });
  for (const key of Object.keys(rig.parts)) {
    const list: MatRec[] = [];
    rig.parts[key].traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        const rec = matByMaterial.get(o.material);
        if (rec) list.push(rec);
      }
    });
    partMats.set(key, list);
  }

  function applyClip(clip: Clip, time: number): void {
    for (const tr of clip.tracks) {
      const obj = rig.parts[tr.part];
      if (!obj) continue;
      const v = sampleTrack(tr.keys, time);
      switch (tr.prop) {
        case 'pos.x': obj.position.x += v; break;
        case 'pos.y': obj.position.y += v; break;
        case 'pos.z': obj.position.z += v; break;
        case 'rot.x': obj.rotation.x += v; break;
        case 'rot.y': obj.rotation.y += v; break;
        case 'rot.z': obj.rotation.z += v; break;
        case 'scale': obj.scale.multiplyScalar(v); break;
        case 'emissive':
          for (const e of partMats.get(tr.part) ?? []) e.m.emissiveIntensity += v;
          break;
        case 'opacity':
          for (const e of partMats.get(tr.part) ?? []) {
            e.m.transparent = true;
            e.m.opacity *= v;
          }
          break;
      }
    }
  }

  const phase = (seed % 97) * 0.37; // Idle-Phasenversatz, damit nicht alle synchron wippen
  let spawnT0 = -1;
  let attackT0 = -1;
  let hitT0 = -1;
  let deathT0 = -1;
  let exhausted = false;
  let walking = false;
  const grayCol = new THREE.Color(0x5a6070);

  function applyExhaustTint() {
    for (const e of mats) {
      e.m.color.copy(e.color);
      if (exhausted) e.m.color.lerp(grayCol, 0.45);
    }
  }

  return {
    root,
    playSpawn() {
      spawnT0 = performance.now();
    },
    playAttack() {
      attackT0 = performance.now();
    },
    playHit() {
      hitT0 = performance.now();
    },
    playDeath() {
      if (deathT0 >= 0) return;
      deathT0 = performance.now();
      for (const e of mats) e.m.transparent = true;
    },
    setExhausted(on) {
      if (on === exhausted) return;
      exhausted = on;
      applyExhaustTint();
    },
    setWalking(on) {
      walking = on;
    },
    isDeathFinished(now) {
      return deathT0 >= 0 && now - deathT0 > DEATH_MS;
    },
    update(now) {
      const t = now / 1000 + phase;

      // (1) Basispose + Basismaterial zurücksetzen (Farbe bleibt via Exhaust-Tint)
      for (const p of partList) {
        p.obj.position.copy(p.pos);
        p.obj.rotation.copy(p.rot);
        p.obj.scale.copy(p.scale);
      }
      for (const e of mats) {
        e.m.emissive.copy(e.emissive);
        e.m.emissiveIntensity = e.emisInt;
        e.m.opacity = e.opacity;
        e.m.transparent = e.transparent;
      }

      // (2) Idle-/Lauf-Clip additiv (Loop)
      const loop = walking && rig.clips.walk ? rig.clips.walk : rig.clips.idle;
      applyClip(loop, ((t % loop.duration) + loop.duration) % loop.duration);

      // (3) Angriffs-Clip additiv (One-Shot)
      let attackLunge = 0;
      if (attackT0 >= 0) {
        const p = (now - attackT0) / ATTACK_MS;
        if (p >= 1) {
          attackT0 = -1;
        } else {
          applyClip(rig.clips.attack, p * rig.clips.attack.duration);
          // Ausfallschritt nach vorn (nur Nahkämpfer)
          if (melee) {
            attackLunge =
              p < 0.3 ? -(p / 0.3) * 0.18 : p < 0.6 ? -0.18 + ((p - 0.3) / 0.3) * 1.08 : 0.9 * (1 - (p - 0.6) / 0.4);
          }
        }
      }
      rig.node.position.z = attackLunge * 0.55;

      // (4) Wrapper-FX
      pose.position.set(0, 0, 0);
      pose.rotation.x = 0;
      pose.rotation.z = 0;
      let scl = 1;

      // Erschöpft: leicht eingesackte Haltung
      if (exhausted && deathT0 < 0) {
        pose.rotation.x = 0.07;
        scl *= 0.97;
      }

      // Beschwörung: aus dem Boden hochwachsen, Ring pulst auf
      if (spawnT0 >= 0) {
        const p = Math.min(1, (now - spawnT0) / SPAWN_MS);
        scl *= 0.15 + 0.85 * easeOutBack(p);
        pose.position.y = (1 - p) * -0.15;
        const rp = Math.min(1, (now - spawnT0) / (SPAWN_MS * 1.15));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - rp);
        ring.scale.setScalar(0.6 + rp * 1.6);
        if (p >= 1 && rp >= 1) spawnT0 = -1;
      }

      // Treffer: rotes Aufblitzen + kurzer Rückstoß
      if (hitT0 >= 0) {
        const p = Math.min(1, (now - hitT0) / HIT_MS);
        const f = (1 - p) * (1 - p);
        for (const e of mats) e.m.emissive.setRGB(e.emissive.r + f * 0.9, e.emissive.g + f * 0.1, e.emissive.b + f * 0.08);
        pose.position.z -= f * 0.22;
        pose.position.x = Math.sin(p * 40) * f * 0.05;
        if (p >= 1) hitT0 = -1;
      }

      // Tod: umkippen, einsinken, ausblenden
      if (deathT0 >= 0) {
        const p = Math.min(1, (now - deathT0) / DEATH_MS);
        pose.rotation.x = -p * p * (Math.PI / 2) * 0.95;
        pose.position.y = -p * 0.18;
        const op = 1 - p * p;
        for (const e of mats) {
          e.m.transparent = true;
          e.m.opacity *= op;
        }
        (shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * op;
      }

      pose.scale.setScalar(scl);
    },
    dispose() {
      for (const e of mats) e.m.dispose();
      (shadow.material as THREE.MeshBasicMaterial).dispose();
      (ring.material as THREE.MeshBasicMaterial).dispose();
      // Geometrien liegen im gemeinsamen Cache und bleiben erhalten
    }
  };
}
