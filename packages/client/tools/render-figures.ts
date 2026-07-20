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
import { createFigure, type Figure } from '../src/figures3d';

const params = new URLSearchParams(location.search);
const card = params.get('card') ?? 'rekrut';

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

/** Emblem einer Aktionskarte (kein Kreatur-Rig). */
function buildEmblem(id: string): THREE.Object3D {
  const g = new THREE.Group();
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
    // Fallback: einfacher leuchtender Kristall
    g.add(meshOf(new THREE.OctahedronGeometry(0.7), mat(0x8888ff, { emissive: 0x2a2a66 })));
  }
  return g;
}

const CREATURES = new Set([
  'ratte', 'wolf', 'schlange', 'adler', 'baer', 'alphawolf',
  'rekrut', 'schildwache', 'feldscherin', 'bannertraeger', 'ritter', 'kommandantin'
]);

let figs: Figure[] = [];
let root: THREE.Object3D;
if (CREATURES.has(card)) {
  const f = createFigure(card, 1, 5);
  figs = [f];
  root = f.root;
} else {
  root = buildEmblem(card);
  const withFigs = root as THREE.Group & { figs?: Figure[] };
  if (withFigs.figs) figs = withFigs.figs;
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
  (window as unknown as { __renderReady: boolean }).__renderReady = ready;
  requestAnimationFrame(frame);
}
frame();
