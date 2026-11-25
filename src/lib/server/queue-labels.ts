import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseQueues } from '../validation.ts';

const queuePath = resolve('data/queues.json');

function labels(value: unknown): Record<string, string> {
  const result = Array.isArray(value) ? Object.fromEntries(value.map(queue => {
    if (!queue || !Number.isSafeInteger(queue.queueId) || queue.queueId < 0) {
      throw new Error('Invalid queue metadata.');
    }
    return [String(queue.queueId), queue.description ?? queue.map];
  })) : parseQueues(value);
  if (!Object.keys(result).length || Object.entries(result).some(([id, label]) =>
    !/^\d+$/.test(id) || typeof label !== 'string' || !label.trim() || label.length > 300)) {
    throw new Error('Invalid queue metadata.');
  }
  return result;
}

export async function readQueueLabels(path = queuePath) {
  return labels(JSON.parse(await readFile(path, 'utf8')));
}

export async function fetchQueueLabels(request: typeof fetch = fetch, fallback = queuePath) {
  try {
    const response = await request('https://static.developer.riotgames.com/docs/lol/queues.json', {
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error('Queue metadata unavailable.');
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error('Queue metadata too large.');
    return labels(JSON.parse(text));
  } catch {
    return readQueueLabels(fallback);
  }
}
