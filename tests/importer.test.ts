import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { readJson, saveJson } from '../src/lib/server/storage.ts';
import { parseSummary } from '../src/lib/server/validation.ts';

const exec = promisify(execFile);
const script = resolve('scripts/fetch.ts');
const mock = resolve('tests/mock-riot.ts');

test('imports atomically, reuses cached matches, and preserves summary when authentication fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rift-regulars-test-'));
  const run = (mode: string) => exec(process.execPath, ['--import', mock, script], {
    cwd: directory, env: { ...process.env, RIOT_API_KEY: 'synthetic-only', FP_TEST_CASE: mode }
  });
  try {
    await run('first');
    const summaryPath = join(directory, 'data', 'summary.json');
    const summary = parseSummary(await readJson(summaryPath));
    assert.equal(summary.matches, 2);
    assert.equal(summary.players.length, 1);
    assert.equal(summary.coverage.complete, true);
    await run('cached');
    const before = await readFile(summaryPath, 'utf8');
    await assert.rejects(run('rejected'), /Riot access is temporarily unavailable/);
    assert.equal(await readFile(summaryPath, 'utf8'), before);
    assert.ok((await readdir(join(directory, 'data', 'matches'))).every(p => p.endsWith('.json')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('atomic JSON save replaces only its intended file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rift-regulars-save-'));
  try {
    const path = join(directory, 'nested', 'test.json');
    await saveJson(path, { safe: true });
    await saveJson(path, { safe: 'still' });
    assert.deepEqual(await readJson(path), { safe: 'still' });
    assert.deepEqual(await readdir(join(directory, 'nested')), ['test.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
