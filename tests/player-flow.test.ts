import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playerUrl } from '../src/lib/player-url.ts';
import { HistoryApiError, requestHistory } from '../src/lib/history-api.ts';
import { Riot, RiotError } from '../src/lib/server/riot.ts';
import { account } from './fixtures.ts';

test('player URLs put the complete Riot ID in one encoded path segment', () => {
  assert.equal(playerUrl('Agus Brr#ARG', 'LA2'), '/player/Agus%20Brr%23ARG?server=LA2');
  const url = new URL(playerUrl('Player / ?#EUW', 'EUW1'), 'https://example.com');
  assert.equal(url.pathname.split('/').length, 3);
  assert.equal(decodeURIComponent(url.pathname.split('/')[2]), 'Player / ?#EUW');
  assert.equal(url.searchParams.get('server'), 'EUW1');
  assert.equal(url.hash, '');
  assert.throws(() => playerUrl('Missing tag', 'LA2'));
});

test('account lookup posts the selected server and returns the resolved identity', async () => {
  const resolved = await requestHistory({ action: 'account', riotId: 'Agus Brr#ARG', platform: 'LA2' },
    async (url, options) => {
      assert.equal(url, '/api/history');
      assert.equal(options?.method, 'POST');
      assert.deepEqual(JSON.parse(String(options?.body)), {
        action: 'account', riotId: 'Agus Brr#ARG', platform: 'LA2'
      });
      return Response.json(account);
    });
  assert.deepEqual(resolved, account);
});

test('missing players have a distinct inline error, separate from expired keys and missing matches', async () => {
  await assert.rejects(
    requestHistory({ action: 'account' }, async () => Response.json({ error: 'Account or match not found.' }, { status: 404 })),
    error => error instanceof HistoryApiError && error.status === 404 && error.message.startsWith('Player not found.')
  );
  for (const [action, status, message] of [
    ['account', 403, 'API key was rejected.'],
    ['match', 404, 'Account or match not found.']
  ] as const) {
    await assert.rejects(requestHistory({ action }, async () => Response.json({ error: message }, { status })),
      error => error instanceof HistoryApiError && error.status === status && error.message === message);
  }
});

test('Riot errors retain HTTP status for the proxy without exposing the API key', async () => {
  await assert.rejects(new Riot('private-synthetic-key',
    async () => new Response('', { status: 404 }), async () => {}).get('/test'),
  error => error instanceof RiotError && error.status === 404 &&
    error.message === 'Account or match not found.' && !error.message.includes('private-synthetic-key'));
});
