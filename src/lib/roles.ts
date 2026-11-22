import type { Participant } from './types.ts';

export const roleLabels = {
  top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support'
};
export type Role = keyof typeof roleLabels;

const positions: Record<string, Role> = {
  TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', BOTTOM: 'bot', UTILITY: 'support'
};

export function participantRole(participant: Participant): Role | undefined {
  const position = participant.teamPosition || participant.individualPosition || '';
  return Object.hasOwn(positions, position) ? positions[position] : undefined;
}
