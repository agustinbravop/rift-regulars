import type { Role } from './roles.ts';

export interface Account {
  puuid: string;
  gameName: string;
  tagLine: string;
}

export interface Participant {
  puuid?: string;
  teamId: number;
  playerSubteamId?: number;
  win?: boolean;
  gameEndedInEarlySurrender?: boolean;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerName?: string;
  championName?: string;
  teamPosition?: string;
  individualPosition?: string;
  profileIcon?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
}

export interface Match {
  metadata: { matchId: string };
  info: {
    platformId?: string;
    gameStartTimestamp?: number;
    gameCreation?: number;
    queueId: number;
    participants: Participant[];
  };
}

export interface Encounter {
  match: string;
  at: number;
  queue: string;
  together: boolean;
  win: boolean | null;
  remake?: boolean;
  champion: string;
  profileIcon?: number;
  myChampion: string;
  kda: [number, number, number];
  myKda?: [number, number, number];
  role?: Role;
  myRole?: Role;
}

export interface Player {
  id: string;
  name: string;
  tagLine?: string;
  nameAt: number;
  encounters: Encounter[];
}

export interface Coverage {
  complete: boolean;
  listed: number;
  missing: number;
  error: string | null;
  since: number;
  until: number;
  note: string;
}

export interface Summary {
  account: string;
  year: number;
  queues: Record<string, string>;
  players: Player[];
  matches: number;
  uniquePlayers: number;
  earliest: number | null;
  latest: number | null;
  updated: string;
  coverage: Coverage;
}

export interface SavedData {
  summary: Summary | null;
  error: string | null;
}
