import assert from 'node:assert/strict';
import { test } from 'node:test';
import { account, match, year } from './fixtures.ts';
import { accountIcon, compactMatch, countNewMatches, historySummary, type History } from '../src/lib/history.ts';
import { importHistory } from '../src/lib/import-history.ts';
import { parseHistory } from '../src/lib/browser-cache.ts';
import { parsePlatform, parseRiotId } from '../src/lib/regions.ts';
import { historyRequest } from '../src/lib/server/history.ts';
import { summarize, yearStart } from '../src/lib/encounters.ts';

const history = (): History => ({
  account, platform: 'LA2', year, ids: [], matches: [], listed: false,
  until: Math.floor(Date.now() / 1000), updated: new Date().toISOString(), queues: {}
});

test('uses the tracked player’s newest available match icon, including icon zero', () => {
  const older = match(1), newer = match(2), missingIcon = match(3);
  older.info.participants[0].profileIcon = 42;
  newer.info.participants[0].profileIcon = 0;
  newer.info.participants[1].profileIcon = 99;
  assert.equal(accountIcon([newer, missingIcon, older], account.puuid), 0);
  assert.equal(accountIcon([older], account.puuid), 42);
  assert.equal(accountIcon([missingIcon], account.puuid), undefined);
  assert.equal(accountIcon([newer], 'absent'), undefined);
  assert.equal(accountIcon([], account.puuid), undefined);
});

test('refresh counts newly listed IDs, not total history or unfinished downloads', () => {
  const known = new Set(['LA2_1', 'LA2_2', 'LA2_3']);
  assert.equal(countNewMatches(['LA2_1', 'LA2_2', 'LA2_3'], known), 0);
  assert.equal(countNewMatches(['LA2_1', 'LA2_2', 'LA2_3', 'LA2_4', 'LA2_5'], known), 2);
  assert.equal(countNewMatches(['LA2_3'], known), 0);
  assert.equal(countNewMatches([], known), 0);
});

test('validates player and server input before making a Riot request', async () => {
  assert.deepEqual(parseRiotId('  Player name # ARG '), { gameName: 'Player name', tagLine: 'ARG' });
  for (const value of ['', 'Player', '#TAG', 'Player#', 'Player#TAG#EXTRA', 'Player\n#TAG']) {
    assert.throws(() => parseRiotId(value));
  }
  assert.equal(parsePlatform('EUW1'), 'EUW1');
  assert.throws(() => parsePlatform('__proto__'));
  for (const input of [
    { platform: 'LA2', action: 'match', id: 'LA2_1/../../anything' },
    { platform: 'LA2', action: 'match', id: 'UNKNOWN_1' },
    { platform: 'LA2', action: 'ids', puuid: 'invalid', start: -1 },
    { platform: 'LA2', action: 'unknown' }
  ]) await assert.rejects(historyRequest(input, 'synthetic-only'));
});

test('compaction preserves all encounters and dashboard results without unused Riot fields', () => {
  const raw = match(1);
  Object.assign(raw.info, { unusedLargePayload: 'discard me' });
  Object.assign(raw.info.participants[0], { unusedItems: [1, 2, 3] });
  const compact = compactMatch(raw);
  assert.equal('unusedLargePayload' in compact.info, false);
  assert.equal('unusedItems' in compact.info.participants[0], false);
  assert.equal(compact.info.participants.length, raw.info.participants.length);
  const h = history();
  h.ids = ['LA2_1', 'LA2_2'];
  h.matches = [compact, compactMatch(match(2))];
  h.listed = true;
  const summary = historySummary(h);
  assert.equal(summary.matches, 2);
  assert.equal(summary.players[0].encounters.length, 2);
  assert.equal(summary.uniquePlayers, 3);
  assert.equal(summary.coverage.complete, true);
  assert.deepEqual(parseHistory(structuredClone(h)), h);
  const otherRegion = structuredClone(h);
  otherRegion.platform = 'NA1';
  assert.deepEqual(historySummary(otherRegion), summary);
  assert.throws(() => parseHistory({ ...h, matches: [match(999)] }));
});

