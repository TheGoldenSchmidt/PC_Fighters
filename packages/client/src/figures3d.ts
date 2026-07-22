// Prozedurale 3D-Spielfiguren (three.js, Low-Poly).
//
// Jede Kreatur-Karte bekommt ein aus Grundkörpern zusammengesetztes Modell
// mit eigenem Rig: Beine, Arme, Kopf, Schwanz, Flügel … sind separate
// Gruppen, die die Idle-/Lauf-/Angriffs-Posen animieren. Es werden keine
// Modell-Dateien benötigt – neue Karten fallen auf einen eingefärbten
// Golem zurück (Farbe aus der Karten-id gehasht).
//
// Koordinaten-Konvention: Füße bei y=0, Blickrichtung +z. Die Battlefield-
// Komponente dreht eigene Figuren um 180°, damit sie zum Gegner schauen.
// Nominale Skala: ein Mensch ist ~1.7 Einheiten hoch; Tiere entsprechend
// kleiner/größer, damit die Größenverhältnisse stimmen.

import * as THREE from 'three';
import type { Animations, VisualCatalogEntry } from '@pcf/engine';
import { buildFigure } from './figures/CardFigure';
import { createAnimationPlayer } from './figures/AnimationPlayer';

// ---- Timing (muss zur Kampf-Abspielung im GameScreen passen) ----
export const SPAWN_MS = 650;
export const ATTACK_MS = 500;
export const HIT_MS = 420;
export const DEATH_MS = 600;

/** Reduced-Motion einmalig auslesen (Idle beruhigen, Klips kürzer wirken). */
const reducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/** Internes Rig, das die Arten-Bauer zurückgeben. */
interface Rig {
  node: THREE.Group;
  /** Idle-/Laufpose; t in Sekunden (bereits mit Phasenversatz). */
  idle(t: number, walking: boolean): void;
  /** Zusätzliche Angriffspose, p ∈ [0,1] (Ausholen → Schlag → zurück). */
  attackPose?(p: number): void;
}

// ---- Geometrie-Cache (Geometrien sind teilbar, Materialien nicht) ----
const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const box = (w: number, h: number, d: number) =>
  geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const sph = (r: number, seg = 7) =>
  geo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(4, seg - 1)));
const cyl = (rt: number, rb: number, h: number, seg = 8) =>
  geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const cone = (r: number, h: number, seg = 6) =>
  geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));

function mat(color: number | string, opts: { metal?: number; rough?: number; emissive?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.85,
    metalness: opts.metal ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    flatShading: true
  });
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  return me;
}

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Menschen (Humanoid-Baukasten)
// ---------------------------------------------------------------------------

interface HumanoidCfg {
  skin: number;
  cloth: number;
  accent: number;
  bulky?: boolean; // Ritter & Co: breiterer Torso
  helmet?: 'kettle' | 'greathelm' | 'plume';
  sword?: boolean;
  shield?: boolean;
  staff?: boolean; // Heilerin: Stab mit leuchtender Spitze
  banner?: boolean;
  cape?: boolean;
}

