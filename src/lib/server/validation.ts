import type { Account, Match, Summary } from '../types.ts';
import { championName } from '../champions.ts';
import { roleLabels } from '../roles.ts';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error('Unexpected Riot or saved-data format. Existing files were kept.');
}
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown) => typeof value === 'string';
const iconId = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const optional = (value: unknown, check: (v: unknown) => boolean) => value === undefined || check(value);

export function parseAccount(value: unknown): Account {
  const a = object(value);
  requireValue(text(a.puuid) && a.puuid && text(a.gameName) && text(a.tagLine));
  return a as unknown as Account;
}

export function parseMatchIds(value: unknown): string[] {
  requireValue(Array.isArray(value) && value.every(id => typeof id === 'string' && /^[A-Z0-9]+_\d+$/.test(id)));
  return value;
}

export function parseMatch(value: unknown, expectedId?: string): Match {
  const m = object(value), info = object(m.info), metadata = object(m.metadata);
  requireValue(text(metadata.matchId) && /^[A-Z0-9]+_\d+$/.test(metadata.matchId as string));
  requireValue(!expectedId || metadata.matchId === expectedId);
  requireValue(number(info.queueId) && optional(info.platformId, text));
  requireValue(optional(info.gameStartTimestamp, number) && optional(info.gameCreation, number));
  requireValue(number(info.gameStartTimestamp ?? info.gameCreation));
  requireValue(Array.isArray(info.participants));
  for (const value of info.participants) {
    const p = object(value);
    requireValue(number(p.teamId) && optional(p.playerSubteamId, number));
    requireValue(optional(p.win, v => typeof v === 'boolean'));
    requireValue(optional(p.gameEndedInEarlySurrender, v => typeof v === 'boolean'));
    requireValue(optional(p.profileIcon, iconId));
    for (const field of ['puuid', 'riotIdGameName', 'riotIdTagline', 'summonerName', 'championName', 'teamPosition', 'individualPosition']) requireValue(optional(p[field], text));
    for (const field of ['kills', 'deaths', 'assists']) requireValue(optional(p[field], number));
  }
  return m as unknown as Match;
}

export function parseQueues(value: unknown): Record<string, string> {
  const queues = object(value);
  requireValue(Object.values(queues).every(text));
  return queues as Record<string, string>;
}

export function parseSummary(value: unknown): Summary {
  const s = object(value), coverage = object(s.coverage);
  requireValue(text(s.account) && number(s.year) && number(s.matches) && number(s.uniquePlayers));
  requireValue(text(s.updated) && Number.isFinite(Date.parse(s.updated as string)));
  requireValue([s.earliest, s.latest].every(v => v === null || number(v)));
  parseQueues(s.queues);
  requireValue(typeof coverage.complete === 'boolean' && [coverage.listed, coverage.missing, coverage.since, coverage.until].every(number));
  requireValue(text(coverage.note) && (coverage.error === null || text(coverage.error)));
  requireValue(Array.isArray(s.players));
  const ids = new Set<string>();
  for (const value of s.players) {
    const p = object(value);
    requireValue(text(p.id) && text(p.name) && optional(p.tagLine, text) && number(p.nameAt) && !ids.has(p.id as string));
    ids.add(p.id as string);
    requireValue(Array.isArray(p.encounters) && p.encounters.length >= 2);
    for (const value of p.encounters) {
      const e = object(value);
      requireValue(text(e.match) && number(e.at) && text(e.queue) && typeof e.together === 'boolean');
      requireValue(e.win === null || typeof e.win === 'boolean');
      requireValue(optional(e.remake, v => typeof v === 'boolean'));
      requireValue(text(e.champion) && text(e.myChampion));
      requireValue(optional(e.profileIcon, iconId));
      requireValue(Array.isArray(e.kda) && e.kda.length === 3 && e.kda.every(number));
      requireValue(optional(e.myKda, v => Array.isArray(v) && v.length === 3 && v.every(number)));
      for (const field of ['role', 'myRole']) {
        requireValue(optional(e[field], v => typeof v === 'string' && Object.hasOwn(roleLabels, v)));
      }
      e.champion = championName(e.champion as string);
      e.myChampion = championName(e.myChampion as string);
    }
  }
  return s as unknown as Summary;
}
