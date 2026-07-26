// Prozedurale 3D-Umgebungen (Schauplätze) für das Schlachtfeld.
//
// Je Schauplatz (Topic.environment) wird eine lane-freie Deko-Kulisse um das
// Spielfeld herum aufgebaut: Wald = Bäume/Büsche, Höhle = Fels + Fledermäuse,
// Stadt = Häuser/Autos. Die Objekte selbst sind aus denselben Low-Poly-
// Primitiven wie die Figuren gebaut (buildFigure aus einer `Visual`-Definition).
//
// Platzierung: Das Battlefield liefert pro Frame die aktuellen Feldkanten
// (aus den DOM-Slot-Ankern abgeleitet). `layout` setzt die Props seitlich
// neben und hinter das Lane-Band – so bleibt das Feld frei und die Kulisse
// skaliert automatisch mit Lane-Anzahl und Bildschirmgröße.
//
// Wichtig (wie bei den Figuren): beim Dispose nur Materialien freigeben –
// die Geometrien liegen im gemeinsamen Cache von buildFigure und bleiben.

import * as THREE from 'three';
import type { EnvironmentKind, Visual } from '@pcf/engine';
import { buildFigure } from './figures/CardFigure';

/** Aktuelle Feldgeometrie in Weltkoordinaten (vom Battlefield pro Frame). */
export interface FieldMetrics {
  /** x der linken Feldkante (Slot-Mitte Lane 0). */
  leftX: number;
  /** x der rechten Feldkante (Slot-Mitte letzte Lane). */
  rightX: number;
  /** z der eigenen (kameranahen) Reihe. */
  nearZ: number;
  /** z der gegnerischen (fernen) Reihe. */
  farZ: number;
  /** Mitte-zu-Mitte-Abstand zweier Lanes (Welt-Einheiten). */
  laneStep: number;
  /** Skala, mit der auch die Figuren im Slot dargestellt werden. */
  scale: number;
}