function buildHumanoid(cfg: HumanoidCfg): Rig {
  const node = new THREE.Group();
  const w = cfg.bulky ? 1.25 : 1;

  const clothM = mat(cfg.cloth);
  const skinM = mat(cfg.skin);
  const accentM = mat(cfg.accent, { metal: 0.35, rough: 0.5 });
  const steelM = mat(0x9aa7b8, { metal: 0.7, rough: 0.35 });

  // Beine: Hüft-Pivots, damit sie beim Laufen schwingen können
  const legL = group(node, -0.13 * w, 0.62, 0);
  const legR = group(node, 0.13 * w, 0.62, 0);
  for (const leg of [legL, legR]) {
    leg.add(mesh(box(0.15 * w, 0.6, 0.17), clothM, 0, -0.31, 0));
    leg.add(mesh(box(0.17 * w, 0.09, 0.26), accentM, 0, -0.6, 0.04)); // Stiefel
  }

  // Torso + Kopf (eigene Gruppe für Atmen/Nicken)
  const chest = group(node, 0, 0.62, 0);
  chest.add(mesh(box(0.52 * w, 0.55, 0.3 * w), clothM, 0, 0.28, 0));
  chest.add(mesh(box(0.54 * w, 0.16, 0.32 * w), accentM, 0, 0.06, 0)); // Gürtel
  const head = group(chest, 0, 0.66, 0);
  head.add(mesh(sph(0.185), skinM, 0, 0.1, 0));
  if (cfg.helmet === 'kettle') {
    head.add(mesh(cyl(0.2, 0.24, 0.1, 8), steelM, 0, 0.2, 0));
  } else if (cfg.helmet === 'greathelm') {
    head.add(mesh(cyl(0.19, 0.2, 0.3, 8), steelM, 0, 0.12, 0));
    head.add(mesh(box(0.3, 0.03, 0.1), mat(0x222833), 0, 0.1, 0.16)); // Sehschlitz
  } else if (cfg.helmet === 'plume') {
    head.add(mesh(cyl(0.17, 0.2, 0.16, 8), accentM, 0, 0.22, 0));
    head.add(mesh(cone(0.06, 0.3, 5), mat(0xd64545), 0, 0.38, -0.04)); // Federbusch
  }

  // Arme: Schulter-Pivots (rechter Arm führt die Waffe)
  const armL = group(chest, -(0.33 * w), 0.48, 0);
  const armR = group(chest, 0.33 * w, 0.48, 0);
  armL.add(mesh(box(0.13, 0.48, 0.15), clothM, 0, -0.22, 0));
  armR.add(mesh(box(0.13, 0.48, 0.15), clothM, 0, -0.22, 0));
  armL.add(mesh(sph(0.1), accentM, 0, 0.02, 0));
  armR.add(mesh(sph(0.1), accentM, 0, 0.02, 0));

  if (cfg.sword) {
    const sword = group(armR, 0, -0.44, 0.06);
    sword.add(mesh(box(0.05, 0.1, 0.16), steelM, 0, 0, 0.02));
    sword.add(mesh(box(0.035, 0.04, 0.55), steelM, 0, 0, 0.36)); // Klinge nach vorn
    sword.rotation.x = -0.5;
  }
  if (cfg.shield) {
    const shield = group(armL, -0.1, -0.3, 0.05);
    shield.add(mesh(cyl(0.26, 0.26, 0.06, 10), accentM));
    shield.rotation.x = Math.PI / 2;
    shield.add(mesh(sph(0.07), steelM, 0, 0.05, 0));
  }
  if (cfg.staff) {
    const staff = group(armR, 0, -0.44, 0.05);
    staff.add(mesh(cyl(0.03, 0.03, 1.1, 6), mat(0x8a6a45), 0, 0.3, 0));
    staff.add(mesh(sph(0.09, 6), mat(0xfff3c0, { emissive: 0xffd766 }), 0, 0.88, 0));
  }
  let flag: THREE.Mesh | null = null;
  if (cfg.banner) {
    const pole = group(armR, 0, -0.44, 0.05);
    pole.add(mesh(cyl(0.03, 0.03, 1.5, 6), mat(0x8a6a45), 0, 0.45, 0));
    flag = mesh(box(0.04, 0.34, 0.5), accentM, 0, 1.0, 0.26);
    pole.add(flag);
  }
  let cape: THREE.Mesh | null = null;
  if (cfg.cape) {
    cape = mesh(box(0.5 * w, 0.85, 0.05), mat(0x7c2d3e), 0, 0.12, -0.2 * w);
    chest.add(cape);
  }

  return {
    node,
    idle(t, walking) {
      // Atmen + leichtes Gewichtsverlagern; beim Laufen schwingen die Glieder
      chest.position.y = 0.62 + Math.sin(t * 2.1) * 0.02;
      chest.rotation.z = Math.sin(t * 0.9) * 0.03;
      head.rotation.y = Math.sin(t * 0.7) * 0.18;
      head.rotation.x = Math.sin(t * 1.3) * 0.05;
      const swing = walking ? Math.sin(t * 9) * 0.7 : Math.sin(t * 2.1) * 0.06;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.7;
      armR.rotation.x = swing * 0.7 + (walking ? 0 : Math.sin(t * 1.7) * 0.05);
      if (flag) flag.rotation.y = Math.sin(t * 2.6) * 0.25;
      if (cape) cape.rotation.x = 0.12 + Math.sin(t * 1.8) * 0.06 + (walking ? 0.25 : 0);
    },
    attackPose(p) {
      // Ausholen (Arm hoch) → Hieb nach vorn → zurück
      const raise = p < 0.35 ? p / 0.35 : p < 0.7 ? 1 - ((p - 0.35) / 0.35) * 1.6 : -0.6 + ((p - 0.7) / 0.3) * 0.6;
      armR.rotation.x = -1.9 * raise;
      chest.rotation.x = p < 0.35 ? -0.12 * (p / 0.35) : 0.22 * (1 - p);
    }
  };
}

