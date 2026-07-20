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
import type { ClientView, PlayerIndex } from '@pcf/engine';
import { createFigure, type Figure } from './figures3d';

/** Teilmenge des GameScreen-FxState, die das Schlachtfeld braucht. */
export interface BattlefieldFx {
  projectiles: { key: string; lane: number; attacker: PlayerIndex; toBase: boolean; emoji: string }[];
  dying: { lane: number; owner: PlayerIndex }[];
}

interface Props {
  view: ClientView;
  me: PlayerIndex;
  fx: BattlefieldFx;
  onUnsupported: () => void;
}

/** Einmalige Probe, ob der Browser WebGL kann (für den 2D-Fallback). */
export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
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
}

interface Orb {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number; // Startzeitpunkt (inkl. Verzögerung)
  done: boolean;
}

interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  figures: Map<number, FigureRec>;
  orbs: Orb[];
  raf: number;
  firstSync: boolean;
  seenProjectiles: Set<string>;
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

/** Fußpunkt + Figurenskala für einen Slot (side, lane) aus dessen DOM-Rect. */
function slotAnchor(
  world: World,
  side: PlayerIndex,
  lane: number
): { pos: THREE.Vector3; scale: number } | null {
  const el = world.container.querySelector<HTMLElement>(`[data-slot="${side}-${lane}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const cRect = world.container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const px = rect.left - cRect.left + rect.width / 2;
  // Fußpunkt im unteren Slot-Drittel, damit die Figur im Slot steht
  const py = rect.top - cRect.top + rect.height * 0.8;
  const pos = groundPoint(world, px, py, new THREE.Vector3());
  // Skala: Welt-Einheiten pro CSS-Pixel in dieser Kameratiefe. Die Figur
  // soll gut die halbe Slot-Höhe einnehmen – der Rest ist Luft für
  // Badges, Sprünge und die schräge Draufsicht.
  const dist = world.camera.position.distanceTo(pos);
  const worldPerPx =
    (2 * dist * Math.tan(THREE.MathUtils.degToRad(world.camera.fov / 2))) /
    (world.container.clientHeight || 1);
  const scale = (Math.min(rect.height * 0.68, rect.width * 0.78) * worldPerPx) / NOMINAL_HEIGHT;
  return { pos, scale };
}

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

export function Battlefield3D({ view, me, fx, onUnsupported }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World | null>(null);
  const onUnsupportedRef = useRef(onUnsupported);
  onUnsupportedRef.current = onUnsupported;

  // ---- Szene einmalig aufbauen ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (!canvas || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    } catch {
      onUnsupportedRef.current();
      return;
    }
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 11, 8);
    camera.lookAt(0, 0, -1.5);

    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a3d2c, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
    sun.position.set(3, 8, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8ab4ff, 0.6);
    rim.position.set(-4, 5, -6);
    scene.add(rim);

    const world: World = {
      renderer,
      scene,
      camera,
      container,
      figures: new Map(),
      orbs: [],
      raf: 0,
      firstSync: true,
      seenProjectiles: new Set()
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
        const anchor = slotAnchor(world, rec.side, rec.lane);
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
          root.scale.setScalar(anchor.scale);
        }
        rec.fig.update(now);
        if (rec.dying && !rec.onBoard && rec.fig.isDeathFinished(now)) {
          world.scene.remove(rec.fig.root);
          rec.fig.dispose();
          world.figures.delete(uid);
        }
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
      for (const orb of world.orbs) {
        scene.remove(orb.mesh);
        (orb.mesh.material as THREE.Material).dispose();
      }
      renderer.dispose();
      worldRef.current = null;
    };
  }, []);

  // ---- Brett-Sync: Figuren erzeugen/aktualisieren/entfernen ----
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const seen = new Set<number>();

    for (const side of [0, 1] as PlayerIndex[]) {
      view.board[side].forEach((c, lane) => {
        if (!c) return;
        seen.add(c.uid);
        let rec = world.figures.get(c.uid);
        if (!rec) {
          const fig = createFigure(c.cardId, side === me ? -1 : 1, c.uid);
          rec = { fig, side, lane, health: c.health, onBoard: true, dying: false, placed: false };
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
  }, [fx, me]);

  return <canvas ref={canvasRef} className="battlefield3d" aria-hidden />;
}
