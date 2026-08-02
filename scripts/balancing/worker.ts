import { parentPort, workerData } from 'node:worker_threads';
import type { DeckList, GameData } from '../../packages/engine/src/index.ts';
import { runTask, toRecord, type Config, type Task } from './run.ts';

const input = workerData as {
  tasks: Task[];
  config: Config;
  data: GameData;
  decks: Record<string, DeckList>;
};

for (const task of input.tasks) {
  try {
    parentPort!.postMessage({ record: toRecord(task, runTask(task, input.decks, input.data, input.config), input.data) });
  } catch (error) {
    parentPort!.postMessage({
      failure: { task, message: error instanceof Error ? error.message : String(error) }
    });
  }
}
parentPort!.postMessage({ done: true });
