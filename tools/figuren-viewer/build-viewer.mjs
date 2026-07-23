// Baut den eigenständigen Figuren-Viewer aus dem Template + den Repo-Daten.
//
//   node tools/figuren-viewer/build-viewer.mjs
//
// Ergebnis (nicht versioniert, siehe .gitignore):
//   tools/figuren-viewer/figuren-viewer.html          – im Browser öffnen
//   tools/figuren-viewer/figuren-viewer.artifact.html – Body-only (für Artifacts)
//
// three.js wird selbst per esbuild zu einem importfreien IIFE (global PCF_THREE)
// gebündelt und inline eingebettet – so ist die Ausgabe komplett self-contained
// (kein externer Host, kein data:/blob:), läuft per file:// und unter Artifact-CSP.

import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const figDir = join(REPO, 'packages/engine/src/data/figures');

// 1) three.js → IIFE bündeln (setzt window.PCF_THREE).
const tmp = mkdtempSync(join(tmpdir(), 'pcf-three-'));
const iifePath = join(tmp, 'three.iife.js');
const esbuild = join(REPO, 'node_modules/.bin/esbuild');
const threeEntry = join(REPO, 'node_modules/three/build/three.module.js');
execSync(
  `"${esbuild}" "${threeEntry}" --bundle --format=iife --global-name=PCF_THREE --minify --legal-comments=none --outfile="${iifePath}"`,
  { stdio: 'inherit' }
);
const threeIife = readFileSync(iifePath, 'utf8');
rmSync(tmp, { recursive: true, force: true });

// 2) Template + alle Figuren (auto) + Default-Klips.
const template = readFileSync(join(HERE, 'viewer-template.html'), 'utf8');
const figureIds = readdirSync(figDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort((a, b) => (a === 'wolf' ? -1 : b === 'wolf' ? 1 : a.localeCompare(b)));
const figures = {};
for (const id of figureIds) figures[id] = JSON.parse(readFileSync(join(figDir, `${id}.json`), 'utf8'));
const defaultClips = JSON.parse(readFileSync(join(REPO, 'packages/engine/src/data/animations.json'), 'utf8'));

// 3) Zusammenbauen. Funktions-Ersetzung, damit `$`-Sequenzen im minifizierten
//    Code/JSON nicht als Ersetzungsmuster interpretiert werden.
const body = template
  .replace('__THREE_IIFE__', () => threeIife)
  .replace('__FIGURES_JSON__', () => JSON.stringify(figures))
  .replace('__DEFAULT_CLIPS_JSON__', () => JSON.stringify(defaultClips));

writeFileSync(join(HERE, 'figuren-viewer.artifact.html'), body);
const standalone =
  '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
  '<title>PC Fighters – Figuren-Viewer</title></head><body style="margin:0">' +
  body +
  '</body></html>';
writeFileSync(join(HERE, 'figuren-viewer.html'), standalone);

console.log('Figuren:', figureIds.join(', '));
console.log('gebaut :', join(HERE, 'figuren-viewer.html'), `(${(standalone.length / 1024).toFixed(0)} KB)`);
