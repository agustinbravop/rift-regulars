import type { History } from './history.ts';
import type { Match } from './types.ts';
import { parseMatch, parseMatchIds } from './validation.ts';
import { matchPlatform } from './regions.ts';
import { yearStart } from './encounters.ts';

type Api = <T>(body: Record<string, unknown>) => Promise<T>;

export async function importHistory(
  history: History, api: Api, publish: (history: History, message: string) => Promise<void>
) {
  if (history.year !== new Date().getUTCFullYear()) {
    throw new Error('A new year has started. Return to search to scan this year’s matches.');
  }
  history.listed = false;
  history.until = Math.floor(Date.now() / 1000);
  const ids = new Set(history.ids);
  for (let start = 0; ; start += 100) {
    const page = parseMatchIds(await api<string[]>({
      action: 'ids', puuid: history.account.puuid, start, until: history.until
    }));
    for (const id of page) {
      matchPlatform(id);
      ids.add(id);
    }
    history.ids = [...ids];
    history.updated = new Date().toISOString();
    await publish(history, `Finding matches… ${ids.size} found`);
    if (page.length < 100) break;
  }
  history.listed = true;
  const saved = new Set(history.matches.map(m => m.metadata.matchId));
  const excluded = new Set(history.excluded ?? []);
  const missing = history.ids.filter(id => !saved.has(id));
  await publish(history, 'Reading match details');
  for (const [index, id] of missing.entries()) {
    const match = parseMatch(await api<Match>({ action: 'match', id }), id);
    const at = (match.info.gameStartTimestamp ?? match.info.gameCreation ?? 0) / 1000;
    // Riot can list empty records with zero timestamps despite the requested year bounds.
    if (match.info.queueId === 0 || match.info.participants.length === 0 ||
      at < yearStart(history.year) || at >= yearStart(history.year + 1)) {
      excluded.add(id);
    } else if (!match.info.participants.some(p => p.puuid === history.account.puuid)) {
      throw new Error('Riot returned a match without this player.');
    } else {
      excluded.delete(id);
      history.matches.push(match);
    }
    history.excluded = [...excluded];
    history.updated = new Date().toISOString();
    if ((index + 1) % 10 === 0) await publish(history, 'Reading match details');
  }
  await publish(history, `Up to date: ${history.matches.length} matches.`);
}
