import type { Player } from './types.ts';
import { queueGroup, resultSummary, stats } from './encounters.ts';
import { championLabel } from './champions.ts';
import queueNames from './queue-names.json' with { type: 'json' };

const knownQueues: Record<string, string> = queueNames;
export const QUEUE_LABEL_OVERRIDES: Record<string, string> = {
  '420': 'Ranked Solo/Duo', '440': 'Ranked Flex', '710': 'Ranked 5s', '1750': 'Arena'
};

export const ROSTER_PAGE_SIZE = 50;
export function shouldExpandRow(target: Pick<Element, 'closest'>, selectedText: string) {
  return !selectedText && !target.closest('button, a, input, select, textarea, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"]), .premade-action-cell');
}

export function recentChampions(encounters: Player['encounters']) {
  return [...new Set(encounters.map(e => e.champion))].slice(0, 3);
}

export function rosterPageIndex(value: string | null) {
  const number = value && /^[1-9]\d*$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(number) ? number - 1 : 0;
}
export type PlayerSort = 'name' | 'encounters' | 'playedWith' | 'playedAgainst' | 'lastOn' | 'lastSeen';
export type SortDirection = 'asc' | 'desc';

export function sortPlayers(players: Player[], column: PlayerSort, direction: SortDirection) {
  return [...players].sort((a, b) => {
    let comparison: number;
    switch (column) {
      case 'name':
        comparison = a.name.localeCompare(b.name) || (a.tagLine ?? '').localeCompare(b.tagLine ?? '');
        break;
      case 'lastSeen':
        comparison = a.encounters[0].at - b.encounters[0].at;
        break;
      case 'lastOn':
        comparison = championLabel(a.encounters[0].champion).localeCompare(championLabel(b.encounters[0].champion));
        break;
      case 'playedWith':
      case 'playedAgainst': {
        const side = column === 'playedWith' ? 'together' : 'against';
        const ar = resultSummary(stats(a.encounters)[side]);
        const br = resultSummary(stats(b.encounters)[side]);
        comparison = ar.wins - br.wins || br.losses - ar.losses;
        break;
      }
      default:
        comparison = a.encounters.length - b.encounters.length;
    }
    return (direction === 'asc' ? comparison : -comparison) ||
      b.encounters.length - a.encounters.length || a.name.localeCompare(b.name) ||
      (a.tagLine ?? '').localeCompare(b.tagLine ?? '') || a.id.localeCompare(b.id);
  });
}

export function queueLabel(id: string, queues: Record<string, string>) {
  const group = queueGroup(id);
  const label = QUEUE_LABEL_OVERRIDES[group] ?? (queues[group]?.trim() || knownQueues[group] || `Queue ${group}`);
  return label.replace(/\s+games$/i, '');
}

export function rosterPage(players: Player[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(players.length / ROSTER_PAGE_SIZE));
  const index = Math.max(0, Math.min(Math.trunc(requestedPage) || 0, pages - 1));
  const start = index * ROSTER_PAGE_SIZE;
  return {
    items: players.slice(start, start + ROSTER_PAGE_SIZE), index, pages, start,
    end: Math.min(start + ROSTER_PAGE_SIZE, players.length)
  };
}
