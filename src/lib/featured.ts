import type { Account, Summary } from './types.ts';
import type { Platform } from './regions.ts';

// Only verified Riot IDs belong here; the operator can supply --riot-id for other entries.
export const featuredAccounts: { id: string; streamer: string; riotId: string | null }[] = [
  { id: 'agurin', streamer: 'Agurin', riotId: 'NAgurin#EU1' },
  { id: 'thebausffs', streamer: 'Thebausffs', riotId: 'Thebausffs#COOL' },
  { id: 'tyler1', streamer: 'Tyler1', riotId: 'S8 IS SO FUN#NA1' },
  { id: 'caedrel', streamer: 'Caedrel', riotId: 'RATKING#DKSON' },
  { id: 'nemesis', streamer: 'Nemesis', riotId: 'Dzukill#KISS' },
  { id: 'drututt', streamer: 'Drututt', riotId: 'Drututt#MAKS' },
  { id: 'aloisnl', streamer: 'AloisNL', riotId: 'AloisNL#EUW' },
  { id: 'dantes', streamer: 'Dantes', riotId: 'NICHOLAS STEWART#DOUG' },
  { id: 'crownie', streamer: 'Crownie', riotId: 'Alex Mercer#LARP' }
];

export interface FeaturedProfile {
  version: 1;
  id: string;
  account: Account;
  platform: Platform;
  year: number;
  icon?: number;
  summary: Summary;
  excluded: string[];
}

export const streamerBadge = (streamer: string, gameName: string) =>
  streamer.toLowerCase() !== gameName.toLowerCase() ? streamer : null;
