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
