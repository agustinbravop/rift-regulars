<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '#lib/components/ui/button/index.js';

  const title = $derived(page.status === 404 ? 'Page not found' : 'Temporarily unavailable');
</script>

<svelte:head>
  <title>{title} | Rift Regulars</title>
  <meta name="robots" content="noindex" />
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
  <link rel="icon" href="/favicon.png" type="image/png" sizes="48x48" />
</svelte:head>

<a class="skip-link" href="#main-content">Skip to main content</a>
<header class="app-header">
  <div class="header-inner">
    <a class="wordmark" href="/" aria-label="Rift Regulars home">
      <img class="brand-symbol" src="/brand-logo.png" alt="" width="56" height="56" />Rift Regulars
    </a>
  </div>
</header>

<main id="main-content" class="error-page" tabindex="-1">
  <h1>{title}</h1>
  <p>{page.status === 404
    ? 'This page doesn’t exist or may have moved.'
    : 'We couldn’t load this page. Please try again in a moment.'}</p>
  <Button href="/" size="lg">Back to search</Button>
</main>

<style>
  .error-page { display: flex; flex-direction: column; align-items: center; gap: 24px; padding-block: clamp(64px, 14vh, 160px); text-align: center; }
  h1 { font-size: clamp(2rem, 5vw, 3rem); }
  p { color: var(--muted-foreground); }
</style>