test('first scan, incremental refresh, and interrupted resume reuse cached matches', async () => {
  const h = history();
  const requested: string[] = [];
  let ids = ['LA2_1', 'LA2_2'];
  let fail = false;
  const api = async <T>(body: Record<string, unknown>): Promise<T> => {
    if (body.action === 'ids') return ids as T;
    requested.push(String(body.id));
    if (fail && body.id === 'LA2_4') throw new Error('Synthetic failure');
    return compactMatch(match(Number(String(body.id).split('_')[1]))) as T;
  };
  let saved: History | null = null;
  const publish = async (value: History) => { saved = structuredClone(value); };
  await importHistory(h, api, publish);
  assert.deepEqual(requested, ['LA2_1', 'LA2_2']);
  assert.equal(historySummary(h).coverage.complete, true);
  assert.equal(saved!.matches.length, 2);

  ids = ['LA2_2', 'LA2_3', 'LA2_4']; // Riot no longer lists LA2_1.
  fail = true;
  await assert.rejects(importHistory(h, api, publish), /Synthetic failure/);
  assert.equal(h.matches.length, 3);
  assert.equal(historySummary(h).coverage.complete, false);
  fail = false;
  await importHistory(h, api, publish);
  assert.deepEqual(requested, ['LA2_1', 'LA2_2', 'LA2_3', 'LA2_4', 'LA2_4']);
  assert.equal(h.matches.length, 4);
  assert.ok(h.ids.includes('LA2_1'));
  assert.equal(historySummary(h).coverage.complete, true);
});

test('paginates all queues and platforms, deduplicates IDs, and keeps partial listing progress', async () => {
  const h = history();
  let fail = true;
  const page = Array.from({ length: 99 }, (_, i) => `LA2_${i + 1}`);
  page.push('NA1_123');
  const starts: number[] = [];
  const api = async <T>(body: Record<string, unknown>): Promise<T> => {
    if (body.action === 'ids') {
      starts.push(body.start as number);
      if (body.start === 0) return page as T;
      if (fail) throw new Error('Listing failed');
      return [] as T;
    }
    const game = match(Number(String(body.id).split('_')[1]));
    game.metadata.matchId = String(body.id);
    game.info.platformId = String(body.id).split('_')[0];
    return game as T;
  };
  await assert.rejects(importHistory(h, api, async () => {}), /Listing failed/);
  assert.equal(h.ids.length, 100);
  assert.equal(h.listed, false);
  fail = false;
  await importHistory(h, api, async () => {});
  assert.deepEqual(starts, [0, 100, 0, 100]);
  assert.equal(h.matches.length, 100);
  assert.equal(historySummary(h).matches, 100);
  assert.equal(historySummary(h).players[0].encounters.length, 100);
  assert.equal(h.listed, true);
});

test('rejects a returned match from another player and accepts non-LAS summaries', async () => {
  const h = history();
  const wrong = match(1);
  wrong.info.participants = wrong.info.participants.filter(p => p.puuid !== account.puuid);
  await assert.rejects(importHistory(h, async <T>(body: Record<string, unknown>) =>
    (body.action === 'ids' ? ['LA2_1'] : wrong) as T, async () => {}), /without this player/);
  assert.equal(h.matches.length, 0);
  const games = [match(1), match(2)].map(m => ({
    ...m, metadata: { matchId: m.metadata.matchId.replace('LA2', 'EUW1') },
    info: { ...m.info, platformId: 'EUW1' }
  }));
  const summary = summarize(account, games, year, {}, historySummary(h).coverage, 'EUW1');
  assert.equal(summary.matches, 2);
  assert.equal(summary.players.length, 1);
});

