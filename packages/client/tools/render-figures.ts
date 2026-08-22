// Autorenwerkzeug (läuft NICHT zur Laufzeit): rendert eine einzelne Spielfigur
// oder ein Aktions-Emblem in ein transparentes Canvas, das der Node-Treiber
// `scripts/render-card-art.mjs` per Playwright als PNG-Kartenbild abgreift.
//
// Aufruf über die URL: render-figures.html?card=<karten-id>
//
// Kreaturen werden über das vorhandene `createFigure` aus der Spiel-Engine
// gebaut (identischer Look wie auf dem Schlachtfeld). Aktionskarten haben keine
// Figur → dafür kleine Embleme aus Grundkörpern.

import * as THREE from 'three';
import type { CardDef, VisualCatalog } from '@pcf/engine';
import { createFigure, type Figure } from '../src/figures3d';

const params = new URLSearchParams(location.search);
const card = params.get('card') ?? 'rekrut';
const serverBase = params.get('server') ?? 'http://localhost:3000';
const renderState = window as unknown as { __renderReady?: boolean; __renderError?: string };

interface RenderInfo {
  cards: CardDef[];
  visuals: VisualCatalog;
  dataError?: string;
}

let info: RenderInfo;
try {
  const response = await fetch(`${serverBase}/info`, { cache: 'no-store' });
  info = await response.json() as RenderInfo;
  if (!response.ok || info.dataError) throw new Error(info.dataError || `Server antwortet mit ${response.status}.`);
} catch (error) {
  renderState.__renderError = `Figuren-Katalog nicht ladbar: ${error instanceof Error ? error.message : String(error)}`;
  throw error;
}
const dataFigures = new Map(Object.entries(info.visuals.cards));
const defaultClips = info.visuals.defaultClips;
const cardDef = info.cards.find((entry) => entry.id === card);

const canvas = document.getElementById('art') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(2);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const scene = new THREE.Scene();
// Beleuchtung wie auf dem Schlachtfeld, damit Kartenbild und Feld zusammenpassen.
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a3d2c, 1.5));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.3);
sun.position.set(4, 8, 6);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x8ab4ff, 0.7);
rim.position.set(-5, 4, 3);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(38, canvas.clientWidth / canvas.clientHeight, 0.1, 100);

// ---- kleine Primitive-Helfer für die Aktions-Embleme ----
const mat = (color: number, opts: { emissive?: number; metal?: number; rough?: number } = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    metalness: opts.metal ?? 0.1,
    roughness: opts.rough ?? 0.7,
    flatShading: true
  });
const meshOf = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  return me;
};

const CLASS_PALETTES: Record<string, [number, number, number]> = {
  guardian: [0x3d7ea6, 0x9dd7e8, 0x173a57],
  kabloom: [0xd94a36, 0xffb33b, 0x681f2c],
  mega_grow: [0x4c9a50, 0xb8d85c, 0x1f4d34],
  solar: [0xe2a934, 0xffe17a, 0x875b22],
  beastly: [0x9a4d3f, 0xe38c45, 0x432339],
  brainy: [0x6957a8, 0x65d3d1, 0x2c244c],
  hearty: [0x596b78, 0xe05a47, 0x27343d],
  sneaky: [0x35766f, 0x71d8bd, 0x182d38],
  neutral: [0x7a5d9d, 0xf0c65a, 0x30243d]
};

