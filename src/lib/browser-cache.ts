import type { History } from './history.ts';
import { parseAccount, parseMatch, parseMatchIds, parseQueues } from './validation.ts';
import { matchPlatform, parsePlatform, regions, type Platform } from './regions.ts';
import { yearStart } from './encounters.ts';
import type { Account } from './types.ts';
import { parseQueuePartners } from './queue-partners.ts';

export const premadeStorageKey = (puuid: string) => `rift-regulars:queue-partners:account:${puuid}`;

export function readPremades(storage: Pick<Storage, 'getItem'>, account: Account) {
  const raw = storage.getItem(premadeStorageKey(account.puuid));
  if (raw !== null) {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error('Invalid premade marks.');
    const marked = parseQueuePartners(JSON.stringify(value.marked ?? null));
    const unmarked = parseQueuePartners(JSON.stringify(value.unmarked ?? null));
    if (marked.some(id => unmarked.includes(id))) throw new Error('Conflicting saved premade marks.');
    return { marked, unmarked };
  }
  const keys = Object.keys(regions).map(p => `rift-regulars:queue-partners:${p}:${account.puuid}`);
  const legacy = `rift-regulars:queue-partners:${account.gameName}#${account.tagLine}`;
  const markedRecords = keys.map(key => storage.getItem(key));
  const unmarkedRecords = keys.map(key => storage.getItem(`${key}:unmarked`));
  const marked = [...new Set((markedRecords.some(raw => raw !== null)
    ? markedRecords : [storage.getItem(legacy)]).flatMap(parseQueuePartners))];
  const unmarked = [...new Set((unmarkedRecords.some(raw => raw !== null)
    ? unmarkedRecords : [storage.getItem(`${legacy}:unmarked`)]).flatMap(parseQueuePartners))];
  if (marked.some(id => unmarked.includes(id))) {
    throw new Error('Saved premade marks conflict across servers. Existing records were not changed.');
  }
  return { marked, unmarked };
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('rift-regulars', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('histories', { keyPath: 'key' });
      store.createIndex('lookup', 'lookup');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Rift Regulars tabs to open the cache.'));
  });
}

const lookupKey = (riotId: string, platform: Platform, year: number) =>
  `${platform}:${year}:${riotId.toLowerCase()}`;

function cacheResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function parseHistory(value: unknown): History {
  if (!value || typeof value !== 'object') throw new Error('Invalid browser history.');
  const h = value as History;
  parseAccount(h.account);
  parsePlatform(h.platform);
  parseMatchIds(h.ids);
  h.ids.forEach(matchPlatform);
  parseQueues(h.queues);
  if (!Number.isSafeInteger(h.year) || typeof h.listed !== 'boolean' ||
    h.year < 2009 || h.year > new Date().getUTCFullYear() ||
    !Number.isFinite(h.until) || h.until < yearStart(h.year) || h.until >= yearStart(h.year + 1) ||
    typeof h.updated !== 'string' || !Number.isFinite(Date.parse(h.updated)) ||
    !Array.isArray(h.matches)) throw new Error('Invalid browser history.');
  const ids = new Set(h.ids), matches = new Set<string>();
  for (const value of h.matches) {
    const match = parseMatch(value);
    const at = (match.info.gameStartTimestamp ?? match.info.gameCreation ?? 0) / 1000;
    if (!ids.has(match.metadata.matchId) || matches.has(match.metadata.matchId) ||
      at < yearStart(h.year) || at >= yearStart(h.year + 1) ||
      !match.info.participants.some(p => p.puuid === h.account.puuid)) throw new Error('Invalid cached match.');
    matches.add(match.metadata.matchId);
  }
  if (h.excluded !== undefined) {
    const excluded = parseMatchIds(h.excluded);
    if (new Set(excluded).size !== excluded.length ||
      excluded.some(id => !ids.has(id) || matches.has(id))) {
      throw new Error('Invalid excluded match.');
    }
  }
  return h;
}

const accountKey = (year: number, puuid: string) => `account:${year}:${puuid}`;

