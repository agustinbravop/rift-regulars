import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeHistories, parseHistory, readHistory, writeHistory, readPremades, premadeStorageKey } from '../src/lib/browser-cache.ts';
import { historySummary, type History } from '../src/lib/history.ts';
import { account, match, year } from './fixtures.ts';
import { readFile } from 'node:fs/promises';
import { recentPlayersKey } from '../src/lib/recent-players.ts';

test('recent players and the account/year import lock use the rift-regulars namespace', async () => {
  assert.equal(recentPlayersKey, 'rift-regulars:recent-players');
  const page = await readFile(new URL('../src/routes/player/[riotId]/+page.svelte', import.meta.url), 'utf8');
  assert.ok(page.includes('const key = `rift-regulars:import:${history.year}:${history.account.puuid}`;'));
  assert.ok(!page.includes('familiar-players'));
  assert.ok(!page.includes('Keep the original storage key'));
});

function history(platform: History['platform'] = 'LA2'): History {
  const game = match(1);
  game.metadata.matchId = `${platform}_1`;
  game.info.platformId = platform;
  return {
    account, platform, year, ids: [game.metadata.matchId], matches: [game], excluded: [],
    listed: true, until: Math.floor(Date.now() / 1000), updated: '2026-11-01T00:00:00Z', queues: {}
  };
}

test('premade overrides retain all servers and legacy marks without destructive conflict resolution', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null };
  assert.equal(premadeStorageKey(account.puuid), `rift-regulars:queue-partners:account:${account.puuid}`);
  const las = `rift-regulars:queue-partners:LA2:${account.puuid}`;
  const na = `rift-regulars:queue-partners:NA1:${account.puuid}`;
  const old = `rift-regulars:queue-partners:${account.gameName}#${account.tagLine}`;
  values.set(old, '["old"]');
  assert.deepEqual(readPremades(storage, account), { marked: ['old'], unmarked: [] });
  values.set(las, '["friend"]');
  values.set(`${old}:unmarked`, '["legacy-unmarked"]');
  assert.deepEqual(readPremades(storage, account), { marked: ['friend'], unmarked: ['legacy-unmarked'] });
  values.set(na, '["other"]');
  values.set(`${na}:unmarked`, '["not-premade"]');
  assert.deepEqual(readPremades(storage, account), { marked: ['friend', 'other'], unmarked: ['not-premade'] });
  const snapshot = [...values];
  values.set(premadeStorageKey(account.puuid), JSON.stringify({ marked: ['friend'], unmarked: ['other'] }));
  assert.deepEqual(readPremades(storage, account), { marked: ['friend'], unmarked: ['other'] });
  assert.deepEqual([...values].slice(0, snapshot.length), snapshot);
  values.delete(premadeStorageKey(account.puuid));
  values.set(`${na}:unmarked`, '["friend"]');
  assert.throws(() => readPremades(storage, account), /conflict across servers/);
  values.set(`${na}:unmarked`, 'not JSON');
  assert.throws(() => readPremades(storage, account));
});

test('merges legacy account/year records without false completion or lost matches/exclusions', () => {
  const las = history(), na = history('NA1');
  las.ids.push('LA2_2', 'NA1_1');
  las.excluded = ['LA2_2', 'NA1_1'];
  const original = structuredClone([las, na]);
  const merged = mergeHistories([las, na], 'NA1', year, account.puuid);
  assert.deepEqual(new Set(merged.ids), new Set(['LA2_1', 'LA2_2', 'NA1_1']));
  assert.deepEqual(merged.excluded, ['LA2_2']);
  assert.equal(merged.matches.length, 2);
  assert.equal(merged.listed, false);
  assert.equal(historySummary(merged).matches, 2);
  assert.equal(historySummary(merged).players[0].encounters.length, 2);
  assert.deepEqual([las, na], original);
  const canonical = { ...merged, listed: true, updated: '2026-11-02T00:00:00Z' };
  assert.equal(mergeHistories([las, na, canonical], 'NA1', year, account.puuid, canonical).listed, true);
  assert.equal(mergeHistories([las, na, canonical], 'EUW1', year, account.puuid, canonical).listed, false);
  assert.throws(() => mergeHistories([las, { ...na, account: { ...account, puuid: 'other' } }], 'NA1', year, account.puuid));
  assert.throws(() => mergeHistories([las, { ...na, year: year - 1 }], 'NA1', year, account.puuid));
  assert.throws(() => parseHistory({ ...las, matches: [match(999)] }));
  const wrongYear = history();
  wrongYear.matches[0].info.gameStartTimestamp = Date.UTC(year - 1, 11, 31);
  assert.throws(() => parseHistory(wrongYear));
  const wrongPlayer = history();
  wrongPlayer.matches[0].info.participants = [];
  assert.throws(() => parseHistory(wrongPlayer));
  assert.throws(() => parseHistory({ ...las, ids: ['EVIL_1'] }));
});

