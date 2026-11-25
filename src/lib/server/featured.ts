import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { parseHistory } from '../browser-cache.ts';
import { compactMatch, historySummary, accountIcon, type History } from '../history.ts';
import { parseDiscovery, parseMatchIds, parseSummary } from '../validation.ts';
import { featuredAccounts, type FeaturedProfile } from '../featured.ts';
import { importHistory } from '../import-history.ts';
import { readQueueLabels } from './queue-labels.ts';

export const featuredDir = resolve('data/featured');
type Api = <T>(body: Record<string, unknown>) => Promise<T>;
type Progress = (value: Record<string, unknown>) => void;
const file = (root: string, id: string, year: number, kind: string) =>
  resolve(root, `${id}-${year}.${kind}.json.gz`);

async function atomicGzip(path: string, value: unknown) {
  const bytes = gzipSync(JSON.stringify(value));
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await using handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  return bytes.length;
}

async function readGzip(path: string): Promise<unknown | null> {
  try { return JSON.parse(gunzipSync(await readFile(path)).toString('utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export async function saveFeaturedHistory(root: string, id: string, history: History) {
  const compact = compactFeaturedHistory(history);
  return atomicGzip(file(root, id, history.year, 'private'), compact);
}

function compactFeaturedHistory(value: unknown, labels: Record<string, string> = {}): History {
  const h = parseHistory(value);
  if (h.year !== new Date().getUTCFullYear()) throw new Error('Saved history year differs; existing files were kept.');
  const { puuid, gameName, tagLine } = h.account;
  const custom = h.matches.filter(m => m.info.queueId === 0).map(m => m.metadata.matchId);
  const matches = h.matches.filter(m => m.info.queueId !== 0).map(compactMatch);
  const queues = { ...h.queues, ...labels };
  return {
    account: { puuid, gameName, tagLine }, platform: h.platform, year: h.year,
    ids: h.ids, matches, excluded: [...new Set([...(h.excluded ?? []), ...custom])],
    listed: h.listed, until: h.until, updated: h.updated,
    queues: Object.fromEntries([...new Set(matches.map(m => String(m.info.queueId)))]
      .filter(id => queues[id]).map(id => [id, queues[id]]))
  };
}

export function parseFeaturedProfile(value: unknown, id: string, year: number): FeaturedProfile {
  if (!value || typeof value !== 'object') throw new Error('Invalid featured profile.');
  const p = value as FeaturedProfile;
  const { account, platform } = parseDiscovery(p);
  const summary = parseSummary(p.summary);
  parseMatchIds(p.excluded);
  if (p.version !== 1 || p.id !== id || p.year !== year || summary.year !== year ||
    summary.account !== `${account.gameName}#${account.tagLine}` || !summary.coverage.complete ||
    (p.icon !== undefined && (!Number.isSafeInteger(p.icon) || p.icon < 0))) {
    throw new Error('Invalid featured profile.');
  }
  return {
    version: 1, id, account: { puuid: account.puuid, gameName: account.gameName, tagLine: account.tagLine },
    platform, year, icon: p.icon, summary, excluded: p.excluded
  };
}

async function lockFeatured(root: string, id: string) {
  if (!featuredAccounts.some(entry => entry.id === id)) throw new Error('Unknown featured account.');
  await mkdir(root, { recursive: true });
  const path = resolve(root, 'import.lock');
  const lock = await open(path, 'wx', 0o600).catch(error => {
    if (error.code === 'EEXIST') throw new Error('A featured import is locked. Check data/featured/import.lock and its PID before removing a stale lock.');
    throw error;
  });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, id, started: new Date().toISOString() }));
  } catch (error) {
    await lock.close();
    await unlink(path);
    throw error;
  }
  return async () => { await lock.close(); await unlink(path); };
}

async function publishFeatured(root: string, id: string, history: History) {
  const summary = historySummary(history);
  summary.coverage.note = 'Retrievable current-year matches on the detected regional host plus previously imported matches. Custom games (queue 0), empty and out-of-year records are excluded. Riot may not return the full year.';
  if (!summary.coverage.complete) throw new Error('Import incomplete; previous public snapshot kept.');
  const profile = parseFeaturedProfile({
    version: 1, id, account: history.account, platform: history.platform, year: history.year,
    icon: accountIcon(history.matches, history.account.puuid), summary, excluded: history.excluded ?? []
  }, id, history.year);
  // Keep resolved aliases recognizable even if the large public snapshot is lost or corrupt.
  await atomicGzip(file(root, id, history.year, 'identity'), {
    account: profile.account, platform: profile.platform
  });
  const publicBytes = await atomicGzip(file(root, id, history.year, 'public'), profile);
  return { profile, publicBytes };
}

export async function republishFeatured(id: string, root = featuredDir, queuesPath?: string) {
  const unlock = await lockFeatured(root, id);
  try {
    const year = new Date().getUTCFullYear();
    const history = compactFeaturedHistory(
      await readGzip(file(root, id, year, 'private')), await readQueueLabels(queuesPath)
    );
    if (!historySummary(history).coverage.complete) throw new Error('Import incomplete; previous public snapshot kept.');
    await saveFeaturedHistory(root, id, history);
    return (await publishFeatured(root, id, history)).profile;
  } finally { await unlock(); }
}

