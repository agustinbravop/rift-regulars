export function parseQueuePartners(raw: string | null): string[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(id => typeof id === 'string' && id.length > 0)) {
    throw new Error('Invalid premade marks.');
  }
  return [...new Set(value)];
}
import type { Player } from './types.ts';

export function premadeIds(players: Player[], marked: readonly string[], unmarked: readonly string[]) {
  const excluded = new Set(unmarked);
  return [...new Set([...marked, ...players
    .filter(p => p.encounters.length >= 5 && p.encounters.every(e => e.together))
    .map(p => p.id)])].filter(id => !excluded.has(id));
}
