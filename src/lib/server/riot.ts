import { setTimeout as sleep } from 'node:timers/promises';
import { RiotRateLimiter } from './rate-limit.ts';

export class RiotError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class Riot {
  private limiter: RiotRateLimiter;
  private key: string;
  private request: typeof fetch;
  private pause: (ms: number) => Promise<unknown>;
  private signal?: AbortSignal;
  private routing: string;

  constructor(
    key: string,
    request: typeof fetch = fetch,
    pause: (ms: number) => Promise<unknown> = sleep,
    signal?: AbortSignal,
    routing: 'americas' | 'europe' | 'asia' | 'sea' = 'americas',
    limiter?: RiotRateLimiter
  ) {
    if (!key.trim()) throw new Error('Set RIOT_API_KEY in your environment or rift_regulars/.env.');
    this.key = key;
    this.request = request;
    this.pause = pause;
    this.signal = signal;
    this.routing = routing;
    this.limiter = limiter ?? new RiotRateLimiter(pause);
  }

  async get(path: string): Promise<unknown> {
    const endpoint = path.startsWith('/riot/account/v1/region/') ? 'account-region'
      : path.startsWith('/riot/account/') ? 'account'
      : path.includes('/by-puuid/') ? 'match-ids'
      : path.startsWith('/lol/match/v5/matches/') ? 'match-details' : path.split('?')[0];
    const method = `${this.routing}:${endpoint}`;
    for (let attempt = 0; attempt < 6; attempt++) {
      this.signal?.throwIfAborted();
      await this.limiter.acquire(method, this.signal);
      this.signal?.throwIfAborted();
      let response: Response;
      try {
        response = await this.request(`https://${this.routing}.api.riotgames.com` + path, {
          headers: { 'X-Riot-Token': this.key },
          signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(this.signal ? [this.signal] : [])]),
          redirect: 'error'
        });
      } catch {
        this.signal?.throwIfAborted();
        if (attempt === 5) throw new Error('Cannot reach Riot. Saved progress is safe; rerun bun run fetch.');
        await this.pause(1000 * 2 ** attempt);
        continue;
      }
      this.limiter.observe(method, response.headers);
      if (response.ok) return response.json();
      if (response.status !== 429 && response.status < 500) {
        const messages: Record<number, string> = {
          401: 'API key is invalid.',
          403: 'API key was rejected. Renew your development key.',
          404: 'Account or match not found.'
        };
        throw new RiotError(messages[response.status] ?? `Riot returned HTTP ${response.status}.`, response.status);
      }
      const wait = response.status === 429
        ? this.limiter.cooldown(method, response.headers)
        : 1000 * 2 ** attempt;
      await response.body?.cancel();
      if (attempt < 5) {
        console.log(`Riot HTTP ${response.status}; retrying in ${wait / 1000}s.`);
        await this.pause(wait);
      }
    }
    throw new Error('Riot retries exhausted. Saved progress is safe; rerun bun run fetch.');
  }
}
