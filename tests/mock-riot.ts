import { account, match } from './fixtures.ts';

// Preloaded only by importer tests, in a temporary working directory.
globalThis.fetch = async (url) => {
  const path = new URL(String(url)).pathname;
  if (process.env.FP_TEST_CASE === 'rejected') return new Response('', { status: 403 });
  if (path.includes('/accounts/')) return Response.json(account);
  if (path.endsWith('/queues.json')) return Response.json([{ queueId: 420, description: 'Ranked solo' }]);
  if (path.endsWith('/ids')) return Response.json(['LA2_2', 'LA2_1']);
  if (process.env.FP_TEST_CASE === 'cached') throw new Error('Cached matches should not be fetched.');
  const id = Number(path.split('_').at(-1));
  const value = match(id);
  value.info.gameStartTimestamp = Date.UTC(new Date().getUTCFullYear(), 1, id);
  return Response.json(value);
};
