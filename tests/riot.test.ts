import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Riot } from '../src/lib/server/riot.ts';
import { RiotRateLimiter } from '../src/lib/server/rate-limit.ts';

test('paces requests, sends key in header, and honors Retry-After', async () => {
  let calls = 0;
  const waits: number[] = [];
  let now = 0;
  const pause = async (ms: number) => { waits.push(ms); now += ms; };
  const request: typeof fetch = async (url, options) => {
    assert.equal(String(url), 'https://americas.api.riotgames.com/test');
    assert.equal(new Headers(options?.headers).get('X-Riot-Token'), 'test-only');
    assert.equal(options?.redirect, 'error');
    return calls++ === 0
      ? new Response('', { status: 429, headers: { 'Retry-After': '2' } })
      : Response.json({ ok: true });
  };
  const riot = new Riot('test-only', request, pause, undefined, 'americas',
    new RiotRateLimiter(pause, () => now));
  assert.deepEqual(await riot.get('/test'), { ok: true });
  assert.ok(waits.includes(2000));
  assert.equal(calls, 2);
});

test('credential errors fail immediately with visitor-safe instructions', async () => {
  const message = 'Riot access is temporarily unavailable. Please try again later or contact support.';
  for (const status of [401, 403]) {
    let calls = 0;
    const request: typeof fetch = async () => { calls++; return new Response('', { status }); };
    await assert.rejects(new Riot('private-test-value', request, async () => {}).get('/test'),
      error => error instanceof Error && error.message === message);
    assert.equal(calls, 1);
  }
  assert.throws(() => new Riot(''), { message });
});

test('bounds retries for server errors and connection failures', async () => {
  for (const network of [false, true]) {
    let calls = 0;
    const request: typeof fetch = async () => {
      calls++;
      if (network) throw new Error('network unavailable');
      return new Response('', { status: 503 });
    };
    await assert.rejects(new Riot('test', request, async () => {}).get('/test'),
      error => {
        assert.ok(error instanceof Error);
        assert.match(error.message, network ? /Cannot reach Riot Games/ : /Riot Games is temporarily unavailable/);
        assert.doesNotMatch(error.message, /bun run|API key|\.env|RIOT_API_KEY/i);
        return true;
      });
    assert.equal(calls, 6);
  }
});

test('aborts without making a request', async () => {
  const signal = AbortSignal.abort(new Error('stopped'));
  await assert.rejects(new Riot('test', async () => { throw new Error('must not run'); },
    async () => {}, signal).get('/test'), /stopped/);
});