function stableHash(input: string) {
  let value = 2166136261;
  for (const char of input) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

type EmblemKind = 'damage' | 'heal' | 'draw' | 'buff' | 'summon' | 'move' | 'freeze' | 'shield' | 'poison' | 'energy' | 'wild';

function emblemKind(def: CardDef): EmblemKind {
  const words = `${def.id} ${def.name} ${def.text ?? ''}`.toLocaleLowerCase('de');
  if (/heil|leben|regeneration|gesundheit wieder|lebenskreis/.test(words)) return 'heal';
  if (/zieh|karte auf die hand|nachschub|entdeck/.test(words)) return 'draw';
  if (/beschw|erzeug|verstärkung|kopie|lege .* animal|lege .* human/.test(words)) return 'summon';
  if (/frier|eis|betäub|stopp/.test(words)) return 'freeze';
  if (/schild|schutz|block|panzer|rüstung/.test(words)) return 'shield';
  if (/gift|krank|schwäch|minus|-\d/.test(words)) return 'poison';
  if (/verschieb|beweg|flieg|spur|lane|flucht/.test(words)) return 'move';
  if (/energie|energy|sun\b|aufladen/.test(words)) return 'energy';
  if (/schaden|zerstör|hieb|schlag|biss|sturz|beben|spreng|explod|angriff/.test(words)) return 'damage';
  if (/\+\d|stärk|mut|instinkt|bonus|doppelt/.test(words)) return 'buff';
  return 'wild';
}

function addSemanticMotif(group: THREE.Group, kind: EmblemKind, primary: THREE.Material, light: THREE.Material, dark: THREE.Material) {
  if (kind === 'damage') {
    group.add(meshOf(new THREE.IcosahedronGeometry(0.42, 1), primary));
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spike = meshOf(new THREE.ConeGeometry(0.11, 0.62, 5), light, Math.cos(angle) * 0.7, Math.sin(angle) * 0.7, 0);
      spike.rotation.z = angle - Math.PI / 2;
      group.add(spike);
    }
  } else if (kind === 'heal') {
    group.add(meshOf(new THREE.SphereGeometry(0.34, 10, 8), primary, -0.25, 0.18));
    group.add(meshOf(new THREE.SphereGeometry(0.34, 10, 8), primary, 0.25, 0.18));
    const tip = meshOf(new THREE.ConeGeometry(0.5, 0.78, 4), primary, 0, -0.2);
    tip.rotation.z = Math.PI;
    group.add(tip);
    group.add(meshOf(new THREE.BoxGeometry(0.12, 0.55, 0.15), light, 0, 0.05, 0.32));
    group.add(meshOf(new THREE.BoxGeometry(0.5, 0.12, 0.15), light, 0, 0.05, 0.32));
  } else if (kind === 'draw') {
    for (let i = -1; i <= 1; i++) {
      const cardMesh = meshOf(new THREE.BoxGeometry(0.58, 0.82, 0.08), i === 0 ? light : primary, i * 0.28, i === 0 ? 0.08 : -0.02, -Math.abs(i) * 0.1);
      cardMesh.rotation.z = i * -0.24;
      group.add(cardMesh);
    }
    group.add(meshOf(new THREE.TorusGeometry(0.16, 0.035, 6, 12), dark, 0, 0.12, 0.1));
  } else if (kind === 'buff') {
    group.add(meshOf(new THREE.BoxGeometry(0.22, 0.9, 0.22), primary, 0, -0.12));
    group.add(meshOf(new THREE.ConeGeometry(0.5, 0.65, 4), light, 0, 0.62));
    for (const x of [-0.52, 0.52]) group.add(meshOf(new THREE.OctahedronGeometry(0.19), light, x, -0.28));
  } else if (kind === 'summon') {
    for (const [x, y, size] of [[0, 0.2, 0.38], [-0.5, -0.25, 0.27], [0.5, -0.25, 0.27]] as const) {
      group.add(meshOf(new THREE.IcosahedronGeometry(size, 1), x === 0 ? light : primary, x, y));
      group.add(meshOf(new THREE.ConeGeometry(size * 0.65, size * 0.8, 5), dark, x, y - size * 0.92));
    }
  } else if (kind === 'move') {
    for (let i = -1; i <= 1; i++) {
      group.add(meshOf(new THREE.BoxGeometry(0.82 - Math.abs(i) * 0.14, 0.1, 0.12), primary, -0.18, i * 0.32));
      const tip = meshOf(new THREE.ConeGeometry(0.24, 0.42, 4), light, 0.48, i * 0.32);
      tip.rotation.z = -Math.PI / 2;
      group.add(tip);
    }
  } else if (kind === 'freeze') {
    for (let i = 0; i < 6; i++) {
      const arm = meshOf(new THREE.BoxGeometry(0.1, 1.35, 0.12), light);
      arm.rotation.z = (i / 6) * Math.PI;
      group.add(arm);
    }
    group.add(meshOf(new THREE.OctahedronGeometry(0.28), primary));
  } else if (kind === 'shield') {
    const shield = meshOf(new THREE.CylinderGeometry(0.72, 0.72, 0.14, 6), primary, 0, 0.12);
    shield.rotation.x = Math.PI / 2;
    shield.rotation.z = Math.PI / 6;
    group.add(shield);
    const point = meshOf(new THREE.ConeGeometry(0.72, 0.6, 6), primary, 0, -0.48);
    point.rotation.x = Math.PI / 2;
    point.rotation.z = Math.PI / 6;
    group.add(point);
    group.add(meshOf(new THREE.SphereGeometry(0.18, 8, 6), light, 0, 0.1, 0.24));
  } else if (kind === 'poison') {
    group.add(meshOf(new THREE.IcosahedronGeometry(0.58, 1), primary, 0, 0.12));
    group.add(meshOf(new THREE.SphereGeometry(0.12, 7, 5), dark, -0.22, 0.22, 0.5));
    group.add(meshOf(new THREE.SphereGeometry(0.12, 7, 5), dark, 0.22, 0.22, 0.5));
    for (const x of [-0.23, 0, 0.23]) group.add(meshOf(new THREE.BoxGeometry(0.12, 0.3, 0.12), light, x, -0.5));
  } else if (kind === 'energy') {
    group.add(meshOf(new THREE.OctahedronGeometry(0.62), light));
    const orbit = meshOf(new THREE.TorusGeometry(0.85, 0.055, 7, 24), primary);
    orbit.rotation.x = 1.05;
    orbit.rotation.y = 0.35;
    group.add(orbit);
  } else {
    group.add(meshOf(new THREE.DodecahedronGeometry(0.6), primary));
    group.add(meshOf(new THREE.TorusKnotGeometry(0.34, 0.075, 48, 6, 2, 3), light, 0, 0, 0.32));
  }
}