// ---------------------------------------------------------------------------
// Tiere
// ---------------------------------------------------------------------------

interface QuadCfg {
  fur: number;
  belly?: number;
  scale: number; // Gesamtgröße (Ratte klein, Bär groß)
  earSize: number;
  roundEars?: boolean; // Bär
  snout: number; // Schnauzenlänge
  tail: 'thin' | 'bushy' | 'stub';
  eyes?: number; // Augenfarbe (Alphawolf: rot glühend)
  mane?: boolean; // Alphawolf: Nackenkamm
}

function buildQuadruped(cfg: QuadCfg): Rig {
  const node = new THREE.Group();
  const s = cfg.scale;
  const furM = mat(cfg.fur);
  const bellyM = mat(cfg.belly ?? cfg.fur);
  const eyeM = mat(cfg.eyes ?? 0x1a1a22, cfg.eyes ? { emissive: cfg.eyes } : {});

  // Körper (Pivot fürs Auf-und-ab beim Traben)
  const body = group(node, 0, 0.52 * s, 0);
  body.add(mesh(box(0.5 * s, 0.42 * s, 0.95 * s), furM));
  body.add(mesh(box(0.44 * s, 0.14 * s, 0.7 * s), bellyM, 0, -0.24 * s, 0.05 * s));
  if (cfg.mane) {
    body.add(mesh(cone(0.16 * s, 0.3 * s, 4), furM, 0, 0.28 * s, 0.18 * s));
    body.add(mesh(cone(0.13 * s, 0.24 * s, 4), furM, 0, 0.28 * s, -0.02 * s));
  }

  // Kopf mit Schnauze und Ohren (Pivot am Hals: Schnüffeln/Beißen)
  const head = group(body, 0, 0.22 * s, 0.48 * s);
  head.add(mesh(box(0.36 * s, 0.32 * s, 0.34 * s), furM, 0, 0.06 * s, 0.06 * s));
  head.add(mesh(box(0.18 * s, 0.16 * s, cfg.snout * s), furM, 0, -0.01 * s, (0.22 + cfg.snout / 2) * s));
  head.add(mesh(sph(0.05 * s, 5), mat(0x2b2b33), 0, -0.01 * s, (0.24 + cfg.snout) * s)); // Nase
  head.add(mesh(sph(0.045 * s, 5), eyeM, -0.1 * s, 0.12 * s, 0.22 * s));
  head.add(mesh(sph(0.045 * s, 5), eyeM, 0.1 * s, 0.12 * s, 0.22 * s));
  const earGeo = cfg.roundEars ? sph(0.09 * s, 6) : cone(0.08 * s, 0.2 * s, 4);
  head.add(mesh(earGeo, furM, -0.13 * s, 0.28 * s, 0));
  head.add(mesh(earGeo, furM, 0.13 * s, 0.28 * s, 0));
  if (cfg.earSize > 1) {
    // Ratte: extra große Lauscher
    head.add(mesh(sph(0.1 * s * cfg.earSize, 6), mat(0xd8a0a8), -0.15 * s, 0.3 * s, -0.02 * s));
    head.add(mesh(sph(0.1 * s * cfg.earSize, 6), mat(0xd8a0a8), 0.15 * s, 0.3 * s, -0.02 * s));
  }

  // Vier Beine (Pivots oben für den Trab)
  const legs: THREE.Group[] = [];
  for (const [lx, lz] of [[-0.18, 0.32], [0.18, 0.32], [-0.18, -0.32], [0.18, -0.32]]) {
    const leg = group(body, lx * s, -0.2 * s, lz * s);
    leg.add(mesh(box(0.12 * s, 0.34 * s, 0.13 * s), furM, 0, -0.17 * s, 0));
    legs.push(leg);
  }

  // Schwanz
  const tail = group(body, 0, 0.08 * s, -0.5 * s);
  if (cfg.tail === 'thin') {
    tail.add(mesh(cyl(0.02 * s, 0.035 * s, 0.55 * s, 5), mat(0xc98f96), 0, 0.05 * s, -0.26 * s));
    tail.rotation.x = 1.2;
  } else if (cfg.tail === 'bushy') {
    tail.add(mesh(cone(0.1 * s, 0.5 * s, 5), furM, 0, 0.1 * s, -0.2 * s));
    tail.rotation.x = 1.9;
  } else {
    tail.add(mesh(sph(0.08 * s, 5), furM));
  }

  return {
    node,
    idle(t, walking) {
      body.position.y = 0.52 * s + Math.sin(t * (walking ? 10 : 2.4)) * (walking ? 0.04 : 0.015) * s;
      head.rotation.x = Math.sin(t * 1.9) * 0.1 + (walking ? -0.1 : 0);
      head.rotation.y = Math.sin(t * 0.8) * 0.2;
      tail.rotation.z = Math.sin(t * (walking ? 8 : 3.2)) * 0.35;
      const trot = walking ? Math.sin(t * 10) * 0.65 : Math.sin(t * 2.4) * 0.04;
      legs[0].rotation.x = trot;
      legs[1].rotation.x = -trot;
      legs[2].rotation.x = -trot;
      legs[3].rotation.x = trot;
    },
    attackPose(p) {
      // Sprung-Biss: Körper duckt sich, Kopf stößt nach vorn
      const bite = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
      body.rotation.x = -0.25 * bite;
      head.rotation.x = 0.55 * bite;
    }
  };
}

