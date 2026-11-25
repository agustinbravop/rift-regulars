import type { PageServerLoad } from './$types';
import { featuredPageData } from '#lib/server/featured.ts';

export const load: PageServerLoad = async ({ setHeaders, params }) => {
  setHeaders({ 'cache-control': 'no-store' });
  return featuredPageData(params.riotId);
};
