import type { Account } from './lib/types.ts';
import type { Platform as RiotPlatform } from './lib/regions.ts';

declare global {
  namespace App {
    interface PageState {
      account?: Account;
      platform?: RiotPlatform;
      riotId?: string;
      lookupError?: string;
    }
  }
}

export {};
