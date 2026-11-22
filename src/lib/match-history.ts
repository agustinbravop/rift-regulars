// shortcut: imported matches are LAS-only, add platform mappings when other regions are supported.
export const matchUrl = (match: string) =>
  /^LA2_\d+$/.test(match) ? `https://www.leagueofgraphs.com/match/las/${match.slice(4)}` : undefined;

export function championRowsThatFit(tableHeight: number, headerHeight: number, count: number) {
  // Champion rows are 48px tall with an 8px gap; reserve 44px for Show all only when needed.
  const available = Math.max(0, tableHeight - headerHeight);
  if (count * 56 - 8 <= available) return count;
  return Math.max(0, Math.floor((available - 44) / 56));
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
