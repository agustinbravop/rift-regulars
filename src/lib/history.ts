import type { Account, Match } from './types.ts';
import type { Platform } from './regions.ts';
import { summarize, yearStart } from './encounters.ts';

export const countNewMatches = (ids: string[], known: ReadonlySet<string>) =>
  ids.filter(id => !known.has(id)).length;

export function accountIcon(matches: Match[], puuid: string): number | undefined {
  let icon: number | undefined;
  let latest = -Infinity;
  for (const match of matches) {
    const at = match.info.gameStartTimestamp ?? match.info.gameCreation ?? 0;
    const participant = match.info.participants.find(p => p.puuid === puuid);
    if (participant?.profileIcon !== undefined && at >= latest) {
      icon = participant.profileIcon;
      latest = at;
    }
  }
  return icon;
}

export interface History {
  account: Account;
  platform: Platform;
  year: number;
  ids: string[];
  matches: Match[];
  excluded?: string[];
  listed: boolean;
  until: number;
  updated: string;
  queues: Record<string, string>;
}

// Keep every participant, including one-off encounters, so later imports can find repeats.
export function compactMatch(match: Match): Match {
  const { info } = match;
  return {
    metadata: { matchId: match.metadata.matchId },
    info: {
      platformId: info.platformId,
      gameStartTimestamp: info.gameStartTimestamp ?? info.gameCreation,
      queueId: info.queueId,
      participants: info.participants.map(p => ({
        puuid: p.puuid, teamId: p.teamId, playerSubteamId: p.playerSubteamId,
        win: p.win, gameEndedInEarlySurrender: p.gameEndedInEarlySurrender,
        riotIdGameName: p.riotIdGameName, riotIdTagline: p.riotIdTagline,
        summonerName: p.summonerName, championName: p.championName,
        teamPosition: p.teamPosition, individualPosition: p.individualPosition,
        profileIcon: p.profileIcon, kills: p.kills, deaths: p.deaths, assists: p.assists
      }))
    }
  };
}

export function historySummary(history: History, error: string | null = null) {
  const saved = new Set([...history.matches.map(m => m.metadata.matchId), ...(history.excluded ?? [])]);
  const missing = history.ids.filter(id => !saved.has(id)).length;
  const summary = summarize(history.account, history.matches, history.year, history.queues, {
    complete: history.listed && missing === 0, listed: history.ids.length, missing,
    error, since: yearStart(history.year), until: history.until,
    note: 'Retrievable current-year Match-V5 history plus matches cached in this browser. Riot may not return the full year. New imports exclude custom games (queue 0), TFT, empty and out-of-year records.'
  }, null);
  summary.updated = history.updated;
  return summary;
}
