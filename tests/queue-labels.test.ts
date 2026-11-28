import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeQueueLabels } from '../src/lib/server/queue-labels.ts';

test('queue refresh preserves old names, skips blanks, prefers Riot and applies friendly overrides last', () => {
  const result = mergeQueueLabels(
    { 12345: 'Retired queue games', 12346: 'Known queue' },
    [
      { id: 12346, name: '   ' },
      { id: 3200, name: 'Howling Abyss Blind Custom Games' },
      { id: 450, name: 'Client ARAM' },
      { id: 0, name: 'Ambiguous custom mode' }
    ],
    [
      { queueId: 450, description: 'Official ARAM games' },
      { queueId: 0, description: 'Custom games' },
      { queueId: 420, description: 'Ranked Solo games' }
    ]
  );
  assert.equal(result['12345'], 'Retired queue');
  assert.equal(result['12346'], 'Known queue');
  assert.equal(result['3200'], 'Howling Abyss Blind Custom');
  assert.equal(result['450'], 'Official ARAM');
  assert.equal(result['0'], 'Custom');
  assert.equal(result['420'], 'Ranked Solo/Duo');
});

test('queue refresh rejects invalid metadata before replacing the saved map', () => {
  const riot = [{ queueId: 450, description: 'ARAM' }];
  for (const community of [
    [], {}, [{ id: -1, name: 'Invalid' }], [{ id: '3200', name: 'Invalid' }],
    [{ id: 3200, name: {} }], [{ id: 3200, name: 'x'.repeat(301) }],
    [{ id: 3200, name: '' }]
  ]) assert.throws(() => mergeQueueLabels({}, community, riot));
  assert.throws(() => mergeQueueLabels({}, [{ id: 3200, name: 'Custom' }], []));
});
