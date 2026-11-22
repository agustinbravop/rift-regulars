import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterPlayers, record, resultSummary, stats, summarize, yearStart } from '../src/lib/encounters.ts';
import { parseAccount, parseMatch, parseMatchIds, parseSummary } from '../src/lib/server/validation.ts';
import { account, coverage, match, year } from './fixtures.ts';

const summary = (matches = [match(1), match(2, false, 450)]) =>
  summarize(account, matches, year, { '420': 'Ranked solo', '450': 'ARAM' }, coverage);

test('normalizes Fiddlesticks for new imports and existing saved summaries', () => {
  const matches = [match(1), match(2)];
  for (const m of matches) {
    m.info.participants[0].championName = 'FiddleSticks';
    m.info.participants[1].championName = 'FiddleSticks';
  }
  const result = summary(matches);
  assert.ok(result.players[0].encounters.every(e => e.champion === 'Fiddlesticks' && e.myChampion === 'Fiddlesticks'));
  const saved = JSON.parse(JSON.stringify(result).replaceAll('Fiddlesticks', 'FiddleSticks'));
  assert.deepEqual(parseSummary(saved), result);
  assert.equal(summary().players[0].encounters[0].champion, match(2).info.participants[1].championName);
});

test('combines queues and sides, excludes self, singles, duplicate matches and duplicate participants', () => {
  const first = match(1);
  first.info.participants.push(first.info.participants[1]);
  const result = summary([first, first, match(2, false, 450), match(3)]);
  assert.equal(result.matches, 3);
  assert.equal(result.players.length, 1);
  const player = result.players[0];
  assert.equal(player.id, 'friend');
  assert.equal(player.encounters.length, 3);
  assert.equal(stats(player.encounters).together.length, 2);
  assert.deepEqual(new Set(player.encounters.map(e => e.queue)), new Set(['420', '450']));
});

test('includes January 1 UTC, excludes last year, next year, and non-LAS matches', () => {
  const previous = match(1), boundary = match(2), next = match(3), foreign = match(4);
  previous.info.gameStartTimestamp = (yearStart(year) - 1) * 1000;
  boundary.info.gameStartTimestamp = yearStart(year) * 1000;
  next.info.gameStartTimestamp = yearStart(year + 1) * 1000;
  foreign.info.platformId = 'NA1';
  const result = summary([previous, boundary, next, foreign]);
  assert.equal(result.matches, 1);
  assert.equal(result.earliest, yearStart(year) * 1000);
});

test('uses Arena subteams, keeps latest available name, sorts by recency', () => {
  const first = match(1), second = match(2);
  for (const m of [first, second]) {
    m.info.participants[0].playerSubteamId = 1;
    m.info.participants[1].playerSubteamId = 2;
  }
  second.info.participants[1].riotIdGameName = 'New name';
  const player = summary([second, first]).players[0];
  assert.equal(player.name, 'New name');
  assert.ok(player.encounters.every(e => !e.together));
  assert.equal(player.encounters[0].match, 'LA2_2');
});

test('does not invent wins or accept a game without the tracked player', () => {
  const first = match(1), missing = match(3);
  delete first.info.participants[0].win;
  missing.info.participants = [];
  const result = summary([first, match(2), missing]);
  assert.equal(result.matches, 2);
  assert.equal(result.players[0].encounters[1].win, null);
  assert.equal(record(result.players[0].encounters), '1W / 0L / 1 unknown');
});

test('queue filter requires two encounters inside that queue and preserves both sides', () => {
  const result = summary();
  assert.equal(filterPlayers(result.players, '', '420').length, 0);
  const both = filterPlayers(result.players, ' <ONE> ', 'all');
  assert.equal(both.length, 1);
  assert.equal(both[0].encounters.length, 2);
  assert.equal(stats(both[0].encounters).together.length, 1);
  assert.equal(stats(both[0].encounters).against.length, 1);
  assert.equal(filterPlayers(result.players, 'missing', 'all').length, 0);
});

test('Riot remake flags on either team preserve encounters but exclude their outcomes', () => {
  const win = match(1), loss = match(2), remakeWin = match(3), remakeLoss = match(4, false);
  loss.info.participants[0].win = false;
  remakeWin.info.participants[1].gameEndedInEarlySurrender = true;
  remakeLoss.info.participants[0].gameEndedInEarlySurrender = true;
  remakeLoss.info.participants[0].win = false;
  const result = summary([win, loss, remakeWin, remakeLoss]);
  const events = result.players[0].encounters;
  assert.equal(events.length, 4);
  assert.equal(result.matches, 4);
  assert.ok(events.slice(0, 2).every(e => e.remake && e.win === null));
  assert.deepEqual(resultSummary(events), { wins: 1, losses: 1, unknown: 0, remakes: 2, winRate: 50 });
  assert.equal(record(events), '1W / 1L / 2 remakes');
  assert.equal(resultSummary(events.slice(0, 2)).winRate, null);
  assert.equal(record([events[0]]), '0W / 0L / 1 remake');
  assert.deepEqual(resultSummary([
    { ...events[0], win: true }, { ...events[1], win: false },
    { ...events[2], remake: false, win: null }
  ]), { wins: 0, losses: 0, unknown: 1, remakes: 2, winRate: null });
  assert.equal(filterPlayers(result.players, '', 'all')[0].encounters.length, 4);
  assert.deepEqual(parseSummary(JSON.parse(JSON.stringify(result))), result);
  assert.throws(() => parseSummary({ ...result, players: [{ ...result.players[0], encounters: events.map(e => ({ ...e, remake: 'yes' })) }] }));
  const invalid = match(5);
  (invalid.info.participants[0] as unknown as Record<string, unknown>).gameEndedInEarlySurrender = 'yes';
  assert.throws(() => parseMatch(invalid));
});

