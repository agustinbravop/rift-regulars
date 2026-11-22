<script lang="ts">
  import { tick } from 'svelte';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import * as Table from '#lib/components/ui/table/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { Separator } from '#lib/components/ui/separator/index.js';
  import ChampionPortrait from '#lib/components/ChampionPortrait.svelte';
  import { formatDate } from '#lib/encounters.ts';
  import { championLabel } from '#lib/champions.ts';
  import { roleLabels, type Role } from '#lib/roles.ts';
  import { championRowsThatFit, matchUrl, sortMatches, type MatchSort } from '#lib/match-history.ts';
  import { queueLabel, type SortDirection } from '#lib/scouting.ts';
  import type { Player } from '#lib/types.ts';

  let { player, queues }: {
    player: Player;
    queues: Record<string, string>;
  } = $props();
  let showAllMatches = $state(false);
  let matchSection = $state<HTMLElement>();
  let sectionVisible = $state(false);
  let showAllButton = $state<HTMLButtonElement | null>(null);
  let showAllChampions = $state(false);
  let tableHeight = $state(0);
  let summaryHeaderHeight = $state(0);
  let sortColumn = $state<MatchSort>('at');
  let sortDirection = $state<SortDirection>('desc');
  const matches = $derived(sortMatches(player.encounters, sortColumn, sortDirection, queues));
  const columns: { key: MatchSort; label: string; hint?: string }[] = [
    { key: 'champion', label: 'They played', hint: 'Sort by their champion name' },
    { key: 'myChampion', label: 'You played', hint: 'Sort by your champion name' },
    { key: 'result', label: 'Result', hint: 'Sort by win, loss, remake, then unknown' },
    { key: 'queue', label: 'Queue' },
    { key: 'at', label: 'Date' },
    { key: 'match', label: 'Match ID' }
  ];

  function sortBy(column: MatchSort) {
    sortDirection = sortColumn === column ? sortDirection === 'asc' ? 'desc' : 'asc' : column === 'at' ? 'desc' : 'asc';
    sortColumn = column;
  }
  const queueCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const event of player.encounters) counts.set(event.queue, (counts.get(event.queue) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || queueLabel(a[0], queues).localeCompare(queueLabel(b[0], queues)));
  });
  const champions = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const e of player.encounters) counts.set(e.champion, (counts.get(e.champion) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || championLabel(a[0]).localeCompare(championLabel(b[0])));
  });
  const championLimit = $derived(championRowsThatFit(tableHeight, summaryHeaderHeight, champions.length));

  $effect(() => {
    if (!showAllMatches || !matchSection) return;
    const observer = new IntersectionObserver(([entry]) => sectionVisible = entry.isIntersecting);
    observer.observe(matchSection);
    return () => observer.disconnect();
  });

  async function collapseMatches() {
    showAllMatches = false;
    await tick();
    showAllButton?.focus({ preventScroll: true });
    if (matchSection && matchSection.getBoundingClientRect().top < 0) {
      matchSection.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
</script>

{#snippet matchPortrait(champion: string, role: Role | undefined)}
  {@const label = `${championLabel(champion)}${role ? `, ${roleLabels[role]}` : ''}`}
  <span class="match-champion" role="img" aria-label={label} title={label}>
    <ChampionPortrait {champion} />
    {#if role}
      <img class="match-role" src={`/roles/${role}.svg`} alt="" width="18" height="18" />
    {/if}
  </span>
{/snippet}

<div class="detail-summary">
  <div bind:clientHeight={summaryHeaderHeight}>
    <section class="queue-summary" aria-label="Queues played">
      <h3>Queues played</h3>
      <ul>
        {#each queueCounts as [queue, count] (queue)}
          <li><span>{queueLabel(queue, queues)}</span><span>{count} {count === 1 ? 'game' : 'games'}</span></li>
        {/each}
      </ul>
    </section>
    <h3 class="champions-heading">Champions played</h3>
  </div>
  <ul class="champion-lineup">
    {#each champions.slice(0, showAllChampions ? champions.length : championLimit) as [champion, count] (champion)}
      <li class="champion-entry">
        <ChampionPortrait {champion} />
        <strong>{championLabel(champion)}</strong><span>{count} {count === 1 ? 'game' : 'games'}</span>
      </li>
    {/each}
  </ul>
  {#if champions.length > championLimit}
    <Button variant="ghost" class="all-champions" aria-expanded={showAllChampions} onclick={() => showAllChampions = !showAllChampions}>
      {showAllChampions ? 'Show fewer' : `Show ${champions.length - championLimit} more`}
    </Button>
  {/if}
</div>

<Separator orientation="vertical" decorative class="details-divider" />

<section class="shared-matches" class:all-matches={showAllMatches} aria-label="Shared matches" bind:this={matchSection} bind:clientHeight={tableHeight}>
  <Table.Root aria-label={`Match history with ${player.name}`}>
    <colgroup>
      <col span="2" class="match-player-column" />
      <col class="match-result-column" />
      <col class="match-queue-column" />
      <col class="match-date-column" />
      <col class="match-id-column" />
    </colgroup>
    <Table.Header>
      <Table.Row>
        {#each columns as column (column.key)}
          <Table.Head scope="col" aria-sort={sortColumn === column.key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
            <Button variant="ghost" class="column-sort" onclick={() => sortBy(column.key)} title={column.hint ?? `Sort by ${column.label.toLowerCase()}`}>
              {column.label}
              {#if sortColumn === column.key}
                {#if sortDirection === 'asc'}<ArrowUp data-icon="inline-end" aria-hidden="true" />{:else}<ArrowDown data-icon="inline-end" aria-hidden="true" />{/if}
              {/if}
            </Button>
          </Table.Head>
        {/each}
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each (showAllMatches ? matches : matches.slice(0, 5)) as event (event.match)}
        <Table.Row>
          <Table.Cell>
            <div class="champion-performance">
              {@render matchPortrait(event.champion, event.role)}
              <span class="match-kda" aria-label={`${player.name}: ${event.kda[0]} kills, ${event.kda[1]} deaths, ${event.kda[2]} assists`}><span>{event.kda[0]}</span> / <span>{event.kda[1]}</span> / <span>{event.kda[2]}</span></span>
            </div>
          </Table.Cell>
          <Table.Cell>
            <div class="champion-performance">
              {@render matchPortrait(event.myChampion, event.myRole)}
              {#if event.myKda}
                <span class="match-kda" aria-label={`You: ${event.myKda[0]} kills, ${event.myKda[1]} deaths, ${event.myKda[2]} assists`}><span>{event.myKda[0]}</span> / <span>{event.myKda[1]}</span> / <span>{event.myKda[2]}</span></span>
              {:else}
                <span class="match-kda text-muted-foreground" aria-label="Your K/D/A unavailable">—</span>
              {/if}
            </div>
          </Table.Cell>
          <Table.Cell>
            <span class:result-win={!event.remake && event.win === true} class:result-loss={!event.remake && event.win === false} class:text-muted-foreground={event.remake}>{event.remake ? 'Remake' : event.win === true ? 'Win' : event.win === false ? 'Loss' : 'Unknown'}</span>
          </Table.Cell>
          <Table.Cell title={queueLabel(event.queue, queues)}>{queueLabel(event.queue, queues)}</Table.Cell>
          <Table.Cell><time datetime={new Date(event.at).toISOString()}>{formatDate(event.at)}</time></Table.Cell>
          <Table.Cell>
            <a href={matchUrl(event.match)} target="_blank" rel="noopener noreferrer" aria-label={`${event.match} on League of Graphs (opens in a new tab)`}>{event.match} ↗</a>
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
  {#if player.encounters.length > 5}
    {#if showAllMatches}
      <Button variant="ghost" class="more-matches" aria-expanded="true" onclick={collapseMatches}>Show less</Button>
      {#if sectionVisible}
        <div class="collapse-matches-position">
          <Button class="collapse-matches" aria-label="Show less match history" aria-expanded="true" onclick={collapseMatches}>
            <ChevronUp data-icon="inline-start" aria-hidden="true" />Show less
          </Button>
        </div>
      {/if}
    {:else}
      <Button bind:ref={showAllButton} variant="ghost" class="more-matches" aria-expanded="false" onclick={() => showAllMatches = true}><ChevronDown data-icon="inline-start" aria-hidden="true" />Show all</Button>
    {/if}
  {/if}
</section>
