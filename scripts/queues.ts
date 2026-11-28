import { resolve } from 'node:path';
import queueNames from '../src/lib/queue-names.json' with { type: 'json' };
import { mergeQueueLabels, readQueueLabels } from '../src/lib/server/queue-labels.ts';
import { saveJson } from '../src/lib/server/storage.ts';

let existing: Record<string, string> = queueNames;
try {
  existing = { ...existing, ...await readQueueLabels() };
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const [community, riot] = await Promise.all([
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/queues.json',
  'https://static.developer.riotgames.com/docs/lol/queues.json'
].map(async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Queue metadata unavailable: ${url}`);
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error('Queue metadata too large.');
  return JSON.parse(text) as unknown;
}));

const queues = mergeQueueLabels(existing, community, riot);
await saveJson(resolve('src/lib/queue-names.json'), queues);
await saveJson(resolve('data/queues.json'), queues);
console.log(`Saved ${Object.keys(queues).length} queue names.`);
