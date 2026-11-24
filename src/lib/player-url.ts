import { parseRiotId } from './regions.ts';

export function playerUrl(riotId: string) {
  const { gameName, tagLine } = parseRiotId(riotId);
  return `/player/${encodeURIComponent(`${gameName}#${tagLine}`)}`;
}
