import assert from 'node:assert/strict';
import { test } from 'node:test';
import { participantRole, type Role } from '../src/lib/roles.ts';
import { summarize } from '../src/lib/encounters.ts';
import { parseMatch, parseSummary } from '../src/lib/server/validation.ts';
import { account, coverage, match, year } from './fixtures.ts';

test('maps recorded positions and leaves unknown roles unset', () => {
  for (const [position, role] of [
    ['TOP', 'top'], ['JUNGLE', 'jungle'], ['MIDDLE', 'mid'],
    ['BOTTOM', 'bot'], ['UTILITY', 'support']
  ]) {
    assert.equal(participantRole({ teamId: 100, teamPosition: position }), role);
  }
  assert.equal(participantRole({ teamId: 100, teamPosition: 'UTILITY', individualPosition: 'BOTTOM' }), 'support');
  assert.equal(participantRole({ teamId: 100, teamPosition: '', individualPosition: 'MIDDLE' }), 'mid');
  for (const teamPosition of [undefined, '', 'Invalid', 'NONE', 'toString']) {
    assert.equal(participantRole({ teamId: 100, teamPosition }), undefined);
  }
});

test('imports both roles, reads legacy summaries, and rejects malformed role data', () => {
  const matches = [match(1), match(2)];
  for (const m of matches) {
    m.info.participants[0].teamPosition = 'MIDDLE';
    m.info.participants[1].teamPosition = 'TOP';
  }
  const summary = summarize(account, matches, year, {}, coverage);
  for (const e of summary.players[0].encounters) {
    assert.equal(e.role, 'top');
    assert.equal(e.myRole, 'mid');
  }
  assert.deepEqual(parseSummary(JSON.parse(JSON.stringify(summary))), summary);
  for (const field of ['role', 'myRole'] as const) {
    for (const invalid of ['BOTTOM', '../top', 'toString', null, 1]) {
      const bad = structuredClone(summary);
      bad.players[0].encounters[0][field] = invalid as Role;
      assert.throws(() => parseSummary(bad));
    }
    for (const e of summary.players[0].encounters) delete e[field];
  }
  assert.deepEqual(parseSummary(structuredClone(summary)), summary);
  for (const field of ['teamPosition', 'individualPosition'] as const) {
    const bad = match(1);
    (bad.info.participants[0] as unknown as Record<string, unknown>)[field] = 42;
    assert.throws(() => parseMatch(bad));
  }
  const aram = summarize(account, [match(1, true, 450), match(2, true, 450)], year, {}, coverage);
  assert.ok(aram.players[0].encounters.every(e => !e.role && !e.myRole));
});
