// Kurzer Blitz auf einer Anzeige, wenn sich ihre Zahl geaendert hat.

import { useEffect, useRef, useState } from 'react';

/** Wie lange die Klasse haengen bleibt – muss zur Animation `wert-puls` passen. */
export const WERT_PULS_MS = 500;

/**
 * Gibt `' wert-puls'` zurueck, solange sich `wert` gerade geaendert hat, sonst
 * `''`. Gedacht zum Anhaengen an eine bestehende Klassenliste:
 *
 * ```tsx
 * <div className={'energy-chip' + useWertPuls(energie)}>…</div>
 * ```
 *
 * Der erste Wert loest bewusst nichts aus – beim Betreten des Bildschirms soll
 * nicht alles gleichzeitig aufblitzen.
 */
export function useWertPuls(wert: number): string {
  const vorher = useRef(wert);
  const [aktiv, setAktiv] = useState(false);

  useEffect(() => {
    if (vorher.current === wert) return;
    vorher.current = wert;
    setAktiv(true);
    const timer = window.setTimeout(() => setAktiv(false), WERT_PULS_MS);
    return () => window.clearTimeout(timer);
  }, [wert]);

  return aktiv ? ' wert-puls' : '';
}

/** Wie lange die Differenz ueber der Marke stehen bleibt. */
export const WERT_DELTA_MS = 900;

/**
 * Wie `useWertPuls`, aber mit RICHTUNG: fuer Werte, bei denen „mehr" und
 * „weniger" Gegenteiliges bedeuten – ATK und Leben einer Kreatur.
 *
 * Liefert eine Klasse (`' wert-hoch'` / `' wert-tief'`) fuer den Blitz und die
 * vorzeichenbehaftete Differenz, damit der Aufrufer sie als `+2` / `−2`
 * anzeigen kann. `null` heisst: gerade keine Aenderung.
 *
 * Wie beim Zwilling loest der erste Wert bewusst nichts aus. Ein Wechsel der
 * Kreatur im selben Slot ist kein Thema: `GameScreen` keyt die Kachel auf
 * `creature.uid`, React montiert sie also neu.
 */
export function useWertAenderung(wert: number): { klasse: string; delta: number | null } {
  const vorher = useRef(wert);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    if (vorher.current === wert) return;
    const diff = wert - vorher.current;
    vorher.current = wert;
    setDelta(diff);
    const timer = window.setTimeout(() => setDelta(null), WERT_DELTA_MS);
    return () => window.clearTimeout(timer);
  }, [wert]);

  return {
    klasse: delta === null ? '' : delta > 0 ? ' wert-hoch' : ' wert-tief',
    delta
  };
}