export interface EnvironmentRec {
  /** Wurzel-Gruppe – vom Battlefield in die Szene gehängt. */
  group: THREE.Group;
  /** Props an die aktuellen Feldkanten setzen (pro Frame aufrufbar). */
  layout(m: FieldMetrics): void;
  /** Animierte Deko (Wiegen, Fledermäuse) fortschreiben. `now` in ms. */
  update(now: number): void;
  /** Materialien freigeben (Geometrien bleiben im gemeinsamen Cache). */
  dispose(): void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Platzierungs-Beschreibung: relativ zu den Feldkanten, damit lane-frei.
// ---------------------------------------------------------------------------
type PlacementDesc =
  | { zone: 'left' | 'right'; u: number; out: number } // entlang z, nach außen versetzt
  | { zone: 'back'; nx: number; depth: number }; // quer über die Breite, hinter dem Feld

interface Placed {
  wrapper: THREE.Group; // trägt Position/Skala; enthält die (autogefittete) Prop-Wurzel
  desc: PlacementDesc;
  /** Halbe tatsächliche Breite des Props nach Auto-Fit, noch ohne Feld-Skala. */
  halfWidth: number;
  sway: number; // Wiege-Amplitude (0 = statisch)
  bob: number;
  spin: number;
  pulse: number;
  lift: number;
  phase: number;
  layoutScale: number;
  baseRotY: number;
  baseRotZ: number;
}

/** Eine Prop-Instanz aus einer Visual-Definition (buildFigure) in einen Wrapper. */
function propInstance(visual: Visual): { wrapper: THREE.Group; halfWidth: number } {
  const wrapper = new THREE.Group();
  wrapper.add(buildFigure(visual).root);
  const box = new THREE.Box3().setFromObject(wrapper);
  return { wrapper, halfWidth: Math.max(0.08, box.getSize(new THREE.Vector3()).x / 2) };
}

interface Motion {
  sway?: number;
  bob?: number;
  spin?: number;
  pulse?: number;
  lift?: number;
  yaw?: number;
  roll?: number;
}

/** Deterministische Streuung: Eine Arena sieht bei jedem Betreten gleich aus. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function addPlaced(
  group: THREE.Group,
  placed: Placed[],
  visual: Visual,
  desc: PlacementDesc,
  motion: Motion = {}
): THREE.Group {
  const { wrapper, halfWidth } = propInstance(visual);
  wrapper.rotation.y = motion.yaw ?? 0;
  wrapper.rotation.z = motion.roll ?? 0;
  group.add(wrapper);
  placed.push({
    wrapper,
    desc,
    halfWidth,
    sway: motion.sway ?? 0,
    bob: motion.bob ?? 0,
    spin: motion.spin ?? 0,
    pulse: motion.pulse ?? 0,
    lift: motion.lift ?? 0,
    phase: placed.length * 1.618 + 0.7,
    layoutScale: 1,
    baseRotY: wrapper.rotation.y,
    baseRotZ: wrapper.rotation.z
  });
  return wrapper;
}

function layoutPlaced(placed: Placed[], m: FieldMetrics): void {
  // Die äußere Slot-Kante liegt etwas außerhalb der Lane-Mitte. Zusätzlich
  // reservieren wir die echte Prop-Breite. Dadurch können selbst breite Bäume
  // nicht mehr in Lane 1 bzw. die äußerste Lane hineinragen.
  const fieldHalfLane = m.laneStep * 0.58;
  for (const p of placed) {
    const d = p.desc;
    let x: number;
    let z: number;
    if (d.zone === 'back') {
      x = lerp(m.leftX - fieldHalfLane, m.rightX + fieldHalfLane, (d.nx + 1) / 2);
      z = m.farZ - d.depth;
    } else {
      const edge = d.zone === 'left' ? m.leftX - fieldHalfLane : m.rightX + fieldHalfLane;
      const propClearance = p.halfWidth * m.scale;
      const perspectiveReserve = 0.4 + Math.max(0, -d.u) * m.laneStep * 0.18;
      const clearance = propClearance + perspectiveReserve + d.out;
      x = edge + (d.zone === 'left' ? -1 : 1) * clearance;
      z = lerp(m.farZ - 0.9, m.nearZ + 1.8, d.u);
    }
    p.wrapper.position.set(x, p.lift, z);
    p.layoutScale = m.scale;
    p.wrapper.scale.setScalar(m.scale);
  }
}

function updatePlaced(placed: Placed[], now: number): void {
  const t = now / 1000;
  for (const p of placed) {
    p.wrapper.rotation.z = p.baseRotZ + Math.sin(t * 0.85 + p.phase) * p.sway;
    p.wrapper.rotation.y = p.baseRotY + t * p.spin;
    p.wrapper.position.y = p.lift + Math.sin(t * 1.15 + p.phase) * p.bob;
    const pulse = 1 + Math.sin(t * 1.7 + p.phase) * p.pulse;
    p.wrapper.scale.setScalar(p.layoutScale * pulse);
  }
}

function finishEnvironment(group: THREE.Group, placed: Placed[]): EnvironmentRec {
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    group,
    layout: (m) => layoutPlaced(placed, m),
    update: (now) => {
      if (!reducedMotion) updatePlaced(placed, now);
    },
    dispose: () => disposeMaterials(group)
  };
}

// ---------------------------------------------------------------------------
// Wald: Nadelbäume, Laubbäume, Büsche
// ---------------------------------------------------------------------------
const WALD_PALETTE = {
  trunk: '#5b4029',
  trunkDark: '#463019',
  leafDark: '#2f6b39',
  leaf: '#3f8a4a',
  leafLight: '#59a860',
  rock: '#6b7074',
  rockDark: '#4f5457',
  grass: '#4f9a48'
};

/** Kleiner Felsbrocken (Ico-Cluster). */
function felsVisual(height: number): Visual {
  return {
    height,
    palette: WALD_PALETTE,
    parts: [
      { id: 'r1', shape: 'ico', size: 0.4, pos: [0, 0.28, 0], scale: [1.3, 0.8, 1.1], color: 'rock' },
      { id: 'r2', shape: 'ico', size: 0.26, pos: [0.3, 0.2, 0.12], color: 'rockDark' },
      { id: 'r3', shape: 'ico', size: 0.22, pos: [-0.26, 0.16, -0.1], color: 'rock' }
    ]
  };
}

/** Grasbüschel (ein paar dünne Kegel). */
function grasVisual(height: number): Visual {
  return {
    height,
    palette: WALD_PALETTE,
    parts: [
      { id: 'g1', shape: 'cone', size: [0.07, 0.5], pos: [0, 0.25, 0], color: 'grass' },
      { id: 'g2', shape: 'cone', size: [0.06, 0.42], pos: [0.12, 0.21, 0.05], rot: [0, 0, 0.25], color: 'leaf' },
      { id: 'g3', shape: 'cone', size: [0.06, 0.42], pos: [-0.11, 0.21, -0.04], rot: [0, 0, -0.25], color: 'leafLight' },
      { id: 'g4', shape: 'cone', size: [0.05, 0.36], pos: [0.02, 0.18, 0.12], rot: [0.2, 0, 0.1], color: 'grass' }
    ]
  };
}

/** Nadelbaum: Stamm + drei sich verjüngende Kegel. */
function nadelbaumVisual(height: number): Visual {
  return {
    height,
    palette: WALD_PALETTE,
    parts: [
      { id: 'trunk', shape: 'cyl', size: [0.12, 0.17, 0.9], pos: [0, 0.45, 0], color: 'trunk' },
      { id: 'f1', shape: 'cone', size: [0.85, 1.05], pos: [0, 1.05, 0], color: 'leafDark' },
      { id: 'f2', shape: 'cone', size: [0.66, 0.9], pos: [0, 1.55, 0], color: 'leaf' },
      { id: 'f3', shape: 'cone', size: [0.46, 0.78], pos: [0, 2.05, 0], color: 'leafLight' }
    ]
  };
}

/** Laubbaum: Stamm + rundliche Ico-Krone (mehrere Cluster). */
function laubbaumVisual(height: number): Visual {
  return {
    height,
    palette: WALD_PALETTE,
    parts: [
      { id: 'trunk', shape: 'cyl', size: [0.13, 0.18, 1.0], pos: [0, 0.5, 0], color: 'trunk' },
      { id: 'c1', shape: 'ico', size: 0.66, pos: [0, 1.35, 0], color: 'leaf' },
      { id: 'c2', shape: 'ico', size: 0.5, pos: [0.42, 1.55, 0.1], color: 'leafDark' },
      { id: 'c3', shape: 'ico', size: 0.48, pos: [-0.4, 1.5, -0.08], color: 'leafLight' },
      { id: 'c4', shape: 'ico', size: 0.44, pos: [0.05, 1.9, -0.05], color: 'leaf' }
    ]
  };
}

/** Busch: kompakter Ico-Cluster. */
function buschVisual(height: number): Visual {
  return {
    height,
    palette: WALD_PALETTE,
    parts: [
      { id: 'b1', shape: 'ico', size: 0.4, pos: [0, 0.34, 0], color: 'leaf' },
      { id: 'b2', shape: 'ico', size: 0.33, pos: [0.32, 0.3, 0.08], color: 'leafDark' },
      { id: 'b3', shape: 'ico', size: 0.31, pos: [-0.3, 0.32, -0.06], color: 'leafLight' },
      { id: 'b4', shape: 'ico', size: 0.28, pos: [0.04, 0.56, 0], color: 'leaf' }
    ]
  };
}

function createWald(): EnvironmentRec {
  const group = new THREE.Group();
  const placed: Placed[] = [];
  const random = seededRandom(0x57a1d);

  const add = (visual: Visual, desc: PlacementDesc, sway: number) => {
    addPlaced(group, placed, visual, desc, { sway });
  };

  // Seitliche Wald-Flanken links/rechts – das Spielfeld ist die freie Lichtung
  // in der Mitte. Mehrere Tiefen-Staffeln (innen niedrig/nah, außen hoch) plus
  // Bodenstreu (Steine, Gras) geben Waldtiefe, ohne die Lanes zu verdecken.
  const flank = (zone: 'left' | 'right') => {
    // Innere Reihe: Büsche + kleine Bäume dicht an der Feldkante
    add(buschVisual(0.5), { zone, u: 0.12, out: 0.4 }, 0.01);
    add(nadelbaumVisual(1.7), { zone, u: 0.38, out: 0.6 }, 0.02);
    add(buschVisual(0.46), { zone, u: 0.62, out: 0.45 }, 0.01);
    add(laubbaumVisual(1.6), { zone, u: 0.88, out: 0.7 }, 0.022);
    // Mittlere Reihe
    add(nadelbaumVisual(2.5), { zone, u: 0.2, out: 1.7 }, 0.02);
    add(laubbaumVisual(2.1), { zone, u: 0.5, out: 2.05 }, 0.024);
    add(nadelbaumVisual(2.6), { zone, u: 0.8, out: 1.85 }, 0.02);
    // Äußere Tiefe (höhere Bäume = dichter Wald dahinter)
    add(nadelbaumVisual(2.9), { zone, u: 0.34, out: 2.8 }, 0.02);
    add(laubbaumVisual(2.4), { zone, u: 0.7, out: 3.0 }, 0.022);
    // Bodenstreu: deterministisch über das Flankenband verteilt
    for (let i = 0; i < 7; i++) {
      const u = 0.05 + random() * 1.05;
      const out = 0.15 + random() * 2.6;
      add(
        random() < 0.4 ? felsVisual(0.28 + random() * 0.2) : grasVisual(0.3 + random() * 0.16),
        { zone, u, out },
        0
      );
    }
    // Vordergrund-Ecke (unten, rahmt den Blick) + hintere Ecke (Tiefe)
    add(buschVisual(0.62), { zone, u: 1.1, out: 0.7 }, 0.012);
    add(nadelbaumVisual(2.8), { zone, u: -0.18, out: 1.3 }, 0.02);
  };
  flank('left');
  flank('right');

  // Baumsaum am fernen Rand: sichtbar innerhalb der erweiterten Bühne, aber
  // deutlich hinter der gegnerischen Reihe. So bleibt Lane 1 auch bei breiten
  // Modellen frei, während der Wald nicht nur aus einer grünen Fläche besteht.
  add(nadelbaumVisual(2.6), { zone: 'back', nx: -1.12, depth: 4.8 }, 0.018);
  add(laubbaumVisual(2.25), { zone: 'back', nx: -0.68, depth: 6.0 }, 0.02);
  add(nadelbaumVisual(2.8), { zone: 'back', nx: -0.22, depth: 6.8 }, 0.017);
  add(laubbaumVisual(2.35), { zone: 'back', nx: 0.28, depth: 6.4 }, 0.02);
  add(nadelbaumVisual(2.7), { zone: 'back', nx: 0.72, depth: 5.8 }, 0.018);
  add(laubbaumVisual(2.45), { zone: 'back', nx: 1.12, depth: 4.7 }, 0.02);

  return finishEnvironment(group, placed);
}

/** Nur Materialien freigeben – Geometrien liegen im gemeinsamen buildFigure-Cache. */
// ---------------------------------------------------------------------------
// Weitere Schauplätze. Jede Arena hat eine eigene Silhouette und ein einzelnes
// starkes Motiv am Horizont; die seitlichen Props halten das Kampfband frei.
// ---------------------------------------------------------------------------
function makeVisual(
  height: number,
  palette: Record<string, string>,
  parts: Visual['parts']
): Visual {
  return { height, detailLevel: 'low', palette, parts };
}

const HOEHLE = {
  rock: '#4a3a2a', dark: '#211810', light: '#70573b', amber: '#f2ad4f',
  glow: '#ffd786', bat: '#17131c', wing: '#362a41'
};

function stalagmit(height: number): Visual {
  return makeVisual(height, HOEHLE, [
    { id: 'base', shape: 'ico', size: 0.42, pos: [0, 0.22, 0], scale: [1.35, 0.55, 1.1], color: 'dark' },
    { id: 'main', shape: 'cone', size: [0.38, 1.8], pos: [0, 0.95, 0], color: 'rock' },
    { id: 'sideA', shape: 'cone', size: [0.2, 1.1], pos: [-0.34, 0.56, 0.08], rot: [0, 0, 0.18], color: 'light' },
    { id: 'sideB', shape: 'cone', size: [0.16, 0.82], pos: [0.3, 0.42, -0.08], rot: [0, 0, -0.22], color: 'rock' }
  ]);
}

function hoehlenKristall(height: number): Visual {
  return makeVisual(height, HOEHLE, [
    { id: 'stone', shape: 'ico', size: 0.34, pos: [0, 0.18, 0], scale: [1.45, 0.55, 1], color: 'dark' },
    { id: 'a', shape: 'cone', size: [0.15, 0.95], pos: [0, 0.55, 0], color: 'glow', roughness: 0.2 },
    { id: 'b', shape: 'cone', size: [0.11, 0.65], pos: [-0.22, 0.38, 0.04], rot: [0, 0, 0.25], color: 'amber' },
    { id: 'c', shape: 'cone', size: [0.09, 0.52], pos: [0.2, 0.31, -0.04], rot: [0, 0, -0.3], color: 'glow' }
  ]);
}

function hoehlenBogen(height: number): Visual {
  return makeVisual(height, HOEHLE, [
    { id: 'footL', shape: 'ico', size: 0.78, pos: [-1.35, 0.65, 0], scale: [0.9, 1.7, 0.8], color: 'dark' },
    { id: 'highL', shape: 'ico', size: 0.72, pos: [-1.05, 1.75, 0], scale: [0.9, 1.25, 0.75], color: 'rock' },
    { id: 'footR', shape: 'ico', size: 0.82, pos: [1.35, 0.65, 0], scale: [0.9, 1.7, 0.8], color: 'dark' },
    { id: 'highR', shape: 'ico', size: 0.7, pos: [1.03, 1.72, 0], scale: [0.9, 1.2, 0.75], color: 'rock' },
    { id: 'topL', shape: 'ico', size: 0.72, pos: [-0.48, 2.38, 0], scale: [1.2, 0.72, 0.76], color: 'light' },
    { id: 'topR', shape: 'ico', size: 0.72, pos: [0.48, 2.38, 0], scale: [1.2, 0.72, 0.76], color: 'rock' },
    { id: 'toothL', shape: 'cone', size: [0.16, 0.75], pos: [-0.42, 1.9, 0.05], rot: [Math.PI, 0, 0], color: 'light' },
    { id: 'toothR', shape: 'cone', size: [0.12, 0.55], pos: [0.55, 2.02, 0.06], rot: [Math.PI, 0, 0], color: 'light' }
  ]);
}

function fledermaus(height: number): Visual {
  return makeVisual(height, HOEHLE, [
    { id: 'body', shape: 'ico', size: 0.14, pos: [0, 0.16, 0], scale: [0.7, 1.2, 0.75], color: 'bat' },
    { id: 'head', shape: 'ico', size: 0.1, pos: [0, 0.35, 0.02], color: 'bat' },
    { id: 'earL', shape: 'cone', size: [0.035, 0.14], pos: [-0.055, 0.47, 0], color: 'wing' },
    { id: 'earR', shape: 'cone', size: [0.035, 0.14], pos: [0.055, 0.47, 0], color: 'wing' },
    { id: 'wingL', shape: 'cone', size: [0.3, 0.75], pos: [-0.33, 0.25, 0], rot: [0, 0, -1.18], scale: [1, 1, 0.18], color: 'wing' },
    { id: 'wingR', shape: 'cone', size: [0.3, 0.75], pos: [0.33, 0.25, 0], rot: [0, 0, 1.18], scale: [1, 1, 0.18], color: 'wing' }
  ]);
}

function createHoehle(): EnvironmentRec {
  const group = new THREE.Group();
  const placed: Placed[] = [];
  const add = (v: Visual, d: PlacementDesc, m: Motion = {}) => addPlaced(group, placed, v, d, m);
  add(hoehlenBogen(3.1), { zone: 'back', nx: 0, depth: 5.4 });
  for (const zone of ['left', 'right'] as const) {
    add(stalagmit(1.25), { zone, u: 0.04, out: 0.45 });
    add(hoehlenKristall(0.72), { zone, u: 0.24, out: 0.75 }, { pulse: 0.025 });
    add(stalagmit(1.9), { zone, u: 0.48, out: 1.35 });
    add(hoehlenKristall(0.95), { zone, u: 0.72, out: 0.62 }, { pulse: 0.035 });
    add(stalagmit(2.5), { zone, u: 0.94, out: 1.9 }, { roll: zone === 'left' ? -0.08 : 0.08 });
  }
  add(fledermaus(0.36), { zone: 'back', nx: -0.48, depth: 3.9 }, { lift: 3.6, bob: 0.18, sway: 0.12 });
  add(fledermaus(0.28), { zone: 'back', nx: 0.25, depth: 4.4 }, { lift: 4.25, bob: 0.22, sway: 0.15, yaw: 0.4 });
  add(fledermaus(0.32), { zone: 'back', nx: 0.62, depth: 3.7 }, { lift: 3.25, bob: 0.16, sway: 0.11, yaw: -0.35 });
  return finishEnvironment(group, placed);
}

const STADT = {
  concrete: '#53637b', dark: '#29374b', glass: '#73d9ff', glassDark: '#24516e',
  neon: '#ff4fa3', lamp: '#ffe3a3', car: '#b9334d', tire: '#111722', barrier: '#e98b32'
};

function haus(height: number, neon = false): Visual {
  const accent = neon ? 'neon' : 'glass';
  return makeVisual(height, STADT, [
    { id: 'tower', shape: 'box', size: [1.25, 2.7, 0.95], pos: [0, 1.35, 0], color: 'dark' },
    { id: 'roof', shape: 'box', size: [1.42, 0.12, 1.08], pos: [0, 2.76, 0], color: 'concrete' },
    { id: 'antenna', shape: 'cyl', size: [0.035, 0.035, 0.75], pos: [0.32, 3.18, 0], color: accent },
    ...[-0.32, 0.32].flatMap((x, column) => [0.65, 1.25, 1.87].map((y, row) => ({
      id: `w${column}${row}`, shape: 'box' as const, size: [0.22, 0.28, 0.035], pos: [x, y, 0.49] as [number, number, number], color: (column + row) % 2 ? 'glassDark' : accent
    }))),
    { id: 'sign', shape: 'box', size: [0.7, 0.12, 0.06], pos: [0, 2.35, 0.51], color: accent }
  ]);
}

function laterne(height: number): Visual {
  return makeVisual(height, STADT, [
    { id: 'base', shape: 'cyl', size: [0.18, 0.24, 0.18], pos: [0, 0.09, 0], color: 'dark' },
    { id: 'pole', shape: 'cyl', size: [0.045, 0.06, 2.25], pos: [0, 1.25, 0], color: 'concrete' },
    { id: 'arm', shape: 'box', size: [0.62, 0.055, 0.055], pos: [0.27, 2.35, 0], color: 'concrete' },
    { id: 'lamp', shape: 'sph', size: 0.16, pos: [0.57, 2.27, 0], scale: [1.2, 0.65, 1], color: 'lamp', roughness: 0.1 },
    { id: 'shade', shape: 'cone', size: [0.22, 0.18], pos: [0.57, 2.43, 0], rot: [Math.PI, 0, 0], color: 'dark' }
  ]);
}

function auto(height: number, blue = false): Visual {
  const body = blue ? 'glassDark' : 'car';
  return makeVisual(height, STADT, [
    { id: 'body', shape: 'box', size: [1.35, 0.36, 0.72], pos: [0, 0.38, 0], color: body, metalness: 0.25 },
    { id: 'cabin', shape: 'box', size: [0.72, 0.34, 0.66], pos: [-0.06, 0.72, 0], color: 'glass', roughness: 0.2 },
    { id: 'hood', shape: 'box', size: [0.43, 0.12, 0.67], pos: [0.58, 0.6, 0], color: body },
    ...[-0.46, 0.42].flatMap((x, xi) => [-0.39, 0.39].map((z, zi) => ({ id: `wheel${xi}${zi}`, shape: 'cyl' as const, size: [0.16, 0.16, 0.12], pos: [x, 0.2, z] as [number, number, number], rot: [Math.PI / 2, 0, 0] as [number, number, number], color: 'tire' }))),
    { id: 'headL', shape: 'sph', size: 0.08, pos: [0.69, 0.42, 0.24], color: 'lamp' },
    { id: 'headR', shape: 'sph', size: 0.08, pos: [0.69, 0.42, -0.24], color: 'lamp' }
  ]);
}

function absperrung(height: number): Visual {
  return makeVisual(height, STADT, [
    { id: 'postL', shape: 'box', size: [0.11, 0.8, 0.11], pos: [-0.48, 0.48, 0], color: 'concrete' },
    { id: 'postR', shape: 'box', size: [0.11, 0.8, 0.11], pos: [0.48, 0.48, 0], color: 'concrete' },
    { id: 'bar', shape: 'box', size: [1.35, 0.25, 0.12], pos: [0, 0.73, 0], color: 'barrier' },
    { id: 'stripeA', shape: 'box', size: [0.22, 0.27, 0.02], pos: [-0.32, 0.73, 0.07], rot: [0, 0, 0.55], color: 'lamp' },
    { id: 'stripeB', shape: 'box', size: [0.22, 0.27, 0.02], pos: [0.32, 0.73, 0.07], rot: [0, 0, 0.55], color: 'lamp' }
  ]);
}

function createStadt(): EnvironmentRec {
  const group = new THREE.Group();
  const placed: Placed[] = [];
  const add = (v: Visual, d: PlacementDesc, m: Motion = {}) => addPlaced(group, placed, v, d, m);
  [-0.9, -0.46, 0, 0.46, 0.9].forEach((nx, i) => add(haus(2.4 + (i % 3) * 0.45, i === 1 || i === 4), { zone: 'back', nx, depth: 6.2 + (i % 2) * 0.7 }));
  for (const zone of ['left', 'right'] as const) {
    const towardField = zone === 'left' ? 0.16 : Math.PI - 0.16;
    add(laterne(1.4), { zone, u: 0.1, out: 0.48 }, { yaw: towardField });
    add(absperrung(0.62), { zone, u: 0.33, out: 0.45 }, { yaw: zone === 'left' ? 0.25 : -0.25 });
    add(auto(0.7, zone === 'right'), { zone, u: 0.58, out: 1.0 }, { yaw: zone === 'left' ? 0.35 : Math.PI - 0.35 });
    add(laterne(1.65), { zone, u: 0.84, out: 0.64 }, { yaw: towardField });
    add(haus(2.6, zone === 'right'), { zone, u: 0.5, out: 3.0 }, { yaw: zone === 'left' ? 0.12 : -0.12 });
  }
  return finishEnvironment(group, placed);
}

const MOND = {
  dust: '#aeb7c8', light: '#d7ddea', rock: '#70788b', shadow: '#30364d',
  metal: '#9da9ba', gold: '#d9a84e', blue: '#4c8dff', green: '#73c98d', beacon: '#83e5ff'
};

function mondfels(height: number): Visual {
  return makeVisual(height, MOND, [
    { id: 'a', shape: 'ico', size: 0.46, pos: [-0.12, 0.3, 0], scale: [1.35, 0.75, 1], color: 'rock' },
    { id: 'b', shape: 'ico', size: 0.3, pos: [0.32, 0.2, 0.04], scale: [1, 0.65, 1.2], color: 'shadow' },
    { id: 'c', shape: 'ico', size: 0.24, pos: [-0.38, 0.15, -0.1], scale: [1.1, 0.55, 1], color: 'dust' }
  ]);
}

function krater(height: number): Visual {
  return makeVisual(height, MOND, [
    { id: 'rim', shape: 'torus', size: [0.72, 0.12], pos: [0, 0.11, 0], rot: [Math.PI / 2, 0, 0], scale: [1.25, 1, 1], color: 'rock' },
    { id: 'inside', shape: 'cyl', size: [0.63, 0.68, 0.045], pos: [0, 0.035, 0], color: 'shadow' },
    { id: 'chip', shape: 'ico', size: 0.12, pos: [0.58, 0.13, 0.08], color: 'light' }
  ]);
}

function landefaehre(height: number): Visual {
  return makeVisual(height, MOND, [
    { id: 'body', shape: 'cyl', size: [0.62, 0.85, 0.8], pos: [0, 1.05, 0], color: 'metal', metalness: 0.4 },
    { id: 'cap', shape: 'cone', size: [0.62, 0.55], pos: [0, 1.72, 0], color: 'light', metalness: 0.3 },
    { id: 'window', shape: 'box', size: [0.58, 0.24, 0.05], pos: [0, 1.2, 0.67], color: 'beacon', roughness: 0.1 },
    { id: 'foil', shape: 'box', size: [1.45, 0.13, 0.72], pos: [0, 0.65, 0], color: 'gold', metalness: 0.35 },
    { id: 'legL', shape: 'cyl', size: [0.05, 0.07, 0.95], pos: [-0.52, 0.32, 0], rot: [0, 0, -0.38], color: 'metal' },
    { id: 'legR', shape: 'cyl', size: [0.05, 0.07, 0.95], pos: [0.52, 0.32, 0], rot: [0, 0, 0.38], color: 'metal' },
    { id: 'footL', shape: 'box', size: [0.42, 0.08, 0.36], pos: [-0.72, 0.05, 0], color: 'shadow' },
    { id: 'footR', shape: 'box', size: [0.42, 0.08, 0.36], pos: [0.72, 0.05, 0], color: 'shadow' },
    { id: 'mast', shape: 'cyl', size: [0.025, 0.025, 0.72], pos: [0.3, 2.15, 0], color: 'metal' },
    { id: 'beacon', shape: 'sph', size: 0.1, pos: [0.3, 2.55, 0], color: 'beacon' }
  ]);
}

function erde(height: number): Visual {
  return makeVisual(height, MOND, [
    { id: 'earth', shape: 'sph', size: 0.72, pos: [0, 0.72, 0], color: 'blue', roughness: 0.25 },
    { id: 'landA', shape: 'ico', size: 0.22, pos: [-0.22, 0.86, 0.65], scale: [1.4, 0.65, 0.18], color: 'green' },
    { id: 'landB', shape: 'ico', size: 0.17, pos: [0.28, 0.58, 0.67], scale: [0.9, 1.2, 0.16], color: 'green' },
    { id: 'ice', shape: 'sph', size: 0.18, pos: [0, 1.33, 0], scale: [1.8, 0.4, 1.7], color: 'light' }
  ]);
}

function createMond(): EnvironmentRec {
  const group = new THREE.Group();
  const placed: Placed[] = [];
  const add = (v: Visual, d: PlacementDesc, m: Motion = {}) => addPlaced(group, placed, v, d, m);
  add(erde(1.25), { zone: 'back', nx: 0.64, depth: 8.5 }, { lift: 2.15, spin: 0.025 });
  add(landefaehre(2.2), { zone: 'back', nx: -0.72, depth: 5.8 }, { yaw: 0.22 });
  for (const zone of ['left', 'right'] as const) {
    add(krater(0.18), { zone, u: 0.05, out: 0.55 });
    add(mondfels(0.48), { zone, u: 0.28, out: 0.42 });
    add(krater(0.22), { zone, u: 0.54, out: 1.0 });
    add(mondfels(0.7), { zone, u: 0.76, out: 0.58 });
    add(mondfels(1.15), { zone, u: 0.94, out: 1.7 });
  }
  return finishEnvironment(group, placed);
}

const MARS = {
  sand: '#c85c2e', light: '#ee8b4e', rock: '#84351f', dark: '#431b18',
  metal: '#9aa4a9', panel: '#324d65', tire: '#21191a', lens: '#9ce6ff', dust: '#f0a064'
};

function marsspitze(height: number): Visual {
  return makeVisual(height, MARS, [
    { id: 'base', shape: 'ico', size: 0.58, pos: [0, 0.3, 0], scale: [1.4, 0.65, 1.05], color: 'dark' },
    { id: 'spire', shape: 'cone', size: [0.48, 2.2], pos: [0, 1.22, 0], scale: [0.86, 1, 0.75], color: 'rock' },
    { id: 'ridge', shape: 'cone', size: [0.27, 1.35], pos: [-0.42, 0.78, 0.08], rot: [0, 0, 0.2], color: 'sand' },
    { id: 'chip', shape: 'ico', size: 0.24, pos: [0.46, 0.18, -0.1], color: 'light' }
  ]);
}

function marsbogen(height: number): Visual {
  return makeVisual(height, MARS, [
    { id: 'legL', shape: 'ico', size: 0.72, pos: [-1.05, 0.7, 0], scale: [0.72, 1.75, 0.78], color: 'dark' },
    { id: 'legR', shape: 'ico', size: 0.72, pos: [1.05, 0.7, 0], scale: [0.72, 1.75, 0.78], color: 'rock' },
    { id: 'topL', shape: 'ico', size: 0.66, pos: [-0.5, 1.75, 0], scale: [1.25, 0.72, 0.8], color: 'sand' },
    { id: 'topR', shape: 'ico', size: 0.66, pos: [0.5, 1.75, 0], scale: [1.25, 0.72, 0.8], color: 'rock' },
    { id: 'cap', shape: 'ico', size: 0.42, pos: [0, 2.05, 0], scale: [1.8, 0.5, 0.75], color: 'light' }
  ]);
}

function rover(height: number): Visual {
  return makeVisual(height, MARS, [
    { id: 'body', shape: 'box', size: [1.15, 0.4, 0.82], pos: [0, 0.65, 0], color: 'metal', metalness: 0.45 },
    { id: 'deck', shape: 'box', size: [0.92, 0.1, 0.7], pos: [0, 0.91, 0], color: 'panel' },
    { id: 'mast', shape: 'cyl', size: [0.045, 0.055, 0.82], pos: [0.2, 1.35, 0], color: 'metal' },
    { id: 'camera', shape: 'box', size: [0.36, 0.22, 0.24], pos: [0.2, 1.82, 0], color: 'metal' },
    { id: 'lensL', shape: 'sph', size: 0.07, pos: [0.09, 1.84, 0.13], color: 'lens' },
    { id: 'lensR', shape: 'sph', size: 0.07, pos: [0.31, 1.84, 0.13], color: 'lens' },
    { id: 'arm', shape: 'cyl', size: [0.04, 0.05, 0.92], pos: [-0.58, 0.83, 0.22], rot: [0, 0, -0.75], color: 'metal' },
    ...[-0.45, 0.45].flatMap((x, xi) => [-0.48, 0.48].map((z, zi) => ({ id: `wheel${xi}${zi}`, shape: 'cyl' as const, size: [0.24, 0.24, 0.16], pos: [x, 0.32, z] as [number, number, number], rot: [Math.PI / 2, 0, 0] as [number, number, number], color: 'tire' })))
  ]);
}

function staubwirbel(height: number): Visual {
  return makeVisual(height, MARS, [
    { id: 'low', shape: 'torus', size: [0.5, 0.035], pos: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0], color: 'dust', transparent: true, opacity: 0.48 },
    { id: 'mid', shape: 'torus', size: [0.38, 0.03], pos: [0, 0.65, 0], rot: [Math.PI / 2, 0, 0], color: 'light', transparent: true, opacity: 0.38 },
    { id: 'high', shape: 'torus', size: [0.25, 0.025], pos: [0, 1, 0], rot: [Math.PI / 2, 0, 0], color: 'dust', transparent: true, opacity: 0.28 }
  ]);
}