test('cache reads preserve legacy rows, use account/year keys, and reject corruption and failed writes', async () => {
  const original = globalThis.indexedDB;
  const las = history(), na = history('NA1');
  const records = new Map<string, { key: string; lookup: string; history: History }>();
  for (const h of [las, na]) {
    const key = `${h.platform}:${year}:${account.puuid}`;
    records.set(key, { key, lookup: `${h.platform}:${year}:agus brr#arg`, history: structuredClone(h) });
  }
  const unrelated = `LA2:${year}:unrelated`;
  const otherYear = `LA2:${year - 1}:${account.puuid}`;
  for (const key of [unrelated, otherYear]) {
    records.set(key, { key, lookup: 'unrelated', history: {} as History });
  }
  const readKeys: string[] = [];
  let fail = false, closed = 0;
  // Only the IDB operations used by this module; aborts never commit the pending put.
  globalThis.indexedDB = {
    open(name: string, version: number) {
      assert.equal(name, 'rift-regulars');
      assert.equal(version, 1);
      const request: Record<string, any> = {};
      const result = (value: unknown) => {
        const get: Record<string, any> = { result: structuredClone(value) };
        queueMicrotask(() => get.onsuccess());
        return get;
      };
      request.result = {
        close() { closed++; },
        transaction() {
          const transaction: Record<string, any> = {};
          transaction.objectStore = () => ({
            getAllKeys() { return result([...records.keys()]); },
            get(key: string) {
              readKeys.push(key);
              return result(records.get(key));
            },
            index(name: string) {
              assert.equal(name, 'lookup');
              return { getKey: (lookup: string) =>
                result([...records.values()].find(record => record.lookup === lookup)?.key) };
            },
            put(record: { key: string; lookup: string; history: History }) {
              queueMicrotask(() => {
                if (fail) {
                  transaction.error = new Error('Synthetic quota failure');
                  transaction.onabort();
                } else {
                  records.set(record.key, structuredClone(record));
                  transaction.oncomplete();
                }
              });
            }
          });
          return transaction;
        }
      };
      queueMicrotask(() => request.onsuccess());
      return request;
    }
  } as unknown as IDBFactory;
  try {
    const merged = await readHistory('Agus Brr#ARG', 'NA1', year, account.puuid, true);
    assert.equal(merged?.matches.length, 2);
    assert.equal(merged?.listed, false);
    assert.deepEqual(new Set(readKeys), new Set([`LA2:${year}:${account.puuid}`, `NA1:${year}:${account.puuid}`]));
    merged!.listed = true;
    merged!.updated = '2026-11-02T00:00:00Z';
    await writeHistory(merged!);
    assert.equal(records.size, 5);
    assert.deepEqual(records.get(`LA2:${year}:${account.puuid}`)?.history, las);
    assert.deepEqual(records.get(`NA1:${year}:${account.puuid}`)?.history, na);
    assert.ok(records.has(`account:${year}:${account.puuid}`));
    const reopened = await readHistory('Agus Brr#ARG', 'NA1', year, account.puuid);
    assert.equal(reopened?.listed, true);
    const transferred = await readHistory('Agus Brr#ARG', 'EUW1', year, account.puuid, true);
    assert.equal(transferred?.platform, 'EUW1');
    assert.equal(transferred?.listed, false);
    assert.equal(transferred?.matches.length, 2);
    const direct = await readHistory('Agus Brr#ARG', 'LA2', year);
    assert.equal(direct?.platform, 'NA1');
    assert.equal(direct?.listed, true);
    assert.equal(await readHistory('Agus Brr#ARG', 'EUW1', year).then(h => h?.matches.length), 2);
    assert.equal(await readHistory('Not cached#TAG', 'LA2', year), null);
    assert.ok(!readKeys.includes(unrelated));
    assert.ok(!readKeys.includes(otherYear));
    fail = true;
    const before = structuredClone([...records]);
    await assert.rejects(writeHistory(transferred!), /Synthetic quota/);
    assert.deepEqual([...records], before);
    records.get(`NA1:${year}:${account.puuid}`)!.history.account = { ...account, puuid: 'wrong' };
    await assert.rejects(readHistory('Agus Brr#ARG', 'NA1', year, account.puuid), /Invalid cached match|Wrong cached account/);
    assert.ok(closed >= 7);
  } finally { globalThis.indexedDB = original; }
});
