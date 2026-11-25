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

test('automatic premades require at least five together and strictly more than 95% together', () => {
  const base = summarize(account, [match(1), match(2)], year, {}, coverage).players[0];
  for (const [together, against, qualifies] of [
    [0, 0, false], [4, 0, false], [5, 0, true], [6, 0, true],
    [19, 1, false], [20, 1, true], [18, 1, false], [5, 1, false]
  ] as const) {
    const player = { ...base, encounters: Array.from({ length: together + against }, (_, index) => ({
      ...base.encounters[0], match: `LA2_${index + 1}`, together: index < together,
      queue: index < together ? '420' : '450', remake: index >= together
    })) };
    assert.deepEqual(premadeIds([player], [], []), qualifies ? [player.id] : [],
      `${together} together / ${against} against, including opponent remakes in another queue`);
  }
});

test('manual overrides retain precedence, identity order and deduplication for mixed histories', () => {
  const games = Array.from({ length: 20 }, (_, index) => match(index + 1));
  const automatic = {
    ...summarize(account, [...games, match(21, false, 450)], year, {}, coverage).players[0],
    id: 'automatic'
  };
  const mixed = { ...automatic, id: 'manual-only', encounters: automatic.encounters.slice(0, 6)
    .map((encounter, index) => ({ ...encounter, together: index < 5 })) };
  assert.deepEqual(premadeIds([automatic, mixed], [], []), ['automatic']);
  assert.deepEqual(premadeIds([automatic, mixed], ['manual-only', 'manual-only', 'unknown'], []),
    ['manual-only', 'unknown', 'automatic']);
  assert.deepEqual(premadeIds([automatic, mixed], ['manual-only'], ['automatic']), ['manual-only']);
  assert.deepEqual(premadeIds([automatic, mixed], ['automatic', 'manual-only'], ['automatic', 'manual-only']), []);
});

test('marks hide the entire player including opponent games and combine with other filters', () => {
  const player = summarize(account, [match(1), match(2, false, 450), match(3)], year, {}, coverage).players[0];
  assert.equal(filterPlayers([player], '', 'all', false, [player.id]).length, 0);
  assert.equal(filterPlayers([player], '', '420', true, [player.id])[0].encounters.length, 2);
  assert.equal(filterPlayers([player], '', '450', true, [player.id]).length, 0);
  assert.equal(filterPlayers([player], 'missing', 'all', true, [player.id]).length, 0);
  assert.equal(filterPlayers([player], '', 'all', true, [player.id])[0].encounters.length, 3);
});