function createMars(): EnvironmentRec {
  const group = new THREE.Group();
  const placed: Placed[] = [];
  const add = (v: Visual, d: PlacementDesc, m: Motion = {}) => addPlaced(group, placed, v, d, m);
  add(marsbogen(2.85), { zone: 'back', nx: 0.2, depth: 6.4 }, { yaw: -0.08 });
  add(rover(1.05), { zone: 'back', nx: -0.72, depth: 4.9 }, { yaw: 0.45 });
  for (const zone of ['left', 'right'] as const) {
    add(marsspitze(1.25), { zone, u: 0.05, out: 0.5 });
    add(staubwirbel(0.72), { zone, u: 0.28, out: 0.9 }, { spin: zone === 'left' ? 0.55 : -0.55, pulse: 0.025 });
    add(marsspitze(2), { zone, u: 0.52, out: 1.3 });
    add(marsspitze(2.65), { zone, u: 0.9, out: 2 }, { roll: zone === 'left' ? 0.1 : -0.1 });
  }
  return finishEnvironment(group, placed);
}

const C137 = {
  slime: '#75f15e', light: '#c2ff7c', portal: '#94ff6f', core: '#2bcf69',
  violet: '#743fa5', dark: '#311c55', crystal: '#77f7ca', metal: '#7b8790', rust: '#8b4e38', eye: '#fff58a'
};

