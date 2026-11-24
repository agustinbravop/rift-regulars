import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RiotRateLimiter } from '../src/lib/server/rate-limit.ts';
import { Riot } from '../src/lib/server/riot.ts';

function clock() {
  let now = 0;
  const waits: number[] = [];
  const pause = async (ms: number) => { waits.push(ms); now += ms; };
  return { pause, waits, now: () => now, limiter: new RiotRateLimiter(pause, () => now) };
}

test('bursts immediately, then respects both rolling development-key windows', async () => {
  const c = clock();
  for (let i = 0; i < 20; i++) await c.limiter.acquire('americas:match-details');
  assert.equal(c.now(), 0);
  assert.deepEqual(c.waits, []);
  await c.limiter.acquire('europe:match-ids');
  assert.equal(c.now(), 1025);
  for (let i = 21; i < 100; i++) await c.limiter.acquire('americas:match-details');
  assert.ok(c.now() < 120_000);
  await c.limiter.acquire('americas:match-details');
  assert.equal(c.now(), 120_025);
});

test('simultaneous callers cannot reserve the same quota', async () => {
  const c = clock();
  await Promise.all(Array.from({ length: 21 }, () => c.limiter.acquire('same-method')));
  assert.deepEqual(c.waits, [1025]);
});

test('uses advertised app limits, including a larger quota than the development fallback', async () => {
  const c = clock();
  await c.limiter.acquire('account');
  c.limiter.observe('account', new Headers({
    'X-App-Rate-Limit': '100:1,1000:120', 'X-App-Rate-Limit-Count': '1:1,1:120'
  }));
  for (let i = 0; i < 30; i++) await c.limiter.acquire('match-ids');
  assert.deepEqual(c.waits, []);

  const small = clock();
  await small.limiter.acquire('account');
  small.limiter.observe('account', new Headers({
    'X-App-Rate-Limit': '2:1,4:10', 'X-App-Rate-Limit-Count': '1:1,1:10'
  }));
  await small.limiter.acquire('account');
  await small.limiter.acquire('account');
  assert.equal(small.now(), 1025);
  await small.limiter.acquire('account');
  await small.limiter.acquire('account');
  assert.equal(small.now(), 10_025);
});

test('accounts for header counts made before startup or by another key user', async () => {
  const c = clock();
  await c.limiter.acquire('account');
  c.limiter.observe('account', new Headers({
    'X-App-Rate-Limit': '3:10', 'X-App-Rate-Limit-Count': '3:10'
  }));
  await c.limiter.acquire('match-ids');
  assert.equal(c.now(), 10_025);
});

test('traffic in another region cannot hide external usage reported by Riot', async () => {
  const c = clock();
  await c.limiter.acquire('americas:account');
  await c.limiter.acquire('europe:account');
  c.limiter.observe('americas:account', new Headers({
    'X-App-Rate-Limit': '3:10', 'X-App-Rate-Limit-Count': '3:10'
  }));
  await c.limiter.acquire('americas:match-ids');
  assert.equal(c.now(), 10_025);
});

test('method limits are scoped by endpoint and region while app limits remain shared', async () => {
  const c = clock();
  await c.limiter.acquire('europe:account');
  c.limiter.observe('europe:account', new Headers({
    'X-Method-Rate-Limit': '1:2', 'X-Method-Rate-Limit-Count': '1:2'
  }));
  await c.limiter.acquire('europe:match-ids');
  await c.limiter.acquire('americas:account');
  assert.equal(c.now(), 0);
  await c.limiter.acquire('europe:account');
  assert.equal(c.now(), 2025);
});

test('429 cooldowns apply to other clients, even when the original request stops retrying', async () => {
  const c = clock();
  c.limiter.cooldown('account', new Headers({ 'Retry-After': '2' }));
  await c.limiter.acquire('match-details');
  assert.equal(c.now(), 2000);

  const scoped = clock();
  scoped.limiter.cooldown('account', new Headers({ 'Retry-After': '3', 'X-Rate-Limit-Type': 'method' }));
  await scoped.limiter.acquire('match-details');
  assert.equal(scoped.now(), 0);
  await scoped.limiter.acquire('account');
  assert.equal(scoped.now(), 3000);
});

test('Retry-After supports HTTP dates and safely handles missing or invalid values', t => {
  t.mock.method(Date, 'now', () => 0);
  const c = clock();
  assert.equal(c.limiter.cooldown('account', new Headers({
    'Retry-After': 'Thu, 01 Jan 1970 00:00:02 GMT'
  })), 2000);
  for (const value of [undefined, 'invalid', '-1', '']) {
    assert.equal(c.limiter.cooldown('account', new Headers(value === undefined ? {} : { 'Retry-After': value })), 120_000);
  }
});

test('malformed advertised limits do not disable the fallback limiter', async () => {
  const c = clock();
  c.limiter.observe('account', new Headers({
    'X-App-Rate-Limit': 'no-limit', 'X-App-Rate-Limit-Count': 'bad-count'
  }));
  for (let i = 0; i < 21; i++) await c.limiter.acquire('account');
  assert.equal(c.now(), 1025);
});

test('Riot instances share burst quota and put retries through the same limiter', async () => {
  const c = clock();
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return calls === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '2' } })
      : Response.json({ ok: true });
  };
  const first = new Riot('synthetic-only', request, c.pause, undefined, 'americas', c.limiter);
  const second = new Riot('synthetic-only', request, c.pause, undefined, 'europe', c.limiter);
  assert.deepEqual(await first.get('/lol/match/v5/matches/LA2_1'), { ok: true });
  assert.deepEqual(await second.get('/lol/match/v5/matches/EUW1_1'), { ok: true });
  assert.equal(c.now(), 2000);
  assert.equal(calls, 3);
});

test('aborted reservations do not spend quota', async () => {
  const c = clock();
  await assert.rejects(c.limiter.acquire('account', AbortSignal.abort(new Error('stopped'))), /stopped/);
  for (let i = 0; i < 20; i++) await c.limiter.acquire('account');
  assert.deepEqual(c.waits, []);
});

test('League region lookup has its own method-limit bucket, separate from Account-V1 identity', async () => {
  const c = clock();
  const riot = new Riot('synthetic-only', async url => Response.json({}, {
    headers: String(url).includes('/accounts/') ? {
      'X-Method-Rate-Limit': '1:2', 'X-Method-Rate-Limit-Count': '1:2'
    } : {}
  }), c.pause, undefined, 'americas', c.limiter);
  await riot.get('/riot/account/v1/accounts/by-riot-id/Player/TAG');
  await riot.get('/riot/account/v1/region/by-game/lol/by-puuid/synthetic-puuid');
  assert.equal(c.now(), 0);
  await riot.get('/riot/account/v1/accounts/by-riot-id/Player/TAG');
  assert.equal(c.now(), 2025);
});