export async function readFeaturedProfile(root: string, id: string, year: number) {
  try {
    const value = await readGzip(file(root, id, year, 'public'));
    return value === null ? null : parseFeaturedProfile(value, id, year);
  } catch { return null; }
}

export async function loadFeatured(riotId: string, root = featuredDir, year = new Date().getUTCFullYear()) {
  const normalized = riotId.toLowerCase();
  for (const entry of featuredAccounts) {
    let matches = entry.riotId?.toLowerCase() === normalized;
    if (!matches) {
      try {
        const identity = parseDiscovery(await readGzip(file(root, entry.id, year, 'identity')));
        matches = `${identity.account.gameName}#${identity.account.tagLine}`.toLowerCase() === normalized;
      } catch { /* Configured IDs still stay featured if their identity file is unavailable. */ }
    }
    if (matches) {
      return { featured: true as const, profile: await readFeaturedProfile(root, entry.id, year) };
    }
  }
  return { featured: false as const, profile: null };
}

export async function featuredPageData(riotId: string, root = featuredDir, year = new Date().getUTCFullYear()) {
  const { featured, profile } = await loadFeatured(riotId, root, year);
  if (profile) {
    const { summary, ...metadata } = profile;
    return { featured, profile: metadata, summary, error: null };
  }
  return {
    featured, profile: null, summary: null,
    error: featured ? 'This featured history is temporarily unavailable. Try again later or choose another player.' : null
  };
}

export async function featuredCards(root = featuredDir, year = new Date().getUTCFullYear()) {
  return Promise.all(featuredAccounts.map(async entry => {
    const profile = await readFeaturedProfile(root, entry.id, year);
    return {
      ...entry, riotId: profile ? `${profile.account.gameName}#${profile.account.tagLine}` : entry.riotId,
      icon: profile?.icon, matches: profile?.summary.matches ?? null
    };
  }));
}

export async function importFeatured(
  id: string, riotId: string, api: Api, log: Progress, root = featuredDir,
  interrupted: () => boolean = () => false, queues: Record<string, string> = {}
) {
  const year = new Date().getUTCFullYear();
  const unlock = await lockFeatured(root, id);
  let history: History | null = null;
  let privateBytes = 0;
  const request: Api = async <T>(body: Record<string, unknown>): Promise<T> => {
    if (interrupted()) throw new Error('Import interrupted; checkpoint kept.');
    const result = await api<T>(body);
    if (interrupted()) throw new Error('Import interrupted; checkpoint kept.');
    return result;
  };
  const checkpoint = async (message: string) => {
    const bytes = await saveFeaturedHistory(root, id, history!);
    privateBytes = bytes;
    const h = history!;
    const processed = h.matches.length + (h.excluded?.length ?? 0);
    log({ id, phase: h.listed ? 'downloading' : 'listing', listed: h.ids.length,
      downloaded: h.matches.length, excluded: h.excluded?.length ?? 0,
      processed, remaining: h.ids.length - processed, compressedBytes: bytes, message });
    return bytes;
  };
  try {
    log({ id, phase: 'discovery' });
    const discovered = parseDiscovery(await request({ action: 'discover', riotId }));
    const previous = await readGzip(file(root, id, year, 'private'));
    const saved = previous === null ? null : parseHistory(previous);
    if (saved && (saved.year !== year || saved.account.puuid !== discovered.account.puuid)) {
      throw new Error('Saved history year or account identity differs; existing files were kept.');
    }
    history = saved ?? {
      ...discovered, year, ids: [], matches: [], excluded: [], queues: {},
      listed: false, until: Math.floor(Date.now() / 1000), updated: new Date().toISOString()
    };
    const { puuid, gameName, tagLine } = discovered.account;
    history.account = { puuid, gameName, tagLine };
    history.platform = discovered.platform;
    history.queues = { ...history.queues, ...queues };
    // Old checkpoints must not reintroduce custom games into public summaries.
    const custom = history.matches.filter(m => m.info.queueId === 0).map(m => m.metadata.matchId);
    history.matches = history.matches.filter(m => m.info.queueId !== 0);
    history.excluded = [...new Set([...(history.excluded ?? []), ...custom])];
    await importHistory(history, body => request({ ...body, platform: history!.platform }),
      async (_history, message) => { await checkpoint(message); });
    if (interrupted()) throw new Error('Import interrupted; checkpoint kept.');
    history = compactFeaturedHistory(history);
    const { profile, publicBytes } = await publishFeatured(root, id, history);
    log({ id, phase: 'complete', listed: history.ids.length, downloaded: history.matches.length,
      excluded: history.excluded?.length ?? 0, compressedBytes: privateBytes,
      publicCompressedBytes: publicBytes });
    return profile;
  } catch (error) {
    if (history) {
      try { await checkpoint('Paused; previous public snapshot kept.'); }
      catch { log({ id, phase: 'checkpoint-failed', message: 'Checkpoint write failed; last atomic checkpoint kept.' }); }
    }
    log({ id, phase: 'failed', message: error instanceof Error ? error.message : 'Import failed' });
    throw error;
  } finally {
    await unlock();
  }
}
