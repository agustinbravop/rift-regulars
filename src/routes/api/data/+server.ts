import { json } from '@sveltejs/kit';
import { readSavedData } from '#lib/server/storage.ts';

export async function GET() {
  return json(await readSavedData(), {
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}