function buildSnake(): Rig {
  const node = new THREE.Group();
  const green = mat(0x4e9d4e);
  const dark = mat(0x2f6d38);

  // Aufgerollter Körper: Ringsegmente, darüber der aufgerichtete Hals
  const coil = group(node, 0, 0.09, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    coil.add(mesh(sph(0.13, 6), i % 2 ? green : dark, Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26));
  }
  const neck = group(node, 0, 0.14, 0.1);
  const n1 = mesh(cyl(0.09, 0.12, 0.4, 6), green, 0, 0.2, 0);
  neck.add(n1);
  const neckTop = group(neck, 0, 0.42, 0.02);
  neckTop.add(mesh(cyl(0.07, 0.09, 0.3, 6), green, 0, 0.12, 0));
  const head = group(neckTop, 0, 0.3, 0.02);
  head.add(mesh(sph(0.12, 6), dark, 0, 0.02, 0.03));
  head.add(mesh(box(0.12, 0.07, 0.16), dark, 0, 0, 0.14));
  head.add(mesh(sph(0.035, 5), mat(0xffd23e, { emissive: 0x8a6a00 }), -0.06, 0.07, 0.08));
  head.add(mesh(sph(0.035, 5), mat(0xffd23e, { emissive: 0x8a6a00 }), 0.06, 0.07, 0.08));
  const tongue = mesh(box(0.02, 0.015, 0.14), mat(0xd64545), 0, -0.01, 0.26);
  head.add(tongue);

  return {
    node,
    idle(t) {
      neck.rotation.z = Math.sin(t * 1.5) * 0.18;
      neck.rotation.x = Math.sin(t * 1.1) * 0.1 - 0.08;
      neckTop.rotation.z = Math.sin(t * 1.5 + 1) * 0.22;
      head.rotation.y = Math.sin(t * 0.9) * 0.35;
      // Zünglein: schnellt periodisch heraus
      tongue.scale.z = Math.max(0, Math.sin(t * 5)) > 0.7 ? 1 : 0.01;
      coil.rotation.y = Math.sin(t * 0.5) * 0.1;
    },
    attackPose(p) {
      // Zustoßen: Hals spannt zurück und schnellt vor
      const strike = p < 0.35 ? -(p / 0.35) * 0.5 : (1 - (p - 0.35) / 0.65) * 0.9;
      neck.rotation.x = strike * -1.1 - 0.08;
      head.rotation.x = strike * 0.6;
    }
  };
}

