import type { Account, Coverage, Match } from '../src/lib/types.ts';
import { yearStart } from '../src/lib/encounters.ts';

// Synthetic checks only, never served as real account history.
export const year = 2026;
export const account: Account = { puuid: 'me', gameName: 'Agus Brr', tagLine: 'ARG' };
export const coverage: Coverage = {
  complete: true, listed: 2, missing: 0, error: null,
  since: yearStart(year), until: yearStart(year + 1) - 1, note: 'Synthetic test fixture.'
};

export function match(number: number, together = true, queueId = 420): Match {
  return {
    metadata: { matchId: `LA2_${number}` },
    info: {
      platformId: 'LA2', gameStartTimestamp: (yearStart(year) + number * 3600) * 1000,
      queueId, participants: [
        { puuid: 'me', teamId: 100, win: true, championName: 'Ahri' },
        { puuid: 'friend', teamId: together ? 100 : 200, championName: 'Garen',
          riotIdGameName: 'Player <one>', riotIdTagline: 'LAS', kills: 4, deaths: 2, assists: 8 },
        { puuid: `stranger-${number}`, teamId: 200 }
      ]
    }
  };
}
