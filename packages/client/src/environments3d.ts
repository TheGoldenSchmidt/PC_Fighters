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
  sway: number; // Wiege-Amplitude (0 = statisch)
  phase: number;
}

/** Eine Prop-Instanz aus einer Visual-Definition (buildFigure) in einen Wrapper. */
function propInstance(visual: Visual): THREE.Group {
  const wrapper = new THREE.Group();
  wrapper.add(buildFigure(visual).root);
  return wrapper;
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

  const add = (visual: Visual, desc: PlacementDesc, sway: number) => {
    const wrapper = propInstance(visual);
    group.add(wrapper);
    placed.push({ wrapper, desc, sway, phase: Math.random() * Math.PI * 2 });
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
    // Bodenstreu: Steine + Grasbüschel zufällig übers Flankenband verteilt
    for (let i = 0; i < 7; i++) {
      const u = 0.05 + Math.random() * 1.05;
      const out = 0.15 + Math.random() * 2.6;
      add(
        Math.random() < 0.4 ? felsVisual(0.28 + Math.random() * 0.2) : grasVisual(0.3 + Math.random() * 0.16),
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

  const layout = (m: FieldMetrics) => {
    const half = m.laneStep * 0.5;
    for (const p of placed) {
      const d = p.desc;
      let x: number;
      let z: number;
      if (d.zone === 'back') {
        x = lerp(m.leftX - half - 0.6, m.rightX + half + 0.6, (d.nx + 1) / 2);
        z = m.farZ - d.depth;
      } else {
        const edge = d.zone === 'left' ? m.leftX - half : m.rightX + half;
        // Grundabstand + laneStep-anteilige Reserve, damit die Kulisse auch bei
        // wenigen (breiten) Lanes klar außerhalb des Spielfelds bleibt.
        const clearance = 1.2 + m.laneStep * 0.35 + d.out;
        x = edge + (d.zone === 'left' ? -1 : 1) * clearance;
        z = lerp(m.farZ - 1.0, m.nearZ + 2.2, d.u);
      }
      p.wrapper.position.set(x, 0, z);
      p.wrapper.scale.setScalar(m.scale);
    }
  };

  const update = (now: number) => {
    for (const p of placed) {
      if (p.sway) p.wrapper.rotation.z = Math.sin(now / 900 + p.phase) * p.sway;
    }
  };

  return { group, layout, update, dispose: () => disposeMaterials(group) };
}

/** Nur Materialien freigeben – Geometrien liegen im gemeinsamen buildFigure-Cache. */
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
    // 'hoehle' und 'stadt' folgen im nächsten Schritt.
    default:
      return null;
  }
}