function addIdentityRunes(group: THREE.Group, seed: number, material: THREE.Material) {
  const count = 3 + (seed % 5);
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + ((seed >>> 8) % 31) / 30;
    const radius = 1.05 + ((seed >>> (index % 16)) & 3) * 0.06;
    const shape = (seed + index) % 3;
    const geometry = shape === 0
      ? new THREE.TetrahedronGeometry(0.11 + (index % 2) * 0.035)
      : shape === 1
        ? new THREE.BoxGeometry(0.15, 0.15, 0.15)
        : new THREE.TorusGeometry(0.1, 0.025, 5, 10);
    const rune = meshOf(geometry, material, Math.cos(angle) * radius, Math.sin(angle) * radius, -0.12);
    rune.rotation.set(angle * 0.3, angle * 0.5, angle);
    group.add(rune);
  }
}

/** Individuelles, klassenkodiertes Emblem fuer Karten ohne Kreatur-Rig. */
function buildEmblem(def: CardDef): THREE.Object3D {
  const g = new THREE.Group();
  const id = def.id;
  if (id === 'schildwall') {
    // Leuchtender Wappenschild
    const steel = mat(0x9aa7b8, { metal: 0.7, rough: 0.35 });
    const blue = mat(0x3b82f6, { emissive: 0x1b3a7a, metal: 0.4, rough: 0.4 });
    const shield = new THREE.Group();
    shield.add(meshOf(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 6), blue, 0, 0.2, 0));
    shield.add(meshOf(new THREE.ConeGeometry(0.9, 0.7, 6), blue, 0, -0.55, 0));
    shield.add(meshOf(new THREE.SphereGeometry(0.18, 8, 6), steel, 0, 0.2, 0.12));
    shield.rotation.x = Math.PI / 2;
    shield.rotation.z = Math.PI / 6;
    g.add(shield);
  } else if (id === 'mobilmachung') {
    // Zwei kleine Rekruten – die beschworenen Token
    const a = createFigure('rekrut', 1, 3);
    const b = createFigure('rekrut', 1, 9);
    a.root.position.set(-0.55, 0, 0);
    a.root.scale.setScalar(0.85);
    a.root.rotation.y = 0.3;
    b.root.position.set(0.55, 0, -0.2);
    b.root.scale.setScalar(0.85);
    b.root.rotation.y = -0.3;
    (g as THREE.Group & { figs?: Figure[] }).figs = [a, b];
    g.add(a.root, b.root);
  } else if (id === 'hetzjagd') {
    // Große Pfote + Staubwölkchen (Tempo)
    const fur = mat(0x8b8f98, { rough: 0.9 });
    const dust = mat(0xcdbfa6, { rough: 1, emissive: 0x2a2418 });
    const paw = new THREE.Group();
    paw.add(meshOf(new THREE.SphereGeometry(0.45, 10, 8), fur, 0, 0.2, 0));
    for (const dx of [-0.4, -0.13, 0.13, 0.4]) {
      paw.add(meshOf(new THREE.SphereGeometry(0.15, 8, 6), fur, dx, 0.55, 0.1));
    }
    paw.scale.set(1, 0.7, 1);
    g.add(paw);
    for (const [dx, dy, s] of [[-0.8, -0.3, 0.3], [0.85, 0.1, 0.25], [-0.2, -0.6, 0.22]]) {
      g.add(meshOf(new THREE.SphereGeometry(s, 7, 6), dust, dx, dy, -0.3));
    }
  } else if (id === 'wilder_instinkt') {
    // Drei glühende Krallenhiebe
    const claw = mat(0xd64545, { emissive: 0x7a1010, rough: 0.5 });
    for (const dx of [-0.35, 0, 0.35]) {
      const slash = meshOf(new THREE.BoxGeometry(0.12, 1.5, 0.12), claw, dx, 0, 0);
      slash.rotation.z = 0.4;
      g.add(slash);
    }
  } else {
    const seed = stableHash(`${def.id}:${def.name}:${def.text ?? ''}`);
    const [baseColor, lightColor, darkColor] = CLASS_PALETTES[def.faction] ?? CLASS_PALETTES.neutral;
    const primary = mat(baseColor, { emissive: darkColor, metal: 0.28, rough: 0.48 });
    const light = mat(lightColor, { emissive: (lightColor & 0xfefefe) >>> 2, metal: 0.2, rough: 0.42 });
    const dark = mat(darkColor, { metal: 0.4, rough: 0.58 });

    if (def.type === 'environment') {
      const platform = meshOf(new THREE.CylinderGeometry(1.1, 1.24, 0.2, 8), dark, 0, -0.72, -0.18);
      g.add(platform);
      const ring = meshOf(new THREE.TorusGeometry(0.92, 0.07, 7, 24), primary, 0, -0.59, -0.02);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      for (let index = 0; index < 4; index++) {
        const angle = index * Math.PI / 2 + Math.PI / 4;
        g.add(meshOf(new THREE.ConeGeometry(0.11, 0.5, 5), light, Math.cos(angle) * 0.78, -0.3, Math.sin(angle) * 0.35));
      }
    } else if (def.type === 'superpower') {
      const crown = meshOf(new THREE.TorusGeometry(0.92, 0.1, 6, 24), primary);
      crown.rotation.x = 0.25;
      g.add(crown);
      for (let index = 0; index < 8; index++) {
        const angle = (index / 8) * Math.PI * 2;
        const ray = meshOf(new THREE.ConeGeometry(0.08, 0.4 + (index % 2) * 0.12, 4), light, Math.cos(angle) * 1.12, Math.sin(angle) * 1.12, -0.18);
        ray.rotation.z = angle - Math.PI / 2;
        g.add(ray);
      }
    } else {
      const actionRing = meshOf(new THREE.TorusGeometry(0.96, 0.075, 7, 24), dark, 0, 0, -0.2);
      actionRing.rotation.z = ((seed >>> 5) % 13) * 0.07;
      g.add(actionRing);
    }

    const motif = new THREE.Group();
    motif.rotation.z = (((seed >>> 12) % 15) - 7) * 0.035;
    motif.position.y = def.type === 'environment' ? 0.2 : 0;
    addSemanticMotif(motif, emblemKind(def), primary, light, dark);
    g.add(motif);
    addIdentityRunes(g, seed, def.type === 'superpower' ? light : primary);
  }
  return g;
}

