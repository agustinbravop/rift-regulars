import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { compile } from 'svelte/compiler';

const source = await readFile('src/routes/+error.svelte', 'utf8');

test('error page compiles accessibly and distinguishes missing pages from temporary failures', () => {
  const result = compile(source, { filename: '+error.svelte', generate: 'server', runes: true });
  assert.deepEqual(result.warnings, []);
  assert.match(source, /page\.status === 404 \? 'Page not found' : 'Temporarily unavailable'/);
  assert.match(source, /<title>\{title\} \| Rift Regulars<\/title>/);
  assert.match(source, /This page doesn’t exist or may have moved\./);
  assert.match(source, /Please try again in a moment\./);
  assert.match(source, /<Button href="\/" size="lg">Back to search<\/Button>/);
  assert.match(source, /<h1>\{title\}<\/h1>/);
  assert.match(source, /<main id="main-content"[^>]*tabindex="-1"/);
  assert.match(source, /class="wordmark" href="\/"/);
  assert.match(source, /name="robots" content="noindex"/);
  assert.doesNotMatch(source, /page\.error|goto\(|window\.location|<SiteFooter/);
});
