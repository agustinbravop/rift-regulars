const matchRegions: Record<string, string> = {
  LA2: 'las', LA1: 'lan', NA1: 'na', BR1: 'br', EUW1: 'euw', EUN1: 'eune',
  TR1: 'tr', RU: 'ru', KR: 'kr', JP1: 'jp', OC1: 'oce', SG2: 'sg', TW2: 'tw', VN2: 'vn', ME1: 'me'
};
export function matchUrl(match: string) {
  const parts = /^([A-Z0-9]+)_(\d+)$/.exec(match);
  const region = parts && matchRegions[parts[1]];
  return region ? `https://www.leagueofgraphs.com/match/${region}/${parts![2]}` : undefined;
}

export function championRowsThatFit(tableHeight: number, headerHeight: number, count: number, matchCount: number) {
  if (count < 5 && matchCount <= 6) return count;
  // Rows are 48px tall with an 8px gap; reserve 28px for the overflow summary only when needed.
  const available = Math.max(0, tableHeight - headerHeight);
  if (count * 56 - 8 <= available) return count;
  return Math.max(Math.min(3, count), Math.floor((available - 28) / 56));
}
import type { Encounter } from './types.ts';
import { championLabel } from './champions.ts';
import { queueLabel, type SortDirection } from './scouting.ts';

export type MatchSort = 'champion' | 'myChampion' | 'result' | 'queue' | 'at' | 'match';

export function sortMatches(encounters: Encounter[], column: MatchSort, direction: SortDirection, queues: Record<string, string>) {
  const resultRank = (e: Encounter) => e.remake ? 2 : e.win === true ? 0 : e.win === false ? 1 : 3;
  return [...encounters].sort((a, b) => {
    let comparison: number;
    switch (column) {
      case 'champion':
      case 'myChampion':
        comparison = championLabel(a[column]).localeCompare(championLabel(b[column]));
        break;
      case 'result':
        comparison = resultRank(a) - resultRank(b);
        break;
      case 'queue':
        comparison = queueLabel(a.queue, queues).localeCompare(queueLabel(b.queue, queues));
        break;
      case 'at':
        comparison = a.at - b.at;
        break;
      case 'match':
        comparison = a.match.localeCompare(b.match, undefined, { numeric: true });
    }
    return (direction === 'asc' ? comparison : -comparison) || b.at - a.at || a.match.localeCompare(b.match);
  });
}
