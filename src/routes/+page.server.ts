import { featuredCards } from '#lib/server/featured.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ featured: await featuredCards() });
