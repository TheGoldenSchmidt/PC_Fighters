// Figuren-Werkstatt: deterministischer Montage-Screenshot einer Figur.
//
// Aufruf:  node scripts/snap.mjs <cardId> [clientPort] [serverPort]
// Ergebnis: POST an den Dev-Server (/snap, nur aktiv bei gesetztem PCF_SNAP) →
//           <PCF_SNAP-Ordner>/<cardId>.png
//
// Erzeugt 6 Kacheln: vorne · seite · hinten + Angriff in 3 Phasen
// (Ausholen · Kontakt · Rückkehr). Der Angriff wird so aus Bewegung statt aus
// einem einzigen Standbild beurteilbar (siehe docs/figure-generation/PLAYBOOK.md).
//
// Einzug und Tod deckt diese Montage NICHT ab – dieses Kriterium wird derzeit nur
// über den interaktiven Viewer geprüft (PLAYBOOK.md → Bekannte Werkzeuglücken).
//
// Warum Playwright statt Screenshot-Tool: direkte Screenshots des Live-WebGL-
// Canvas timeouten; deshalb rendert die Seite selbst eine Montage und postet sie
// an /snap. Warum kein Browser-MCP: nicht in jeder Umgebung vorhanden. Ist
// mcp__Claude_Browser verfügbar, kann derselbe Ablauf (freeze → yaw/clip →
// drawImage → fetch /snap) auch dort per javascript_tool laufen.

import { execSync } from 'node:child_process';

const cardId = process.argv[2];
const clientPort = process.argv[3] || '5173';
const serverPort = process.argv[4] || '3000';
if (!cardId) {
  console.error('Nutzung: node snap.mjs <cardId> [clientPort] [serverPort]');
  process.exit(2);
}

// Playwright robust auflösen: lokal installiert ODER global (via `npm root -g`).
// Bewusst plattformneutral – dieses Skript läuft unter Windows wie unter Linux.
async function loadChromium() {
  const candidates = ['playwright'];
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    if (globalRoot) candidates.push(`${globalRoot}/playwright/index.mjs`);
  } catch {
    /* npm evtl. nicht im PATH – dann bleibt nur der lokale Versuch */
  }
  for (const spec of candidates) {
    try {
      const mod = await import(spec);
      return mod.chromium;
    } catch {
      /* nächster Kandidat */
    }
  }
  throw new Error(
    'Playwright nicht auffindbar. Entweder `npm i -D playwright` im Repo, ' +
      'oder global verfügbar machen.'
  );
}

const chromium = await loadChromium();
const url = `http://localhost:${clientPort}/?figure=${cardId}`;

// Chromium umgebungsneutral auflösen: ein ausdrücklich gesetzter Pfad (PW_CHROMIUM)
// gewinnt; sonst übernimmt Playwright seine eigene Auflösung, die auch
// PLAYWRIGHT_BROWSERS_PATH berücksichtigt. Kein fest verdrahteter /opt-Pfad – der
// war unter Windows immer ungültig.
const launchOptions = process.env.PW_CHROMIUM
  ? { executablePath: process.env.PW_CHROMIUM }
  : {};

const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Bausteinzahl gegenchecken (Golem-Fallback / veralteter Server = Symptom).
  const parts = await page.evaluate(() => {
    // Neuer Live-Viewer: Label und Wert sind getrennte Elemente. Der Regex-
    // Fallback hält das Skript mit der alten kompakten Vorschau kompatibel.
    const stat = document.querySelector('.figure-stats strong')?.textContent;
    if (stat && /^\d+$/.test(stat.trim())) return Number(stat);
    const match = document.body.innerText.match(/(\d+)\s+Bausteine/i);
    return match ? Number(match[1]) : 0;
  });
  console.log(`[snap] ${cardId}: ${parts} Bausteine`);
  if (parts === 0) {
    console.log('[snap] WARNUNG: 0 Bausteine – Server neu gestartet? Figur-Datei vorhanden?');
  }

  const result = await page.evaluate(
    async ({ cardId, serverPort }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const h = window.__figure;
      const cv = document.querySelector('canvas');
      if (!h || !cv) return 'NO HANDLE (h=' + !!h + ' cv=' + !!cv + ')';
      h.freeze();

      const tw = 300;
      const th = 340;
      const cols = 3;
      const rows = 2;
      const m = document.createElement('canvas');
      m.width = tw * cols;
      m.height = th * rows;
      const ctx = m.getContext('2d');
      ctx.fillStyle = '#141a1f';
      ctx.fillRect(0, 0, m.width, m.height);

      // Statische Ansichten + Angriff in 3 Phasen. Jeder Angriffs-Frame wartet
      // zuerst >Klip-Dauer (500 ms), damit der vorige Angriffs-OneShot ausgelaufen
      // ist und die Posen sich nicht stapeln (h.clip triggert playAttack erneut).
      const shots = [
        ['vorne', async () => h.yaw(0.35)],
        ['seite', async () => h.yaw(1.7)],
        ['hinten', async () => h.yaw(3.2)],
        ['angriff 1', async () => { h.yaw(0.35); await sleep(600); h.clip('attack', 110); }],
        ['angriff 2', async () => { h.yaw(0.35); await sleep(600); h.clip('attack', 240); }],
        ['angriff 3', async () => { h.yaw(0.35); await sleep(600); h.clip('attack', 400); }]
      ];

      // Der Viewer-Canvas ist breit und flach (z. B. 844×406); ihn komplett in eine
      // hochformatige Kachel zu quetschen verzerrt die Figur und lässt sie winzig
      // wirken. Deshalb einen mittigen Ausschnitt im Kachel-Seitenverhältnis
      // herausschneiden – die Figur steht mittig unter dem Kamera-Fokus.
      const srcH = cv.height;
      const srcW = Math.min(cv.width, srcH * (tw / th));
      const srcX = (cv.width - srcW) / 2;

      for (let i = 0; i < shots.length; i++) {
        await shots[i][1]();
        const x = (i % cols) * tw;
        const y = ((i / cols) | 0) * th;
        ctx.drawImage(cv, srcX, 0, srcW, srcH, x, y, tw, th);
        ctx.fillStyle = '#8fe6b0';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(shots[i][0], x + 8, y + 20);
      }

      h.live();
      const r = await fetch('http://localhost:' + serverPort + '/snap?name=' + encodeURIComponent(cardId), {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: m.toDataURL('image/png')
      });
      return 'snap ' + r.status;
    },
    { cardId, serverPort }
  );
  console.log('[snap]', result);
} finally {
  await browser.close();
}
