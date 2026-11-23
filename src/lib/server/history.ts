import { Riot } from './riot.ts';
import { RiotRateLimiter } from './rate-limit.ts';
import { regions, parsePlatform, parseRiotId } from '../regions.ts';
import { compactMatch } from '../history.ts';
import { yearStart } from '../encounters.ts';
import { parseAccount, parseMatch, parseMatchIds } from './validation.ts';

// shortcut: one Node server owns this queue, use shared rate limiting before running multiple instances.
let pending = Promise.resolve();
let waiting = 0;
const limiter = new RiotRateLimiter();

export async function historyRequest(input: unknown, key: string) {
  if (!input || typeof input !== 'object') throw new Error('Invalid request.');
  const body = input as Record<string, unknown>;
  const platform = parsePlatform(body.platform);
  let path: string;
  if (body.action === 'account') {
    const { gameName, tagLine } = parseRiotId(body.riotId);
    path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  } else if (body.action === 'ids') {
    if (typeof body.puuid !== 'string' || !/^[\w-]{10,200}$/.test(body.puuid) ||
      !Number.isSafeInteger(body.start) || (body.start as number) < 0 || (body.start as number) > 100_000 ||
      !Number.isSafeInteger(body.until) || (body.until as number) < yearStart(new Date().getUTCFullYear()) ||
      (body.until as number) > Math.floor(Date.now() / 1000) + 60) throw new Error('Invalid history request.');
    const query = new URLSearchParams({
      startTime: String(yearStart(new Date().getUTCFullYear())), endTime: String(body.until),
      start: String(body.start), count: '100'
    });
    path = `/lol/match/v5/matches/by-puuid/${encodeURIComponent(body.puuid)}/ids?${query}`;
  } else if (body.action === 'match') {
    if (typeof body.id !== 'string' || !new RegExp(`^${platform}_\\d+$`).test(body.id)) throw new Error('Invalid match ID.');
    path = `/lol/match/v5/matches/${body.id}`;
  } else {
    throw new Error('Invalid action.');
  }
  if (waiting >= 20) throw new Error('Server is busy. Try Refresh shortly.');
  waiting++;
  const previous = pending;
  let release!: () => void;
  pending = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    const routing = regions[platform].routing;
    const riot = new Riot(key, fetch, undefined, undefined,
      body.action === 'account' && routing === 'sea' ? 'asia' : routing, limiter);
    const value = await riot.get(path);
    if (body.action === 'account') return parseAccount(value);
    if (body.action === 'ids') return parseMatchIds(value);
    return compactMatch(parseMatch(value, body.id as string));
  } finally {
    waiting--;
    release();
  }
}
