<script lang="ts">
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<a class="skip-link" href="#legal-content">Skip to legal content</a>
<header class="app-header">
  <div class="header-inner">
    <a class="wordmark" href="/" aria-label="Rift Regulars home">
      <img class="brand-symbol" src="/brand-logo.png" alt="" width="56" height="56" />Rift Regulars
    </a>
  </div>
</header>

<main id="legal-content" class="legal-page" tabindex="-1">
  {@render children()}
</main>
