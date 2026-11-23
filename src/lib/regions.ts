export const regions = {
  LA2: { label: 'LAS', routing: 'americas' },
  LA1: { label: 'LAN', routing: 'americas' },
  NA1: { label: 'NA', routing: 'americas' },
  BR1: { label: 'BR', routing: 'americas' },
  EUW1: { label: 'EUW', routing: 'europe' },
  EUN1: { label: 'EUNE', routing: 'europe' },
  TR1: { label: 'TR', routing: 'europe' },
  RU: { label: 'RU', routing: 'europe' },
  ME1: { label: 'ME', routing: 'europe' },
  KR: { label: 'KR', routing: 'asia' },
  JP1: { label: 'JP', routing: 'asia' },
  OC1: { label: 'OCE', routing: 'sea' },
  SG2: { label: 'SEA', routing: 'sea' },
  TW2: { label: 'TW', routing: 'sea' },
  VN2: { label: 'VN', routing: 'sea' }
} as const;

export type Platform = keyof typeof regions;

export function parsePlatform(value: unknown): Platform {
  if (typeof value !== 'string' || !Object.hasOwn(regions, value)) throw new Error('Choose a supported server.');
  return value as Platform;
}

export function parseRiotId(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter a player name and #TAG.');
  const parts = value.trim().split('#');
  const gameName = parts[0]?.trim(), tagLine = parts[1]?.trim();
  if (parts.length !== 2 || !gameName || !tagLine || gameName.length > 100 || tagLine.length > 20 ||
    /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Enter a player name and #TAG.');
  return { gameName, tagLine };
}
