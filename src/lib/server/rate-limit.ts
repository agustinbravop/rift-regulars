import { setTimeout as sleep } from 'node:timers/promises';

interface Window {
  limit: number;
  duration: number;
  external: number;
  externalUntil: number;
}
interface Bucket {
  requests: number[];
  windows: Window[];
  blockedUntil: number;
}

function pairs(header: string | null): Map<number, number> | null {
  if (!header) return null;
  const parts = header.split(',').map(pair => pair.trim());
  if (!parts.every(pair => /^\d+:\d+$/.test(pair))) return null;
  const entries = parts.map(pair => pair.split(':').map(Number));
  if (!entries.every(pair => pair.length === 2 && pair.every(Number.isSafeInteger) &&
    pair[0] >= 0 && pair[1] > 0 && Number.isSafeInteger(pair[1] * 1000))) return null;
  return new Map(entries.map(([count, seconds]) => [seconds * 1000, count]));
}

const window = (limit: number, duration: number): Window =>
  ({ limit, duration, external: 0, externalUntil: 0 });

export class RiotRateLimiter {
  private app: Bucket = {
    requests: [], windows: [window(20, 1000), window(100, 120_000)], blockedUntil: 0
  };
  private methods = new Map<string, Bucket>();
  private pause: (ms: number) => Promise<unknown>;
  private now: () => number;

  constructor(pause: (ms: number) => Promise<unknown> = sleep, now = () => performance.now()) {
    this.pause = pause;
    this.now = now;
  }

  private method(name: string): Bucket {
    let bucket = this.methods.get(name);
    if (!bucket) {
      bucket = { requests: [], windows: [], blockedUntil: 0 };
      this.methods.set(name, bucket);
    }
    return bucket;
  }

  async acquire(method: string, signal?: AbortSignal) {
    const buckets = [this.app, this.method(method)];
    while (true) {
      signal?.throwIfAborted();
      const now = this.now();
      let delay = 0;
      for (const bucket of buckets) {
        const longest = Math.max(120_000, ...this.app.windows.map(w => w.duration), ...bucket.windows.map(w => w.duration));
        bucket.requests = bucket.requests.filter(at => at > now - longest);
        delay = Math.max(delay, bucket.blockedUntil - now);
        for (const w of bucket.windows) {
          const recent = bucket.requests.filter(at => at > now - w.duration);
          const external = now < w.externalUntil ? w.external : 0;
          if (recent.length + external >= w.limit) {
            const next = Math.min(
              recent.length ? recent[0] + w.duration : Infinity,
              external ? w.externalUntil : Infinity
            );
            delay = Math.max(delay, next - now + 25);
          }
        }
      }
      if (delay > 0) {
        await this.pause(delay);
        continue;
      }
      // Reserve synchronously, so callers sharing this limiter cannot spend the same quota.
      for (const bucket of buckets) bucket.requests.push(now);
      return;
    }
  }

  observe(method: string, headers: Headers) {
    const now = this.now();
    for (const [bucket, prefix] of [[this.app, 'X-App'], [this.method(method), 'X-Method']] as const) {
      const limits = pairs(headers.get(`${prefix}-Rate-Limit`));
      if (limits?.size && [...limits.values()].every(limit => limit > 0)) {
        bucket.windows = [...limits].map(([duration, limit]) =>
          bucket.windows.find(w => w.duration === duration && w.limit === limit) ?? window(limit, duration));
      }
      const counts = pairs(headers.get(`${prefix}-Rate-Limit-Count`));
      for (const w of bucket.windows) {
        const reported = counts?.get(w.duration);
        if (reported === undefined) continue;
        const scope = method.slice(0, method.indexOf(':') + 1);
        const requests = prefix === 'X-App'
          ? [...this.methods].filter(([name]) => name.startsWith(scope)).flatMap(([, b]) => b.requests)
          : bucket.requests;
        const local = requests.filter(at => at > now - w.duration).length;
        // Header counts can include requests made before startup or by another key user.
        w.external = Math.max(0, reported - local);
        w.externalUntil = now + w.duration;
      }
    }
  }

  cooldown(method: string, headers: Headers): number {
    const value = headers.get('Retry-After');
    const seconds = value === null || !value.trim() ? NaN : Number(value);
    const date = value && !Number.isFinite(seconds) ? Date.parse(value) : NaN;
    const delay = Number.isFinite(seconds) && seconds >= 0 ? Math.max(1000, seconds * 1000)
      : Number.isFinite(date) ? Math.max(1000, date - Date.now()) : 120_000;
    const type = headers.get('X-Rate-Limit-Type');
    const bucket = type === 'method' || type === 'service' ? this.method(method) : this.app;
    bucket.blockedUntil = Math.max(bucket.blockedUntil, this.now() + delay);
    return delay;
  }
}
