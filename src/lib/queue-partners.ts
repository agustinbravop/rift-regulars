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
    .filter(p => {
      const together = p.encounters.filter(e => e.together).length;
      return together >= 5 && together * 100 > p.encounters.length * 95;
    })
    .map(p => p.id)])].filter(id => !excluded.has(id));
}
