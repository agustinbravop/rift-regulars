import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { importFeatured, readFeaturedProfile, loadFeatured, featuredCards, featuredPageData, republishFeatured, saveFeaturedHistory } from '../src/lib/server/featured.ts';
import { streamerBadge } from '../src/lib/featured.ts';
import { match } from './fixtures.ts';
import { fetchQueueLabels, readQueueLabels } from '../src/lib/server/queue-labels.ts';
import { yearStart } from '../src/lib/encounters.ts';
import queueNames from '../src/lib/queue-names.json' with { type: 'json' };
import { QUEUE_LABEL_OVERRIDES } from '../src/lib/scouting.ts';

const account = { puuid: 'synthetic-account', gameName: 'Synthetic', tagLine: 'TEST' };
const year = new Date().getUTCFullYear();
const game = (n: number, queue = 420) => {
  const m = match(n, true, queue);
  m.info.participants[0].puuid = account.puuid;
  Object.assign(m.info, { unused: 'must not persist' });
  return m;
};

test('featured persistence compacts, resumes failures, and retains the successful public snapshot', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rift-featured-'));
  try {
    let ids = ['LA2_1', 'LA2_2', 'LA2_3'];
    let failing = false;
    const requested: string[] = [];
    const api = async <T>(body: Record<string, unknown>): Promise<T> => {
      if (body.action === 'discover') return { account, platform: 'LA2' } as T;
      if (body.action === 'ids') return ids as T;
      requested.push(String(body.id));
      if (failing && body.id === 'LA2_5') throw new Error('Synthetic failure');
      return game(Number(String(body.id).split('_')[1]), body.id === 'LA2_3' ? 0 : 420) as T;
    };
    const logs: Record<string, unknown>[] = [];
    await importFeatured('agurin', 'Synthetic#TEST', api, log => logs.push(log), root, () => false,
      { 420: 'Ranked Solo games', 450: 'ARAM games' });
    const privateFile = join(root, `agurin-${year}.private.json.gz`);
    const publicFile = join(root, `agurin-${year}.public.json.gz`);
    const originalPublic = await readFile(publicFile);
    const cardFile = join(root, `agurin-${year}.card.json.gz`);
    const originalCard = await readFile(cardFile);
    assert.equal(JSON.parse(gunzipSync(originalCard).toString()).matches, 2);
    assert.equal((await featuredCards(root, year))[0].matches, 2);
    const persisted = JSON.parse(gunzipSync(await readFile(privateFile)).toString());
    assert.equal(persisted.matches.length, 2);
    assert.equal(persisted.matches[0].info.participants.length, 3);
    assert.equal('unused' in persisted.matches[0].info, false);
    assert.deepEqual(persisted.queues, { 420: 'Ranked Solo games' });
    assert.ok(game(3, 0).info.participants.length > 0);
    assert.deepEqual(persisted.excluded, ['LA2_3']);
    assert.equal((await readFeaturedProfile(root, 'agurin', year))?.summary.matches, 2);
    assert.deepEqual((await readFeaturedProfile(root, 'agurin', year))?.summary.queues, { 420: 'Ranked Solo games' });
    assert.equal(logs.at(-1)?.phase, 'complete');
    assert.ok(Number(logs.at(-1)?.compressedBytes) > 0);
    ids = [...ids, 'LA2_4', 'LA2_5'];
    failing = true;
    await assert.rejects(importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root), /Synthetic failure/);
    assert.deepEqual(await readFile(publicFile), originalPublic);
    assert.deepEqual(await readFile(cardFile), originalCard);
    assert.equal(JSON.parse(gunzipSync(await readFile(privateFile)).toString()).matches.length, 3);
    failing = false;
    await importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root);
    assert.equal(requested.filter(id => id === 'LA2_4').length, 1);
    assert.equal((await loadFeatured('synthetic#test', root, year)).profile?.summary.matches, 4);
    assert.equal((await featuredCards(root, year))[0].riotId, 'Synthetic#TEST');
    assert.equal((await featuredCards(root, year))[0].matches, 4);
    const lastPublic = await readFile(publicFile);
    const lastPrivate = await readFile(privateFile);
    const changedAccount = async <T>(): Promise<T> => ({
      account: { ...account, puuid: 'another-synthetic-account' }, platform: 'LA2'
    }) as T;
    await assert.rejects(importFeatured('agurin', 'Synthetic#TEST', changedAccount, () => {}, root), /identity differs/);
    assert.deepEqual(await readFile(publicFile), lastPublic);
    assert.deepEqual(await readFile(privateFile), lastPrivate);
    await writeFile(publicFile, 'corrupt');
    assert.equal((await featuredCards(root, year))[0].matches, null);
    assert.deepEqual(await loadFeatured('synthetic#test', root, year), { featured: true, profile: null });
    await writeFile(privateFile, 'corrupt');
    await assert.rejects(importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root));
    assert.equal((await readFile(privateFile)).toString(), 'corrupt');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('card metadata refreshes, validates replacements and supports legacy snapshots and year rollover', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rift-featured-'));
  try {
    const api = async <T>(body: Record<string, unknown>): Promise<T> => (
      body.action === 'discover' ? { account, platform: 'LA2' } :
        body.action === 'ids' ? ['LA2_1'] : game(1)
    ) as T;
    await importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root);
    const publicPath = join(root, `agurin-${year}.public.json.gz`);
    const cardPath = join(root, `agurin-${year}.card.json.gz`);
    const card = await readFile(cardPath);
    assert.ok(card.length < 1024);
    const parse = JSON.parse;
    const parsing = t.mock.method(JSON, 'parse', (text: string, ...args: []) => {
      assert.doesNotMatch(text, /"summary":/, 'optimized cards must not parse public summaries');
      return parse(text, ...args);
    });
    assert.equal((await featuredCards(root, year))[0].matches, 1);
    parsing.mock.restore();
    const metadata = parse(gunzipSync(card).toString());
    for (const invalid of [
      { version: 2 }, { id: 'other' }, { year: year - 1 }, { stamp: 'stale' },
      { matches: -1 }, { icon: -1 }, { account: {} }, { platform: 'invalid' }
    ]) {
      await writeFile(cardPath, gzipSync(JSON.stringify({ ...metadata, ...invalid })));
      assert.equal((await featuredCards(root, year))[0].matches, 1);
    }
    assert.equal((await featuredCards(root, year + 1))[0].matches, null);
    await rm(cardPath);
    assert.equal((await featuredCards(root, year))[0].matches, 1);
    await writeFile(cardPath, 'corrupt sidecar');
    assert.equal((await featuredCards(root, year))[0].matches, 1);
    await writeFile(cardPath, card);
    const profile = JSON.parse(gunzipSync(await readFile(publicPath)).toString());
    profile.account.gameName = 'Renamed';
    profile.summary.account = 'Renamed#TEST';
    profile.summary.matches = 12;
    await writeFile(publicPath, gzipSync(JSON.stringify(profile)));
    assert.equal((await featuredCards(root, year))[0].matches, 12);
    assert.equal((await featuredCards(root, year))[0].riotId, 'Renamed#TEST');
    await rm(publicPath);
    assert.equal((await featuredCards(root, year))[0].matches, null);
    assert.equal((await loadFeatured('Synthetic#TEST', root, year)).featured, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing or corrupt featured profiles are unavailable, never trigger upstream or browser writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rift-featured-'));
  try {
    assert.deepEqual(await loadFeatured('NAgurin#EU1', root, year), { featured: true, profile: null });
    await writeFile(join(root, `agurin-${year}.public.json.gz`), 'corrupt');
    assert.deepEqual(await loadFeatured('nagurin#eu1', root, year), { featured: true, profile: null });
    assert.equal((await loadFeatured('Personal#TEST', root, year)).featured, false);
    const source = await readFile('src/routes/player/[riotId]/+page.svelte', 'utf8');
    assert.match(source, /if \(data\.featured\)[\s\S]*?return;[\s\S]*?readHistory/);
    assert.match(source, /if \(data\.featured \|\| !history\) return/);
    const search = await readFile('src/lib/components/PlayerSearch.svelte', 'utf8');
    assert.match(search, /featuredAccounts\.some[\s\S]*?goto[\s\S]*?return;[\s\S]*?requestHistory/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a failed optional card write preserves the successful public commit and cleans temporary files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rift-featured-'));
  try {
    await mkdir(join(root, `agurin-${year}.card.json.gz`));
    const api = async <T>(body: Record<string, unknown>): Promise<T> => (
      body.action === 'discover' ? { account, platform: 'LA2' } :
        body.action === 'ids' ? ['LA2_1'] : game(1)
    ) as T;
    await importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root);
    assert.equal((await readFeaturedProfile(root, 'agurin', year))?.summary.matches, 1);
    assert.equal((await featuredCards(root, year))[0].matches, 1);
    assert.ok((await readdir(root)).every(name => !name.endsWith('.tmp') && name !== 'import.lock'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('global import lock and interruption preserve checkpoints and do not publish incomplete data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rift-featured-'));
  try {
    await writeFile(join(root, 'import.lock'), '{"pid":0}');
    const api = async <T>(): Promise<T> => { throw new Error('must not request'); };
    await assert.rejects(importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root), /locked/);
    await rm(join(root, 'import.lock'));
    await assert.rejects(importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root, () => true), /interrupted/);
    assert.equal(await readFeaturedProfile(root, 'agurin', year), null);
    assert.equal((await featuredCards(root, year))[0].matches, null);
    let interrupted = false;
    const partialApi = async <T>(body: Record<string, unknown>): Promise<T> => {
      if (body.action === 'discover') return { account, platform: 'LA2' } as T;
      if (body.action === 'ids') return ['LA2_1', 'LA2_2'] as T;
      if (body.id === 'LA2_2') interrupted = true;
      return game(body.id === 'LA2_1' ? 1 : 2) as T;
    };
    await assert.rejects(importFeatured('agurin', 'Synthetic#TEST', partialApi, () => {}, root, () => interrupted), /interrupted/);
    const saved = JSON.parse(gunzipSync(await readFile(join(root, `agurin-${year}.private.json.gz`))).toString());
    assert.equal(saved.matches.length, 1);
    assert.equal(await readFeaturedProfile(root, 'agurin', year), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('listing-page failures checkpoint IDs and download batches report machine-readable progress', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rift-featured-'));
  try {
    let failListing = true;
    const api = async <T>(body: Record<string, unknown>): Promise<T> => {
      if (body.action === 'discover') return { account, platform: 'LA2' } as T;
      if (body.action === 'ids') {
        if (body.start === 100) {
          if (failListing) throw new Error('Listing interrupted');
          return ['LA2_101'] as T;
        }
        return Array.from({ length: 100 }, (_, index) => `LA2_${index + 1}`) as T;
      }
      return game(Number(String(body.id).split('_')[1])) as T;
    };
    await assert.rejects(importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root), /Listing interrupted/);
    const saved = JSON.parse(gunzipSync(await readFile(join(root, `agurin-${year}.private.json.gz`))).toString());
    assert.equal(saved.ids.length, 100);
    assert.equal(saved.listed, false);
    assert.equal(await readFeaturedProfile(root, 'agurin', year), null);
    failListing = false;
    const logs: Record<string, unknown>[] = [];
    await importFeatured('agurin', 'Synthetic#TEST', api, value => logs.push(value), root);
    assert.ok(logs.some(log => log.phase === 'listing' && log.listed === 101));
    assert.ok(logs.some(log => log.phase === 'downloading' && log.downloaded === 10 && log.remaining === 91));
    assert.equal(logs.at(-1)?.downloaded, 101);
    assert.equal(logs.at(-1)?.phase, 'complete');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('streamer badges appear only when the display name differs, ignoring case', () => {
  assert.equal(streamerBadge('Thebausffs', 'thebausffs'), null);
  assert.equal(streamerBadge('Agurin', 'NAgurin'), 'Agurin');
  assert.equal(streamerBadge('Crownie', 'Alex Mercer'), 'Crownie');
});

test('page loader serves one summary and no unused metadata without upstream or browser access', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rift-featured-'));
  try {
    const api = async <T>(body: Record<string, unknown>): Promise<T> => (
      body.action === 'discover' ? { account: { ...account, unused: 'discard' }, platform: 'LA2' } :
        body.action === 'ids' ? ['LA2_1', 'LA2_2'] : game(body.id === 'LA2_1' ? 1 : 2)
    ) as T;
    await importFeatured('agurin', 'Synthetic#TEST', api, () => {}, root);
    const upstream = t.mock.method(globalThis, 'fetch', () => { throw new Error('No upstream permitted'); });
    let browserCalls = 0;
    for (const key of ['indexedDB', 'localStorage']) {
      const previous = Object.getOwnPropertyDescriptor(globalThis, key);
      Object.defineProperty(globalThis, key, {
        configurable: true, get() { browserCalls++; throw new Error('No browser storage permitted'); }
      });
      t.after(() => {
        if (previous) Object.defineProperty(globalThis, key, previous);
        else Reflect.deleteProperty(globalThis, key);
      });
    }
    const loaded = await featuredPageData('Synthetic#TEST', root, year);
    assert.equal(loaded.summary?.matches, 2);
    assert.equal(loaded.profile && 'summary' in loaded.profile, false);
    assert.equal((JSON.stringify(loaded).match(/"summary":/g) ?? []).length, 1);
    assert.deepEqual(loaded.profile?.account, account);
    assert.equal(upstream.mock.callCount(), 0);
    assert.equal(browserCalls, 0);
    const publicPath = join(root, `agurin-${year}.public.json.gz`);
    const publicData = JSON.parse(gunzipSync(await readFile(publicPath)).toString());
    publicData.year = year - 1;
    await writeFile(publicPath, gzipSync(JSON.stringify(publicData)));
    const wrongYear = await featuredPageData('Synthetic#TEST', root, year);
    assert.equal(wrongYear.featured, true);
    assert.equal(wrongYear.summary, null);
    assert.ok(wrongYear.error);
    await writeFile(publicPath, gzipSync(JSON.stringify({ ...publicData, year, summary: { bad: true } })));
    assert.equal((await featuredPageData('Synthetic#TEST', root, year)).summary, null);
    assert.equal((await featuredPageData('NAgurin#EU1', root, year)).summary, null);
    assert.equal((await featuredPageData('Personal#TEST', root, year)).featured, false);
    assert.equal(upstream.mock.callCount(), 0);
    assert.equal(browserCalls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('queue metadata uses one unauthenticated timed request, validates responses, and falls back offline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rift-queues-'));
  const fallback = join(root, 'queues.json');
  try {
    await writeFile(fallback, JSON.stringify({ 450: 'ARAM games' }));
    let calls = 0;
    const request: typeof fetch = async (_url, init) => {
      calls++;
      assert.ok(init?.signal);
      assert.equal(init?.headers, undefined);
      return new Response(JSON.stringify([
        { queueId: 450, description: 'ARAM games', unused: 'discard' },
        { queueId: 400, description: 'Normal Draft Pick games' }
      ]));
    };
    assert.deepEqual(await fetchQueueLabels(request, fallback), {
      ...queueNames, 450: 'ARAM games', 400: 'Normal Draft Pick games', ...QUEUE_LABEL_OVERRIDES
    });
    assert.equal(calls, 1);
    for (const value of [
      [{ queueId: '450', description: 'invalid' }],
      [{ queueId: 450, description: {} }],
      [], { nonsense: 'invalid' }
    ]) {
      assert.deepEqual(await fetchQueueLabels(async () => new Response(JSON.stringify(value)), fallback), {
        ...queueNames, 450: 'ARAM games', ...QUEUE_LABEL_OVERRIDES
      });
    }
    assert.deepEqual(await fetchQueueLabels(async () => { throw new Error('Offline'); }, fallback), {
      ...queueNames, 450: 'ARAM games', ...QUEUE_LABEL_OVERRIDES
    });
    await writeFile(fallback, '{"450":false}');
    await assert.rejects(fetchQueueLabels(async () => new Response('bad'), fallback));
    await assert.rejects(readQueueLabels(fallback));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('offline republish repairs labels, strips unused attributes and customs, and refuses wrong-year or incomplete data', async t => {
  const root = await mkdtemp(join(tmpdir(), 'rift-featured-'));
  try {
    const queuesPath = join(root, 'queues.json');
    await writeFile(queuesPath, JSON.stringify({ 450: 'ARAM games', 400: 'Normal Draft Pick games' }));
    const rawHistory = {
      account: { ...account, unused: 'discard' }, platform: 'LA2' as const, year,
      ids: ['LA2_1', 'LA2_2', 'LA2_3'], matches: [game(1, 450), game(2, 450), game(3, 0)],
      listed: true, until: Math.floor(Date.now() / 1000), updated: new Date().toISOString(),
      queues: {}, unused: { fullPayload: 'discard' }
    };
    const privatePath = join(root, `agurin-${year}.private.json.gz`);
    await writeFile(privatePath, gzipSync(JSON.stringify(rawHistory)));
    const upstream = t.mock.method(globalThis, 'fetch', () => { throw new Error('Offline repair must not fetch'); });
    const repaired = await republishFeatured('agurin', root, queuesPath);
    assert.deepEqual(repaired.summary.queues, { 450: 'ARAM games' });
    assert.equal(repaired.summary.matches, 2);
    assert.deepEqual(repaired.excluded, ['LA2_3']);
    assert.ok(repaired.summary.players.every(p => p.encounters.every(e => e.match !== 'LA2_3')));
    const persisted = JSON.parse(gunzipSync(await readFile(privatePath)).toString());
    assert.deepEqual(persisted.account, account);
    assert.equal('unused' in persisted, false);
    assert.equal('unused' in persisted.matches[0].info, false);
    assert.deepEqual(persisted.queues, { 450: 'ARAM games' });
    assert.equal(upstream.mock.callCount(), 0);
    const publicPath = join(root, `agurin-${year}.public.json.gz`);
    const originalPublic = await readFile(publicPath);
    await writeFile(privatePath, gzipSync(JSON.stringify({ ...persisted, listed: false })));
    await assert.rejects(republishFeatured('agurin', root, queuesPath), /incomplete/);
    assert.deepEqual(await readFile(publicPath), originalPublic);
    const wrongYear = { ...persisted, year: year - 1, matches: [], ids: [], excluded: [], until: yearStart(year) - 1 };
    await writeFile(privatePath, gzipSync(JSON.stringify(wrongYear)));
    const originalPrivate = await readFile(privatePath);
    await assert.rejects(republishFeatured('agurin', root, queuesPath), /year differs/);
    assert.deepEqual(await readFile(privatePath), originalPrivate);
    await assert.rejects(saveFeaturedHistory(root, 'agurin', wrongYear), /year differs/);
    assert.deepEqual(await readFile(publicPath), originalPublic);
  } finally { await rm(root, { recursive: true, force: true }); }
});