const CREATURES = new Set([
  'ratte', 'wolf', 'schlange', 'adler', 'baer', 'alphawolf',
  'rekrut', 'schildwache', 'feldscherin', 'bannertraeger', 'ritter', 'kommandantin'
]);

let figs: Figure[] = [];
let root: THREE.Object3D;
const dataFig = dataFigures.get(card);
if (cardDef?.type === 'creature' && dataFig?.visual) {
  // Daten-Figur: identischer Aufbau wie im Spiel (visual + eigene/Default-Klips).
  const f = createFigure(
    card,
    1,
    5,
    { visual: dataFig.visual, animations: dataFig.animations },
    defaultClips
  );
  figs = [f];
  root = f.root;
} else if (cardDef?.type === 'creature' && CREATURES.has(card)) {
  const f = createFigure(card, 1, 5);
  figs = [f];
  root = f.root;
} else if (cardDef && cardDef.type !== 'creature') {
  // Aktionen, Umgebungen und Superkraefte erhalten nur ein Template-Emblem.
  // Sie laufen niemals durch createFigure und koennen daher kein Golem-Fallback werden.
  root = buildEmblem(cardDef);
  const withFigs = root as THREE.Group & { figs?: Figure[] };
  if (withFigs.figs) figs = withFigs.figs;
} else {
  const message = cardDef
    ? `Kreatur ${card} besitzt keine freigegebene Figur; Golem-Rendering ist gesperrt.`
    : `Unbekannte Karte ${card}.`;
  renderState.__renderError = message;
  throw new Error(message);
}
scene.add(root);

// Kamera so setzen, dass die Figur (egal ob Ratte oder Bär) formatfüllend im
// 3/4-Winkel steht – Größenunterschiede werden durch Bounding-Box ausgeglichen.
function fitCamera() {
  for (const f of figs) f.update(700);
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y * 0.9, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.85;
  const dir = new THREE.Vector3(0.55, 0.32, 1).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.lookAt(center.x, center.y, center.z);
}
fitCamera();

let ready = false;
function frame() {
  const now = performance.now();
  for (const f of figs) f.update(now);
  renderer.render(scene, camera);
  ready = true;
  renderState.__renderReady = ready;
  requestAnimationFrame(frame);
}
frame();
