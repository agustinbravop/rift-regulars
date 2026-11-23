import { json } from '@sveltejs/kit';
import { RIOT_API_KEY } from '$app/env/private';
import { historyRequest } from '#lib/server/history.ts';
import { RiotError } from '#lib/server/riot.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url }) => {
  const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Invalid origin.' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return json({ error: 'Expected JSON.' }, { status: 415, headers });
  }
  try {
    // Bound the body even when Content-Length is absent or dishonest.
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Empty request.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw new Error('Request too large.'); }
      chunks.push(value);
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return json(await historyRequest(input, RIOT_API_KEY ?? ''), { headers });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not fetch history. Try Refresh.' }, {
      status: error instanceof RiotError ? error.status : 400, headers
    });
  }
};
