<script lang="ts">
  import { Badge } from '#lib/components/ui/badge/index.js';
  import SummonerPortrait from './SummonerPortrait.svelte';
  import { streamerBadge } from '#lib/featured.ts';
  import { playerUrl } from '#lib/player-url.ts';

  type AccountCard = {
    id: string; streamer: string; riotId: string | null; icon?: number; matches: number | null
  };
  let { accounts }: { accounts: AccountCard[] } = $props();
  const rows = $derived([
    accounts.slice(0, 5),
    accounts.slice(5)
  ]);
</script>

{#snippet card(account: AccountCard)}
  {@const gameName = account.riotId?.split('#')[0] ?? account.streamer}
  {@const tag = account.riotId?.split('#')[1]}
  {@const badge = streamerBadge(account.streamer, gameName)}
  <SummonerPortrait icon={account.icon} name={gameName} />
  <div class="featured-details">
    <p class="featured-name" title={account.riotId ?? gameName}>{gameName}{#if tag}<span class="player-tag">#{tag}</span>{/if}</p>
    {#if badge}
      <span class="featured-badge">
        <Badge variant="secondary" class="max-w-full" title={badge}><span class="truncate">{badge}</span></Badge>
      </span>
    {/if}
  </div>
{/snippet}

<section class="featured-section" aria-labelledby="featured-title">
  <h2 id="featured-title">Or explore your favorite streamer’s account</h2>
  <div class="featured-rows">
    {#each rows as row, rowIndex}
      <ul class="featured-list"
        aria-label={`Featured player histories, row ${rowIndex + 1}`}>
        {#each row as account (account.id)}
          <li>
            {#if account.riotId && account.matches !== null}
              <a class="featured-card" href={playerUrl(account.riotId)}>{@render card(account)}</a>
            {:else}
              <div class="featured-card" role="link" aria-disabled="true">{@render card(account)}</div>
            {/if}
          </li>
        {/each}
      </ul>
      {/each}
  </div>
</section>

<style>
  .featured-section { width: 100%; min-width: 0; margin: 3rem auto 0; text-align: left; }
  h2 { margin-bottom: 1rem; font-size: 1rem; font-weight: 400; text-align: center; }
  .featured-rows { display: flex; flex-direction: column; gap: 1.5rem; }
  .featured-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 1.5rem; list-style: none; }
  li { flex: 0 0 auto; width: max-content; max-width: 100%; }
  .featured-card { display: flex; align-items: center; gap: .75rem; min-height: 6rem; height: 100%; padding: .75rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); text-decoration: none; }
  .featured-card :global(.summoner-portrait[data-slot="avatar"]) { width: 56px; height: 56px; flex-shrink: 0; }
  .featured-card :global(.summoner-portrait img) { width: 100%; height: 100%; object-fit: cover; }
  .featured-details { position: relative; min-width: 0; font-size: .95rem; line-height: 1.35; }
  .featured-badge { position: absolute; inset-inline-start: 0; bottom: calc(100% + .35rem); max-width: 100%; }
  .featured-badge :global([data-slot="badge"]) { background: #ffbc70; color: #2b1a08; border-color: transparent; }
  a.featured-card { transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease; }
  a.featured-card:hover,
  a.featured-card:focus-visible { transform: translateY(-2px); background: color-mix(in oklch, var(--card), var(--foreground) 4%); border-color: var(--primary); box-shadow: 0 5px 14px rgb(0 0 0 / .22); }
  a.featured-card:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
  a.featured-card:active { transform: translateY(1px) scale(.99); background: color-mix(in oklch, var(--card), black 10%); border-color: var(--primary); box-shadow: inset 0 2px 4px rgb(0 0 0 / .18); transition-duration: 80ms; }
  .featured-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font-weight: 600; white-space: nowrap; }
  .featured-name .player-tag { font-weight: 400; }
  @media (prefers-reduced-motion: reduce) {
    a.featured-card { transition: none; }
    a.featured-card:hover,
    a.featured-card:focus-visible,
    a.featured-card:active { transform: none; }
  }
</style>