function buildBird(): Rig {
  const node = new THREE.Group();
  const brown = mat(0x7a5230);
  const light = mat(0xd9c9a8);

  // Rumpf schwebt – Vögel stehen nicht, sie fliegen auf der Stelle
  const bodyG = group(node, 0, 0.85, 0);
  bodyG.rotation.x = -0.25;
  bodyG.add(mesh(sph(0.24, 7), brown, 0, 0, 0));
  bodyG.add(mesh(sph(0.16, 6), light, 0, -0.08, 0.12));
  const head = group(bodyG, 0, 0.22, 0.14);
  head.add(mesh(sph(0.14, 6), light));
  head.add(mesh(cone(0.05, 0.16, 4), mat(0xf0a832), 0, -0.01, 0.17));
  head.children[1].rotation.x = Math.PI / 2;
  head.add(mesh(sph(0.035, 5), mat(0x1a1a22), -0.08, 0.04, 0.09));
  head.add(mesh(sph(0.035, 5), mat(0x1a1a22), 0.08, 0.04, 0.09));

  // Flügel: Pivots an den Schultern, permanent schlagend
  const wingL = group(bodyG, -0.18, 0.08, -0.02);
  const wingR = group(bodyG, 0.18, 0.08, -0.02);
  wingL.add(mesh(box(0.55, 0.04, 0.3), brown, -0.3, 0, 0));
  wingR.add(mesh(box(0.55, 0.04, 0.3), brown, 0.3, 0, 0));
  const tail = mesh(box(0.2, 0.03, 0.3), brown, 0, -0.06, -0.3);
  bodyG.add(tail);
  // Krallen
  bodyG.add(mesh(cyl(0.02, 0.02, 0.15, 4), mat(0xf0a832), -0.07, -0.26, 0));
  bodyG.add(mesh(cyl(0.02, 0.02, 0.15, 4), mat(0xf0a832), 0.07, -0.26, 0));

  return {
    node,
    idle(t, walking) {
      const flapSpeed = walking ? 14 : 9;
      const flap = Math.sin(t * flapSpeed) * 0.65;
      wingL.rotation.z = -0.25 - flap;
      wingR.rotation.z = 0.25 + flap;
      bodyG.position.y = 0.85 + Math.sin(t * 2.2) * 0.08;
      head.rotation.y = Math.sin(t * 1.1) * 0.4;
      tail.rotation.x = Math.sin(t * 2.2) * 0.15;
    },
    attackPose(p) {
      // Sturzflug-Andeutung
      const dive = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
      bodyG.rotation.x = -0.25 - dive * 0.7;
      bodyG.position.y = 0.85 - dive * 0.3;
    }
  };
}

/** Fallback für unbekannte Karten: kleiner Golem, Farbe aus der id gehasht. */
function buildGolem(cardId: string): Rig {
  let h = 0;
  for (let i = 0; i < cardId.length; i++) h = (h * 31 + cardId.charCodeAt(i)) >>> 0;
  const color = new THREE.Color().setHSL((h % 360) / 360, 0.45, 0.5).getHex();
  const stone = mat(color, { rough: 1 });
  const node = new THREE.Group();
  const body = group(node, 0, 0.55, 0);
  body.add(mesh(box(0.6, 0.6, 0.4), stone, 0, 0.3, 0));
  const head = group(body, 0, 0.75, 0);
  head.add(mesh(box(0.3, 0.26, 0.28), stone));
  head.add(mesh(sph(0.04, 5), mat(0xffffff, { emissive: 0xaad4ff }), -0.08, 0.03, 0.15));
  head.add(mesh(sph(0.04, 5), mat(0xffffff, { emissive: 0xaad4ff }), 0.08, 0.03, 0.15));
  const armL = group(body, -0.38, 0.5, 0);
  const armR = group(body, 0.38, 0.5, 0);
  armL.add(mesh(box(0.16, 0.55, 0.2), stone, 0, -0.25, 0));
  armR.add(mesh(box(0.16, 0.55, 0.2), stone, 0, -0.25, 0));
  node.add(mesh(box(0.22, 0.55, 0.24), stone, -0.16, 0.28, 0));
  node.add(mesh(box(0.22, 0.55, 0.24), stone, 0.16, 0.28, 0));
  return {
    node,
    idle(t, walking) {
      body.position.y = 0.55 + Math.sin(t * 1.8) * 0.02;
      head.rotation.y = Math.sin(t * 0.7) * 0.25;
      const swing = walking ? Math.sin(t * 8) * 0.5 : Math.sin(t * 1.8) * 0.05;
      armL.rotation.x = swing;
      armR.rotation.x = -swing;
    },
    attackPose(p) {
      const smash = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
      armR.rotation.x = -2.0 * smash;
    }
  };
}

