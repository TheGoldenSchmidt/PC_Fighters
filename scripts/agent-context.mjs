#!/usr/bin/env node

// Read-only Operator-Briefing: versucht zuerst einen Fetch und berichtet danach
// ausschließlich belegbare Git- und Datei-Fakten. Fehler blockieren den Agenten nie.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TASK_DIR = join(ROOT, '.ai', 'tasks');
const ACTIVE_STATUSES = new Set([
  'planned',
  'in_progress',
  'awaiting_review',
  'changes_requested',
  'ready_to_complete',
  'blocked'
]);

function warn(message) {
  console.error(`WARNUNG: ${message}`);
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: options.timeout,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never'
    }
  });
  const stderr = (result.stderr ?? '').trim();
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      status: result.status,
      stdout: (result.stdout ?? '').trimEnd(),
      stderr,
      error: result.error
    };
  }
  return { ok: true, status: 0, stdout: result.stdout.trimEnd(), stderr };
}

function fetchRepository() {
  const result = runGit(['fetch', '--all', '--prune'], { timeout: 8000 });
  if (result.ok) return 'erfolgreich';

  const timedOut = result.error?.code === 'ETIMEDOUT';
  const status = timedOut
    ? 'fehlgeschlagen (Timeout nach 8 Sekunden)'
    : result.status == null
      ? `fehlgeschlagen (${result.error?.message ?? 'unbekannter Startfehler'})`
      : `fehlgeschlagen (Exit-Code ${result.status})`;
  const detail = result.stderr || result.error?.message || 'keine weitere Git-Ausgabe';
  warn(`git fetch --all --prune ${status}: ${detail}`);
  return status;
}

function parseTask(path) {
  const content = readFileSync(path, 'utf8');
  const fileName = path.split(/[\\/]/).at(-1);
  const fileId = fileName?.match(/^(TASK-\d+)(?:-|\.md$)/i)?.[1]?.toUpperCase();
  const metadataId = content.match(/^\s*-\s*Task-ID:\s*(TASK-\d+)\s*$/im)?.[1]?.toUpperCase();
  const heading = content.match(/^#\s+(?:TASK-\d+\s*:\s*)?(.+)$/m)?.[1]?.trim();
  const status = content.match(/^\s*-\s*Status:\s*([^\s]+)\s*$/im)?.[1]?.toLowerCase();
  return {
    id: metadataId ?? fileId ?? '<unbekannte Task-ID>',
    title: heading ?? '<Titel fehlt>',
    status,
    path,
    content
  };
}

function activeTasks() {
  if (!existsSync(TASK_DIR)) return [];
  const tasks = readdirSync(TASK_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^TASK-\d+.*\.md$/i.test(entry.name) && entry.name !== '_TEMPLATE.md')
    .map((entry) => parseTask(join(TASK_DIR, entry.name)));

  for (const task of tasks) {
    if (!task.status || !ACTIVE_STATUSES.has(task.status)) {
      warn(`${relative(ROOT, task.path)} hat keinen zulässigen aktiven Status und wird vorsichtshalber als aktiv behandelt.`);
    }
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id, 'de'));
}

function gitFact(args, label) {
  const result = runGit(args);
  if (result.ok) return result.stdout || '<keine>';
  warn(`${label} konnte nicht ermittelt werden: ${result.stderr || result.error?.message || `Exit-Code ${result.status}`}`);
  return '<nicht ermittelbar>';
}

function resolveCommit(revision) {
  if (!revision) return null;
  const result = runGit(['rev-parse', '--verify', `${revision}^{commit}`]);
  return result.ok ? result.stdout.trim() : null;
}