function portal(height: number): Visual {
  return makeVisual(height, C137, [
    { id: 'core', shape: 'sph', size: 0.92, pos: [0, 1.05, 0], scale: [1, 1.18, 0.16], color: 'core', transparent: true, opacity: 0.58, roughness: 0.08 },
    { id: 'outer', shape: 'torus', size: [1, 0.16], pos: [0, 1.05, 0], color: 'portal', roughness: 0.12 },
    { id: 'inner', shape: 'torus', size: [0.72, 0.05], pos: [0, 1.05, 0.08], color: 'light', roughness: 0.08 },
    { id: 'dropL', shape: 'sph', size: 0.11, pos: [-0.72, 0.28, 0], scale: [0.7, 1.9, 0.7], color: 'slime' },
    { id: 'dropR', shape: 'sph', size: 0.08, pos: [0.66, 0.14, 0], scale: [0.7, 1.5, 0.7], color: 'light' }
  ]);
}

function fremdkristall(height: number): Visual {
  return makeVisual(height, C137, [
    { id: 'base', shape: 'ico', size: 0.34, pos: [0, 0.18, 0], scale: [1.4, 0.55, 1], color: 'dark' },
    { id: 'a', shape: 'cone', size: [0.15, 1.05], pos: [0, 0.58, 0], color: 'crystal', roughness: 0.16 },
    { id: 'b', shape: 'cone', size: [0.11, 0.75], pos: [-0.25, 0.43, 0], rot: [0, 0, 0.3], color: 'light' },
    { id: 'c', shape: 'cone', size: [0.1, 0.62], pos: [0.24, 0.35, -0.06], rot: [0, 0, -0.35], color: 'violet' }
  ]);
}

