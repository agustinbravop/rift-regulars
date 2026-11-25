import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { compile } from 'svelte/compiler';
import { featuredAccounts } from '../src/lib/featured.ts';

const source = await readFile('src/lib/components/FeaturedCarousel.svelte', 'utf8');

test('featured catalog compiles accessibly and retains all nine configured accounts', () => {
  const result = compile(source, { filename: 'FeaturedCarousel.svelte', generate: 'server', runes: true });
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(featuredAccounts.map(account => account.id), [
    'agurin', 'thebausffs', 'tyler1', 'caedrel', 'nemesis',
    'drututt', 'aloisnl', 'dantes', 'crownie'
  ]);
  assert.match(source, /#each rows as row, rowIndex/);
  assert.match(source, /#each row as account/);
  assert.match(source, /accounts\.slice\(0, 5\)/);
  assert.match(source, /accounts\.slice\(5\)/);
  const rows = [featuredAccounts.slice(0, 5), featuredAccounts.slice(5)];
  assert.deepEqual(rows.map(row => row.map(account => account.id)), [
    ['agurin', 'thebausffs', 'tyler1', 'caedrel', 'nemesis'],
    ['drututt', 'aloisnl', 'dantes', 'crownie']
  ]);
  assert.deepEqual(rows.map(row => row.length), [5, 4]);
  assert.equal(new Set(rows.flat().map(account => account.id)).size, 9);
  assert.match(source, /<h2 id="featured-title">Or explore your favorite streamer’s account<\/h2>/);
});

test('only available cards are links; unavailable cards have disabled semantics and no action', () => {
  assert.match(source, /#if account\.riotId && account\.matches !== null\}\s*<a/);
  assert.match(source, /<div class="featured-card" role="link" aria-disabled="true">/);
  assert.equal((source.match(/<a /g) ?? []).length, 1);
  assert.doesNotMatch(source, /History unavailable|onclick|onsubmit/);
});

test('account name and tag stay on one line with conditional badge and no rendered game counts', () => {
  assert.match(source, /SummonerPortrait[\s\S]*?featured-details[\s\S]*?featured-name[\s\S]*?player-tag[\s\S]*?#if badge\}[\s\S]*?featured-badge[\s\S]*?<Badge/);
  assert.match(source, /streamerBadge\(account\.streamer, gameName\)/);
  assert.doesNotMatch(source, /account\.matches\.toLocaleString| games<\/p>/);
  assert.equal((source.match(/account\.matches !== null/g) ?? []).length, 1);
  assert.match(source, /\.featured-name \{[^}]*white-space: nowrap/);
  assert.doesNotMatch(source, /\.player-tag \{[^}]*display: block/);
});

test('static catalog has no controls, moving tracks or duplicated/hidden groups', () => {
  assert.doesNotMatch(source, /Button|<button|Pause|Play|paused|duplicate|inert|aria-hidden|animation|@keyframes|scrollBy/);
  assert.equal((source.match(/#each rows as row, rowIndex/g) ?? []).length, 1);
  assert.equal((source.match(/#each row as account/g) ?? []).length, 1);
  assert.match(source, /a\.featured-card:focus-visible \{ outline:/);
});

test('all cards wrap without clipped lists or scrollers; landing spans page gutters', async () => {
  assert.match(source, /\.featured-list \{[^}]*flex-wrap: wrap; justify-content: center; gap: 1\.5rem/);
  assert.match(source, /h2 \{[^}]*text-align: center/);
  assert.match(source, /h2 \{[^}]*font-size: 1rem; font-weight: 400/);
  assert.match(source, /\.featured-rows \{[^}]*gap: 1\.5rem/);
  assert.doesNotMatch(source, /overflow-x: auto|58rem|scroll-snap|overflow: clip|featured-list[^}]*overflow/);
  const layout = await readFile('src/routes/layout.css', 'utf8');
  assert.match(layout, /\.landing \{ max-width: none; width: 100%/);
});

test('compact intrinsic cards share centered rows without artificial padding', () => {
  assert.doesNotMatch(source, /class:offset|padding-inline-start|7rem/);
  assert.match(source, /li \{ flex: 0 0 auto; width: max-content; max-width: 100%/);
  assert.doesNotMatch(source, /--card-width|min-width: (?!0)/);
  assert.match(source, /\.featured-card \{ display: flex; align-items: center;[^}]*min-height: 6rem/);
  assert.match(source, /\.featured-details \{ position: relative/);
});

test('conditional badge floats above the name without affecting card width or alignment', () => {
  assert.match(source, /\.featured-badge \{ position: absolute; inset-inline-start: 0; bottom: calc\(100% \+ \.35rem\); max-width: 100%/);
  assert.match(source, /<Badge[^>]*class="max-w-full" title=\{badge\}><span class="truncate">/);
  assert.match(source, /\.featured-card \{ display: flex; align-items: center/);
  assert.match(source, /\.featured-rows \{[^}]*gap: 1\.5rem/);
});

test('warm vibrant badge styling is scoped and has accessible text contrast', () => {
  assert.match(source, /\.featured-badge :global\(\[data-slot="badge"\]\) \{ background: #ffbc70; color: #2b1a08/);
  const luminance = (hex: string) => {
    const rgb = hex.match(/../g)!.map(channel => {
      const value = parseInt(channel, 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  assert.ok((luminance('ffbc70') + .05) / (luminance('2b1a08') + .05) >= 4.5);
});

test('available links alone lift on hover/focus, retaining a ring and respecting reduced motion', () => {
  assert.match(source, /a\.featured-card \{ transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease/);
  assert.match(source, /a\.featured-card:hover,\s*a\.featured-card:focus-visible \{ transform: translateY\(-2px\);[^}]*border-color: var\(--primary\); box-shadow:/);
  assert.match(source, /a\.featured-card:focus-visible \{ outline: 2px solid var\(--ring\)/);
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?a\.featured-card \{ transition: none;[\s\S]*?a\.featured-card:active \{ transform: none/);
  assert.doesNotMatch(source, /transition: all|div\.featured-card:hover|(?<!a)\.featured-card:hover \{/);
});

test('active links use immediate CSS-only blue press feedback without changing navigation', () => {
  assert.match(source, /a\.featured-card:active \{ transform: translateY\(1px\) scale\(\.99\);[^}]*background:[^}]*border-color: var\(--primary\); box-shadow: inset[^}]*transition-duration: 80ms/);
  assert.doesNotMatch(source, /border-color: #ffbc70|div\.featured-card:active|onclick|onmousedown|setTimeout/);
  assert.match(source, /<a class="featured-card" href=\{playerUrl\(account\.riotId\)\}/);
});

test('featured icons alone reserve 56px without changing shared avatars', () => {
  assert.match(source, /\.featured-card :global\(\.summoner-portrait\[data-slot="avatar"\]\) \{ width: 56px; height: 56px; flex-shrink: 0/);
  assert.match(source, /\.featured-card :global\(\.summoner-portrait img\) \{ width: 100%; height: 100%; object-fit: cover/);
});