test('last seen includes the cutoff and preserves older encounters within the selected queue', () => {
  const result = summary([match(1), match(2), match(3, false, 450)]);
  const player = result.players[0];
  const latest = player.encounters[0].at;
  const queueLatest = player.encounters[1].at;
  assert.equal(filterPlayers(result.players, '', 'all', true, [], latest)[0].encounters.length, 3);
  assert.equal(filterPlayers(result.players, '', 'all', true, [], latest + 1).length, 0);
  assert.equal(filterPlayers(result.players, '', '420', true, [], queueLatest)[0].encounters.length, 2);
  assert.equal(filterPlayers(result.players, '', '420', true, [], queueLatest + 1).length, 0);
  assert.equal(filterPlayers([], '', 'all', true, [], latest).length, 0);
});

test('validates API shapes and prevents match IDs from becoming file paths', () => {
  assert.deepEqual(parseAccount(account), account);
  assert.deepEqual(parseMatch(match(1), 'LA2_1'), match(1));
  assert.throws(() => parseMatchIds(['../../.env']));
  assert.throws(() => parseMatchIds(['LA2_1/../../secret']));
  assert.throws(() => parseAccount({ puuid: 1 }));
  assert.throws(() => parseMatch(match(1), 'LA2_2'));
  assert.throws(() => parseMatch({ metadata: {}, info: { participants: [] } }));
});

test('keeps match-time summoner icons with each encounter and follows the selected queue', () => {
  const first = match(1), second = match(2), latest = match(3, false, 450);
  first.info.participants[1].profileIcon = 0;
  second.info.participants[1].profileIcon = 42;
  latest.info.participants[1].profileIcon = 99;
  const result = summary([latest, first, second]);
  assert.equal(result.players[0].encounters[0].profileIcon, 99);
  assert.equal(filterPlayers(result.players, '', '420')[0].encounters[0].profileIcon, 42);
  assert.equal(result.players[0].encounters[2].profileIcon, 0);
  assert.deepEqual(parseSummary(JSON.parse(JSON.stringify(result))), result);
  for (const invalid of [-1, 1.5, '../icon', null]) {
    const bad = structuredClone(latest);
    (bad.info.participants[1] as unknown as Record<string, unknown>).profileIcon = invalid;
    assert.throws(() => parseMatch(bad));
    const badSummary = structuredClone(result);
    (badSummary.players[0].encounters[0] as unknown as Record<string, unknown>).profileIcon = invalid;
    assert.throws(() => parseSummary(badSummary));
  }
  assert.equal(summary().players[0].encounters[0].profileIcon, undefined);
});

test('keeps both players K/D/A and accepts older summaries without your K/D/A', () => {
  const first = match(1), second = match(2);
  for (const m of [first, second]) {
    Object.assign(m.info.participants[0], { kills: 4, deaths: 5, assists: 9 });
    Object.assign(m.info.participants[1], { kills: 8, deaths: 3, assists: 12 });
  }
  const value = summary([first, second]);
  for (const e of value.players[0].encounters) {
    assert.deepEqual(e.kda, [8, 3, 12]);
    assert.deepEqual(e.myKda, [4, 5, 9]);
  }
  assert.deepEqual(parseSummary(structuredClone(value)), value);
  for (const invalid of [null, '4/5/9', [4, 5], [4, 5, '9'], [4, 5, Infinity]]) {
    const bad = structuredClone(value);
    (bad.players[0].encounters[0] as unknown as Record<string, unknown>).myKda = invalid;
    assert.throws(() => parseSummary(bad));
  }
  for (const e of value.players[0].encounters) delete e.myKda;
  assert.deepEqual(parseSummary(structuredClone(value)), value);
});

test('reads the existing summary format and rejects corrupt saved data', () => {
  const value = summary();
  assert.deepEqual(parseSummary(JSON.parse(JSON.stringify(value))), value);
  assert.throws(() => parseSummary({ ...value, players: [{}] }));
  assert.throws(() => parseSummary({ ...value, coverage: null }));
});
