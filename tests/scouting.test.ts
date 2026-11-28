import assert from 'node:assert/strict';
import { test } from 'node:test';
import { record, resultSummary, summarize } from '../src/lib/encounters.ts';
import { queueLabel, recentChampions, rosterPage, rosterPageIndex, ROSTER_PAGE_SIZE, shouldExpandRow, sortPlayers } from '../src/lib/scouting.ts';
import { parseMatch, parseSummary } from '../src/lib/server/validation.ts';
import { filterPlayers } from '../src/lib/encounters.ts';
import { account, coverage, match, year } from './fixtures.ts';

const player = summarize(account, [match(1), match(2)], year, {}, coverage).players[0];

test('filtered expanded players retain their identity and only the selected queue encounters', () => {
  const encounters = ['420', '450', '420'].map(queue => ({ ...player.encounters[0], queue }));
  const players = [{ ...player, encounters }];
  const filtered = filterPlayers(players, '', '420');
  const expanded = filtered.find(candidate => candidate.id === player.id);
  assert.ok(expanded);
  assert.deepEqual(expanded.encounters.map(event => event.queue), ['420', '420']);
  assert.equal(filterPlayers(players, '', '450').some(candidate => candidate.id === player.id), false);
  assert.equal(filterPlayers(players, '', '420', false, [player.id]).length, 0);
  assert.equal(players[0].encounters.length, 3);
});

test('row expansion ignores interactive controls, the premade cell, and selected text', () => {
  assert.equal(shouldExpandRow({ closest: () => null }, ''), true);
  assert.equal(shouldExpandRow({ closest: () => null }, 'selected player name'), false);
  for (const selector of ['button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[contenteditable]:not([contenteditable="false"])', '.premade-action-cell']) {
    const target = { closest: (selectors: string) => {
      assert.ok(selectors.split(', ').includes(selector));
      return {} as Element;
    } };
    assert.equal(shouldExpandRow(target, ''), false);
  }
});

test('recent champions keeps the three newest distinct picks from filtered encounters', () => {
  const encounters = ['Ahri', 'Ahri', 'Lux', 'Ahri', 'Garen', 'Ashe'].map((champion, index) => ({
    ...player.encounters[0], champion, at: 100 - index, queue: index < 2 ? '420' : '450'
  }));
  assert.deepEqual(recentChampions(encounters), ['Ahri', 'Lux', 'Garen']);
  const filtered = filterPlayers([{ ...player, encounters }], '', '450');
  assert.deepEqual(recentChampions(filtered[0].encounters), ['Lux', 'Ahri', 'Garen']);
  assert.deepEqual(recentChampions(encounters.slice(0, 2)), ['Ahri']);
  assert.deepEqual(recentChampions([]), []);
  assert.equal(encounters.length, 6);
});

test('win rates use only known results and do not invent a rate for empty history', () => {
  const events = structuredClone(player.encounters);
  events[0].win = true;
  events[1].win = false;
  events.push({ ...events[0], match: 'LA2_3', win: null });
  assert.deepEqual(resultSummary(events), { wins: 1, losses: 1, unknown: 1, remakes: 0, winRate: 50 });
  assert.equal(record(events), '1W / 1L / 1 unknown');
  assert.deepEqual(resultSummary([]), { wins: 0, losses: 0, unknown: 0, remakes: 0, winRate: null });
  assert.equal(resultSummary([{ ...events[0], win: null }]).winRate, null);
});

test('roster renders a bounded page without changing ranking or losing the final players', () => {
  const players = Array.from({ length: 53 }, (_, index) => ({ ...player, id: `player-${index}` }));
  const first = rosterPage(players, 0);
  assert.equal(first.items.length, ROSTER_PAGE_SIZE);
  assert.equal(first.pages, 2);
  assert.equal(first.items[0].id, 'player-0');
  const second = rosterPage(players, 1);
  assert.equal(second.start, 50);
  assert.equal(second.items[0].id, 'player-50');
  const final = second;
  assert.deepEqual(final.items.map(p => p.id), ['player-50', 'player-51', 'player-52']);
  assert.equal(final.end, 53);
  assert.equal(players.length, 53);
});

test('page query parameters use one-based pages and reject invalid values', () => {
  assert.equal(rosterPageIndex('4'), 3);
  assert.equal(rosterPageIndex('1'), 0);
  for (const value of [null, '', '0', '-1', '2.5', 'NaN', 'Infinity', '1e2', '9007199254740992']) {
    assert.equal(rosterPageIndex(value), 0);
  }
});

