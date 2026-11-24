import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyRequest } from '../src/lib/server/history.ts';
import { RiotError } from '../src/lib/server/riot.ts';
import { account as fixtureAccount, match } from './fixtures.ts';
import { mergeHistories } from '../src/lib/browser-cache.ts';
import { importHistory } from '../src/lib/import-history.ts';
import { historySummary, type History } from '../src/lib/history.ts';
import { parseDiscovery } from '../src/lib/validation.ts';

const account = { ...fixtureAccount, puuid: 'synthetic-puuid' };

test('discovers without a server, validates upstream identity, and distinguishes lookup failures', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  let accountValue: unknown = account;
  let regionValue: unknown = { puuid: account.puuid, game: 'lol', region: 'euw1' };
  let accountStatus = 200, regionStatus = 200;
  globalThis.fetch = async url => {
    urls.push(String(url));
    const region = String(url).includes('/region/');
    return Response.json(region ? regionValue : accountValue, { status: region ? regionStatus : accountStatus });
  };
  try {
    const input = { action: 'discover', riotId: 'Player#TAG' };
    assert.deepEqual(await historyRequest(input, 'synthetic-only'), { account, platform: 'EUW1' });
    assert.ok(urls.every(url => url.startsWith('https://americas.api.riotgames.com/riot/account/v1/')));
    assert.match(urls[1], /region\/by-game\/lol\/by-puuid\//);
    for (const region of [
      { puuid: 'wrong', game: 'lol', region: 'NA1' },
      { puuid: account.puuid, game: 'valorant', region: 'NA1' },
      { puuid: account.puuid, game: 'lol' }, null
    ]) {
      regionValue = region;
      await assert.rejects(historyRequest(input, 'synthetic-only'), /Unexpected League region/);
    }
    regionValue = { puuid: account.puuid, game: 'lol', region: '__proto__' };
    await assert.rejects(historyRequest(input, 'synthetic-only'), /not supported/);
    regionStatus = 404;
    await assert.rejects(historyRequest(input, 'synthetic-only'),
      e => e instanceof RiotError && e.status === 404 && /no active League/.test(e.message));
    accountStatus = 404;
    await assert.rejects(historyRequest(input, 'synthetic-only'), /Player not found/);
    accountStatus = 403;
    await assert.rejects(historyRequest(input, 'synthetic-only'), /rejected/);
    accountStatus = 200;
    accountValue = { ...account, puuid: '../../bad' };
    await assert.rejects(historyRequest(input, 'synthetic-only'), /Unexpected account identity/);
    const before = urls.length;
    await assert.rejects(historyRequest({ action: 'discover', riotId: 'bad' }, 'synthetic-only'));
    assert.equal(urls.length, before);
  } finally { globalThis.fetch = original; }
});

test('routes match details by allowlisted match prefix, never the active server', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    const game = match(1);
    game.metadata.matchId = 'KR_1';
    game.info.platformId = 'KR';
    return Response.json(game);
  };
  try {
    await historyRequest({ action: 'match', platform: 'LA2', id: 'KR_1' }, 'synthetic-only');
    assert.equal(urls[0], 'https://asia.api.riotgames.com/lol/match/v5/matches/KR_1');
    for (const id of ['FAKE_1', 'KR_1/evil', '__proto___1', 'KR_-1']) {
      await assert.rejects(historyRequest({ action: 'match', id }, 'synthetic-only'));
    }
    assert.equal(urls.length, 1);
  } finally { globalThis.fetch = original; }
});

test('a discovered transfer re-lists the new host while retaining earlier cached platform matches', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  const older = match(1);
  older.info.participants[0].puuid = account.puuid;
  const previous: History = {
    account, platform: 'LA2', year: 2026, ids: ['LA2_1'], matches: [older], listed: true,
    until: Math.floor(Date.now() / 1000), updated: new Date().toISOString(), queues: {}
  };
  globalThis.fetch = async url => {
    const path = String(url);
    urls.push(path);
    if (path.includes('/accounts/')) return Response.json(account);
    if (path.includes('/region/')) return Response.json({ puuid: account.puuid, game: 'lol', region: 'kr' });
    if (path.includes('/ids?')) return Response.json(['KR_2', 'KR_2']);
    const game = match(2);
    game.metadata.matchId = 'KR_2';
    game.info.platformId = 'KR';
    game.info.participants[0].puuid = account.puuid;
    return Response.json(game);
  };
  try {
    const discovered = parseDiscovery(await historyRequest({ action: 'discover', riotId: 'Player#TAG' }, 'synthetic-only'));
    const transferred = mergeHistories([previous], discovered.platform, previous.year, account.puuid, previous);
    assert.equal(historySummary(transferred).coverage.complete, false);
    await importHistory(transferred, async <T>(body: Record<string, unknown>) =>
      await historyRequest({ ...body, platform: transferred.platform }, 'synthetic-only') as T, async () => {});
    assert.equal(historySummary(transferred).coverage.complete, true);
    assert.equal(historySummary(transferred).matches, 2);
    assert.equal(historySummary(transferred).players[0].encounters.length, 2);
    assert.deepEqual(transferred.ids, ['LA2_1', 'KR_2']);
    assert.equal(urls.filter(url => url.includes('/lol/match/')).length, 2);
    assert.ok(urls.filter(url => url.includes('/lol/match/')).every(url => url.startsWith('https://asia.api.riotgames.com/')));
  } finally { globalThis.fetch = original; }
});
