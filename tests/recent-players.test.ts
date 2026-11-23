import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterRecentPlayers, parseRecentPlayers, rememberPlayer, type RecentPlayer } from '../src/lib/recent-players.ts';

const player = (id: string, name = id): RecentPlayer => ({
  account: { puuid: id, gameName: name, tagLine: 'TAG' }, platform: 'LA2'
});

test('remembers every successful lookup without a five-player limit, newest first', () => {
  let players: RecentPlayer[] = [];
  for (let i = 0; i < 100; i++) players = rememberPlayer(players, player(String(i)));
  assert.equal(players.length, 100);
  assert.equal(players[0].account.puuid, '99');
  assert.equal(players.at(-1)?.account.puuid, '0');
  assert.deepEqual(parseRecentPlayers(JSON.stringify(players)), players);
});

test('deduplicates by PUUID and server, updates changed names, and preserves other entries', () => {
  const original = [player('one'), { ...player('one'), platform: 'EUW1' as const }, player('two')];
  const updated = rememberPlayer(original, player('one', 'New name'));
  assert.equal(updated.length, 3);
  assert.equal(updated[0].account.gameName, 'New name');
  assert.equal(updated[1].platform, 'EUW1');
  assert.equal(original[0].account.gameName, 'one');
});

test('filters all saved players by name or tag without changing their recent order', () => {
  const players = [player('one', 'Agus Brr'), player('two', 'Other')];
  players[1].account.tagLine = 'EUW';
  assert.deepEqual(filterRecentPlayers(players, '  AGUS '), [players[0]]);
  assert.deepEqual(filterRecentPlayers(players, '#euw'), [players[1]]);
  assert.deepEqual(filterRecentPlayers(players, ''), players);
  assert.deepEqual(filterRecentPlayers(players, 'missing'), []);
});

test('empty storage is accepted, corrupt or duplicate entries are rejected', () => {
  assert.deepEqual(parseRecentPlayers(null), []);
  for (const raw of ['broken', '{}', '[null]', JSON.stringify([{
    account: player('one').account, platform: '__proto__'
  }]), JSON.stringify([player('one'), player('one')])]) {
    assert.throws(() => parseRecentPlayers(raw));
  }
});