export function mergeHistories(
  histories: History[], platform: Platform, year: number, puuid: string, canonical: History | null = null
): History {
  if (!histories.length) throw new Error('No cached histories.');
  const ordered = histories.map(parseHistory).sort((a, b) => Date.parse(a.updated) - Date.parse(b.updated));
  if (ordered.some(h => h.year !== year || h.account.puuid !== puuid)) throw new Error('Wrong cached account.');
  const latest = ordered[ordered.length - 1];
  const ids = [...new Set(ordered.flatMap(h => h.ids))];
  const matches = [...new Map(ordered.flatMap(h => h.matches).map(m => [m.metadata.matchId, m])).values()];
  const saved = new Set(matches.map(m => m.metadata.matchId));
  const excluded = [...new Set(ordered.flatMap(h => h.excluded ?? []))].filter(id => !saved.has(id));
  const known = new Set(canonical?.ids);
  const downloaded = new Set(canonical?.matches.map(m => m.metadata.matchId));
  const empty = new Set(canonical?.excluded);
  const changed = !canonical || canonical.platform !== platform ||
    ids.some(id => !known.has(id)) || matches.some(m => !downloaded.has(m.metadata.matchId)) ||
    excluded.some(id => !empty.has(id)) ||
    ordered.some(h => Date.parse(h.updated) > Date.parse(canonical.updated));
  return {
    ...latest, platform, ids, matches, excluded,
    listed: !changed && canonical!.listed,
    until: canonical?.until ?? latest.until,
    queues: Object.assign({}, ...ordered.map(h => h.queues))
  };
}

export async function readHistory(
  riotId: string, platform: Platform | undefined, year: number, puuid?: string, discovered = false
): Promise<History | null> {
  const db = await openCache();
  try {
    const store = db.transaction('histories', 'readonly').objectStore('histories');
    let identity = puuid;
    let cachedPlatform = platform;
    if (!identity) {
      const platforms = (platform ? [platform, ...Object.keys(regions).filter(p => p !== platform)] : Object.keys(regions)) as Platform[];
      const keys = await Promise.all(platforms.map(p => cacheResult(store.index('lookup').getKey(lookupKey(riotId, p, year)))));
      const selectedKey = keys.find(key => key !== undefined);
      if (selectedKey === undefined) return null;
      const selected = await cacheResult(store.get(selectedKey));
      const selectedHistory = parseHistory(selected.history);
      if (selectedHistory.year !== year ||
        `${selectedHistory.account.gameName}#${selectedHistory.account.tagLine}`.toLowerCase() !== riotId.toLowerCase()) {
        throw new Error('Wrong cached account.');
      }
      identity = selectedHistory.account.puuid;
      cachedPlatform ??= selectedHistory.platform;
    }
    const keys = await cacheResult(store.getAllKeys());
    const relatedKeys = keys.filter(key => key === accountKey(year, identity) ||
      Object.keys(regions).some(p => key === `${p}:${year}:${identity}`));
    const related = await Promise.all(relatedKeys.map(key => cacheResult(store.get(key))));
    const histories = related.map(r => {
      const h = parseHistory(r.history);
      if (h.year !== year || h.account.puuid !== identity ||
        (r.key !== accountKey(year, identity) && r.key !== `${h.platform}:${year}:${identity}`)) {
        throw new Error('Wrong cached account.');
      }
      return h;
    });
    const canonical = related.find(r => r.key === accountKey(year, identity))?.history as History | undefined;
    return histories.length ? mergeHistories(histories,
      discovered && platform ? platform : canonical?.platform ?? cachedPlatform ?? histories[histories.length - 1].platform,
      year, identity, canonical) : null;
  } finally { db.close(); }
}

export async function writeHistory(history: History) {
  parseHistory(history);
  const db = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('histories', 'readwrite');
      transaction.objectStore('histories').put({
        key: accountKey(history.year, history.account.puuid),
        lookup: lookupKey(`${history.account.gameName}#${history.account.tagLine}`, history.platform, history.year),
        history
      });
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
