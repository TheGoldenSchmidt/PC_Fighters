// 3D-Schlachtfeld: ein transparentes WebGL-Canvas liegt über dem Lane-Raster.
//
// Die DOM-Slots bleiben die Wahrheit für Layout und Bedienung (Tap-Flächen,
// Stat-Badges, Namensschilder). Diese Komponente projiziert die Slot-Mitten
// per Raycast auf eine Bodenebene und stellt dort die prozeduralen
// 3D-Figuren auf. Dadurch funktioniert jede Lane-Anzahl und jede
// Bildschirmgröße ohne eigene Layout-Logik.
//
// Animations-Auslöser kommen aus dem GameScreen-Zustand:
//  - neue uid auf dem Brett            → Beschwörungsanimation
//  - fx.projectiles                    → Angreifer macht Ausfall + 3D-Geschoss
//  - Lebenspunkte einer uid sinken     → Treffer-Blitz + Rückstoß
//  - fx.dying                          → Sterbeanimation (umkippen, auflösen)
//  - uid wechselt die Lane             → Figur läuft sichtbar hinüber
//
// Kein WebGL verfügbar? Dann meldet onUnsupported und der GameScreen
// bleibt bei der bisherigen 2D-Darstellung.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ClientView, EnvironmentKind, PlayerIndex, Topic, VisualCatalog } from '@pcf/engine';
import { createFigure, type Figure } from './figures3d';
import { createEnvironment, type EnvironmentRec, type FieldMetrics } from './environments3d';
import { SACRIFICE_MS } from './arena/fx';

/** Zauber-Effektarten der Aktionskarten (Spiegel des engine-SpellEvent). */
export type SpellEffectKind = 'buff' | 'attackBuff' | 'summon' | 'move';

/** Teilmenge des GameScreen-FxState, die das Schlachtfeld braucht. */
export interface BattlefieldFx {
  projectiles: { key: string; lane: number; attacker: PlayerIndex; toBase: boolean; emoji: string }[];
  dying: { lane: number; owner: PlayerIndex }[];
  spells: { key: string; lane: number; effect: SpellEffectKind; faction: string }[];
  sacrifices: {
    key: string;
    owner: PlayerIndex;
    slot: 0 | 1 | 2;
    cardId: string;
  }[];
}

interface Props {
  view: ClientView;
  me: PlayerIndex;
  fx: BattlefieldFx;
  topic: Topic | null;
  /** Aussehen/Animation je cardId (Phase 3 nutzt es; fehlt es → Golem-Fallback). */
  catalog: VisualCatalog | null;
  onUnsupported: () => void;
}

const NOMINAL_HEIGHT = 1.8; // Modell-Einheiten, auf die die Slot-Höhe normiert wird
const PROJECTILE_FLY_MS = 340;
const PROJECTILE_DELAY_MS = 140; // Abschuss erst, wenn der Ausfallschritt zuschlägt

interface FigureRec {
  fig: Figure;
  side: PlayerIndex;
  lane: number;
  health: number;
  onBoard: boolean;
  dying: boolean;
  placed: boolean; // schon einmal positioniert (sonst direkt teleportieren)
  /** Zeitpunkt des Angriffs-Zulaufs (0 = kein Zulauf aktiv). */
  attackStart: number;
  /** Welt-Versatz zum Gegner beim Zulauf (Spitzenwert, wird per Hüllkurve skaliert). */
  approach: THREE.Vector3;
  /** Tatsächliche Modellbreite nach Auto-Fit, für breite Tiere/Dinos. */
  width: number;
}

interface TeamFigureRec {
  fig: Figure;
  side: PlayerIndex;
  slot: 0 | 1 | 2;
  cardId: string;
  width: number;
  sacrificing: boolean;
  sacrificeStart: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

interface TeamZoneRec {
  group: THREE.Group;
  bench: THREE.Mesh;
  markers: THREE.Mesh[];
  base: THREE.Mesh;
  core: THREE.Mesh;
  shield: THREE.Mesh;
  flashStart: number;
}

// Angriffs-Zulauf: die Figur tritt vor dem Schlag ein Stück auf den Gegner zu
// und kehrt danach zurück (rein visuell, keine Positionsänderung im Spielzustand).
const APPROACH_IN_MS = 150; // Zulauf nach vorn
const APPROACH_HOLD_MS = 300; // kurz halten (Schlag)
const APPROACH_OUT_MS = 480; // zurück in die Aufstellung

function approachEnvelope(elapsed: number): number {
  if (elapsed < 0) return 0;
  if (elapsed < APPROACH_IN_MS) return elapsed / APPROACH_IN_MS;
  if (elapsed < APPROACH_HOLD_MS) return 1;
  if (elapsed < APPROACH_OUT_MS) return 1 - (elapsed - APPROACH_HOLD_MS) / (APPROACH_OUT_MS - APPROACH_HOLD_MS);
  return 0;
}

interface Orb {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number; // Startzeitpunkt (inkl. Verzögerung)
  done: boolean;
}

/** Transienter Zauber-Effekt (Aktionskarte) auf einer Lane. */
interface SpellFx {
  group: THREE.Group;
  ring: THREE.Mesh;
  column: THREE.Mesh;
  motes: THREE.Mesh[];
  effect: SpellEffectKind;
  start: number;
  done: boolean;
}

/** Gruppe aus der Szene nehmen und alle Geometrien/Materialien freigeben. */
function disposeGroup(scene: THREE.Scene, group: THREE.Group): void {
  scene.remove(group);
  const geos = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geos.add(o.geometry);
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    }
  });
  geos.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}

