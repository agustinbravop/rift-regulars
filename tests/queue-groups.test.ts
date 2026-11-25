import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countQueues, filterPlayers, queueGroup, resultSummary, stats, summarize } from '../src/lib/encounters.ts';
import { queueLabel, recentChampions } from '../src/lib/scouting.ts';
import { sortMatches } from '../src/lib/match-history.ts';
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