// ---- Karten-id → Modell ----
function buildRig(cardId: string): Rig {
  switch (cardId) {
    case 'rekrut':
      return buildHumanoid({ skin: 0xe8b98a, cloth: 0x6b7a8f, accent: 0x8a6a45, helmet: 'kettle', sword: true });
    case 'schildwache':
      return buildHumanoid({ skin: 0xe8b98a, cloth: 0x4a6a9a, accent: 0x3b82f6, helmet: 'kettle', shield: true, sword: true });
    case 'feldscherin':
      return buildHumanoid({ skin: 0xd9a06e, cloth: 0xe8e2d4, accent: 0xc94f4f, staff: true });
    case 'bannertraeger':
      return buildHumanoid({ skin: 0xe8b98a, cloth: 0x8f5a3a, accent: 0xd6a23e, banner: true });
    case 'ritter':
      return buildHumanoid({ skin: 0xe8b98a, cloth: 0x9aa7b8, accent: 0x6a7686, bulky: true, helmet: 'greathelm', sword: true, shield: true });
    case 'kommandantin':
      return buildHumanoid({ skin: 0xd9a06e, cloth: 0x35507a, accent: 0xd6a23e, helmet: 'plume', sword: true, cape: true });
    case 'ratte':
      return buildQuadruped({ fur: 0x8d7b6a, belly: 0xb5a694, scale: 0.5, earSize: 1.3, snout: 0.28, tail: 'thin' });
    case 'wolf':
      return buildQuadruped({ fur: 0x8b8f98, belly: 0xc6c9cf, scale: 0.85, earSize: 1, snout: 0.3, tail: 'bushy' });
    case 'alphawolf':
      return buildQuadruped({ fur: 0x3d4048, belly: 0x6a6e78, scale: 1.0, earSize: 1, snout: 0.32, tail: 'bushy', eyes: 0xff3b30, mane: true });
    case 'baer':
      return buildQuadruped({ fur: 0x6e4f33, belly: 0x9a7a55, scale: 1.25, earSize: 0.9, roundEars: true, snout: 0.22, tail: 'stub' });
    case 'schlange':
      return buildSnake();
    case 'adler':
      return buildBird();
    default:
      return buildGolem(cardId);
  }
}

// ---------------------------------------------------------------------------
// Figure-Wrapper: Zustandsmaschine für Spawn/Angriff/Treffer/Tod + Blob-Schatten
// ---------------------------------------------------------------------------

const easeOutBack = (p: number) => {
  const c = 1.70158;
  const q = p - 1;
  return 1 + (c + 1) * q * q * q + c * q * q;
};

/**
 * Datengetriebene Figur aus dem `visual`/`animations`-Block einer Karte.
 * Gleiches `Figure`-Interface wie der Code-Rig-Pfad; der Battlefield merkt
 * keinen Unterschied. `play*` löst die passenden Klips im Player aus.
 */