function tentakel(height: number): Visual {
  return makeVisual(height, C137, [
    { id: 'pod', shape: 'ico', size: 0.38, pos: [0, 0.24, 0], scale: [1.2, 0.65, 1], color: 'dark' },
    { id: 'stem', shape: 'cone', size: [0.2, 1.15], pos: [0, 0.82, 0], rot: [0, 0, -0.12], color: 'violet' },
    { id: 'curl', shape: 'torus', size: [0.27, 0.1], pos: [0.14, 1.43, 0], rot: [0, 0, 0.3], color: 'slime' },
    { id: 'eye', shape: 'sph', size: 0.11, pos: [0.14, 1.48, 0.2], color: 'eye' },
    { id: 'pupil', shape: 'sph', size: 0.045, pos: [0.14, 1.48, 0.29], color: 'dark' }
  ]);
}

function schrott(height: number): Visual {
  return makeVisual(height, C137, [
    { id: 'plate', shape: 'box', size: [0.9, 0.12, 0.55], pos: [0, 0.22, 0], rot: [0.25, 0.3, 0.18], color: 'metal', metalness: 0.5 },
    { id: 'pipe', shape: 'torus', size: [0.28, 0.07], pos: [-0.18, 0.42, 0.05], rot: [0.3, 0.2, 0], color: 'rust' },
    { id: 'can', shape: 'cyl', size: [0.13, 0.13, 0.48], pos: [0.32, 0.36, -0.03], rot: [0.2, 0, 0.7], color: 'dark' },
    { id: 'slime', shape: 'sph', size: 0.12, pos: [0.08, 0.32, 0.28], scale: [1.8, 0.45, 1], color: 'slime', transparent: true, opacity: 0.8 }
  ]);
}

