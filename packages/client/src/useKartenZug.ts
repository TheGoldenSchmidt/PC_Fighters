// Handkarten per Ziehen in eine Lane ausspielen.
//
// Bewusst Pointer-Events statt HTML5-Drag-&-Drop: dessen `dragstart` feuert auf
// Touch-Geräten gar nicht, und das Spiel ist mobil-first. Pointer-Events decken
// Maus, Stift und Finger mit demselben Code ab.
//
// Die Trefferprüfung läuft über die Rechtecke der eigenen Lane-Slots, die beim
// Zugbeginn EINMAL eingesammelt werden – nicht über `document.elementFromPoint`.
// Grund: elementFromPoint existiert in jsdom nicht, der Ablauf wäre also nicht
// testbar, und der Zieh-Geist unter dem Finger würde die Treffer verfälschen.

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/** Ein Rechteck reicht – volle DOMRects braucht die Trefferprüfung nicht. */
export interface LaneRect {
  lane: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Laufender Kartenzug: Karte, Fingerposition, gerade überfahrene Lane. */
export interface ZugZustand {
  handIndex: number;
  x: number;
  y: number;
  lane: number | null;
}

export interface KartenZugOptionen {
  /** Darf diese Handkarte gerade gezogen werden? */
  ziehbar: (handIndex: number) => boolean;
  /** Rechtecke der möglichen Ziel-Lanes, beim Zugbeginn abgefragt. */
  laneRects: () => LaneRect[];
  /** Darf die gezogene Karte auf dieser Lane abgelegt werden? */
  gueltig: (lane: number, handIndex: number) => boolean;
  /** Ablegen auf einer gültigen Lane. */
  onAblegen: (handIndex: number, lane: number) => void;
  /** Kurzes Antippen ohne nennenswerte Bewegung. */
  onTippen: (handIndex: number) => void;
}

/** Ab dieser Bewegung (CSS-Pixel) ist es ein Zug und kein Tippen mehr. */
const ZUG_SCHWELLE = 8;

export function useKartenZug(optionen: KartenZugOptionen) {
  const [zug, setZug] = useState<ZugZustand | null>(null);
  const opt = useRef(optionen);
  opt.current = optionen;

  const start = useRef<{ handIndex: number; x: number; y: number; aktiv: boolean } | null>(null);
  const rects = useRef<LaneRect[]>([]);

  const laneUnter = (x: number, y: number): number | null => {
    for (const r of rects.current) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return r.lane;
    }
    return null;
  };

  const beenden = () => {
    start.current = null;
    rects.current = [];
    setZug(null);
  };

  const handlers = (handIndex: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      // Nur die primäre Taste zieht; Rechtsklick/Mittelklick bleiben unberührt.
      if (e.button !== 0) return;
      start.current = { handIndex, x: e.clientX, y: e.clientY, aktiv: false };
      // Capture sichert das pointerup zu, auch wenn der Finger die Karte
      // verlässt (was beim Ziehen der Normalfall ist). jsdom kennt die API
      // nicht – der optionale Aufruf hält die Tests am Leben.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      if (!s.aktiv) {
        const weit =
          Math.abs(e.clientX - s.x) > ZUG_SCHWELLE || Math.abs(e.clientY - s.y) > ZUG_SCHWELLE;
        if (!weit) return;
        if (!opt.current.ziehbar(s.handIndex)) {
          start.current = null;
          return;
        }
        s.aktiv = true;
        rects.current = opt.current.laneRects();
      }
      const lane = laneUnter(e.clientX, e.clientY);
      setZug({
        handIndex: s.handIndex,
        x: e.clientX,
        y: e.clientY,
        lane: lane !== null && opt.current.gueltig(lane, s.handIndex) ? lane : null
      });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      if (!s.aktiv) {
        beenden();
        opt.current.onTippen(s.handIndex);
        return;
      }
      const lane = laneUnter(e.clientX, e.clientY);
      beenden();
      if (lane !== null && opt.current.gueltig(lane, s.handIndex)) {
        opt.current.onAblegen(s.handIndex, lane);
      }
    },
    onPointerCancel: beenden
  });

  return { zug, handlers };
}

/** Lane-Rechtecke der eigenen Reihe aus dem DOM lesen (gleiche Anker wie 3D). */
export function eigeneLaneRects(me: number, lanes: number): LaneRect[] {
  const out: LaneRect[] = [];
  for (let lane = 0; lane < lanes; lane++) {
    const el = document.querySelector<HTMLElement>(`[data-slot="${me}-${lane}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    out.push({ lane, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return out;
}