function createDataFigure(facing: 1 | -1, entry: VisualCatalogEntry, defaultClips: Animations): Figure {
  const built = buildFigure(entry.visual!);
  const model = built.root;

  const root = new THREE.Group();
  // Blickrichtung auf der äußeren Ebene (wie beim Rig-Pfad die "pose"-Gruppe):
  // so zeigen Animations-Ausfälle (+z) korrekt zum Gegner.
  const outer = new THREE.Group();
  outer.rotation.y = facing === 1 ? 0 : Math.PI;
  outer.add(model);
  root.add(outer);

  const shadow = new THREE.Mesh(
    geo('shadow', () => new THREE.CircleGeometry(0.5, 16)),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  const ring = new THREE.Mesh(
    geo('ring', () => new THREE.RingGeometry(0.42, 0.55, 24)),
    new THREE.MeshBasicMaterial({ color: 0xf5b74a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  root.add(ring);

  const clips: Animations = { ...defaultClips, ...(entry.animations ?? {}) };
  const player = createAnimationPlayer(built.parts, clips, { reducedMotion });
  const deathMs = (clips.death?.duration ?? 1.0) * 1000;

  // Farb-Basis fürs Erschöpfungs-Dimmen (Player fasst Farbe nicht an).
  const mats: { m: THREE.MeshStandardMaterial; color: THREE.Color }[] = [];
  model.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      mats.push({ m: o.material, color: o.material.color.clone() });
    }
  });
  const grayCol = new THREE.Color(0x5a6070);
  let exhausted = false;
  let spawnT0 = -1;
  let deathT0 = -1;

  return {
    root,
    playSpawn() {
      spawnT0 = performance.now();
      player.play('entrance');
    },
    playAttack() {
      player.play('attack');
    },
    playHit() {
      player.play('hit');
    },
    playDeath() {
      if (deathT0 >= 0) return;
      deathT0 = performance.now();
      player.play('death');
    },
    setExhausted(on) {
      if (on === exhausted) return;
      exhausted = on;
      for (const e of mats) {
        e.m.color.copy(e.color);
        if (exhausted) e.m.color.lerp(grayCol, 0.45);
      }
    },
    setWalking() {
      // Datengetriebene Figuren: der Idle-Loop sorgt für Lebendigkeit,
      // ein separater Lauf-Klip ist optional und (noch) nicht nötig.
    },
    isDeathFinished(now) {
      return deathT0 >= 0 && now - deathT0 > deathMs;
    },
    update(now) {
      player.update(now);
      if (spawnT0 >= 0) {
        const rp = Math.min(1, (now - spawnT0) / (SPAWN_MS * 1.15));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - rp);
        ring.scale.setScalar(0.6 + rp * 1.6);
        if (rp >= 1) spawnT0 = -1;
      }
      if (deathT0 >= 0) {
        const p = Math.min(1, (now - deathT0) / deathMs);
        (shadow.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - p * p);
      }
    },
    dispose() {
      model.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) o.material.dispose();
      });
      (shadow.material as THREE.MeshBasicMaterial).dispose();
      (ring.material as THREE.MeshBasicMaterial).dispose();
      // Geometrien liegen im gemeinsamen Cache und bleiben erhalten.
    }
  };
}

export function createFigure(
  cardId: string,
  facing: 1 | -1,
  seed: number,
  entry?: VisualCatalogEntry | null,
  defaultClips?: Animations
): Figure {
  if (entry?.visual) return createDataFigure(facing, entry, defaultClips ?? {});

  const rig = buildRig(cardId);

  const root = new THREE.Group();
  // pose: Ebene für Animations-Offsets (Ausfall, Rückstoß, Umfallen)
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

  // Alle Materialien einsammeln (für Treffer-Blitz, Erschöpfungs-Dimmen, Sterbe-Fade)
  const mats: { m: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color }[] = [];
  rig.node.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      mats.push({ m: o.material, color: o.material.color.clone(), emissive: o.material.emissive.clone() });
    }
  });

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
      for (const e of mats) {
        e.m.transparent = true;
      }
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
      rig.idle(t, walking);

      // Grund-Pose zurücksetzen, dann Effekte aufschichten
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

      // Angriff: Ausfallschritt nach vorn (lokal +z = Blickrichtung)
      if (attackT0 >= 0) {
        const p = Math.min(1, (now - attackT0) / ATTACK_MS);
        const lunge = p < 0.3 ? -(p / 0.3) * 0.18 : p < 0.6 ? -0.18 + ((p - 0.3) / 0.3) * 1.08 : 0.9 * (1 - (p - 0.6) / 0.4);
        rig.node.position.z = lunge * 0.55;
        rig.attackPose?.(p);
        if (p >= 1) {
          attackT0 = -1;
          rig.node.position.z = 0;
        }
      } else {
        rig.node.position.z = 0;
      }

      // Treffer: rotes Aufblitzen + kurzer Rückstoß
      if (hitT0 >= 0) {
        const p = Math.min(1, (now - hitT0) / HIT_MS);
        const f = (1 - p) * (1 - p);
        for (const e of mats) e.m.emissive.setRGB(f * 0.9 + e.emissive.r, f * 0.1 + e.emissive.g, f * 0.08 + e.emissive.b);
        pose.position.z -= f * 0.22;
        pose.position.x = Math.sin(p * 40) * f * 0.05;
        if (p >= 1) {
          hitT0 = -1;
          for (const e of mats) e.m.emissive.copy(e.emissive);
        }
      }

      // Tod: umkippen, einsinken, ausblenden
      if (deathT0 >= 0) {
        const p = Math.min(1, (now - deathT0) / DEATH_MS);
        pose.rotation.x = -p * p * (Math.PI / 2) * 0.95;
        pose.position.y = -p * 0.18;
        const op = 1 - p * p;
        for (const e of mats) e.m.opacity = op;
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
