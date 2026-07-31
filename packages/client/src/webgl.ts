// Kann der Browser WebGL?
//
// Bewusst eine eigene, winzige Datei: Die Antwort entscheidet, OB das
// 3D-Schlachtfeld ueberhaupt geladen wird. Stuende sie in `Battlefield3D.tsx`,
// muesste man three.js laden, um zu erfahren, dass man es nicht braucht.

/** Einmalige Probe, ob der Browser WebGL kann (für den 2D-Fallback). */
export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
