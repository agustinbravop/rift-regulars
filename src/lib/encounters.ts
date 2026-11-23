import type { Account, Coverage, Encounter, Match, Player, Summary } from './types.ts';
import { championName } from './champions.ts';
import { participantRole } from './roles.ts';

export const yearStart = (year: number) => Date.UTC(year, 0, 1) / 1000;

export function summarize(
  account: Account, matches: Match[], year: number,
  queues: Record<string, string>, coverage: Coverage, platform = 'LA2'
): Summary {
  const players = new Map<string, Player>();
  const accepted: number[] = [];
  const seenMatches = new Set<string>();
  for (const match of matches) {
    const { info, metadata: { matchId } } = match;
    const at = info.gameStartTimestamp ?? info.gameCreation ?? 0;
    if (seenMatches.has(matchId) || at / 1000 < yearStart(year) || at / 1000 >= yearStart(year + 1)) continue;
    if ((info.platformId ?? platform) !== platform) continue;
    seenMatches.add(matchId);
    const me = info.participants.find(p => p.puuid === account.puuid);
    if (!me) continue;
    const myRole = participantRole(me);
    const remake = info.participants.some(p => p.gameEndedInEarlySurrender === true);
    accepted.push(at);
    const seenPlayers = new Set<string>();
    for (const p of info.participants) {
      if (!p.puuid || p.puuid === account.puuid || seenPlayers.has(p.puuid)) continue;
      seenPlayers.add(p.puuid);
      let player = players.get(p.puuid);
      if (!player) {
        player = { id: p.puuid, name: 'Unknown player', tagLine: '', nameAt: 0, encounters: [] };
        players.set(p.puuid, player);
      }
      const name = p.riotIdGameName || p.summonerName;
      if (name && at >= player.nameAt) {
        player.name = name;
        player.tagLine = p.riotIdTagline ?? '';
        player.nameAt = at;
      }
      // Arena squads can share a teamId; subteam IDs identify actual teammates.
      const together = me.playerSubteamId && p.playerSubteamId
        ? me.playerSubteamId === p.playerSubteamId : me.teamId === p.teamId;
      const role = participantRole(p);
      player.encounters.push({
        match: matchId, at, queue: String(info.queueId), together,
        win: !remake && typeof me.win === 'boolean' ? me.win : null,
        ...(remake ? { remake: true } : {}),
        champion: championName(p.championName ?? 'Unknown'),
        ...(p.profileIcon === undefined ? {} : { profileIcon: p.profileIcon }),
        myChampion: championName(me.championName ?? 'Unknown'),
        ...(role ? { role } : {}),
        ...(myRole ? { myRole } : {}),
        kda: [p.kills ?? 0, p.deaths ?? 0, p.assists ?? 0],
        myKda: [me.kills ?? 0, me.deaths ?? 0, me.assists ?? 0]
      });
    }
  }
  const repeated = [...players.values()].filter(p => p.encounters.length >= 2);
  for (const p of repeated) p.encounters.sort((a, b) => b.at - a.at);
  repeated.sort((a, b) => b.encounters.length - a.encounters.length ||
    b.encounters[0].at - a.encounters[0].at || a.name.localeCompare(b.name));
  return {
    account: `${account.gameName}#${account.tagLine}`, year, queues, players: repeated,
    matches: accepted.length, uniquePlayers: players.size,
    earliest: accepted.length ? Math.min(...accepted) : null,
    latest: accepted.length ? Math.max(...accepted) : null,
    updated: new Date().toISOString(), coverage
  };
}

export function stats(encounters: Encounter[]) {
  return {
    together: encounters.filter(e => e.together),
    against: encounters.filter(e => !e.together)
  };
}

export function resultSummary(encounters: Encounter[]) {
  const wins = encounters.filter(e => !e.remake && e.win === true).length;
  const losses = encounters.filter(e => !e.remake && e.win === false).length;
  const remakes = encounters.filter(e => e.remake).length;
  const unknown = encounters.length - wins - losses - remakes;
  return { wins, losses, unknown, remakes, winRate: wins + losses ? Math.round(wins / (wins + losses) * 100) : null };
}

export function record(encounters: Encounter[]) {
  const { wins, losses, unknown, remakes } = resultSummary(encounters);
  return `${wins}W / ${losses}L${remakes ? ` / ${remakes} remake${remakes === 1 ? '' : 's'}` : ''}${unknown ? ` / ${unknown} unknown` : ''}`;
}

export function filterPlayers(
  players: Player[], search: string, queue: string,
  includePremade = true, premades: readonly string[] = [], seenSince = 0
) {
  const query = search.trim().toLocaleLowerCase();
  const marked = new Set(premades);
  return players.map(p => ({
    ...p, encounters: p.encounters.filter(e => queue === 'all' || e.queue === queue)
  })).filter(p => {
    const riotId = `${p.name}${p.tagLine ? `#${p.tagLine}` : ''}`.toLocaleLowerCase();
    return p.encounters.length >= 2 && p.encounters[0].at >= seenSince && riotId.includes(query) &&
      (includePremade || !marked.has(p.id));
  }).sort((a, b) => b.encounters.length - a.encounters.length ||
    b.encounters[0].at - a.encounters[0].at || a.name.localeCompare(b.name));
}

export const formatDate = (at: number | null) => at === null ? 'None' :
  new Date(at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
