// Autorenwerkzeug: rendert freigegebene 3D-Figuren oder Karten-Templates als PNG.
// Manuelles Artwork wird ueber art-manifest.json geschuetzt und nie ueberschrieben.

import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const CLIENT = join(ROOT, 'packages', 'client');
const OUT = join(CLIENT, 'public', 'assets', 'cards');
const MANIFEST_FILE = join(OUT, 'art-manifest.json');
const CARDS_DIR = join(ROOT, 'packages', 'engine', 'src', 'data', 'cards');
const FIGURES_DIR = join(ROOT, 'packages', 'engine', 'src', 'data', 'figures');
const CLIENT_PORT = 5174;
const SERVER_PORT = 3001;
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const SOURCES = new Set(['manual', 'figure-render', 'template']);
const LEGACY_CODE_FIGURES = new Set(['bannertraeger']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function allCards() {
  return readdirSync(CARDS_DIR)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => readJson(join(CARDS_DIR, file)));
}

function figureIds() {
  const ids = existsSync(FIGURES_DIR)
    ? readdirSync(FIGURES_DIR).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5))
    : [];
  return new Set([...ids, ...LEGACY_CODE_FIGURES]);
}

function loadManifest() {
  const manifest = readJson(MANIFEST_FILE);
  if (manifest.version !== 1 || !manifest.cards || typeof manifest.cards !== 'object') {
    throw new Error('art-manifest.json braucht version 1 und ein cards-Objekt.');
  }
  return manifest;
}

function expectedSource(card) {
  return card.type === 'creature' ? 'figure-render' : 'template';
}

function checkArtwork(cards, manifest) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const problems = [];
  for (const [cardId, entry] of Object.entries(manifest.cards)) {
    const card = cardsById.get(cardId);
    if (!card) problems.push(`${cardId}: Manifest verweist auf keine Karte`);
    if (!entry || !SOURCES.has(entry.source)) problems.push(`${cardId}: ungueltige Bildquelle`);
    if (card && entry?.source === 'figure-render' && card.type !== 'creature') {
      problems.push(`${cardId}: Nicht-Kreaturen duerfen nicht als Figur gerendert werden`);
    }
    if (card && entry?.source === 'template' && card.type === 'creature') {
      problems.push(`${cardId}: Kreaturen duerfen nicht als Template/Golem markiert werden`);
    }
  }
  for (const file of readdirSync(OUT).filter((name) => name.endsWith('.png'))) {
    const cardId = file.slice(0, -4);
    if (!manifest.cards[cardId]) problems.push(`${file}: vorhandenes PNG hat keine Bildquelle im Manifest`);
    const signature = readFileSync(join(OUT, file)).subarray(0, 8).toString('hex');
    if (signature !== '89504e470d0a1a0a') problems.push(`${file}: Datei ist kein gueltiges PNG`);
  }
  if (problems.length > 0) throw new Error(`Artwork-Pruefung fehlgeschlagen:\n- ${problems.join('\n- ')}`);
  return { tracked: Object.keys(manifest.cards).length, pngs: readdirSync(OUT).filter((name) => name.endsWith('.png')).length };
}

async function waitForServer(url, tries = 60) {
  for (let index = 0; index < tries; index++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Prozess ist noch nicht bereit.
    }
    await sleep(500);
  }
  throw new Error(`Server unter ${url} nicht erreichbar.`);
}

async function loadChromium() {
  const candidates = ['playwright'];
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    if (globalRoot) candidates.push(`${globalRoot}/playwright/index.mjs`);
  } catch {
    // Nur lokales Playwright versuchen.
  }
  for (const specifier of candidates) {
    try {
      const module = await import(specifier);
      return module.chromium;
    } catch {
      // Naechster Kandidat.
    }
  }
  throw new Error('Playwright nicht auffindbar (lokal oder global installieren).');
}

function localBin(name) {
  return join(ROOT, 'node_modules', '.bin', `${name}${process.platform === 'win32' ? '.cmd' : ''}`);
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const onlyIds = args.filter((arg) => !arg.startsWith('--'));
  const unknownFlags = args.filter((arg) => arg.startsWith('--') && arg !== '--check');
  if (unknownFlags.length > 0) throw new Error(`Unbekannte Option: ${unknownFlags.join(', ')}`);

  const cards = allCards();
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const manifest = loadManifest();
  const audit = checkArtwork(cards, manifest);
  if (checkOnly) {
    console.log(`Artwork-Manifest gueltig: ${audit.pngs} PNGs, ${audit.tracked} Quellen.`);
    return;
  }

  for (const cardId of onlyIds) {
    if (!cardsById.has(cardId)) throw new Error(`Unbekannte Karte: ${cardId}`);
  }
  const availableFigures = figureIds();
  const selected = cards.filter((card) => onlyIds.length === 0 || onlyIds.includes(card.id));
  const renderCards = [];
  for (const card of selected) {
    const desiredSource = expectedSource(card);
    const existingSource = manifest.cards[card.id]?.source;
    if (existingSource === 'manual') {
      console.log(`  - ${card.id}: manual, bleibt unangetastet`);
      continue;
    }
    if (existingSource && existingSource !== desiredSource) {
      throw new Error(`${card.id}: Manifestquelle ${existingSource} widerspricht ${desiredSource}.`);
    }
    if (card.type === 'creature' && !availableFigures.has(card.id)) {
      if (onlyIds.includes(card.id)) throw new Error(`${card.id}: keine freigegebene Figur; kein Golem-Rendering erlaubt.`);
      continue;
    }
    renderCards.push({ card, source: desiredSource });
  }
  if (renderCards.length === 0) {
    console.log('Keine renderbaren Karten ausgewaehlt.');
    return;
  }

  const chromium = await loadChromium();
  const spawnOptions = { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' };
  const server = spawn(localBin('tsx'), ['packages/server/src/index.ts'], {
    ...spawnOptions,
    env: { ...process.env, PORT: String(SERVER_PORT) }
  });
  const vite = spawn(localBin('vite'), ['--port', String(CLIENT_PORT), '--strictPort'], {
    ...spawnOptions,
    cwd: CLIENT
  });
  const serverBase = `http://localhost:${SERVER_PORT}`;
  const clientBase = `http://localhost:${CLIENT_PORT}`;

  try {
    await Promise.all([
      waitForServer(`${serverBase}/info`),
      waitForServer(`${clientBase}/tools/render-figures.html`)
    ]);
    const browser = await chromium.launch({
      executablePath: CHROMIUM,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    });
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', (error) => console.log('  ! Seitenfehler:', error.message));

    for (const { card, source } of renderCards) {
      const url = `${clientBase}/tools/render-figures.html?card=${encodeURIComponent(card.id)}&server=${encodeURIComponent(serverBase)}`;
      await page.goto(url);
      await page.waitForFunction(
        () => window.__renderReady === true || typeof window.__renderError === 'string',
        { timeout: 15000 }
      );
      const renderError = await page.evaluate(() => window.__renderError || null);
      if (renderError) throw new Error(`${card.id}: ${renderError}`);
      await page.waitForTimeout(250);
      await page.locator('#art').screenshot({ path: join(OUT, `${card.id}.png`), omitBackground: true });
      manifest.cards[card.id] = { source };
      console.log(`  ✓ ${card.id}.png (${source})`);
    }
    await browser.close();
    writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } finally {
    vite.kill('SIGTERM');
    server.kill('SIGTERM');
  }
  console.log('Fertig – Kartenbilder und Manifest aktualisiert.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