test('paging remains valid after filtering, including empty and reduced result sets', () => {
  assert.equal(rosterPage([player], 19).index, 0);
  assert.equal(rosterPage([player], -1).index, 0);
  assert.equal(rosterPage([player], Number.NaN).index, 0);
  assert.deepEqual(rosterPage([], 19), { items: [], index: 0, pages: 1, start: 0, end: 0 });
});

test('sorts columns in both directions without mutating the original list', () => {
  const older = { ...structuredClone(player), id: 'older', name: 'Alpha', tagLine: 'ZZZ' };
  older.encounters[0].at = 1;
  older.encounters[0].champion = 'Ahri';
  const newer = { ...structuredClone(player), id: 'newer', name: 'Beta' };
  newer.encounters[0].champion = 'Zyra';
  newer.encounters.push({ ...newer.encounters[1], match: 'LA2_3' });
  const players = [older, newer];
  for (const column of ['name', 'lastSeen', 'lastOn', 'encounters'] as const) {
    assert.equal(sortPlayers(players, column, 'asc')[0].id, 'older');
    assert.equal(sortPlayers(players, column, 'desc')[0].id, 'newer');
  }
  assert.equal(players[0].id, 'older');
  const sameName = { ...older, id: 'same-name', tagLine: 'AAA' };
  assert.equal(sortPlayers([older, sameName], 'name', 'asc')[0].id, 'same-name');
});

test('record columns sort by wins and prefer fewer losses on tied wins', () => {
  const better = { ...structuredClone(player), id: 'better' };
  const worse = { ...structuredClone(player), id: 'worse' };
  worse.encounters[1].win = false;
  assert.equal(sortPlayers([worse, better], 'playedWith', 'desc')[0].id, 'better');
  for (const p of [better, worse]) p.encounters.forEach(e => e.together = false);
  assert.equal(sortPlayers([worse, better], 'playedAgainst', 'desc')[0].id, 'better');
  assert.equal(sortPlayers([worse, better], 'playedAgainst', 'asc')[0].id, 'worse');
  const tiedWins = { ...structuredClone(better), id: 'tied-wins' };
  tiedWins.encounters.push({ ...tiedWins.encounters[0], match: 'LA2_3', win: false });
  assert.equal(sortPlayers([tiedWins, better], 'playedAgainst', 'desc')[0].id, 'better');
});

test('uses the requested short queue names and preserves unknown queue fallbacks', () => {
  const queues = { '420': '5v5 Ranked Solo games', '440': '5v5 Ranked Flex games', '450': 'ARAM' };
  assert.equal(queueLabel('420', queues), 'Ranked Solo/Duo');
  assert.equal(queueLabel('440', queues), 'Ranked Flex');
  assert.equal(queueLabel('1750', queues), 'Arena');
  assert.equal(queueLabel('710', queues), 'Ranked 5s');
  assert.equal(queueLabel('450', queues), 'ARAM');
  assert.equal(queueLabel('450', { 450: '5v5 ARAM games' }), '5v5 ARAM');
  assert.equal(queueLabel('480', { 480: 'Swiftplay Games' }), 'Swiftplay');
  assert.equal(queueLabel('400', { 400: '  5v5 Draft Pick games  ' }), '5v5 Draft Pick');
  assert.equal(queueLabel('99998', { 99998: 'Games Festival' }), 'Games Festival');
  assert.equal(queueLabel('3200', queues), 'Howling Abyss Blind Custom');
  assert.equal(queueLabel('3200', { 3200: '' }), 'Howling Abyss Blind Custom');
  assert.equal(queueLabel('3200', { 3200: 'Saved custom name' }), 'Saved custom name');
  assert.equal(queueLabel('99999', queues), 'Queue 99999');
});

test('retains and searches the latest match-provided tag without extra lookups', () => {
  const first = match(1), latest = match(2);
  first.info.participants[1].riotIdTagline = 'OLD';
  latest.info.participants[1].riotIdTagline = 'NEW';
  const summary = summarize(account, [latest, first], year, {}, coverage);
  assert.equal(summary.players[0].tagLine, 'NEW');
  assert.equal(filterPlayers(summary.players, '#new', 'all').length, 1);
  assert.equal(filterPlayers(summary.players, '#old', 'all').length, 0);
  assert.throws(() => parseMatch({
    ...latest, info: { ...latest.info, participants: [{ ...latest.info.participants[1], riotIdTagline: 123 }] }
  }));
  assert.throws(() => parseSummary({ ...summary, players: [{ ...summary.players[0], tagLine: 123 }] }));
});
