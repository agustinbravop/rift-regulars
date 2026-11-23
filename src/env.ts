import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
  RIOT_API_KEY: { schema: value => value ?? '' }
});
