import type { History } from './history.ts';
import { parseAccount, parseMatch, parseMatchIds, parseQueues } from './validation.ts';
import { parsePlatform, type Platform } from './regions.ts';

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('familiar-players', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('histories', { keyPath: 'key' });
      store.createIndex('lookup', 'lookup');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Familiar Players tabs to open the cache.'));
  });
}

const lookupKey = (riotId: string, platform: Platform, year: number) =>
  `${platform}:${year}:${riotId.toLowerCase()}`;

export function parseHistory(value: unknown): History {
  if (!value || typeof value !== 'object') throw new Error('Invalid browser history.');
  const h = value as History;
  parseAccount(h.account);
  parsePlatform(h.platform);
  parseMatchIds(h.ids);
  parseQueues(h.queues);
  if (!Number.isSafeInteger(h.year) || typeof h.listed !== 'boolean' ||
    !Number.isFinite(h.until) || !Number.isFinite(Date.parse(h.updated)) ||
    !Array.isArray(h.matches)) throw new Error('Invalid browser history.');
  const ids = new Set(h.ids), matches = new Set<string>();
  for (const value of h.matches) {
    const match = parseMatch(value);
    if (!ids.has(match.metadata.matchId) || matches.has(match.metadata.matchId) ||
      !match.metadata.matchId.startsWith(`${h.platform}_`) ||
      !match.info.participants.some(p => p.puuid === h.account.puuid)) throw new Error('Invalid cached match.');
    matches.add(match.metadata.matchId);
  }
  if (h.excluded !== undefined) {
    const excluded = parseMatchIds(h.excluded);
    if (new Set(excluded).size !== excluded.length ||
      excluded.some(id => !ids.has(id) || matches.has(id) || !id.startsWith(`${h.platform}_`))) {
      throw new Error('Invalid excluded match.');
    }
  }
  return h;
}

export async function readHistory(riotId: string, platform: Platform, year: number, puuid?: string): Promise<History | null> {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('histories', 'readonly');
      const store = transaction.objectStore('histories');
      const request = puuid ? store.get(`${platform}:${year}:${puuid}`)
        : store.index('lookup').get(lookupKey(riotId, platform, year));
      request.onsuccess = () => {
        try {
          const h = request.result ? parseHistory(request.result.history) : null;
          if (h && (h.platform !== platform || h.year !== year)) throw new Error('Wrong cached account.');
          resolve(h);
        } catch (error) { reject(error); }
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function writeHistory(history: History) {
  const db = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('histories', 'readwrite');
      transaction.objectStore('histories').put({
        key: `${history.platform}:${history.year}:${history.account.puuid}`,
        lookup: lookupKey(`${history.account.gameName}#${history.account.tagLine}`, history.platform, history.year),
        history
      });
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
