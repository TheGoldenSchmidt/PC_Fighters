// Interaktiver Figuren-Live-Viewer für die Werkstatt.
// Lädt denselben Katalog und verwendet dieselbe createFigure-Pipeline wie das
// Schlachtfeld. ?figure=<cardId> bleibt für snap.mjs rückwärtskompatibel;
// ?viewer=figures öffnet die frei auswählbare Werkstattbühne.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import type { CardDef, CreatureCard, VisualCatalog } from '@pcf/engine';
import { createFigure, type Figure } from './figures3d';
import { defaultServerHost, toInfoUrl } from './config';
import './FigurePreview.css';

type ClipName = 'idle' | 'entrance' | 'attack' | 'hit' | 'death';

const CLIPS: { id: ClipName; label: string; short: string; description: string }[] = [
  { id: 'idle', label: 'Idle', short: 'Ruhe', description: 'Atmung und kleine Nebenbewegungen' },
  { id: 'entrance', label: 'Einzug', short: 'Auftritt', description: 'So betritt die Figur ihre Lane' },
  { id: 'attack', label: 'Angriff', short: 'Aktion', description: 'Die individuelle Angriffs-Choreografie' },
  { id: 'hit', label: 'Treffer', short: 'Reaktion', description: 'Rückstoß und Schadensreaktion' },
  { id: 'death', label: 'Tod', short: 'Abgang', description: 'Die vollständige Sterbeanimation' }
];

interface ViewerMeta {
  parts: number;
  hasVisual: boolean;
  durations: Partial<Record<ClipName, number>>;
  customClips: Set<string>;
}

interface InfoResponse {
  visuals?: VisualCatalog;
  cards?: CardDef[];
  dataError?: string;
}

interface ViewerCard {
  id: string;
  name: string;
  card?: CreatureCard;
}

