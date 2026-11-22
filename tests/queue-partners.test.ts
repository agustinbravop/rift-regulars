import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterPlayers, summarize } from '../src/lib/encounters.ts';
import { parseQueuePartners, premadeIds } from '../src/lib/queue-partners.ts';
import { account, coverage, match, year } from './fixtures.ts';

test('queue-partner marks default empty, round-trip by stable ID, and deduplicate', () => {
  assert.deepEqual(parseQueuePartners(null), []);
  const ids = ['partner-puuid', 'another-puuid', 'partner-puuid'];
  assert.deepEqual(parseQueuePartners(JSON.stringify(ids)), ['partner-puuid', 'another-puuid']);
});

test('invalid saved marks are rejected rather than silently overwritten', () => {
  for (const raw of ['invalid json', '{}', 'null', '[1]', '[""]', '["valid", null]']) {
    assert.throws(() => parseQueuePartners(raw));
  }
});

test('include premade toggle uses the supplied marks', () => {
  const player = summarize(account, [match(1), match(2, false, 450)], year, {}, coverage).players[0];
  const players = [player, { ...player, id: 'other', name: 'Other player' }];
  assert.equal(filterPlayers(players, '', 'all').length, 2);
  assert.equal(filterPlayers(players, '', 'all', false, []).length, 2);
  assert.deepEqual(filterPlayers(players, '', 'all', false, [player.id]).map(p => p.id), ['other']);
  assert.equal(filterPlayers(players, '', 'all', true, [player.id]).length, 2);
  assert.equal(filterPlayers(players, '', 'all', false, ['unknown-id']).length, 2);
});

test('automatically marks five or more teammate-only games and respects manual overrides', () => {
  const player = summarize(account, [1, 2, 3, 4, 5].map(id => match(id)), year, {}, coverage).players[0];
  assert.deepEqual(premadeIds([player], [], []), [player.id]);
  assert.deepEqual(premadeIds([{ ...player, encounters: player.encounters.slice(0, 4) }], [], []), []);
  const six = summarize(account, [1, 2, 3, 4, 5, 6].map(id => match(id)), year, {}, coverage).players[0];
  assert.deepEqual(premadeIds([six], [], []), [six.id]);
  const mixed = summarize(account, [...[1, 2, 3, 4, 5].map(id => match(id)), match(6, false, 450)], year, {}, coverage).players[0];
  assert.deepEqual(premadeIds([mixed], [], []), []);
  assert.deepEqual(premadeIds([mixed], [mixed.id], []), [mixed.id]);
  assert.deepEqual(premadeIds([player], [player.id], [player.id]), []);
  assert.deepEqual(premadeIds([player], [player.id], []), [player.id]);
});

test('marks hide the entire player including opponent games and combine with other filters', () => {
  const player = summarize(account, [match(1), match(2, false, 450), match(3)], year, {}, coverage).players[0];
  assert.equal(filterPlayers([player], '', 'all', false, [player.id]).length, 0);
  assert.equal(filterPlayers([player], '', '420', true, [player.id])[0].encounters.length, 2);
  assert.equal(filterPlayers([player], '', '450', true, [player.id]).length, 0);
  assert.equal(filterPlayers([player], 'missing', 'all', true, [player.id]).length, 0);
  assert.equal(filterPlayers([player], '', 'all', true, [player.id])[0].encounters.length, 3);
});
