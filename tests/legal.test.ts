import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('all pages share legal links, contact, and one Riot disclaimer', async () => {
  const layout = await source('routes/+layout.svelte');
  const footer = await source('lib/components/SiteFooter.svelte');
  const player = await source('routes/player/[riotId]/+page.svelte');
  assert.match(layout, /<SiteFooter\s*\/>/);
  assert.ok(layout.indexOf('<SiteFooter') > layout.indexOf('{/key}'));
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
  assert.match(footer, /href="mailto:agustinbravop1@gmail.com"/);
  assert.match(footer, /Rift Regulars isn't endorsed by Riot Games/);
  assert.doesNotMatch(player, /not endorsed by Riot Games/);
});

test('legal pages have titles, headings, and a real contact address', async () => {
  for (const [route, title] of [['privacy', 'Privacy Policy'], ['terms', 'Terms of Service']]) {
    const page = await source(`routes/(legal)/${route}/+page.svelte`);
    assert.ok(page.includes(`<title>${title} | Rift Regulars</title>`));
    assert.ok(page.includes(`<h1>${title}</h1>`));
    assert.match(page, /mailto:agustinbravop1@gmail.com/);
    assert.doesNotMatch(page, /TODO|placeholder|support@your/);
  }
});