/** Thematischer 3D-Boden (wird bei Topic-Wechsel eingefärbt). */
interface Ground {
  floor: THREE.Mesh;
  grid: THREE.GridHelper;
  glow: THREE.Mesh;
}

interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Erweiterte WebGL-Bühne inklusive seitlicher Kulissenflügel. */
  container: HTMLElement;
  /** Das unveränderte DOM-Lane-Raster für Slot-Anker und Bedienung. */
  layoutRoot: HTMLElement;
  figures: Map<number, FigureRec>;
  teamFigures: Map<string, TeamFigureRec>;
  teamZones: [TeamZoneRec, TeamZoneRec];
  orbs: Orb[];
  spellFx: SpellFx[];
  ground: Ground;
  environment: EnvironmentRec | null;
  /** Pro Lane ein getönter Bodenstreifen (der „Weg", auf dem gekämpft wird). */
  lanePaths: THREE.Mesh[];
  pathGeo: THREE.PlaneGeometry;
  shadowCatcher: THREE.Mesh | null;
  realShadows: boolean;
  /** Eigene Seite + Lane-Anzahl (für die lane-freie Umgebungs-Platzierung). */
  me: PlayerIndex;
  lanes: number;
  raf: number;
  firstSync: boolean;
  seenProjectiles: Set<string>;
  seenSpells: Set<string>;
  seenSacrifices: Set<string>;
}

const SPELL_MS = 900;
// Dauer der Opfer-Animation. Kommt aus fx.ts, damit sie exakt so lange laeuft,
// wie die Abspielung darauf wartet – sonst steht die Figur am Ende still
// herum oder wird mitten im Sprung abgeraeumt, sobald jemand am Kampftempo
// dreht. Der Import ist unbedenklich: fx.ts zieht kein three.js nach.
const REDUCED_SACRIFICE_MS = 360;

function setFigureOpacity(root: THREE.Object3D, opacity: number): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const original = material.userData.cheerleaderOpacity;
      if (typeof original !== 'number') {
        material.userData.cheerleaderOpacity = material.opacity;
      }
      material.transparent = true;
      material.opacity = (material.userData.cheerleaderOpacity as number) * opacity;
    }
  });
}

function createTeamZone(): TeamZoneRec {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x252a33, roughness: 0.7, metalness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x9c6a44, roughness: 0.82, metalness: 0.04 });
  const gold = new THREE.MeshBasicMaterial({ color: 0xf5b74a, transparent: true, opacity: 0.72 });
  const light = new THREE.MeshBasicMaterial({
    color: 0xeaf4ff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  // Bewusst OHNE Lehne: die Lehne stand genau zwischen Kamera und Bankfiguren
  // und verdeckte sie von vorn. Ohne sie muss die Sitzfläche selbst die Bank
  // lesbar machen – deshalb dicker, tiefer und heller als zuvor.
  const bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 0.92), wood);
  bench.position.y = 0.32;
  bench.castShadow = true;
  bench.receiveShadow = true;
  group.add(bench);
  // Zwei Kufen statt einer Lehne: sie erden die Bank optisch, ohne etwas zu
  // verdecken – sie liegen unter der Sitzfläche.
  for (const x of [-1.45, 1.45]) {
    const kufe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.86), steel);
    kufe.position.set(x, 0.16, 0);
    kufe.castShadow = true;
    group.add(kufe);
  }
  const markers = [-1.05, 0, 1.05].map((x) => {
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.5, 22), gold.clone());
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.015, 0.2);
    group.add(marker);
    return marker;
  });
  // Die Basis steht HINTER der Bank (lokales +z). Bei der Gegnerzone dreht die
  // 180°-Drehung der Gruppe dieses "hinten" korrekt nach hinten weg. Weiter als
  // knapp zwei Einheiten darf sie nicht rücken, sonst schiebt die Perspektive
  // die eigene Basis unter die Handkarten.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.1, 0.42, 8), steel.clone());
  base.position.set(0, 0.2, 1.85);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.47, 8), light);
  core.position.copy(base.position);
  group.add(core);
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xeaf4ff,
      transparent: true,
      opacity: 0,
      wireframe: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  shield.position.set(0, 0.18, 1.85);
  group.add(shield);
  return { group, bench, markers, base, core, shield, flashStart: 0 };
}