function createC137(): EnvironmentRec {
  const group = new THREE.Group();
  const placed: Placed[] = [];
  const add = (v: Visual, d: PlacementDesc, m: Motion = {}) => addPlaced(group, placed, v, d, m);
  add(portal(2.45), { zone: 'back', nx: 0, depth: 6 }, { lift: 0.5, spin: 0.08, pulse: 0.045 });
  add(schrott(0.55), { zone: 'back', nx: -0.55, depth: 4.7 }, { lift: 2.9, bob: 0.22, spin: -0.18 });
  add(schrott(0.4), { zone: 'back', nx: 0.58, depth: 5 }, { lift: 3.6, bob: 0.16, spin: 0.24, roll: 0.4 });
  for (const zone of ['left', 'right'] as const) {
    add(fremdkristall(0.72), { zone, u: 0.03, out: 0.42 }, { pulse: 0.04 });
    add(tentakel(1.3), { zone, u: 0.25, out: 0.65 }, { sway: 0.08, roll: zone === 'left' ? -0.08 : 0.08 });
    add(schrott(0.52), { zone, u: 0.47, out: 0.9 }, { lift: 0.35, bob: 0.1, spin: zone === 'left' ? 0.2 : -0.2 });
    add(fremdkristall(1.05), { zone, u: 0.68, out: 0.58 }, { pulse: 0.035 });
    add(tentakel(1.75), { zone, u: 0.9, out: 1.35 }, { sway: 0.1, roll: zone === 'left' ? 0.1 : -0.1 });
  }
  return finishEnvironment(group, placed);
}

function disposeMaterials(group: THREE.Group): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}

/**
 * Umgebung für einen Schauplatz bauen. Unbekannte/noch nicht umgesetzte Arten
 * liefern `null` (dann bleibt es bei der reinen Farbgebung des Topics).
 */
export function createEnvironment(kind: EnvironmentKind | undefined): EnvironmentRec | null {
  switch (kind) {
    case 'wald':
      return createWald();
    case 'hoehle':
      return createHoehle();
    case 'stadt':
      return createStadt();
    case 'mond':
      return createMond();
    case 'mars':
      return createMars();
    case 'c137':
      return createC137();
    default:
      return null;
  }
}
