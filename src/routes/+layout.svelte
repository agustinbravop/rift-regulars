<script lang="ts">
  import './layout.css';
  import { page } from '$app/state';
  import { Toaster } from '#lib/components/ui/sonner/index.js';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
</script>

<Toaster position="top-right" closeButton duration={8000} />

{#key `${page.url.pathname}:${page.url.searchParams.get('server') ?? ''}`}
  {@render children()}
{/key}
