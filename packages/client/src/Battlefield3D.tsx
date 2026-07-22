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
import type { ClientView, PlayerIndex, Topic, VisualCatalog } from '@pcf/engine';
import { createFigure, type Figure } from './figures3d';

/** Zauber-Effektarten der Aktionskarten (Spiegel des engine-SpellEvent). */
export type SpellEffectKind = 'buff' | 'attackBuff' | 'summon' | 'move';

/** Teilmenge des GameScreen-FxState, die das Schlachtfeld braucht. */
export interface BattlefieldFx {
  projectiles: { key: string; lane: number; attacker: PlayerIndex; toBase: boolean; emoji: string }[];
  dying: { lane: number; owner: PlayerIndex }[];
  spells: { key: string; lane: number; effect: SpellEffectKind; faction: string }[];
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
  container: HTMLElement;
  figures: Map<number, FigureRec>;
  orbs: Orb[];
  spellFx: SpellFx[];
  ground: Ground;
  shadowCatcher: THREE.Mesh | null;
  realShadows: boolean;
  raf: number;
  firstSync: boolean;
  seenProjectiles: Set<string>;
  seenSpells: Set<string>;
}

const SPELL_MS = 900;

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
    if (!canvas || !container) return;

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

    const world: World = {
      renderer,
      scene,
      camera,
      container,
      figures: new Map(),
      orbs: [],
      spellFx: [],
      ground: { floor, grid, glow },
      shadowCatcher,
      realShadows,
      raf: 0,
      firstSync: true,
      seenProjectiles: new Set(),
      seenSpells: new Set()
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
      for (const orb of world.orbs) {
        scene.remove(orb.mesh);
        (orb.mesh.material as THREE.Material).dispose();
      }
      for (const s of world.spellFx) {
        disposeGroup(scene, s.group);
      }
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
    (world.ground.floor.material as THREE.MeshStandardMaterial).color.copy(lane);
    (world.ground.grid.material as THREE.Material as THREE.LineBasicMaterial).color.copy(border);
    (world.ground.glow.material as THREE.MeshBasicMaterial).color.copy(accent);
    // Nebelfarbe dunkel aus der Lane-Farbe ableiten → weicher Horizont
    if (world.scene.fog) world.scene.fog.color.copy(lane.clone().multiplyScalar(0.4));
  }, [topic]);

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
          const cat = catalogRef.current;
          const fig = createFigure(
            c.cardId,
            side === me ? -1 : 1,
            c.uid,
            cat?.cards[c.cardId],
            cat?.defaultClips,
            { realShadows: world.realShadows }
          );
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
  }, [fx, me]);

  return <canvas ref={canvasRef} className="battlefield3d" aria-hidden />;
}
