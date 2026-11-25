<script lang="ts">
  import PlayerSearch from '#lib/components/PlayerSearch.svelte';
  import FeaturedCarousel from '#lib/components/FeaturedCarousel.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Rift Regulars | Know the names on Summoner’s Rift</title>
  <meta name="description" content="Find the teammates and opponents you keep meeting in League of Legends. Search your Riot ID to scan this year's match history." />
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
  <link rel="icon" href="/favicon.png" type="image/png" sizes="48x48" />
  <link rel="preload" href="/fonts/public-sans-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<a class="skip-link" href="#main-content">Skip to player search</a>
<header class="app-header">
  <div class="header-inner">
    <a class="wordmark" href="/" aria-label="Rift Regulars home">
      <img class="brand-symbol" src="/brand-logo.png" alt="" width="56" height="56" />Rift Regulars
    </a>
  </div>
</header>

<main id="main-content" class="landing" tabindex="-1">
  <section class="landing-hero" aria-labelledby="hero-title">
    <h1 id="hero-title">Know the names you keep seeing on Summoner’s Rift.</h1>
    <p class="hero-description">Find the teammates and opponents you meet most often in this year’s matches.</p>
    <PlayerSearch />
  </section>
  <FeaturedCarousel accounts={data.featured} />
</main>
