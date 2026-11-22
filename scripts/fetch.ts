import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { summarize, yearStart } from '../src/lib/encounters.ts';
import { Riot } from '../src/lib/server/riot.ts';
import { dataDir, readJson, saveJson } from '../src/lib/server/storage.ts';
import { parseAccount, parseMatch, parseMatchIds, parseQueues } from '../src/lib/server/validation.ts';
import type { Match } from '../src/lib/types.ts';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort(new Error('Import interrupted; rerun bun run fetch to resume.')));
process.once('SIGTERM', () => controller.abort(new Error('Import stopped; rerun bun run fetch to resume.')));

async function main() {
  // shortcut: imports assume one process and one API-key user, add a lock for scheduled imports.
  const year = new Date().getUTCFullYear();
  const since = yearStart(year), until = Math.floor(Date.now() / 1000);
  const riot = new Riot(process.env.RIOT_API_KEY ?? '', fetch,
    ms => sleep(ms, undefined, { signal: controller.signal }), controller.signal);
  const account = parseAccount(await riot.get('/riot/account/v1/accounts/by-riot-id/Agus%20Brr/ARG'));
  let queues: Record<string, string>;
  try {
    const response = await fetch('https://static.developer.riotgames.com/docs/lol/queues.json', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
    });
    if (!response.ok) throw new Error('Queue names unavailable.');
    const value: unknown = await response.json();
    if (!Array.isArray(value) || !value.every(q =>
      q && Number.isInteger(q.queueId) && typeof (q.description ?? q.map) === 'string'
    )) throw new Error('Unexpected queue-name format.');
    queues = Object.fromEntries(value.map(q => [String(q.queueId), q.description ?? q.map]));
    await saveJson(resolve(dataDir, 'queues.json'), queues);
  } catch {
    controller.signal.throwIfAborted();
    try {
      queues = parseQueues(await readJson(resolve(dataDir, 'queues.json')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      queues = {};
    }
  }
  console.log(`Fetching ${account.gameName}#${account.tagLine}, LAS, since ${year}-01-01 UTC.`);
  const ids = new Set<string>();
  let offset = 0;
  while (true) {
    const query = new URLSearchParams({
      startTime: String(since), endTime: String(until), start: String(offset), count: '100'
    });
    const page = parseMatchIds(await riot.get(`/lol/match/v5/matches/by-puuid/${encodeURIComponent(account.puuid)}/ids?${query}`));
    for (const id of page) if (id.startsWith('LA2_')) ids.add(id);
    console.log(`Listed ${ids.size} LAS matches.`);
    if (page.length < 100) break;
    offset += page.length;
  }
  // Retain older cached history if Riot no longer returns it in a later import.
  const idsPath = resolve(dataDir, `match_ids_${year}.json`);
  try {
    for (const id of parseMatchIds(await readJson(idsPath))) if (id.startsWith('LA2_')) ids.add(id);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await saveJson(idsPath, [...ids]);
  const matches: Match[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    try {
      matches.push(parseMatch(await readJson(resolve(dataDir, 'matches', `${id}.json`)), id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.push(id);
    }
  }
  const publish = (complete = false, error: string | null = null) =>
    saveJson(resolve(dataDir, 'summary.json'), summarize(account, matches, year, queues, {
      complete, listed: ids.size, missing: ids.size - matches.length, error, since, until,
      note: 'All retrievable Match-V5 history plus cached matches, not guaranteed full-year history. Custom/TFT games are not included.'
    }));
  try {
    await publish();
    for (const [index, id] of missing.entries()) {
      const match = parseMatch(await riot.get(`/lol/match/v5/matches/${id}`), id);
      await saveJson(resolve(dataDir, 'matches', `${id}.json`), match);
      matches.push(match);
      console.log(`Saved ${matches.length}/${ids.size}: ${id}`);
      if ((index + 1) % 10 === 0) await publish();
    }
    await publish(true);
    console.log(`Import complete: ${matches.length} saved LAS matches. Open http://127.0.0.1:8765`);
  } catch (error) {
    await publish(false, controller.signal.aborted
      ? 'Import interrupted; rerun bun run fetch to resume.'
      : error instanceof Error ? error.message : 'Import failed; rerun bun run fetch.');
    throw error;
  }
}

main().catch(error => {
  // Do not print request objects or headers; those contain the API key.
  console.error(controller.signal.aborted ? 'Import stopped. Cached matches were kept.' :
    error instanceof Error ? error.message : 'Import failed. Cached matches were kept.');
  process.exitCode = 1;
});
