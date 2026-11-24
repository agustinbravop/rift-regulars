import { Riot, RiotError } from './riot.ts';
import { RiotRateLimiter } from './rate-limit.ts';
import { regions, parsePlatform, parseRiotId, matchPlatform } from '../regions.ts';
import { compactMatch } from '../history.ts';
import { yearStart } from '../encounters.ts';
import { parseAccount, parseMatch, parseMatchIds } from './validation.ts';
import { parseDiscovery } from '../validation.ts';

// shortcut: one Node server owns this queue, use shared rate limiting before running multiple instances.
let pending = Promise.resolve();
let waiting = 0;
const limiter = new RiotRateLimiter();

export async function historyRequest(input: unknown, key: string) {
  if (!input || typeof input !== 'object') throw new Error('Invalid request.');
  const body = input as Record<string, unknown>;
  const platform = body.action === 'discover' ? null
    : body.action === 'match' ? matchPlatform(body.id) : parsePlatform(body.platform);
  let path: string;
  if (body.action === 'account' || body.action === 'discover') {
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
    const routing = platform ? regions[platform].routing : 'americas';
    const riot = new Riot(key, fetch, undefined, undefined,
      body.action === 'account' && routing === 'sea' ? 'asia' : routing, limiter);
    let value: unknown;
    try { value = await riot.get(path); }
    catch (error) {
      if (body.action === 'discover' && error instanceof RiotError && error.status === 404) {
        throw new RiotError('Player not found. Check the player name and #TAG.', 404);
      }
      throw error;
    }
    if (body.action === 'discover') {
      const account = parseAccount(value);
      if (!/^[\w-]{10,200}$/.test(account.puuid)) throw new Error('Unexpected account identity.');
      parseRiotId(`${account.gameName}#${account.tagLine}`);
      let region: unknown;
      try {
        region = await riot.get(`/riot/account/v1/region/by-game/lol/by-puuid/${encodeURIComponent(account.puuid)}`);
      } catch (error) {
        if (error instanceof RiotError && error.status === 404) {
          throw new RiotError('This account has no active League of Legends region.', 404);
        }
        throw error;
      }
      if (!region || typeof region !== 'object' ||
        !('puuid' in region) || region.puuid !== account.puuid ||
        !('game' in region) || region.game !== 'lol' ||
        !('region' in region) || typeof region.region !== 'string') {
        throw new Error('Unexpected League region response.');
      }
      let activePlatform;
      try { activePlatform = parsePlatform(region.region.toUpperCase()); }
      catch { throw new Error('This account’s League server is not supported.'); }
      return parseDiscovery({ account, platform: activePlatform });
    }
    if (body.action === 'account') return parseAccount(value);
    if (body.action === 'ids') {
      const ids = parseMatchIds(value);
      ids.forEach(matchPlatform);
      return ids;
    }
    return compactMatch(parseMatch(value, body.id as string));
  } finally {
    waiting--;
    release();
  }
}