/** three.Color aus einem Hex-String, mit Fallback bei ungültiger Angabe. */
function safeColor(hex: string | undefined, fallback: number): THREE.Color {
  try {
    return new THREE.Color(hex ?? fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

/** Farbe eines Zauber-Effekts (Effektart bestimmt Grundton, Fraktion tönt nach). */
function spellColor(effect: SpellEffectKind, faction: string): THREE.Color {
  const base =
    effect === 'buff'
      ? 0x5ee8a0
      : effect === 'attackBuff'
        ? 0xff8a4d
        : effect === 'summon'
          ? 0xffd766
          : 0xd9c4a0; // move
  const c = new THREE.Color(base);
  const tint = faction === 'animals' ? new THREE.Color(0x8be98f) : new THREE.Color(0x63c9f8);
  return c.lerp(tint, 0.18);
}

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

/** Bildschirmpunkt (CSS-Pixel relativ zum Canvas) → Punkt auf der Bodenebene. */
function groundPoint(world: World, px: number, py: number, out: THREE.Vector3): THREE.Vector3 {
  const w = world.container.clientWidth || 1;
  const h = world.container.clientHeight || 1;
  ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
  raycaster.setFromCamera(ndc, world.camera);
  raycaster.ray.intersectPlane(groundPlane, out);
  return out;
}

interface Anchor {
  pos: THREE.Vector3;
  scale: number;
  /** Breite des Ankerelements in Welt-Einheiten auf dieser Kameratiefe. */
  breite: number;
}

/**
 * Fußpunkt, Figurenskala und Weltgröße eines Layout-Elements.
 *
 * Alles, was auf der Bühne steht, hängt an einem DOM-Rechteck: die Kämpfer an
 * `[data-slot="<seite>-<lane>"]`, Bank und Basis an `[data-zone="<seite>"]`.
 * Dadurch können 2D-Fallback und 3D-Bühne gar nicht auseinanderlaufen – wer
 * das Layout im CSS verschiebt, verschiebt die 3D-Welt automatisch mit.
 */
function elementAnchor(world: World, selector: string, modelWidth = NOMINAL_HEIGHT): Anchor | null {
  const el = world.layoutRoot.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const cRect = world.container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const px = rect.left - cRect.left + rect.width / 2;
  // Füße nahe der unteren Kante verankern. Der kleine Bodenabstand hält
  // Namensschild/Stats frei, ohne die Figur optisch schweben zu lassen.
  const py = rect.top - cRect.top + rect.height * 0.86;
  const pos = groundPoint(world, px, py, new THREE.Vector3());
  // Skala: Welt-Einheiten pro CSS-Pixel in dieser Kameratiefe. Die Figur
  // soll gut die halbe Slot-Höhe einnehmen – der Rest ist Luft für
  // Badges, Sprünge und die schräge Draufsicht.
  const dist = world.camera.position.distanceTo(pos);
  const worldPerPx =
    (2 * dist * Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2))) /
    (world.container.clientHeight || 1);
  const heightScale = (rect.height * 0.64 * worldPerPx) / NOMINAL_HEIGHT;
  const widthScale = (rect.width * 0.7 * worldPerPx) / Math.max(modelWidth, 0.1);
  return {
    pos,
    scale: Math.min(heightScale, widthScale),
    breite: rect.width * worldPerPx
  };
}

/** Fußpunkt + Figurenskala für einen Slot (side, lane) aus dessen DOM-Rect. */
function slotAnchor(
  world: World,
  side: PlayerIndex,
  lane: number,
  modelWidth = NOMINAL_HEIGHT
): Anchor | null {
  return elementAnchor(world, `[data-slot="${side}-${lane}"]`, modelWidth);
}

interface ArenaRenderStyle {
  floorOpacity: number;
  gridOpacity: number;
  pathOpacity: number;
  glowOpacity: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
}

const DEFAULT_ARENA_STYLE: ArenaRenderStyle = {
  floorOpacity: 0.34,
  gridOpacity: 0.1,
  pathOpacity: 0.16,
  glowOpacity: 0.14,
  fogNear: 18,
  fogFar: 46,
  exposure: 1.1
};

const ARENA_STYLES: Record<EnvironmentKind, ArenaRenderStyle> = {
  wald: { floorOpacity: 0.38, gridOpacity: 0.045, pathOpacity: 0.13, glowOpacity: 0.1, fogNear: 16, fogFar: 40, exposure: 1.08 },
  hoehle: { floorOpacity: 0.5, gridOpacity: 0.025, pathOpacity: 0.11, glowOpacity: 0.18, fogNear: 13, fogFar: 34, exposure: 1.12 },
  stadt: { floorOpacity: 0.44, gridOpacity: 0.2, pathOpacity: 0.2, glowOpacity: 0.2, fogNear: 20, fogFar: 50, exposure: 1.16 },
  mond: { floorOpacity: 0.48, gridOpacity: 0.055, pathOpacity: 0.12, glowOpacity: 0.13, fogNear: 23, fogFar: 58, exposure: 1.22 },
  mars: { floorOpacity: 0.5, gridOpacity: 0.035, pathOpacity: 0.1, glowOpacity: 0.15, fogNear: 17, fogFar: 43, exposure: 1.12 },
  c137: { floorOpacity: 0.42, gridOpacity: 0.14, pathOpacity: 0.24, glowOpacity: 0.26, fogNear: 16, fogFar: 42, exposure: 1.2 }
};

/** Geschossfarbe aus dem Projektil-Emoji der Karte ableiten. */
function orbColor(emoji: string): number {
  switch (emoji) {
    case '☠️': return 0x6fdd6f; // Gift
    case '✨': return 0xffe28a;
    case '🦷':
    case '🪶': return 0xf2ede2;
    case '🐾':
    case '🐺': return 0xc9a15f;
    case '🚩': return 0xe06666;
    case '🗡️':
    case '⚔️': return 0xcdd6e4;
    default: return 0xffb14d;
  }
}

export function Battlefield3D({ view, me, fx, topic, catalog, onUnsupported }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const onUnsupportedRef = useRef(onUnsupported);
  onUnsupportedRef.current = onUnsupported;
  // Katalog kann asynchron (nach dem Mount) eintreffen – über Ref lesen.
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  // ---- Szene einmalig aufbauen ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    const layoutRoot = container?.parentElement;
    if (!canvas || !container || !layoutRoot) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      onUnsupportedRef.current();
      return;
    }
    renderer.setClearColor(0x000000, 0);
    // Filmisches Tone-Mapping + sRGB → wärmerer, „wertigerer" Look (billig).
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Perf-Stufe: echte Kontaktschatten nur auf leistungsfähigen Geräten
    // (Desktop). Auf Touch-/Reduced-Motion-Geräten bleiben die Blob-Schatten.
    const mq = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const realShadows = !mq('(pointer: coarse)') && !mq('(prefers-reduced-motion: reduce)');
    if (realShadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    const scene = new THREE.Scene();
    // Gekippte, tiefere Kamera: man blickt von der eigenen Seite über das Feld,
    // der Boden weicht perspektivisch zurück (eigene Reihe groß, gegnerische
    // kleiner). Die Figuren bleiben über den DOM-Slot-Raycast pinnend
    // ausgerichtet – die Kamera bestimmt nur Blickwinkel und Tiefenwirkung.
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 8, 10.5);
    camera.lookAt(0, 1.1, -2.5);

    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a3d2c, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
    sun.position.set(3, 8, 4);
    if (realShadows) {
      sun.castShadow = true;
      const size = dpr >= 2 ? 2048 : 1024;
      sun.shadow.mapSize.set(size, size);
      const cam = sun.shadow.camera;
      cam.near = 0.5;
      cam.far = 40;
      cam.left = -12;
      cam.right = 12;
      cam.top = 10;
      cam.bottom = -10;
      cam.updateProjectionMatrix();
      sun.shadow.bias = -0.0008;
    }
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8ab4ff, 0.6);
    rim.position.set(-4, 5, -6);
    scene.add(rim);

    // Kontaktschatten-Ebene (nur der Schatten ist sichtbar, der Karten-
    // Hintergrund scheint durch). Ersetzt bei Bedarf die Blob-Schatten.
    const shadowCatcher = realShadows
      ? new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.3 }))
      : null;
    if (shadowCatcher) {
      shadowCatcher.rotation.x = -Math.PI / 2;
      shadowCatcher.position.y = 0;
      shadowCatcher.receiveShadow = true;
      scene.add(shadowCatcher);
    }

    // ---- Thematischer 3D-Boden (halbtransparent, damit die DOM-Lane-Rahmen,
    // "FREI"-Hinweise und Ziel-Markierungen darunter sichtbar bleiben) ----
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({
        color: 0x1d2940,
        roughness: 0.95,
        metalness: 0,
        transparent: true,
        opacity: 0.32,
        depthWrite: false
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    scene.add(floor);

    // Rasterlinien geben dem Boden Tiefe/Perspektive
    const grid = new THREE.GridHelper(60, 30, 0x63c9f8, 0x63c9f8);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.16;
    (grid.material as THREE.Material).depthWrite = false;
    grid.position.y = 0;
    scene.add(grid);

    // Weicher Horizont-Schimmer hinter dem Feld (Additiv, thematische Akzentfarbe)
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 26),
      new THREE.MeshBasicMaterial({
        color: 0x63c9f8,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );
    glow.position.set(0, 4, -20);
    scene.add(glow);

    // Nebel lässt den fernen Boden zur Akzentfarbe ausfaden → Horizont-Wirkung
    scene.fog = new THREE.Fog(0x0b101d, 18, 46);

    // ---- Lane-Wege: je Lane ein getönter Bodenstreifen vom eigenen zum
    // gegnerischen Slot. Macht sichtbar, dass eine Lane ein Kampf-Pfad ist,
    // und trägt (zusammen mit dezenteren DOM-Boxen) die Arena-Wirkung. ----
    const pathGeo = new THREE.PlaneGeometry(1, 1);
    const lanePaths: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const strip = new THREE.Mesh(
        pathGeo,
        new THREE.MeshBasicMaterial({
          color: 0x63c9f8,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.y = 0.006;
      strip.visible = false;
      scene.add(strip);
      lanePaths.push(strip);
    }

    const teamZones: [TeamZoneRec, TeamZoneRec] = [createTeamZone(), createTeamZone()];
    teamZones.forEach((zone) => {
      zone.group.visible = false;
      scene.add(zone.group);
    });

    const world: World = {
      renderer,
      scene,
      camera,
      container,
      layoutRoot,
      figures: new Map(),
      teamFigures: new Map(),
      teamZones,
      orbs: [],
      spellFx: [],
      ground: { floor, grid, glow },
      environment: null,
      lanePaths,
      pathGeo,
      shadowCatcher,
      realShadows,
      me,
      lanes: view.lanes,
      raf: 0,
      firstSync: true,
      seenProjectiles: new Set(),
      seenSpells: new Set(),
      seenSacrifices: new Set()
    };
    worldRef.current = world;

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const tmp = new THREE.Vector3();
    const frame = () => {
      const now = performance.now();

      // Figuren zu ihren Slot-Ankern führen (Lane-Wechsel = sichtbares Laufen)
      for (const [uid, rec] of world.figures) {
        const anchor = slotAnchor(world, rec.side, rec.lane, rec.width);
        if (anchor) {
          const root = rec.fig.root;
          if (!rec.placed) {
            root.position.copy(anchor.pos);
            rec.placed = true;
          } else {
            tmp.copy(anchor.pos).sub(root.position);
            const dist = tmp.length();
            if (dist > 0.04) {
              // konstante Schrittgeschwindigkeit, gegen Ende weich abbremsen
              const step = Math.min(dist, Math.max(dist * 0.14, 0.09));
              root.position.addScaledVector(tmp.normalize(), step);
              rec.fig.setWalking(true);
            } else {
              root.position.copy(anchor.pos);
              rec.fig.setWalking(false);
            }
          }
          // Angriffs-Zulauf: ein Stück auf den Gegner zu und zurück (rein visuell).
          // Der Slot-Anker wird jeden Frame frisch kopiert → kein Aufsummieren.
          if (rec.attackStart) {
            const k = approachEnvelope(now - rec.attackStart);
            if (k <= 0 && now - rec.attackStart > APPROACH_OUT_MS) rec.attackStart = 0;
            else root.position.addScaledVector(rec.approach, k);
          }
          root.scale.setScalar(anchor.scale);
        }
        rec.fig.update(now);
        if (rec.dying && !rec.onBoard && rec.fig.isDeathFinished(now)) {
          world.scene.remove(rec.fig.root);
          rec.fig.dispose();
          world.figures.delete(uid);
        }
      }

      // Feldgeometrie (aus den DOM-Slot-Ankern) für Lane-Wege + Umgebung
      const opp: PlayerIndex = world.me === 0 ? 1 : 0;
      const a0 = slotAnchor(world, world.me, 0);
      const aN = slotAnchor(world, world.me, Math.max(0, world.lanes - 1));
      const f0 = slotAnchor(world, opp, 0);
      const fN = slotAnchor(world, opp, Math.max(0, world.lanes - 1));
      const haveField = !!(a0 && aN && f0 && fN);
      const anchors = haveField ? [a0!, aN!, f0!, fN!] : [];
      const leftX = haveField ? Math.min(...anchors.map((a) => a.pos.x)) : 0;
      const rightX = haveField ? Math.max(...anchors.map((a) => a.pos.x)) : 0;
      const laneStep = haveField
        ? world.lanes > 1
          ? Math.max(
              Math.abs(aN!.pos.x - a0!.pos.x),
              Math.abs(fN!.pos.x - f0!.pos.x)
            ) / (world.lanes - 1)
          : Math.max(rightX - leftX, 2.0)
        : 2.0;

      if (haveField) {
        const nearZ = Math.max(a0!.pos.z, aN!.pos.z);
        const farZ = Math.min(f0!.pos.z, fN!.pos.z);
        const farSide: PlayerIndex = world.me === 0 ? 1 : 0;
        const ownZone = world.teamZones[world.me];
        const opponentZone = world.teamZones[farSide];

        // Bank und Basis stehen mittig vor bzw. hinter den Lanes – dort, wo im
        // Vorbild der Held steht. Die Basis sitzt im lokalen Raum der Zone bei
        // z = +2.4, also HINTER der Bank; die 180°-Drehung der Gegnerzone dreht
        // dieses „dahinter" dort korrekt nach hinten.
        //
        // Die eigene Zone hängt vollständig am DOM-Anker `[data-zone="<seite>"]`
        // (Position und Größe), den auch der 2D-Fallback bespielt. Bei der
        // gegnerischen Zone geht das nicht: Ihr Anker sitzt am oberen Bildrand,
        // wo der Boden in den Horizont läuft – der Raycast landet dort zig
        // Einheiten hinter dem Feld und die Bank würde riesig. Sie übernimmt
        // deshalb nur die x-Mitte; Tiefe und Größe kommen aus der
        // Feldgeometrie, verkleinert um genau den Faktor, um den auch die
        // Figuren der hinteren Reihe kleiner sind.
        const mitteX = (leftX + rightX) / 2;
        const ownSpot = elementAnchor(world, `[data-zone="${world.me}"]`);
        const oppSpot = elementAnchor(world, `[data-zone="${farSide}"]`);
        // Die Bank ist gut 3.4 Einheiten breit – der Anker gibt die Zielbreite vor.
        const BANK_BREITE = 3.4;
        // Obergrenze 2.1 statt 1.6: die vergrößerten `.bank-anker` liefen sonst
        // in den Deckel und die Bank wäre trotz breiterem Anker nicht gewachsen.
        const ownScale = Math.max(
          0.25,
          Math.min(2.1, (ownSpot ? ownSpot.breite : laneStep) / BANK_BREITE)
        );
        const tiefenFaktor = a0!.scale > 0 ? Math.min(1, f0!.scale / a0!.scale) : 0.75;

        ownZone.group.position.set(
          ownSpot ? ownSpot.pos.x : mitteX,
          0,
          ownSpot ? ownSpot.pos.z : nearZ + laneStep * 0.6
        );
        ownZone.group.rotation.y = 0;
        ownZone.group.scale.setScalar(ownScale);

        opponentZone.group.position.set(
          oppSpot ? oppSpot.pos.x : mitteX,
          0,
          farZ - laneStep * 0.5
        );
        opponentZone.group.rotation.y = Math.PI;
        opponentZone.group.scale.setScalar(ownScale * tiefenFaktor);

        for (const zone of [ownZone, opponentZone]) {
          zone.group.visible = true;
          zone.group.updateMatrixWorld(true);
        }

        for (const zone of world.teamZones) {
          const flash =
            zone.flashStart && now >= zone.flashStart
              ? Math.max(0, 1 - (now - zone.flashStart) / 520)
              : 0;
          (zone.shield.material as THREE.MeshBasicMaterial).opacity = flash * 0.82;
          zone.shield.scale.setScalar(1 + (1 - flash) * 0.35);
          (zone.core.material as THREE.MeshBasicMaterial).opacity = 0.58 + flash * 0.42;
        }

        for (const rec of world.teamFigures.values()) {
          const own = rec.side === world.me;
          const zone = own ? ownZone : opponentZone;
          const skala = zone.group.scale.x;
          // Die drei Plätze verteilen sich auf der Bank (3.2 Einheiten breit);
          // die Gegnerzone ist gedreht, ihre Plätze laufen daher andersherum.
          const seatSpacing = skala * 1.05 * (own ? 1 : -1);
          const rest = new THREE.Vector3(
            zone.group.position.x + (rec.slot - 1) * seatSpacing,
            (rec.slot === 1 ? 0.18 : 0.3) * skala,
            zone.group.position.z
          );
          const figureScale = Math.min(skala * 0.72, (skala * 1.0) / Math.max(rec.width, 0.2));
          if (!rec.sacrificing) {
            rec.fig.root.position.copy(rest);
            rec.fig.root.scale.setScalar(figureScale);
            rec.fig.root.visible = true;
          } else {
            const progress = Math.min(1, (now - rec.sacrificeStart) / SACRIFICE_MS);
            const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (reducedMotion) {
              const fade = Math.min(1, (now - rec.sacrificeStart) / REDUCED_SACRIFICE_MS);
              rec.fig.root.position.copy(rest);
              rec.fig.root.scale.setScalar(figureScale);
              setFigureOpacity(rec.fig.root, 1 - fade);
              rec.fig.root.visible = fade < 1;
            } else {
              rec.fig.root.position.lerpVectors(rec.from, rec.to, progress);
              rec.fig.root.position.y += Math.sin(progress * Math.PI) * laneStep * 0.85;
              rec.fig.root.scale.setScalar(figureScale);
              if (progress >= 1) rec.fig.root.visible = false;
            }
          }
          rec.fig.update(now);
        }
      } else {
        world.teamZones.forEach((zone) => {
          zone.group.visible = false;
        });
      }

      // Lane-Wege: getönter Streifen vom eigenen zum gegnerischen Slot je Lane
      for (let i = 0; i < world.lanePaths.length; i++) {
        const strip = world.lanePaths[i];
        if (i >= world.lanes) {
          strip.visible = false;
          continue;
        }
        const near = slotAnchor(world, world.me, i);
        const far = slotAnchor(world, opp, i);
        if (!near || !far) {
          strip.visible = false;
          continue;
        }
        const midX = (near.pos.x + far.pos.x) / 2;
        const midZ = (near.pos.z + far.pos.z) / 2;
        const len = Math.abs(near.pos.z - far.pos.z) + laneStep * 0.55;
        strip.position.set(midX, 0.006, midZ);
        strip.scale.set(laneStep * 0.62, len, 1);
        strip.visible = true;
      }

      // Umgebung (Deko) lane-frei an die aktuellen Feldkanten setzen
      if (world.environment) {
        if (haveField) {
          world.environment.layout({
            leftX,
            rightX,
            nearZ: Math.max(a0!.pos.z, aN!.pos.z),
            farZ: Math.min(f0!.pos.z, fN!.pos.z),
            laneStep,
            scale: a0!.scale
          });
          world.environment.group.visible = true;
        } else {
          // Slots noch nicht im DOM (z. B. vor dem ersten Layout) → verbergen
          world.environment.group.visible = false;
        }
        world.environment.update(now);
      }

      // Geschosse: leichte Bogenflugbahn von Angreifer zu Ziel
      for (const orb of world.orbs) {
        const p = (now - orb.start) / PROJECTILE_FLY_MS;
        if (p < 0) {
          orb.mesh.visible = false;
          continue;
        }
        if (p >= 1) {
          orb.done = true;
          world.scene.remove(orb.mesh);
          (orb.mesh.material as THREE.Material).dispose();
          continue;
        }
        orb.mesh.visible = true;
        orb.mesh.position.lerpVectors(orb.from, orb.to, p);
        orb.mesh.position.y += Math.sin(p * Math.PI) * 1.1;
        const pulse = 1 + Math.sin(now / 30) * 0.15;
        orb.mesh.scale.setScalar(pulse);
      }
      world.orbs = world.orbs.filter((o) => !o.done);

      // Zauber-Effekte: Ring dehnt sich, Lichtsäule steigt, Funken schweben hoch
      for (const s of world.spellFx) {
        const p = (now - s.start) / SPELL_MS;
        if (p >= 1) {
          s.done = true;
          disposeGroup(world.scene, s.group);
          continue;
        }
        const fade = 1 - p;
        s.ring.scale.setScalar(0.4 + p * 2.2);
        (s.ring.material as THREE.MeshBasicMaterial).opacity = 0.7 * fade;
        s.column.scale.set(1, 0.2 + p * 1.4, 1);
        s.column.position.y = (0.2 + p * 1.4) * 0.6;
        (s.column.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade * (p < 0.3 ? p / 0.3 : 1);
        s.motes.forEach((mote, i) => {
          const mp = (p + i * 0.13) % 1;
          mote.position.y = 0.2 + mp * 2.4;
          const ang = (i / s.motes.length) * Math.PI * 2 + p * 3;
          const rad = 0.35 + mp * 0.5;
          mote.position.x = Math.cos(ang) * rad;
          mote.position.z = Math.sin(ang) * rad;
          (mote.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - mp);
        });
      }
      world.spellFx = world.spellFx.filter((s) => !s.done);

      renderer.render(scene, camera);
      world.raf = requestAnimationFrame(frame);
    };
    world.raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(world.raf);
      ro.disconnect();
      for (const rec of world.figures.values()) {
        scene.remove(rec.fig.root);
        rec.fig.dispose();
      }
      for (const rec of world.teamFigures.values()) {
        scene.remove(rec.fig.root);
        rec.fig.dispose();
      }
      for (const zone of world.teamZones) disposeGroup(scene, zone.group);
      for (const orb of world.orbs) {
        scene.remove(orb.mesh);
        (orb.mesh.material as THREE.Material).dispose();
      }
      for (const s of world.spellFx) {
        disposeGroup(scene, s.group);
      }
      if (world.environment) {
        scene.remove(world.environment.group);
        world.environment.dispose();
      }
      for (const strip of world.lanePaths) {
        scene.remove(strip);
        (strip.material as THREE.Material).dispose();
      }
      pathGeo.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      glow.geometry.dispose();
      (glow.material as THREE.Material).dispose();
      if (shadowCatcher) {
        shadowCatcher.geometry.dispose();
        (shadowCatcher.material as THREE.Material).dispose();
      }
      renderer.dispose();
      worldRef.current = null;
    };
  }, []);

  // ---- Thematischer Boden: Farben aus dem Schauplatz (Topic) übernehmen ----
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const lane = safeColor(topic?.colors.lane, 0x1d2940);
    const border = safeColor(topic?.colors.laneBorder, 0x45619c);
    const accent = safeColor(topic?.colors.accent, 0x63c9f8);
    const style = topic?.environment ? ARENA_STYLES[topic.environment] : DEFAULT_ARENA_STYLE;
    const floorMat = world.ground.floor.material as THREE.MeshStandardMaterial;
    const gridMat = world.ground.grid.material as THREE.LineBasicMaterial;
    const glowMat = world.ground.glow.material as THREE.MeshBasicMaterial;
    floorMat.color.copy(lane);
    floorMat.opacity = style.floorOpacity;
    gridMat.color.copy(border);
    gridMat.opacity = style.gridOpacity;
    glowMat.color.copy(accent);
    glowMat.opacity = style.glowOpacity;
    world.renderer.toneMappingExposure = style.exposure;
    // Lane-Wege in der Akzentfarbe (heller Pfad auf dem dunklen Boden)
    for (const strip of world.lanePaths) {
      const material = strip.material as THREE.MeshBasicMaterial;
      material.color.copy(accent);
      material.opacity = style.pathOpacity;
    }
    world.teamZones.forEach((zone, side) => {
      const faction = view.players[side as PlayerIndex].faction;
      const team = new THREE.Color(faction === 'animals' ? 0x10b981 : 0x3b82f6);
      (zone.core.material as THREE.MeshBasicMaterial).color.copy(team.lerp(accent, 0.38));
      (zone.shield.material as THREE.MeshBasicMaterial).color.copy(
        new THREE.Color(0xeaf4ff).lerp(accent, 0.24)
      );
    });
    // Nebelfarbe dunkel aus der Lane-Farbe ableiten → weicher Horizont
    if (world.scene.fog instanceof THREE.Fog) {
      world.scene.fog.color.copy(lane.clone().multiplyScalar(0.4));
      world.scene.fog.near = style.fogNear;
      world.scene.fog.far = style.fogFar;
    }
  }, [topic, view.players]);

  // ---- Prozedurale 3D-Umgebung (Deko) je nach Schauplatz auf-/abbauen ----
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    // Alte Umgebung entfernen
    if (world.environment) {
      world.scene.remove(world.environment.group);
      world.environment.dispose();
      world.environment = null;
    }
    // Neue Umgebung bauen (null = nur Farbe, keine Deko)
    const env = createEnvironment(topic?.environment);
    if (env) {
      env.group.visible = false; // erst sichtbar, wenn die Slots vermessen sind
      world.scene.add(env.group);
      world.environment = env;
    }
  }, [topic?.environment]);

  // ---- Brett-Sync: Figuren erzeugen/aktualisieren/entfernen ----
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.me = me;
    world.lanes = view.lanes;
    const seen = new Set<number>();

    for (const side of [0, 1] as PlayerIndex[]) {
      view.board[side].forEach((c, lane) => {
        if (!c) return;
        seen.add(c.uid);
        let rec = world.figures.get(c.uid);
        if (!rec) {
          const cat = catalogRef.current;
          const fig = createFigure(
            c.cardId,
            side === me ? -1 : 1,
            c.uid,
            cat?.cards[c.cardId],
            cat?.defaultClips,
            { realShadows: world.realShadows }
          );
          const width = new THREE.Box3().setFromObject(fig.root).getSize(new THREE.Vector3()).x;
          rec = { fig, side, lane, health: c.health, onBoard: true, dying: false, placed: false, attackStart: 0, approach: new THREE.Vector3(), width };
          world.figures.set(c.uid, rec);
          world.scene.add(fig.root);
          if (!world.firstSync) fig.playSpawn();
        } else {
          if (c.health < rec.health) rec.fig.playHit();
          rec.health = c.health;
          rec.lane = lane;
          rec.side = side;
          rec.onBoard = true;
        }
        rec.fig.setExhausted(c.exhausted);
      });
    }

    // Vom Brett verschwundene Figuren: Sterbende zu Ende animieren lassen,
    // alle anderen (z. B. nach Resync) sofort entfernen.
    for (const [uid, rec] of world.figures) {
      if (seen.has(uid)) continue;
      rec.onBoard = false;
      if (!rec.dying) {
        world.scene.remove(rec.fig.root);
        rec.fig.dispose();
        world.figures.delete(uid);
      }
    }
    world.firstSync = false;
  }, [view, me]);

  // ---- Öffentliche Teamroster: drei stabile Bankplätze je Seite ----
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const present = new Set<string>();
    for (const side of [0, 1] as PlayerIndex[]) {
      view.players[side].cheerleaders.forEach((cardId, rawSlot) => {
        if (!cardId) return;
        const slot = rawSlot as 0 | 1 | 2;
        const key = `${side}-${slot}`;
        present.add(key);
        const current = world.teamFigures.get(key);
        if (current?.cardId === cardId) return;
        if (current) {
          world.scene.remove(current.fig.root);
          current.fig.dispose();
        }
        const cat = catalogRef.current;
        const fig = createFigure(
          cardId,
          side === me ? -1 : 1,
          10000 + side * 10 + slot,
          cat?.cards[cardId],
          cat?.defaultClips,
          { realShadows: world.realShadows }
        );
        const width = new THREE.Box3().setFromObject(fig.root).getSize(new THREE.Vector3()).x;
        fig.playCheer();
        world.scene.add(fig.root);
        world.teamFigures.set(key, {
          fig,
          side,
          slot,
          cardId,
          width,
          sacrificing: false,
          sacrificeStart: 0,
          from: new THREE.Vector3(),
          to: new THREE.Vector3()
        });
      });
    }
    for (const [key, rec] of world.teamFigures) {
      if (present.has(key)) continue;
      world.scene.remove(rec.fig.root);
      rec.fig.dispose();
      world.teamFigures.delete(key);
    }
  }, [view.players, me]);

  // ---- Kampf-Effekte: Angriffs-Ausfall, 3D-Geschosse, Sterbeanimationen ----
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const now = performance.now();

    for (const p of fx.projectiles) {
      if (world.seenProjectiles.has(p.key)) continue;
      world.seenProjectiles.add(p.key);

      const defender: PlayerIndex = p.attacker === 0 ? 1 : 0;
      const attackerRec = [...world.figures.values()].find(
        (r) => r.side === p.attacker && r.lane === p.lane && r.onBoard
      );
      attackerRec?.fig.playAttack();

      const from = slotAnchor(world, p.attacker, p.lane);
      if (!from) continue;
      let to = slotAnchor(world, defender, p.lane)?.pos ?? null;
      if (p.toBase || !to) {
        // Basis-Treffer: über die Feldkante hinaus in Richtung der Basis
        const dir = defender === me ? 1 : -1;
        to = from.pos.clone();
        to.z += dir * 7;
      }
      // Angreifer läuft vor dem Schlag ein Stück auf den Gegner zu (gedeckelt,
      // damit Basis-Angriffe nicht quer übers Feld stürmen).
      if (attackerRec) {
        const dirVec = to.clone().sub(from.pos);
        dirVec.y = 0;
        const dist = dirVec.length();
        if (dist > 0.001) {
          attackerRec.approach.copy(dirVec.normalize().multiplyScalar(Math.min(dist * 0.28, 0.7)));
          attackerRec.attackStart = now;
        }
      }
      const material = new THREE.MeshBasicMaterial({
        color: orbColor(p.emoji),
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), material);
      mesh.visible = false;
      const start = new THREE.Vector3().copy(from.pos);
      start.y += NOMINAL_HEIGHT * from.scale * 0.45;
      world.scene.add(mesh);
      world.orbs.push({
        mesh,
        from: start,
        to: to.clone().setY(start.y * 0.8),
        start: now + PROJECTILE_DELAY_MS,
        done: false
      });
    }
    // Gedächtnis begrenzen – Keys sind zeitgestempelt und kommen nie wieder
    if (world.seenProjectiles.size > 200) world.seenProjectiles.clear();

    for (const d of fx.dying) {
      for (const rec of world.figures.values()) {
        if (rec.side === d.owner && rec.lane === d.lane && !rec.dying) {
          rec.dying = true;
          rec.fig.playDeath();
        }
      }
    }

    // Zauber-Effekte der Aktionskarten: immer auf der eigenen (unteren) Reihe,
    // da nur eigene Kreaturen/Lanes Ziel einer Aktion sind.
    for (const sp of fx.spells) {
      if (world.seenSpells.has(sp.key)) continue;
      world.seenSpells.add(sp.key);
      const anchor = slotAnchor(world, me, sp.lane);
      if (!anchor) continue;
      const color = spellColor(sp.effect, sp.faction);

      const group = new THREE.Group();
      group.position.copy(anchor.pos);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 0.62, 28),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      group.add(ring);

      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.5, 1, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      group.add(column);

      const motes: THREE.Mesh[] = [];
      const moteGeo = new THREE.SphereGeometry(0.07, 6, 5);
      for (let i = 0; i < 7; i++) {
        const mote = new THREE.Mesh(
          moteGeo,
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending
          })
        );
        group.add(mote);
        motes.push(mote);
      }

      world.scene.add(group);
      world.spellFx.push({
        group,
        ring,
        column,
        motes,
        effect: sp.effect,
        start: performance.now(),
        done: false
      });
    }
    if (world.seenSpells.size > 200) world.seenSpells.clear();

    for (const sacrifice of fx.sacrifices) {
      if (world.seenSacrifices.has(sacrifice.key)) continue;
      world.seenSacrifices.add(sacrifice.key);
      const rec = world.teamFigures.get(`${sacrifice.owner}-${sacrifice.slot}`);
      if (!rec || rec.cardId !== sacrifice.cardId) continue;
      rec.sacrificing = true;
      rec.sacrificeStart = now;
      rec.from.copy(rec.fig.root.position);
      world.teamZones[sacrifice.owner].group.updateMatrixWorld(true);
      world.teamZones[sacrifice.owner].core.getWorldPosition(rec.to);
      rec.to.y = 0.12;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!reducedMotion) rec.fig.playSacrifice();
      world.teamZones[sacrifice.owner].flashStart =
        now + (reducedMotion ? REDUCED_SACRIFICE_MS * 0.45 : SACRIFICE_MS * 0.58);
    }
    if (world.seenSacrifices.size > 100) world.seenSacrifices.clear();
  }, [fx, me]);

  return (
    <div className="battlefield3d-shell" aria-hidden>
      <canvas ref={canvasRef} className="battlefield3d" />
    </div>
  );
}
