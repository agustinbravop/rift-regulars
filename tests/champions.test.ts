import assert from 'node:assert/strict';
import { test } from 'node:test';
import { championLabel, championName } from '../src/lib/champions.ts';

test('displays champion names without changing portrait IDs', () => {
  for (const [id, label] of [
    ['JarvanIV', 'Jarvan IV'],
    ['MonkeyKing', 'Wukong'],
    ['Nunu', 'Nunu & Willump'],
    ['Renata', 'Renata Glasc'],
    ['KSante', "K'Sante"],
    ['Kaisa', "Kai'Sa"],
    ['Leblanc', 'LeBlanc'],
    ['DrMundo', 'Dr. Mundo']
  ]) {
    assert.equal(championLabel(id), label);
    assert.equal(championName(id), id);
  }
  assert.equal(championLabel('FiddleSticks'), 'Fiddlesticks');
  assert.equal(championLabel('Ahri'), 'Ahri');
  assert.equal(championLabel('Unknown'), 'Unknown');
});
