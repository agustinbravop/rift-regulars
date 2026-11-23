import { json } from '@sveltejs/kit';

export async function GET() {
  return json({ error: 'History is now stored in your browser. Search for a player to begin.' }, {
    status: 410,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
  });
}
