// Entwickler-Vorschau einer einzelnen Figur (nur DEV): ?figure=<cardId>.
// Holt den Figuren-Katalog über /info (Server muss laufen), baut die Figur mit
// derselben createFigure-Pipeline wie das Spielfeld und rendert sie mit den
// gleichen Einstellungen (ACES, sRGB, echte Schatten). Drag = drehen, Buttons
// lösen die Klips aus. Grundlage für die Figuren-Werkstatt.

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { VisualCatalog } from '@pcf/engine';
import { createFigure, type Figure } from './figures3d';
import { defaultServerHost, toInfoUrl } from './config';

export function FigurePreview({ cardId }: { cardId: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const figRef = useRef<Figure | null>(null);
  const [catalog, setCatalog] = useState<VisualCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ parts: number; clips: string[]; hasVisual: boolean } | null>(null);

  // Katalog laden (wie StartScreen.loadInfo).
  useEffect(() => {
    fetch(toInfoUrl(defaultServerHost()))
      .then((r) => r.json())
      .then((j) => {
        if (j?.visuals) setCatalog(j.visuals as VisualCatalog);
        else setError('Der Server liefert keinen Figuren-Katalog.');
      })
      .catch(() => setError('Server nicht erreichbar – läuft "npm run server" (Port 3000)?'));
  }, []);

  // Szene aufbauen, Figur bauen, Render-Loop.
  useEffect(() => {
    if (!catalog) return;
    const mount = mountRef.current;
    if (!mount) return;

    const entry = catalog.cards[cardId];
    setMeta({
      parts: entry?.visual?.parts.length ?? 0,
      clips: ['idle', ...Object.keys({ ...catalog.defaultClips, ...(entry?.animations ?? {}) })].filter(
        (v, i, a) => a.indexOf(v) === i
      ),
      hasVisual: Boolean(entry?.visual)
    });

    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(3.2, 2.5, 4.6);
    camera.lookAt(0, 1.0, 0);

    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a3d2c, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2dd, 2.1);
    sun.position.set(3, 8, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 30;
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 5;
    sun.shadow.camera.bottom = -4;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x8ab4ff, 0.6);
    rim.position.set(-4, 5, -6);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.3 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const fig = createFigure(cardId, 1, 1, entry, catalog.defaultClips, { realShadows: true });
    figRef.current = fig;
    scene.add(fig.root);
    fig.playSpawn();

    // Drehen per Ziehen.
    let dragging = false;
    let lastX = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      fig.root.rotation.y += (e.clientX - lastX) * 0.01;
      lastX = e.clientX;
    };
    const onUp = () => {
      dragging = false;
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    let raf = 0;
    const tick = () => {
      fig.update(performance.now());
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      const nw = mount.clientWidth || 1;
      const nh = mount.clientHeight || 1;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      scene.remove(fig.root);
      fig.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      figRef.current = null;
    };
  }, [catalog, cardId]);

  const play = (fn: 'playSpawn' | 'playAttack' | 'playHit' | 'playDeath') => figRef.current?.[fn]();

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 90% at 50% 0%, #202a30, #0a0f13 70%)', color: '#e3e9ee', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12 }}>
      <div style={{ fontWeight: 700, letterSpacing: 1 }}>🧪 Figuren-Vorschau · {cardId}</div>
      {error && <div style={{ color: '#ff8a8a', maxWidth: 360, textAlign: 'center' }}>{error}</div>}
      {meta && !meta.hasVisual && !error && (
        <div style={{ color: '#f0c674', fontSize: 13 }}>Keine Figur-Datei für "{cardId}" – Golem-Fallback.</div>
      )}
      <div ref={mountRef} style={{ width: 'min(92vw, 420px)', height: 'min(70vh, 460px)', touchAction: 'none' }} />
      {meta && (
        <div style={{ fontSize: 12, color: '#93a3ae' }}>
          {meta.parts} Bausteine · Klips: {meta.clips.join(', ')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {(
          [
            ['Einzug', 'playSpawn'],
            ['Angriff', 'playAttack'],
            ['Treffer', 'playHit'],
            ['Tod', 'playDeath']
          ] as const
        ).map(([label, fn]) => (
          <button
            key={fn}
            onClick={() => play(fn)}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #3a4650', background: fn === 'playDeath' ? '#2a1618' : '#131c22', color: '#e3e9ee', cursor: 'pointer', fontWeight: 700 }}
          >
            {label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: '#93a3ae', maxWidth: 360, textAlign: 'center' }}>
        Idle läuft dauerhaft. Ziehen ↔ zum Drehen. (Nur im Entwicklungsmodus.)
      </p>
    </div>
  );
}