function mainBranch() {
  const remoteHead = runGit(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const candidates = [remoteHead.ok ? remoteHead.stdout.trim() : null, 'origin/main', 'origin/master', 'main', 'master'];
  for (const candidate of candidates) {
    const commit = resolveCommit(candidate);
    if (candidate && commit) return { name: candidate, commit };
  }
  return null;
}

function valueOrNone(value) {
  return value && value.trim() ? value.trim() : '<keine>';
}

function printBlock(title, value) {
  console.log(`\n## ${title}`);
  console.log(valueOrNone(value));
}

function brief(task, fetchStatus) {
  const branchResult = runGit(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branch = branchResult.ok ? branchResult.stdout.trim() : '<detached oder nicht ermittelbar>';
  const head = gitFact(['rev-parse', 'HEAD'], 'HEAD');
  const documentedRaw = task.content
    .match(/^\s*-\s*Handoff-Basis-Commit:\s*(.*?)\s*$/im)?.[1]
    ?.replace(/^`|`$/g, '')
    .trim();
  const documentedCommit = resolveCommit(documentedRaw);

  let comparisonCommit = documentedCommit;
  let comparisonSource = documentedCommit
    ? 'dokumentierter Handoff-Basis-Commit'
    : '<nicht ermittelbar>';

  if (!comparisonCommit) {
    const fallback = mainBranch();
    if (fallback) {
      comparisonCommit = fallback.commit;
      comparisonSource = `Fallback ${fallback.name}; kein bestätigter letzter Übergabestand`;
      warn(`Kein gültiger Handoff-Basis-Commit dokumentiert; Vergleich erfolgt gegen ${fallback.name}.`);
    } else {
      warn('Weder ein gültiger Handoff-Basis-Commit noch ein Hauptbranch konnte aufgelöst werden.');
    }
  }

  console.log(`Ausgewählte Task-ID: ${task.id}`);
  console.log(`Task-Datei: ${relative(ROOT, task.path).replaceAll('\\', '/')}`);
  console.log(`Aktueller Branch: ${branch}`);
  console.log(`Aktuelles HEAD: ${head}`);
  console.log(`Dokumentierter Handoff-Basis-Commit: ${documentedRaw || '<nicht dokumentiert>'}`);
  console.log(`Verwendete Vergleichsbasis: ${comparisonCommit || '<nicht ermittelbar>'}`);
  console.log(`Herkunft der Vergleichsbasis: ${comparisonSource}`);
  console.log(`Fetch-Status: ${fetchStatus}`);

  if (comparisonCommit) {
    const range = `${comparisonCommit}..HEAD`;
    console.log(`Anzahl Commits seit Vergleichsbasis: ${gitFact(['rev-list', '--count', range], 'Commit-Anzahl')}`);
    printBlock(
      'Commits seit Vergleichsbasis (vollständiger Commit-Body)',
      gitFact(
        ['log', '--reverse', '--date=iso-strict', '--format=Commit: %H%nAutor: %an <%ae>%nDatum: %ad%n%n%B%n---', range],
        'Commit-Liste'
      )
    );
    printBlock('Diff-Umfang seit Vergleichsbasis', gitFact(['diff', '--stat', range], 'Diff-Umfang'));
    printBlock('Geänderte Dateien seit Vergleichsbasis', gitFact(['diff', '--name-status', range], 'geänderte Dateien'));
  } else {
    console.log('Anzahl Commits seit Vergleichsbasis: <nicht ermittelbar>');
    printBlock('Commits seit Vergleichsbasis (vollständiger Commit-Body)', '<nicht ermittelbar>');
    printBlock('Diff-Umfang seit Vergleichsbasis', '<nicht ermittelbar>');
    printBlock('Geänderte Dateien seit Vergleichsbasis', '<nicht ermittelbar>');
  }

  printBlock('Gestagte Änderungen', gitFact(['diff', '--cached', '--name-status'], 'gestagte Änderungen'));
  printBlock('Uncommittete Änderungen aus git status', gitFact(['status', '--short', '--untracked-files=all'], 'git status'));
  printBlock('Vollständiger Inhalt der Task-Datei', task.content);
}

try {
  const fetchStatus = fetchRepository();
  const tasks = activeTasks();
  const requested = process.argv[2]?.toUpperCase();

  if (!requested) {
    if (tasks.length === 0) {
      console.log(`Fetch-Status: ${fetchStatus}`);
      console.log('Aktive Tasks: 0');
      warn('Keine aktive Task gefunden.');
    } else if (tasks.length > 1) {
      for (const task of tasks) console.log(`${task.id}\t${task.title}`);
      warn('Mehrere aktive Tasks gefunden; eine konkrete Task-ID ist erforderlich.');
    } else {
      brief(tasks[0], fetchStatus);
    }
  } else {
    const task = tasks.find((candidate) => candidate.id === requested);
    if (!task) {
      console.log(`Ausgewählte Task-ID: ${requested}`);
      console.log('Task-Datei: <nicht gefunden>');
      console.log(`Fetch-Status: ${fetchStatus}`);
      warn(`Keine aktive Task-Datei für ${requested} gefunden.`);
    } else {
      brief(task, fetchStatus);
    }
  }
} catch (error) {
  warn(error instanceof Error ? error.message : String(error));
}

// Das Briefing darf einen Agenten auch bei unvollständigen Ergebnissen nie blockieren.
process.exitCode = 0;
