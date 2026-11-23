import { parsePlatform, parseRiotId, type Platform } from './regions.ts';

export function playerUrl(riotId: string, platform: Platform) {
  const { gameName, tagLine } = parseRiotId(riotId);
  return `/player/${encodeURIComponent(`${gameName}#${tagLine}`)}?${new URLSearchParams({ server: parsePlatform(platform) })}`;
}
