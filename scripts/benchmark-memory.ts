// Linux-only, synthetic production workloads. Never starts from the app's data directory.
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import { featuredAccounts } from '../src/lib/featured.ts';
import { saveFeaturedHistory, republishFeatured } from '../src/lib/server/featured.ts';
import { yearStart } from '../src/lib/encounters.ts';
import type { History } from '../src/lib/history.ts';

// Usage: node scripts/benchmark-memory.ts OUTPUT.json BUN NODE_BASELINE NODE_OPTIMIZED [BUN_BUILD]
const [output, bun, baseline, optimized, official] = process.argv.slice(2);
assert.ok(output && bun && baseline && optimized, 'See usage in scripts/benchmark-memory.ts');
const root = await mkdtemp('/tmp/opencode/rift-memory-');
const fixtureRoot = join(root, 'data/featured');
const year = new Date().getUTCFullYear();
const guard = resolve('scripts/benchmark-no-network.ts');
const results: unknown[] = [];
let active: ChildProcess | undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    active?.kill('SIGKILL');
    void rm(root, { recursive: true, force: true }).finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
}
process.once('exit', () => active?.kill('SIGKILL'));

async function memory(pid: number) {
  const status = await readFile(`/proc/${pid}/status`, 'utf8');
  return Object.fromEntries(['VmRSS', 'VmHWM'].map(key => {
    const value = status.match(new RegExp(`^${key}:\\s+(\\d+) kB`, 'm'));
    assert.ok(value, `${key} unavailable`);
    return [key, Number(value[1]) * 1024];
  }));
}

async function run(label: string, runtime: string, build: string, smol = false) {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>(done => socket.close(() => done()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(runtime, [
    ...(runtime === bun ? [...(smol ? ['--smol'] : []), '--preload', guard] : ['--import', guard]),
    resolve(build, 'index.js')
  ], {
    cwd: root, env: {
      PATH: process.env.PATH, HOST: '127.0.0.1', PORT: String(port), ORIGIN: base,
      RIOT_API_KEY: '', NODE_ENV: 'production'
    }, stdio: ['ignore', 'pipe', 'pipe']
  });
  active = child;
  let logs = '';
  child.stdout.on('data', value => { logs += value; });
  child.stderr.on('data', value => { logs += value; });
  const exited = once(child, 'exit');
  let sampledPeak = 0;
  const sampler = setInterval(() => {
    if (child.pid) void memory(child.pid).then(m => {
      sampledPeak = Math.max(sampledPeak, m.VmRSS);
    }).catch(() => {});
  }, 20);
  const deadline = setTimeout(() => child.kill('SIGKILL'), 90_000);
  const phases: unknown[] = [];
  async function request(path: string) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200, `${label}: ${path}`);
    return response.text();
  }
  async function phase(name: string, path: string, count: number, concurrency = 1) {
    const start = performance.now();
    for (let offset = 0; offset < count; offset += concurrency) {
      await Promise.all(Array.from({ length: Math.min(concurrency, count - offset) }, () => request(path)));
    }
    phases.push({ name, requests: count, concurrency, elapsedMs: performance.now() - start,
      ...await memory(child.pid!) });
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      assert.equal(child.exitCode, null, logs);
      // Static readiness avoids warming homepage before the idle measurement.
      try {
        const response = await fetch(base + '/favicon.png', { signal: AbortSignal.timeout(500) });
        await response.arrayBuffer();
        if (response.ok) { ready = true; break; }
      } catch { /* bounded startup retry */ }
      await delay(50);
    }
    assert.ok(ready, logs);
    await delay(1000);
    phases.push({ name: 'idle', ...await memory(child.pid!) });
    const home = await request('/');
    assert.match(home, /Know the names/);
    assert.match(home, /Synthetic0/);
    const asset = home.match(/(?:href|src)="([^"]+_app\/immutable\/[^"]+)"/)?.[1];
    assert.ok(asset, 'SSR asset reference');
    await request(asset);
    const noKey = await fetch(base + '/api/history', {
      method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'discover', riotId: 'Synthetic#TEST' })
    });
    assert.equal(noKey.status, 400);
    assert.match(await noKey.text(), /temporarily unavailable/i);
    await phase('homepage', '/', 40);
    const profilePath = '/player/Synthetic8%23TEST';
    assert.match(await request(profilePath), /Synthetic8/);
    await phase('largest-profile', profilePath, 10);
    await phase('concurrent-homepage', '/', 24, 4);
    await phase('concurrent-profile', profilePath, 8, 4);
    await delay(3000);
    phases.push({ name: 'post-load-3s', ...await memory(child.pid!) });
    child.kill('SIGTERM');
    const termination = await Promise.race([
      exited, delay(5000).then(() => { throw new Error('SIGTERM exceeded five seconds'); })
    ]);
    assert.deepEqual(termination, [0, null], logs);
    assert.doesNotMatch(logs, /BENCHMARK_NETWORK_BLOCKED/);
    results.push({ label, phases, sampledPeak, termination, smoke: 'SSR, assets, same-origin no-key 400, SIGTERM passed' });
  } finally {
    clearInterval(sampler);
    clearTimeout(deadline);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
    active = undefined;
  }
}

