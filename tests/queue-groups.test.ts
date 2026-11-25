import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { ScriptTarget, transpile } from 'typescript';
import { countQueues, filterPlayers, queueGroup, resultSummary, stats, summarize } from '../src/lib/encounters.ts';
import { queueLabel, recentChampions, rosterPage, sortPlayers, type PlayerSort } from '../src/lib/scouting.ts';
import { sortMatches, type MatchSort } from '../src/lib/match-history.ts';
import { compactMatch, historySummary, type History } from '../src/lib/history.ts';
import { parseHistory } from '../src/lib/browser-cache.ts';
import { account, coverage, match, year } from './fixtures.ts';

const labels = { 1740: 'BraveryArena', 1750: 'Regular Arena', 420: 'Ranked games' };

test('only Bravery Arena 1740 is grouped into regular Arena 1750 for display', () => {
  assert.equal(queueGroup('1740'), '1750');
  assert.equal(queueGroup('1750'), '1750');
  assert.equal(queueLabel('1740', labels), 'Arena');
  assert.equal(queueLabel('1750', labels), 'Arena');
  assert.equal(queueLabel('420', labels), 'Ranked Solo/Duo');
  for (const id of ['1700', '1710', '450']) assert.equal(queueGroup(id), id);
  assert.equal(queueLabel('1700', { 1700: 'Unchanged metadata' }), 'Unchanged metadata');
});

test('Arena filters combine both queues before repeat threshold, retaining sides, champions and latest icons', () => {
  const games = [match(1, true, 1740), match(2, false, 1750), match(3, true, 420), match(4, true, 420)];
  Object.assign(games[0].info.participants[1], { championName: 'Annie', profileIcon: 11 });
  Object.assign(games[1].info.participants[1], { championName: 'Garen', profileIcon: 22 });
  const players = summarize(account, games, year, labels, coverage).players;
  const before = structuredClone({ games, players, labels });
  const regular = filterPlayers(players, '', '1750');
  assert.deepEqual(filterPlayers(players, '', '1740'), regular);
  assert.equal(regular.length, 1);
  const events = regular[0].encounters;
  assert.deepEqual(events.map(event => event.queue), ['1750', '1740']);
  assert.deepEqual(events.map(event => event.match), ['LA2_2', 'LA2_1']);
  assert.equal(stats(events).together.length, 1);
  assert.equal(stats(events).against.length, 1);
  assert.equal(resultSummary(events).wins, 2);
  assert.deepEqual(recentChampions(events), ['Garen', 'Annie']);
  assert.equal(events[0].profileIcon, 22);
  assert.equal(filterPlayers(players, '', 'all')[0].encounters.length, 4);
  assert.deepEqual(filterPlayers(players, '', '420')[0].encounters.map(event => event.queue), ['420', '420']);
  const counts = countQueues(players[0].encounters);
  assert.deepEqual([...counts], [['420', 2], ['1750', 2]]);
  assert.deepEqual([...counts.keys()].map(id => queueLabel(id, labels)), ['Ranked Solo/Duo', 'Arena']);
  assert.deepEqual(sortMatches(players[0].encounters, 'queue', 'asc', labels).map(event => event.match),
    ['LA2_2', 'LA2_1', 'LA2_4', 'LA2_3']);
  assert.deepEqual({ games, players, labels }, before);
});

test('compact saved histories and summaries preserve original queue IDs and metadata', () => {
  const history: History = {
    account, platform: 'LA2', year, ids: ['LA2_1', 'LA2_2'],
    matches: [compactMatch(match(1, true, 1740)), compactMatch(match(2, false, 1750))],
    listed: true, until: Math.floor(Date.now() / 1000), updated: new Date().toISOString(), queues: labels
  };
  const saved = JSON.stringify(history);
  const restored = parseHistory(JSON.parse(saved));
  assert.deepEqual(restored.matches.map(game => game.info.queueId), [1740, 1750]);
  const summary = historySummary(restored);
  assert.deepEqual(summary.players[0].encounters.map(event => event.queue), ['1750', '1740']);
  assert.deepEqual(summary.queues, labels);
  countQueues(summary.players[0].encounters);
  filterPlayers(summary.players, '', '1750');
  assert.equal(JSON.stringify(restored), saved);
});

test('all-queue filtering reuses encounters while queue filtering and downstream sorting leave input untouched', () => {
  const player = summarize(account, [
    match(1, true, 1740), match(2, false, 1750), match(3), match(4)
  ], year, labels, coverage).players[0];
  const players = [{ ...player, id: 'other', name: 'Zed', encounters: player.encounters.slice(1) }, player];
  const before = structuredClone(players);
  for (const p of players) {
    p.encounters.forEach(Object.freeze);
    Object.freeze(p.encounters);
    Object.freeze(p);
  }
  Object.freeze(players);
  const all = filterPlayers(players, '', 'all');
  assert.deepEqual(all, [before[1], before[0]]);
  assert.notEqual(all, players);
  for (const p of all) {
    assert.equal(p.encounters, players.find(source => source.id === p.id)!.encounters);
    for (const column of ['champion', 'myChampion', 'result', 'queue', 'at', 'match'] satisfies MatchSort[]) {
      for (const direction of ['asc', 'desc'] as const) {
        assert.notEqual(sortMatches(p.encounters, column, direction, labels), p.encounters);
      }
    }
    countQueues(p.encounters);
    recentChampions(p.encounters);
  }
  for (const column of ['name', 'encounters', 'playedWith', 'playedAgainst', 'lastOn', 'lastSeen'] satisfies PlayerSort[]) {
    for (const direction of ['asc', 'desc'] as const) rosterPage(sortPlayers(all, column, direction), 0);
  }
  const arena = filterPlayers(players, '', '1750');
  assert.deepEqual(filterPlayers(players, '', '1740'), arena);
  for (const p of arena) {
    const original = players.find(source => source.id === p.id)!;
    assert.notEqual(p.encounters, original.encounters);
    assert.deepEqual(p.encounters, original.encounters.filter(e => queueGroup(e.queue) === '1750'));
    p.encounters.reverse();
  }
  assert.deepEqual(filterPlayers([], '', 'all'), []);
  assert.deepEqual(filterPlayers([], '', '1750'), []);
  assert.deepEqual(players, before);
});

test('player queue options collect grouped keys directly with unchanged ordering and no flattened encounters', async () => {
  const source = await readFile('src/routes/player/[riotId]/+page.svelte', 'utf8');
  const body = source.match(/const queues = \$derived\.by\(\(\) => \{([\s\S]*?)\n  \}\);/)?.[1];
  assert.ok(body);
  assert.doesNotMatch(body, /flatMap|countQueues/);
  const collect = new Function('summary', 'queueGroup', 'queueName', transpile(body, { target: ScriptTarget.ESNext }));
  const queueName = (id: string) => queueLabel(id, labels);
  const players = summarize(account, [
    match(1, true, 1740), match(2, false, 1750), match(3), match(4, true, 450)
  ], year, labels, coverage).players;
  players.push({ ...players[0], id: 'other', encounters: players[0].encounters.slice(0, 2) });
  const before = structuredClone(players);
  const expected = [...countQueues(players.flatMap(p => p.encounters)).keys()]
    .sort((a, b) => queueName(b).localeCompare(queueName(a)));
  assert.deepEqual(collect({ players }, queueGroup, queueName), expected);
  assert.deepEqual(expected, ['420', '450', '1750']);
  for (const summary of [undefined, null, { players: [] }, { players: [{ encounters: [] }] }]) {
    assert.deepEqual(collect(summary, queueGroup, queueName), []);
  }
  assert.deepEqual(players, before);
});
