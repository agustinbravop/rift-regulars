import assert from 'node:assert/strict';
import { test } from 'node:test';
import { championRowsThatFit, matchUrl, sortMatches, type MatchSort } from '../src/lib/match-history.ts';
import type { Encounter } from '../src/lib/types.ts';

test('sorts match columns in both directions before limiting rows, without mutating history', () => {
  const events: Encounter[] = [
    { match: 'LA2_10', at: 2, queue: '450', champion: 'MonkeyKing', myChampion: 'Lux', win: false, together: false, kda: [1, 2, 3] },
    { match: 'LA2_2', at: 3, queue: '420', champion: 'Ahri', myChampion: 'JarvanIV', win: true, together: true, kda: [4, 5, 6] },
    { match: 'LA2_3', at: 1, queue: '450', champion: 'Zed', myChampion: 'Ashe', win: null, remake: true, together: true, kda: [0, 0, 0] },
    { match: 'LA2_4', at: 0, queue: '450', champion: 'Lux', myChampion: 'Zed', win: null, together: true, kda: [0, 0, 0] }
  ];
  const original = structuredClone(events);
  const expected: Record<MatchSort, string[]> = {
    champion: ['LA2_2', 'LA2_4', 'LA2_10', 'LA2_3'],
    myChampion: ['LA2_3', 'LA2_2', 'LA2_10', 'LA2_4'],
    result: ['LA2_2', 'LA2_10', 'LA2_3', 'LA2_4'],
    queue: ['LA2_10', 'LA2_3', 'LA2_4', 'LA2_2'],
    at: ['LA2_4', 'LA2_3', 'LA2_10', 'LA2_2'],
    match: ['LA2_2', 'LA2_3', 'LA2_4', 'LA2_10']
  };
  const queues = { '450': 'ARAM', '420': 'Ranked Solo/Duo' };
  for (const column of Object.keys(expected) as MatchSort[]) {
    assert.deepEqual(sortMatches(events, column, 'asc', queues).map(e => e.match), expected[column]);
    if (column !== 'queue') {
      assert.deepEqual(sortMatches(events, column, 'desc', queues).map(e => e.match), [...expected[column]].reverse());
    }
  }
  assert.deepEqual(sortMatches(events, 'queue', 'desc', queues).map(e => e.match), ['LA2_2', 'LA2_10', 'LA2_3', 'LA2_4']);
  assert.deepEqual(events, original);
  assert.deepEqual(sortMatches([], 'at', 'desc', queues), []);
});

test('links supported regions to League of Graphs without accepting malformed IDs', () => {
  assert.equal(matchUrl('LA2_1584158803'), 'https://www.leagueofgraphs.com/match/las/1584158803');
  assert.equal(matchUrl('NA1_123'), 'https://www.leagueofgraphs.com/match/na/123');
  for (const id of ['UNKNOWN_123', 'LA2_123/path', 'javascript:alert(1)', 'LA2_']) {
    assert.equal(matchUrl(id), undefined);
  }
});

test('fits as many champion rows as possible, reserving a summary only for overflow', () => {
  assert.equal(championRowsThatFit(500, 200, 5, 6), 5);
  assert.equal(championRowsThatFit(500, 200, 6, 6), 4);
  assert.equal(championRowsThatFit(0, 200, 7, 7), 3);
  assert.equal(championRowsThatFit(200, 200, 0, 0), 0);
  assert.equal(championRowsThatFit(248, 200, 1, 6), 1);
  assert.equal(championRowsThatFit(508, 200, 6, 6), 5);
  assert.equal(championRowsThatFit(507, 200, 6, 6), 4);
  assert.equal(championRowsThatFit(528, 200, 6, 6), 6);
});

test('always shows fewer than five champions when the match list needs no shortening', () => {
  assert.equal(championRowsThatFit(200, 200, 2, 2), 2);
  assert.equal(championRowsThatFit(200, 200, 4, 5), 4);
  assert.equal(championRowsThatFit(200, 200, 4, 6), 4);
  assert.equal(championRowsThatFit(200, 200, 4, 7), 3);
  assert.equal(championRowsThatFit(200, 200, 5, 5), 3);
});
