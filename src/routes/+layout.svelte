<script lang="ts">
  import './layout.css';
  import { page } from '$app/state';
  import { Toaster } from '#lib/components/ui/sonner/index.js';
  import SiteFooter from '#lib/components/SiteFooter.svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<Toaster position="top-right" closeButton duration={8000} />

<div class="site-shell">
  <div class="site-content">
    {#key `${page.url.pathname}:${page.state.platform ?? ''}`}
      {@render children()}
    {/key}
  </div>
  <SiteFooter />
</div>
