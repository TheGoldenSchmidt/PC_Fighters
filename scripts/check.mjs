// Kanonische, nicht mutierende Repository-Prüfung.
// Build-Ausgaben landen ausschließlich in einem temporären Systemverzeichnis.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
const tempRoot = mkdtempSync(join(tmpdir(), 'pcf-check-'));
const buildOut = join(tempRoot, 'client-dist');

function gitState() {
  const result = spawnSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`git status fehlgeschlagen: ${result.stderr?.trim() || 'unbekannter Fehler'}`);
  }
  return result.stdout;
}

function run(label, command, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.error) {
    console.error(`${label} konnte nicht gestartet werden: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.error(`${label} fehlgeschlagen (Exit-Code ${result.status ?? 1}).`);
    return result.status ?? 1;
  }
  return 0;
}

let exitCode = 0;
let before = '';

try {
  before = gitState();
  if (!npmCli) throw new Error('npm_execpath fehlt; die kanonische Prüfung muss mit `npm run check` gestartet werden.');
  const steps = [
    ['TypeScript', process.execPath, [npmCli, 'run', 'typecheck']],
    ['Tests und Datenvalidierung', process.execPath, [npmCli, 'test']],
    ['Produktionsbuild (temporäres Ziel)', process.execPath, [npmCli, 'run', 'build', '--workspace', '@pcf/client', '--', '--outDir', buildOut]],
    ['Aktualität des Figuren-Viewers', process.execPath, ['tools/figuren-viewer/build-viewer.mjs', '--check']]
  ];

  for (const [label, command, args] of steps) {
    exitCode = run(label, command, args);
    if (exitCode !== 0) break;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  // Das Ziel stammt unmittelbar aus mkdtempSync und liegt unter os.tmpdir().
  rmSync(tempRoot, { recursive: true, force: true });
}

try {
  const after = gitState();
  if (after !== before) {
    console.error('\nDie Prüfung hat den Git-Arbeitsbaum verändert.');
    exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
}

if (exitCode === 0) console.log('\nAlle Prüfungen erfolgreich; der Git-Arbeitsbaum blieb unverändert.');
process.exitCode = exitCode;
