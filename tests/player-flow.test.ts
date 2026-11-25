import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { playerUrl } from '../src/lib/player-url.ts';
import { HistoryApiError, requestHistory } from '../src/lib/history-api.ts';
import { Riot, RiotError } from '../src/lib/server/riot.ts';
import { account } from './fixtures.ts';
import { parseDiscovery } from '../src/lib/validation.ts';

test('search feedback uses one persistent toaster and retains accessible input errors', async () => {
  const layout = await readFile(new URL('../src/routes/+layout.svelte', import.meta.url), 'utf8');
  const search = await readFile(new URL('../src/lib/components/PlayerSearch.svelte', import.meta.url), 'utf8');
  assert.equal((layout.match(/<Toaster\b/g) ?? []).length, 1);
  assert.ok(layout.indexOf('<Toaster') < layout.indexOf('{#key'));
  assert.ok(search.includes("toast.error(error, { id: 'player-search-error' })"));
  assert.ok(search.includes("toast.dismiss('player-search-error')"));
  assert.ok(search.includes("toast.warning(recentStorageError, { id: 'recent-players-storage' })"));
  assert.ok(search.includes('<p id="lookup-error" class="sr-only">{error}</p>'));
  assert.ok(!search.includes('class="recent-storage-error"'));
});

test('the full-height shell keeps the footer after content and cache loading retains dashboard controls', async () => {
  const layout = await readFile(new URL('../src/routes/+layout.svelte', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/routes/layout.css', import.meta.url), 'utf8');
  const player = await readFile(new URL('../src/routes/player/[riotId]/+page.svelte', import.meta.url), 'utf8');
  assert.match(layout, /class="site-shell"[\s\S]*class="site-content"[\s\S]*@render children\(\)[\s\S]*<SiteFooter/);
  assert.match(css, /\.site-shell\s*\{[^}]*min-height: 100dvh;[^}]*display: flex;[^}]*flex-direction: column;/);
  assert.match(css, /\.site-content\s*\{[^}]*flex: 1;/);
  assert.match(player, /\{#if scanning && !checkingCache\}[\s\S]*\{:else\}\s*<section class="workspace-intro">/);
  assert.ok(player.includes('disabled={checkingCache || busy || !ready}'));
  assert.match(player, /class="roster-filters"[\s\S]*\{#if checkingCache\}\s*<p class="sr-only" role="status">Opening saved history/);
});

test('expanded details widen desktop gutters from the sidebar without reducing table width', async () => {
  const css = await readFile(new URL('../src/routes/layout.css', import.meta.url), 'utf8');
  const match = css.match(/\.expanded-details \{[^}]*grid-template-columns: minmax\((\d+)px, (\d+)px\) 1px minmax\(0, 1fr\); gap: (\d+)px;/);
  assert.ok(match);
  const [, min, max, gap] = match.map(Number);
  assert.equal(gap, 24);
  assert.equal(min, 204);
  assert.equal(max, 254);
  assert.equal(min + gap * 2, 220 + 16 * 2);
  assert.equal(max + gap * 2, 270 + 16 * 2);
  assert.match(css, /\.expanded-details \{ grid-template-columns: 1fr; gap: 28px;/);
});

test('cache loading shares real table headers and preserves all seven columns with skeleton rows', async () => {
  const player = await readFile(new URL('../src/routes/player/[riotId]/+page.svelte', import.meta.url), 'utf8');
  assert.equal((player.match(/<Table.Header>/g) ?? []).length, 1);
  assert.ok(player.includes('aria-busy={checkingCache}'));
  assert.ok(player.includes('disabled={checkingCache || !ready}'));
  const skeletonRows = player.slice(player.indexOf('<Table.Body>'), player.indexOf('{:else if summary}'));
  assert.ok(skeletonRows.includes('{ length: 8 }'));
  assert.ok(skeletonRows.includes('data-player-row aria-hidden="true"'));
  assert.equal((skeletonRows.match(/<Table.Cell\b/g) ?? []).length, 7);
  assert.match(player, /class="roster-pagination">\s*\{#if checkingCache\}[\s\S]*<Skeleton/);
});

test('player URLs put the complete Riot ID in one encoded path segment', () => {
  assert.equal(playerUrl('Agus Brr#ARG'), '/player/Agus%20Brr%23ARG');
  const url = new URL(playerUrl('Player / ?#EUW'), 'https://example.com');
  assert.equal(url.pathname.split('/').length, 3);
  assert.equal(decodeURIComponent(url.pathname.split('/')[2]), 'Player / ?#EUW');
  assert.equal(url.search, '');
  assert.equal(url.hash, '');
  assert.throws(() => playerUrl('Missing tag'));
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

test('submitted searches discover without posting a server and preserve distinct discovery errors', async () => {
  const discovered = { account: { ...account, puuid: 'synthetic-puuid' }, platform: 'NA1' };
  const resolved = parseDiscovery(await requestHistory({ action: 'discover', riotId: 'Agus Brr#ARG' },
    async (_url, options) => {
      assert.deepEqual(JSON.parse(String(options?.body)), { action: 'discover', riotId: 'Agus Brr#ARG' });
      return Response.json(discovered);
    }));
  assert.deepEqual(resolved, discovered);
  for (const message of ['Player not found. Check the player name and #TAG.', 'This account has no active League of Legends region.']) {
    await assert.rejects(requestHistory({ action: 'discover' },
      async () => Response.json({ error: message }, { status: 404 })),
    e => e instanceof HistoryApiError && e.status === 404 && e.message === message);
  }
  assert.throws(() => parseDiscovery({ ...discovered, platform: '__proto__' }));
  assert.throws(() => parseDiscovery({ ...discovered, account: { ...account, puuid: 'invalid' } }));
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
