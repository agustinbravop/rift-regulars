import { setTimeout as sleep } from 'node:timers/promises';

const api = 'https://americas.api.riotgames.com';

export class Riot {
  private lastRequest = 0;
  private key: string;
  private request: typeof fetch;
  private pause: (ms: number) => Promise<unknown>;
  private signal?: AbortSignal;

  constructor(
    key: string,
    request: typeof fetch = fetch,
    pause: (ms: number) => Promise<unknown> = sleep,
    signal?: AbortSignal
  ) {
    if (!key.trim()) throw new Error('Set RIOT_API_KEY in your environment or familiar_players/.env.');
    this.key = key;
    this.request = request;
    this.pause = pause;
    this.signal = signal;
  }

  async get(path: string): Promise<unknown> {
    for (let attempt = 0; attempt < 6; attempt++) {
      this.signal?.throwIfAborted();
      // Leave headroom beneath development keys' 100 requests / 2 minutes.
      await this.pause(Math.max(0, 1300 - (performance.now() - this.lastRequest)));
      this.signal?.throwIfAborted();
      this.lastRequest = performance.now();
      let response: Response;
      try {
        response = await this.request(api + path, {
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
      if (response.ok) return response.json();
      if (response.status !== 429 && response.status < 500) {
        const messages: Record<number, string> = {
          401: 'API key is invalid.',
          403: 'API key was rejected. Renew your development key.',
          404: 'Account or match not found.'
        };
        throw new Error(messages[response.status] ?? `Riot returned HTTP ${response.status}.`);
      }
      const retry = Number(response.headers.get('Retry-After') ?? 120);
      const wait = response.status === 429
        ? (Number.isFinite(retry) ? Math.max(1, retry) : 120) * 1000
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
