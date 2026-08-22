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
const SOURCES = new Set(['manual', 'figure-render', 'template']);
const LEGACY_CODE_FIGURES = new Set(['bannertraeger']);
const STANDARD_DECK_VARIANTS = new Set([
  'baseball_zombie', 'drum_major', 'fliessbandarbeiter', 'flugblatt_verteiler',
  'medic', 'mini_ninja', 'pied_piper', 'skunk_punk', 'smelly_zombie',
  'cardboard_robot_zombie', 'dolphin_rider', 'fishy_imp', 'imp',
  'button_mushroom', 'bellflower', 'mixed_nuts', 'sunflower', 'peashooter',
  'torchwood', 'smashing_pumpkin', 'buff_shroom', 'small_nut', 'pismashio',
  'seedling', 'zapricot', 'spineapple', 'sting_bean', 'wall_nut'
]);

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

function chromiumPath() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : undefined,
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : undefined,
    process.platform === 'win32' ? 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' : undefined,
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : undefined,
    '/opt/pw-browsers/chromium'
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Kein Chromium/Chrome/Edge gefunden. Optional CHROMIUM_PATH setzen.');
  }
  return found;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const force = args.includes('--force');
  const standardSet = args.includes('--standard-set');
  const onlyIds = args.filter((arg) => !arg.startsWith('--'));
  const unknownFlags = args.filter((arg) => arg.startsWith('--') && !['--check', '--force', '--standard-set'].includes(arg));
  if (unknownFlags.length > 0) throw new Error(`Unbekannte Option: ${unknownFlags.join(', ')}`);
  if (standardSet && onlyIds.length > 0) {
    throw new Error('--standard-set kann nicht mit einzelnen Karten-IDs kombiniert werden.');
  }

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
  const selected = cards.filter((card) => {
    if (standardSet) return card.type !== 'creature' || STANDARD_DECK_VARIANTS.has(card.id);
    return onlyIds.length === 0 || onlyIds.includes(card.id);
  });
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
    const outputFile = join(OUT, `${card.id}.png`);
    if (!force && existsSync(outputFile)) {
      console.log(`  - ${card.id}: vorhandenes PNG bleibt unangetastet`);
      continue;
    }
    renderCards.push({ card, source: desiredSource });
  }
  if (renderCards.length === 0) {
    console.log('Keine renderbaren Karten ausgewaehlt.');
    return;
  }

  const chromium = await loadChromium();
  const spawnOptions = { cwd: ROOT, stdio: 'inherit', shell: false };
  const serverBootstrap = [
    "const os=require('node:os');",
    "if(process.platform==='win32')os.userInfo=()=>({username:process.env.USERNAME||'pcf-art',homedir:process.env.USERPROFILE||process.cwd(),uid:-1,gid:-1,shell:null});",
    "(async()=>{const{tsImport}=await import('tsx/esm/api');await tsImport('./packages/server/src/index.ts',require('node:url').pathToFileURL(process.cwd()+'/__pcf_art_bootstrap__.mjs').href)})().catch(error=>{console.error(error);process.exit(1)})"
  ].join('');
  const server = spawn(process.execPath, ['-e', serverBootstrap], {
    ...spawnOptions,
    env: { ...process.env, PORT: String(SERVER_PORT) }
  });
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(CLIENT_PORT), '--strictPort'], {
    ...spawnOptions,
    cwd: CLIENT
  });
  const serverBase = `http://localhost:${SERVER_PORT}`;
  const clientBase = `http://localhost:${CLIENT_PORT}`;

  let browser;
  try {
    await Promise.all([
      waitForServer(`${serverBase}/info`),
      waitForServer(`${clientBase}/tools/render-figures.html`)
    ]);
    browser = await chromium.launch({
      executablePath: chromiumPath(),
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
    browser = undefined;
    writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  } finally {
    if (browser) await browser.close();
    vite.kill('SIGTERM');
    server.kill('SIGTERM');
  }
  console.log('Fertig – Kartenbilder und Manifest aktualisiert.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
