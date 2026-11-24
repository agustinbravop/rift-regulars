import type { Account } from './types.ts';
import { parseAccount } from './validation.ts';
import { parsePlatform, parseRiotId, type Platform } from './regions.ts';

export interface RecentPlayer {
  account: Account;
  platform: Platform;
}

export const recentPlayersKey = 'rift-regulars:recent-players';

export function parseRecentPlayers(raw: string | null): RecentPlayer[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Invalid recent players.');
  const seen = new Set<string>();
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid recent player.');
    const account = parseAccount(entry.account);
    parseRiotId(`${account.gameName}#${account.tagLine}`);
    const platform = parsePlatform(entry.platform);
    const key = `${platform}:${account.puuid}`;
    if (seen.has(key)) throw new Error('Duplicate recent player.');
    seen.add(key);
    return { account, platform };
  });
}

export function rememberPlayer(players: RecentPlayer[], player: RecentPlayer): RecentPlayer[] {
  return [player, ...players.filter(p => p.account.puuid !== player.account.puuid || p.platform !== player.platform)];
}

export function filterRecentPlayers(players: RecentPlayer[], query: string): RecentPlayer[] {
  const name = query.trim().toLocaleLowerCase();
  return players.filter(p => `${p.account.gameName}#${p.account.tagLine}`.toLocaleLowerCase().includes(name));
}
