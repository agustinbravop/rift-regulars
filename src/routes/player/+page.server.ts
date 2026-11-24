import { redirect } from '@sveltejs/kit';
import { playerUrl } from '#lib/player-url.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  let destination = '/';
  try {
    const riotId = url.searchParams.get('player');
    if (riotId) destination = playerUrl(riotId);
  } catch { /* Invalid legacy links return to search. */ }
  redirect(307, destination);
};