test('empty records do not block scanning, persist as exclusions, and are retried on Refresh', async () => {
  const h = history();
  let repaired = false;
  const requested: string[] = [];
  const api = async <T>(body: Record<string, unknown>): Promise<T> => {
    if (body.action === 'ids') return ['LA2_1', 'LA2_2'] as T;
    requested.push(String(body.id));
    const game = match(Number(String(body.id).split('_')[1]));
    if (body.id === 'LA2_1' && !repaired) {
      game.info.participants = [];
      game.info.gameStartTimestamp = 0;
      game.info.gameCreation = 0;
    }
    return game as T;
  };
  await importHistory(h, api, async () => {});
  assert.equal(h.matches.length, 1);
  assert.deepEqual(h.excluded, ['LA2_1']);
  assert.equal(historySummary(h).coverage.missing, 0);
  assert.equal(historySummary(h).coverage.complete, true);
  assert.doesNotMatch(historySummary(h).coverage.note, /excluded/i);
  assert.deepEqual(parseHistory(structuredClone(h)), h);
  await importHistory(h, api, async () => {});
  assert.deepEqual(h.excluded, ['LA2_1']);
  repaired = true;
  await importHistory(h, api, async () => {});
  assert.deepEqual(requested, ['LA2_1', 'LA2_2', 'LA2_1', 'LA2_1']);
  assert.equal(h.matches.length, 2);
  assert.deepEqual(h.excluded, []);
  assert.equal(historySummary(h).coverage.complete, true);
  assert.throws(() => parseHistory({ ...h, excluded: ['LA2_1'] }));
  assert.throws(() => parseHistory({ ...h, excluded: ['LA2_999'] }));
});

test('out-of-year records do not stop later downloads or enter the saved year', async () => {
  const h = history();
  const games = [match(1), match(2), match(3), match(4)];
  games[0].info.gameStartTimestamp = yearStart(year) * 1000 - 1;
  games[1].info.gameStartTimestamp = yearStart(year + 1) * 1000;
  games[2].info.gameStartTimestamp = yearStart(year) * 1000;
  let saved: History | undefined;
  await importHistory(h, async <T>(body: Record<string, unknown>) =>
    (body.action === 'ids' ? games.map(m => m.metadata.matchId)
      : games.find(m => m.metadata.matchId === body.id)) as T,
  async value => { saved = structuredClone(value); });
  assert.deepEqual(h.excluded, ['LA2_1', 'LA2_2']);
  assert.deepEqual(h.matches.map(m => m.metadata.matchId), ['LA2_3', 'LA2_4']);
  assert.equal(historySummary(h).matches, 2);
  assert.equal(historySummary(h).coverage.complete, true);
  assert.deepEqual(parseHistory(saved), h);
});

test('server serializes requests across regions and uses Asia for SEA account lookups', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  let active = 0, peak = 0;
  globalThis.fetch = async (url, options) => {
    urls.push(String(url));
    assert.equal(new Headers(options?.headers).get('X-Riot-Token'), 'synthetic-only');
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    if (String(url).includes('/accounts/')) return Response.json(account);
    if (String(url).includes('/ids?')) return Response.json(['LA2_1']);
    const m = match(1);
    m.metadata.matchId = 'EUW1_1';
    m.info.platformId = 'EUW1';
    return Response.json(m);
  };
  try {
    await Promise.all([
      historyRequest({ action: 'match', platform: 'EUW1', id: 'EUW1_1' }, 'synthetic-only'),
      historyRequest({
        action: 'ids', platform: 'LA2', puuid: 'synthetic-puuid', start: 0,
        until: Math.floor(Date.now() / 1000)
      }, 'synthetic-only'),
      historyRequest({ action: 'account', platform: 'SG2', riotId: 'Player#TAG' }, 'synthetic-only')
    ]);
    assert.equal(peak, 1);
    assert.ok(urls[0].startsWith('https://europe.api.riotgames.com/lol/match/'));
    assert.ok(urls[1].startsWith('https://americas.api.riotgames.com/lol/match/'));
    const query = new URL(urls[1]).searchParams;
    assert.equal(query.get('startTime'), String(yearStart(year)));
    assert.ok(Number(query.get('endTime')) <= Math.floor(Date.now() / 1000));
    assert.ok(Number(query.get('endTime')) >= yearStart(year));
    assert.equal(query.get('start'), '0');
    assert.equal(query.get('count'), '100');
    assert.ok(urls[2].startsWith('https://asia.api.riotgames.com/riot/account/'));
  } finally { globalThis.fetch = original; }
});
