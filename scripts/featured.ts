import { parseArgs } from 'node:util';
import { featuredAccounts } from '../src/lib/featured.ts';
import { importFeatured } from '../src/lib/server/featured.ts';
import { historyRequest } from '../src/lib/server/history.ts';
import { parseRiotId } from '../src/lib/regions.ts';
import { fetchQueueLabels } from '../src/lib/server/queue-labels.ts';

try {
  const { values } = parseArgs({ options: {
    id: { type: 'string' }, 'riot-id': { type: 'string' }, help: { type: 'boolean' }
  } });
  if (values.help) {
    console.log('bun run featured --id <registry key> [--riot-id "Name#TAG"]');
    console.log(`Keys: ${featuredAccounts.map(entry => entry.id).join(', ')}`);
  } else {
    const entry = featuredAccounts.find(entry => entry.id === values.id);
    if (!entry) throw new Error('Supply --id with one featured registry key. See --help.');
    const riotId = values['riot-id'] ?? entry.riotId;
    if (!riotId) throw new Error(`Set ${entry.id}'s verified riotId in src/lib/featured.ts or supply --riot-id "Name#TAG".`);
    parseRiotId(riotId);
    const key = process.env.RIOT_API_KEY;
    if (!key) throw new Error('RIOT_API_KEY is required for operator imports.');
    let interrupted = false;
    const stop = () => {
      if (!interrupted) console.log(JSON.stringify({
        id: entry.id, phase: 'stopping', message: 'Waiting for the current request, then saving a checkpoint.'
      }));
      interrupted = true;
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    try {
      const queues = await fetchQueueLabels();
      await importFeatured(entry.id, riotId, async <T>(body: Record<string, unknown>) =>
        await historyRequest(body, key) as T, value => console.log(JSON.stringify(value)), undefined, () => interrupted, queues);
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  }
} catch (error) {
  console.error(JSON.stringify({ phase: 'error', message: error instanceof Error ? error.message : 'Import failed' }));
  process.exitCode = 1;
}
