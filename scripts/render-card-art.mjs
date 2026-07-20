// Autorenwerkzeug: rendert die 3D-Spielfiguren zu transparenten PNG-Kartenbildern.
//
// Läuft NICHT im Spiel. Die erzeugten PNGs liegen in
// packages/client/public/assets/cards/ und werden committet – das Spiel selbst
// braucht dieses Skript nie.
//
// Neu erzeugen (z. B. nach Figur-Änderungen in packages/client/src/figures3d.ts):
//   1. einmalig Playwright bereitstellen:   npm i -D playwright
//   2. Skript ausführen:                    node scripts/render-card-art.mjs
//
// Chromium wird aus PLAYWRIGHT_BROWSERS_PATH bzw. CHROMIUM_PATH genommen; hier
// ist bereits ein Browser vorinstalliert (kein Download nötig).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CLIENT = join(ROOT, 'packages', 'client');
const OUT = join(CLIENT, 'public', 'assets', 'cards');
const PORT = 5174;
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

// Nur Karten OHNE gemalte Kunst: die 3 vorhandenen PNGs (rekrut/schildwache/
// feldscherin) bleiben erhalten.
const CARDS = [
  'ratte', 'wolf', 'schlange', 'adler', 'baer', 'alphawolf',
  'bannertraeger', 'ritter', 'kommandantin',
  'schildwall', 'mobilmachung', 'hetzjagd', 'wilder_instinkt'
];

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // noch nicht bereit
    }
    await sleep(500);
  }
  throw new Error(`Vite-Server unter ${url} nicht erreichbar.`);
}

async function main() {
  const { chromium } = await import('playwright');

  // Vite-Dev-Server für den Client starten (liefert tools/render-figures.html).
  const vite = spawn(
    join(ROOT, 'node_modules', '.bin', 'vite'),
    ['--port', String(PORT), '--strictPort'],
    { cwd: CLIENT, stdio: 'inherit' }
  );

  const base = `http://localhost:${PORT}`;
  try {
    await waitForServer(`${base}/tools/render-figures.html`);

    const browser = await chromium.launch({
      executablePath: CHROMIUM,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  ! Seitenfehler:', e.message));

    for (const card of CARDS) {
      await page.goto(`${base}/tools/render-figures.html?card=${card}`);
      await page.waitForFunction(() => window.__renderReady === true, { timeout: 15000 });
      await page.waitForTimeout(250); // ein paar Frames für saubere Beleuchtung
      const out = join(OUT, `${card}.png`);
      await page.locator('#art').screenshot({ path: out, omitBackground: true });
      console.log(`  ✓ ${card}.png`);
    }

    await browser.close();
  } finally {
    vite.kill('SIGTERM');
  }
  console.log('Fertig – Kartenbilder in', OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