export function FigurePreview({ cardId }: { cardId?: string | null }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const figRef = useRef<Figure | null>(null);
  const yawRef = useRef<(yaw: number) => void>(() => undefined);
  const statusTimerRef = useRef<number | null>(null);
  const [catalog, setCatalog] = useState<VisualCatalog | null>(null);
  const [cards, setCards] = useState<CardDef[]>([]);
  const [selectedId, setSelectedId] = useState(cardId ?? '');
  const [activeClip, setActiveClip] = useState<ClipName>('idle');
  const [runId, setRunId] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ViewerMeta | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetch(toInfoUrl(defaultServerHost()), { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as InfoResponse;
        if (!response.ok) throw new Error(body.dataError || `Server antwortet mit ${response.status}.`);
        return body;
      })
      .then((body) => {
        if (!alive) return;
        if (!body.visuals) throw new Error('Der Server liefert keinen Figuren-Katalog.');
        setCatalog(body.visuals);
        setCards(body.cards ?? []);
        const available = Object.keys(body.visuals.cards);
        const wanted = cardId && available.includes(cardId) ? cardId : selectedId;
        if (!wanted || !available.includes(wanted)) setSelectedId(available.sort()[0] ?? cardId ?? '');
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        const detail = reason instanceof Error ? reason.message : String(reason);
        setError(`Server nicht erreichbar oder Daten fehlerhaft: ${detail}`);
      });
    return () => {
      alive = false;
    };
  }, [reloadToken]);

  const figureCards = useMemo<ViewerCard[]>(() => {
    if (!catalog) return [];
    const creatures = new Map(
      cards
        .filter((card): card is CreatureCard => card.type === 'creature')
        .map((card) => [card.id, card])
    );
    return Object.keys(catalog.cards)
      .map((id) => ({ id, name: creatures.get(id)?.name ?? id, card: creatures.get(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [cards, catalog]);

  const selected = figureCards.find((card) => card.id === selectedId);
  const accent =
    (selected?.card && catalog?.palettes[selected.card.faction]?.faction) || '#72d9c4';
  const viewerStyle = { '--viewer-accent': accent } as CSSProperties;

  useEffect(() => {
    if (!catalog || !selectedId) return;
    const mount = mountRef.current;
    if (!mount) return;

    const entry = catalog.cards[selectedId];
    const clips = { ...catalog.defaultClips, ...(entry?.animations ?? {}) };
    setMeta({
      parts: entry?.visual?.parts.length ?? 0,
      hasVisual: Boolean(entry?.visual),
      durations: Object.fromEntries(
        CLIPS.map(({ id }) => [id, clips[id]?.duration]).filter(([, duration]) => duration != null)
      ),
      customClips: new Set(Object.keys(entry?.animations ?? {}))
    });
    setActiveClip('idle');

    const width = mount.clientWidth || 1;
    const height = mount.clientHeight || 1;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'figure-viewer-canvas';
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x10171c, 0.055);
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(3.15, 2.4, 4.8);
    camera.lookAt(0, 0.92, 0);

    scene.add(new THREE.HemisphereLight(0xcde9ef, 0x3a3027, 1.55));
    const key = new THREE.DirectionalLight(0xffe6bd, 2.35);
    key.position.set(3.5, 7, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -4;
    key.shadow.camera.right = 4;
    key.shadow.camera.top = 5;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0008;
    scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color(accent), 1.05);
    rim.position.set(-4, 4.5, -5);
    scene.add(rim);

    const platformMaterial = new THREE.MeshStandardMaterial({
      color: 0x26333a,
      roughness: 0.82,
      metalness: 0.18
    });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.84, 0.16, 32), platformMaterial);
    platform.position.y = -0.08;
    platform.receiveShadow = true;
    scene.add(platform);
    const grid = new THREE.GridHelper(8, 16, 0x6c8a8d, 0x2b4147);
    grid.position.y = 0.004;
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.24;
    scene.add(grid);

    const figure = createFigure(selectedId, 1, 1, entry, catalog.defaultClips, {
      realShadows: true
    });
    figRef.current = figure;
    scene.add(figure.root);
    figure.playSpawn();

    let dragging = false;
    let lastX = 0;
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.classList.add('is-dragging');
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      figure.root.rotation.y += (event.clientX - lastX) * 0.01;
      lastX = event.clientX;
    };
    const onPointerUp = () => {
      dragging = false;
      renderer.domElement.classList.remove('is-dragging');
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    let animationFrame = 0;
    let paused = false;
    const renderOnce = () => renderer.render(scene, camera);
    const loop = () => {
      figure.update(performance.now());
      renderOnce();
      if (!paused) animationFrame = requestAnimationFrame(loop);
    };
    loop();

    yawRef.current = (yaw: number) => {
      figure.root.rotation.y = yaw;
      figure.update(performance.now());
      renderOnce();
    };

    const clipFunctions = {
      entrance: 'playSpawn',
      attack: 'playAttack',
      hit: 'playHit',
      death: 'playDeath'
    } as const;
    const handle = {
      freeze() {
        paused = true;
        cancelAnimationFrame(animationFrame);
      },
      live() {
        if (!paused) return;
        paused = false;
        loop();
      },
      yaw(yaw: number) {
        yawRef.current(yaw);
      },
      clip(name: keyof typeof clipFunctions, deltaMs = 0) {
        figure.reset();
        figure[clipFunctions[name]]();
        figure.update(performance.now() + deltaMs);
        renderOnce();
      }
    };
    (window as unknown as { __figure?: typeof handle }).__figure = handle;

    const onResize = () => {
      const nextWidth = mount.clientWidth || 1;
      const nextHeight = mount.clientHeight || 1;
      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    const oldTitle = document.title;
    document.title = `Figuren-Viewer · ${selected?.name ?? selectedId}`;

    return () => {
      cancelAnimationFrame(animationFrame);
      delete (window as unknown as { __figure?: unknown }).__figure;
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      scene.remove(figure.root);
      figure.dispose();
      grid.geometry.dispose();
      gridMaterial.dispose();
      platform.geometry.dispose();
      platformMaterial.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      figRef.current = null;
      yawRef.current = () => undefined;
      document.title = oldTitle;
    };
  }, [catalog, selectedId]);

  useEffect(
    () => () => {
      if (statusTimerRef.current != null) window.clearTimeout(statusTimerRef.current);
    },
    []
  );

  const chooseFigure = (nextId: string) => {
    setSelectedId(nextId);
    const url = new URL(window.location.href);
    url.searchParams.set('viewer', 'figures');
    url.searchParams.set('figure', nextId);
    window.history.replaceState(null, '', url);
  };

  const playClip = (clip: ClipName) => {
    const figure = figRef.current;
    if (!figure) return;
    if (statusTimerRef.current != null) window.clearTimeout(statusTimerRef.current);
    figure.reset();
    if (clip === 'entrance') figure.playSpawn();
    else if (clip === 'attack') figure.playAttack();
    else if (clip === 'hit') figure.playHit();
    else if (clip === 'death') figure.playDeath();
    setActiveClip(clip);
    setRunId((value) => value + 1);

    const duration = meta?.durations[clip];
    if (clip !== 'idle' && clip !== 'death' && duration) {
      statusTimerRef.current = window.setTimeout(() => setActiveClip('idle'), duration * 1000 + 120);
    }
  };

  const activeDuration = meta?.durations[activeClip];

  return (
    <main className="figure-viewer" style={viewerStyle}>
      <header className="figure-viewer-header">
        <div>
          <span className="figure-viewer-kicker">PC Fighters · Figuren-Werkstatt</span>
          <h1>Animationsbühne</h1>
          <p>Modelle drehen, jede Kampfpose einzeln starten und direkt miteinander vergleichen.</p>
        </div>
        <div className="figure-viewer-live"><span />Live aus dem Spielkatalog</div>
      </header>

      {error ? (
        <section className="figure-viewer-error" role="alert">
          <strong>Viewer wartet auf den Spielserver.</strong>
          <p>{error}</p>
          <button type="button" onClick={() => setReloadToken((value) => value + 1)}>Erneut verbinden</button>
        </section>
      ) : (
        <section className="figure-viewer-layout">
          <div className="figure-stage-panel">
            <div className="figure-stage-toolbar">
              <div>
                <span className="stage-eyebrow">Aktuelles Modell</span>
                <strong>{selected?.name ?? (selectedId || 'Katalog wird geladen …')}</strong>
              </div>
              <div className="camera-presets" aria-label="Kamerawinkel">
                <button type="button" onClick={() => yawRef.current(0)}>Vorne</button>
                <button type="button" onClick={() => yawRef.current(Math.PI / 2)}>Seite</button>
                <button type="button" onClick={() => yawRef.current(Math.PI)}>Hinten</button>
              </div>
            </div>
            <div className="figure-stage-wrap">
              <div className="stage-ruler stage-ruler-x" aria-hidden="true" />
              <div className="stage-ruler stage-ruler-y" aria-hidden="true" />
              <div ref={mountRef} className="figure-stage" aria-label={`3D-Vorschau: ${selected?.name ?? selectedId}`} />
              <div className="stage-drag-hint">Ziehen zum Drehen</div>
            </div>
          </div>

          <aside className="figure-control-panel">
            <div className="figure-picker-block">
              <label htmlFor="figure-picker">Figur auswählen</label>
              <div className="figure-picker-row">
                <select
                  id="figure-picker"
                  value={selectedId}
                  onChange={(event) => chooseFigure(event.target.value)}
                  disabled={!figureCards.length}
                >
                  {figureCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
                </select>
                <button
                  type="button"
                  className="reload-figure-button"
                  onClick={() => setReloadToken((value) => value + 1)}
                  title="Katalog nach einem Server-Neustart neu laden"
                >
                  Neu laden
                </button>
              </div>
              <div className="figure-model-id">
                {selectedId || '–'} · {figureCards.length} Modelle
              </div>
            </div>

            <div className="figure-stats" aria-label="Figurendaten">
              <div><span>Bausteine</span><strong>{meta?.parts ?? '–'}</strong></div>
              <div><span>Angriff</span><strong>{selected?.card?.attack ?? '–'}</strong></div>
              <div><span>Leben</span><strong>{selected?.card?.health ?? '–'}</strong></div>
            </div>

            <div className="take-heading">
              <div>
                <span>Animations-Takes</span>
                <strong>{CLIPS.find((clip) => clip.id === activeClip)?.label}</strong>
              </div>
              <span className="take-duration">
                {activeClip === 'idle' ? 'Loop' : activeDuration ? `${activeDuration.toFixed(2)} s` : 'Standard'}
              </span>
            </div>

            <div className="animation-takes">
              {CLIPS.map((clip, index) => {
                const isActive = activeClip === clip.id;
                const duration = meta?.durations[clip.id];
                return (
                  <button
                    type="button"
                    key={clip.id}
                    className={`animation-take${isActive ? ' is-active' : ''}${clip.id === 'death' ? ' is-danger' : ''}`}
                    onClick={() => playClip(clip.id)}
                    disabled={clip.id !== 'idle' && !duration}
                  >
                    <span className="take-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="take-copy"><strong>{clip.label}</strong><small>{clip.description}</small></span>
                    <span className="take-source">{meta?.customClips.has(clip.id) ? 'individuell' : 'standard'}</span>
                  </button>
                );
              })}
            </div>

            <div className="animation-progress" aria-hidden="true">
              <span
                key={`${activeClip}-${runId}`}
                className={activeClip === 'idle' ? 'is-looping' : ''}
                style={{ animationDuration: `${Math.max(activeDuration ?? 1.4, 0.25)}s` }}
              />
            </div>

            {meta && !meta.hasVisual && (
              <p className="figure-fallback-note">Für diese Karte fehlt eine Figur-Datei; angezeigt wird der Golem-Fallback.</p>
            )}
          </aside>
        </section>
      )}
    </main>
  );
}