try {
  await mkdir(fixtureRoot, { recursive: true });
  const queuesPath = join(root, 'queues.json');
  await writeFile(queuesPath, '{"420":"Ranked Solo/Duo"}');
  const fixtures = [];
  for (const [index, entry] of featuredAccounts.entries()) {
    const count = 320 + index * 60;
    const account = { puuid: `synthetic-${index}`, gameName: `Synthetic${index}`, tagLine: 'TEST' };
    const history: History = {
      account, platform: 'LA2', year, listed: true, until: yearStart(year + 1) - 1,
      updated: `${year}-11-01T00:00:00.000Z`, queues: { 420: 'Ranked Solo/Duo' }, excluded: [],
      ids: Array.from({ length: count }, (_, n) => `LA2_${n + 1}`),
      matches: Array.from({ length: count }, (_, n) => ({
        metadata: { matchId: `LA2_${n + 1}` },
        info: {
          platformId: 'LA2', gameStartTimestamp: (yearStart(year) + n * 3600) * 1000, queueId: 420,
          participants: Array.from({ length: 10 }, (_, p) => ({
            puuid: p === 0 ? account.puuid : `opponent-${(n + p * 17) % 150}`,
            riotIdGameName: p === 0 ? account.gameName : `Synthetic player ${(n + p * 17) % 150}`,
            riotIdTagline: 'TEST', championName: 'Ahri', teamId: p < 5 ? 100 : 200,
            profileIcon: 1, kills: 5, deaths: 3, assists: 8, win: n % 2 === 0
          }))
        }
      }))
    };
    await saveFeaturedHistory(fixtureRoot, entry.id, history);
    await republishFeatured(entry.id, fixtureRoot, queuesPath);
    const bytes = await readFile(join(fixtureRoot, `${entry.id}-${year}.public.json.gz`));
    fixtures.push({ id: entry.id, matches: count, compressed: bytes.length, uncompressed: gunzipSync(bytes).length,
      cardCompressed: (await readFile(join(fixtureRoot, `${entry.id}-${year}.card.json.gz`))).length });
  }
  for (const [name, build] of [['baseline-node-adapter', baseline], ['optimized-node-adapter', optimized]]) {
    await run(`${name}/node`, process.execPath, build);
    await run(`${name}/bun`, bun, build);
    await run(`${name}/bun-smol`, bun, build, true);
  }
  if (official) {
    await run('official-bun-adapter/bun', bun, official);
    await run('official-bun-adapter/bun-smol', bun, official, true);
  }
  await writeFile(output, JSON.stringify({ versions: {
    node: process.version, bun: execFileSync(bun, ['--version'], { encoding: 'utf8' }).trim(), bunExecutable: bun
  }, fixtures,
    samplingMs: 20, containerMetrics: 'not collected; process RSS only', results }, null, 2) + '\n');
  console.log(`Saved ${results.length} runs to ${output}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
