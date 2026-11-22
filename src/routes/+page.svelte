<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Search from '@lucide/svelte/icons/search';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import Users from '@lucide/svelte/icons/users';
  import Check from '@lucide/svelte/icons/check';
  import * as Alert from '#lib/components/ui/alert/index.js';
  import * as Empty from '#lib/components/ui/empty/index.js';
  import * as Field from '#lib/components/ui/field/index.js';
  import * as InputGroup from '#lib/components/ui/input-group/index.js';
  import * as NativeSelect from '#lib/components/ui/native-select/index.js';
  import * as Table from '#lib/components/ui/table/index.js';
  import { Switch } from '#lib/components/ui/switch/index.js';
  import { Badge } from '#lib/components/ui/badge/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import ChampionPortrait from '#lib/components/ChampionPortrait.svelte';
  import { championLabel } from '#lib/champions.ts';
  import SummonerPortrait from '#lib/components/SummonerPortrait.svelte';
  import PlayerDetails from '#lib/components/PlayerDetails.svelte';
  import { filterPlayers, formatDate, resultSummary, stats } from '#lib/encounters.ts';
  import { parseQueuePartners, premadeIds } from '#lib/queue-partners.ts';
  import { queueLabel, recentChampions, rosterPage, rosterPageIndex, shouldExpandRow, sortPlayers, type PlayerSort, type SortDirection } from '#lib/scouting.ts';
  import type { Encounter, SavedData } from '#lib/types.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let refreshed = $state<SavedData | null>(null);
  const saved = $derived(refreshed ?? data);
  const summary = $derived(saved.summary);
  let search = $state('');
  let queue = $state('all');
  let lastSeen = $state('all');
  let includePremade = $state(true);
  let markedPremades = $state<string[]>([]);
  let unmarkedPremades = $state<string[]>([]);
  const premades = $derived(premadeIds(summary?.players ?? [], markedPremades, unmarkedPremades));
  let expandedId = $state<string | null>(null);
  const requestedPage = $derived(rosterPageIndex(page.url.searchParams.get('page')));
  let sortColumn = $state<PlayerSort>('encounters');
  let sortDirection = $state<SortDirection>('desc');
  let busy = $state(false);
  let ready = $state(false);
  let refreshError = $state('');
  let storageError = $state('');
  let markNotice = $state('');
  // Keep the original storage key so existing manual marks survive the label change.
  const storageKey = $derived(`familiar-players:queue-partners:${summary?.account ?? 'Agus Brr#ARG'}`);
  const unmarkedStorageKey = $derived(`${storageKey}:unmarked`);
  const queues = $derived([...new Set(summary?.players.flatMap(p => p.encounters.map(e => e.queue)) ?? [])]
    .sort((a, b) => queueName(a).localeCompare(queueName(b))));
  const players = $derived(sortPlayers(
    filterPlayers(summary?.players ?? [], search, queue, includePremade, premades,
      lastSeen === 'all' ? 0 : Date.now() - Number(lastSeen) * 86_400_000),
    sortColumn, sortDirection
  ));
  const roster = $derived(rosterPage(players, requestedPage));
  const columns: { key: PlayerSort; label: string; hint?: string }[] = [
    { key: 'name', label: 'Player' },
    { key: 'lastOn', label: 'Recent champions', hint: 'Newest first; sort by latest champion name' },
    { key: 'encounters', label: 'Encounters' },
    { key: 'playedWith', label: 'WR with', hint: 'Sort by teammate wins, then fewer losses' },
    { key: 'playedAgainst', label: 'WR against', hint: 'Sort by wins against, then fewer losses' },
    { key: 'lastSeen', label: 'Last seen' }
  ];

  onMount(() => {
    try {
      markedPremades = parseQueuePartners(localStorage.getItem(storageKey));
      unmarkedPremades = parseQueuePartners(localStorage.getItem(unmarkedStorageKey));
    } catch {
      storageError = 'Saved premade marks could not be read. New changes will apply only in this tab until you reload.';
    }
    ready = true;
  });

  function queueName(id: string) { return queueLabel(id, summary?.queues ?? {}); }
  function focusSearch(event: KeyboardEvent) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
      !ready || !summary || event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))) return;
    event.preventDefault();
    document.getElementById('search')?.focus();
  }
  function setPage(index: number, replaceState = false) {
    expandedId = null;
    const url = new URL(page.url.href);
    if (index === 0) url.searchParams.delete('page');
    else url.searchParams.set('page', String(index + 1));
    return goto(url, { shallow: true, reset: false, replace: replaceState });
  }
  function resetPage() { void setPage(0, true); }
  function sortBy(column: PlayerSort) {
    sortDirection = sortColumn === column ? (sortDirection === 'asc' ? 'desc' : 'asc')
      : column === 'name' || column === 'lastOn' ? 'asc' : 'desc';
    sortColumn = column;
    resetPage();
  }
  async function changePage(index: number) {
    await setPage(index);
    await tick();
    document.getElementById('roster-heading')?.focus({ preventScroll: true });
  }
  async function togglePremade(id: string) {
    const wasMarked = premades.includes(id);
    const name = summary?.players.find(p => p.id === id)?.name ?? 'Player';
    markedPremades = wasMarked ? markedPremades.filter(premade => premade !== id) : [...markedPremades, id];
    unmarkedPremades = wasMarked ? [...unmarkedPremades, id] : unmarkedPremades.filter(premade => premade !== id);
    markNotice = `${name} ${wasMarked ? 'unmarked' : 'marked'} as premade.`;
    if (!storageError) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(markedPremades));
        localStorage.setItem(unmarkedStorageKey, JSON.stringify(unmarkedPremades));
      } catch {
        storageError = 'Browser storage is unavailable. Premade changes apply only in this tab until you reload.';
      }
    }
    if (!includePremade && !wasMarked) {
      resetPage();
      await tick();
      document.getElementById('roster-heading')?.focus({ preventScroll: true });
    }
  }
  async function reload() {
    busy = true;
    refreshError = '';
    try {
      const response = await fetch('/api/data');
      if (!response.ok) throw new Error();
      refreshed = await response.json() as SavedData;
      if (queue !== 'all' && !refreshed.summary?.players.some(p => p.encounters.some(e => e.queue === queue))) queue = 'all';
      resetPage();
    } catch {
      refreshError = 'Could not reload saved data. Check the local server and retry.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window onkeydown={focusSearch} />

<svelte:head>
  <title>Familiar Players | LoL Encounter Tracker</title>
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
  <link rel="icon" href="/favicon.png" type="image/png" sizes="48x48" />
  <link rel="preload" href="/fonts/public-sans-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
  <meta name="description" content="Find League of Legends players you have encountered more than once, with match history grouped by queue." />
</svelte:head>

{#snippet results(events: Encounter[])}
  {@const result = resultSummary(events)}
  {#if events.length}
    <span class="record-cell"><span class="result-win">{result.wins}W</span><span class="record-divider">/</span><span class="result-loss">{result.losses}L</span></span>
    {#if result.unknown}<span class="unknown-results">{result.unknown} unknown</span>{/if}
  {:else}
    <span class="text-muted-foreground" aria-label="No games">—</span>
  {/if}
{/snippet}

<a class="skip-link" href="#main-content">Skip to players</a>
<header class="app-header">
  <div class="header-inner">
    <a class="wordmark" href="/" aria-label="Familiar Players home">
      <img class="brand-symbol" src="/brand-logo.png" alt="" width="56" height="56" />Familiar Players
    </a>
    <div class="account-info"><Badge variant="outline">LAS</Badge><span>{summary?.account ?? 'Agus Brr#ARG'}</span></div>
  </div>
</header>

<main id="main-content" tabindex="-1">
  <section class="workspace-intro">
    <h1>Know the names you keep seeing on the Rift.</h1>
    <Button variant="outline" onclick={reload} disabled={busy || !ready}>
      <RefreshCw data-icon="inline-start" aria-hidden="true" class={busy ? 'refreshing' : ''} />
      {busy ? 'Reloading…' : 'Reload saved data'}
    </Button>
  </section>
  {#if summary && (!summary.coverage.complete || summary.coverage.error)}
    <Alert.Root class="mb-5">
      <Alert.Title>History import is incomplete</Alert.Title>
      <Alert.Description>{summary.coverage.missing} of {summary.coverage.listed} listed matches still need downloading. {summary.coverage.error ?? 'Reload saved data as the import progresses.'}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if refreshError || storageError}
    <Alert.Root variant="destructive" class="mb-5">
      <Alert.Title>{refreshError ? 'Reload failed' : 'Premade marks are not being saved'}</Alert.Title>
      <Alert.Description>{refreshError || storageError}</Alert.Description>
    </Alert.Root>
  {/if}
  <p class="sr-only" role="status">{markNotice}</p>

  <section class="roster-panel" aria-labelledby="roster-heading">
    <h2 class="sr-only" id="roster-heading" tabindex="-1">Repeated players</h2>
    <div class="roster-filters">
      <Field.Group class="search-filters">
        <Field.Field class="player-search">
          <Field.Label for="search">Find a player</Field.Label>
          <InputGroup.Root>
            <InputGroup.Input id="search" type="search" bind:value={search} oninput={resetPage} placeholder="Player#TAG" aria-keyshortcuts="/" autocomplete="off" disabled={!summary || !ready} />
            <InputGroup.Addon><Search aria-hidden="true" /></InputGroup.Addon>
          </InputGroup.Root>
        </Field.Field>
        <Field.Field>
          <Field.Label for="queue">Queue</Field.Label>
          <NativeSelect.Root id="queue" bind:value={queue} onchange={resetPage} disabled={!summary || !ready}>
            <NativeSelect.Option value="all">All queues</NativeSelect.Option>
            {#each queues as id (id)}<NativeSelect.Option value={id}>{queueName(id)}</NativeSelect.Option>{/each}
          </NativeSelect.Root>
        </Field.Field>
        <Field.Field>
          <Field.Label for="last-seen">Last seen</Field.Label>
          <NativeSelect.Root id="last-seen" bind:value={lastSeen} onchange={resetPage} disabled={!summary || !ready}>
            <NativeSelect.Option value="all">Any time</NativeSelect.Option>
            {#each [7, 30, 90, 365] as days (days)}
              <NativeSelect.Option value={String(days)}>Last {days} days</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </Field.Field>
        <Field.Field orientation="horizontal" class="premade-toggle">
          <Field.Label for="include-premade">Include premades</Field.Label>
          <Switch id="include-premade" bind:checked={includePremade} onCheckedChange={resetPage} disabled={!summary || !ready} />
        </Field.Field>
      </Field.Group>
    </div>

    <p class="sr-only" role="status">{players.length} repeated players match your filters.</p>
    {#if !summary}
      <Empty.Root>
        <Empty.Header><Empty.Title>Start with your match history</Empty.Title><Empty.Description>{saved.error}</Empty.Description></Empty.Header>
        <Empty.Content><p>Keep <code>RIOT_API_KEY</code> in <code>familiar_players/.env</code>, then run <code>bun run fetch</code>.</p></Empty.Content>
      </Empty.Root>
    {:else if !players.length}
      <Empty.Root>
        <Empty.Header><Empty.Title>No players match these filters</Empty.Title><Empty.Description>Try another name or queue, a wider Last seen range, or turn on Include premades.</Empty.Description></Empty.Header>
      </Empty.Root>
    {:else}
      <div class="roster-table">
        <Table.Root class="player-table" aria-label="Repeated players, with sortable columns">
          <colgroup>
            <col class="roster-name-column" />
            <col class="roster-champions-column" />
            <col class="roster-encounters-column" />
            <col span="2" class="roster-record-column" />
            <col class="roster-date-column" />
            <col class="roster-action-column" />
          </colgroup>
          <Table.Header>
            <Table.Row>
              {#each columns as column (column.key)}
                <Table.Head aria-sort={sortColumn === column.key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                  <Button variant="ghost" class="column-sort" onclick={() => sortBy(column.key)} disabled={!ready} title={column.hint ?? `Sort by ${column.label.toLowerCase()}`}>
                    {column.label}
                    {#if sortColumn === column.key}
                      {#if sortDirection === 'asc'}<ArrowUp data-icon="inline-end" aria-hidden="true" />{:else}<ArrowDown data-icon="inline-end" aria-hidden="true" />{/if}
                    {/if}
                  </Button>
                </Table.Head>
              {/each}
              <Table.Head scope="col"><span class="sr-only">Premade</span></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each roster.items as player (player.id)}
              {@const side = stats(player.encounters)}
              <Table.Row
                data-state={expandedId === player.id ? 'selected' : undefined}
                data-player-row
                class={ready ? 'expandable-player-row' : ''}
                onclick={(event) => {
                  if (ready && event.target instanceof Element && shouldExpandRow(event.target, window.getSelection()?.toString() ?? '')) {
                    expandedId = expandedId === player.id ? null : player.id;
                  }
                }}
              >
                <Table.Cell>
                  <Button variant="ghost" class="roster-player" aria-expanded={expandedId === player.id} aria-controls={`details-${player.id}`} disabled={!ready} onclick={() => expandedId = expandedId === player.id ? null : player.id}>
                    {#if expandedId === player.id}<ChevronDown aria-hidden="true" />{:else}<ChevronRight aria-hidden="true" />{/if}
                    <SummonerPortrait icon={player.encounters[0].profileIcon} name={player.name} />
                    <span class="player-name">{player.name}{#if player.tagLine}<span class="player-tag">#{player.tagLine}</span>{/if}</span>
                    {#if premades.includes(player.id)}<Badge variant="secondary" class="premade-accent" title={markedPremades.includes(player.id) ? 'Marked manually' : 'Auto-marked: at least 5 games together and none against in imported history'}>Premade</Badge>{/if}
                  </Button>
                </Table.Cell>
                <Table.Cell>
                  <div class="recent-champions">
                    {#each recentChampions(player.encounters) as champion, index (champion)}
                      <span class="last-on-icon" role="img" aria-label={`${index === 0 ? 'Latest champion' : `Recent champion ${index + 1}`}: ${championLabel(champion)}`} title={`${championLabel(champion)}${index === 0 ? ' (latest)' : ''}`}>
                        <ChampionPortrait {champion} />
                      </span>
                    {/each}
                  </div>
                </Table.Cell>
                <Table.Cell>{player.encounters.length}</Table.Cell>
                <Table.Cell>{@render results(side.together)}</Table.Cell>
                <Table.Cell>{@render results(side.against)}</Table.Cell>
                <Table.Cell class="last-seen-column">{formatDate(player.encounters[0].at)}</Table.Cell>
                <Table.Cell class="premade-action-cell">
                  <Button
                    variant={premades.includes(player.id) ? 'secondary' : 'outline'}
                    class="row-premade-action premade-accent"
                    aria-pressed={premades.includes(player.id)}
                    aria-label={`${premades.includes(player.id) ? 'Unmark' : 'Mark'} ${player.name} as premade`}
                    disabled={!ready || (!premades.includes(player.id) && !(summary.players.find(p => p.id === player.id)?.encounters.some(e => e.together) ?? false))}
                    onclick={() => togglePremade(player.id)}
                  >
                    {#if premades.includes(player.id)}<Check data-icon="inline-start" aria-hidden="true" />
                    {:else}<Users data-icon="inline-start" aria-hidden="true" />{/if}
                    <span>{premades.includes(player.id) ? 'Unmark premade' : 'Mark as premade'}</span>
                  </Button>
                </Table.Cell>
              </Table.Row>
              {#if expandedId === player.id}
                <Table.Row class="expanded-row">
                  <Table.Cell colspan={columns.length + 1}>
                    <div id={`details-${player.id}`} class="expanded-details" role="region" aria-label={`${player.name}'s match details`}>
                      <PlayerDetails
                        {player} queues={summary.queues}
                      />
                    </div>
                  </Table.Cell>
                </Table.Row>
              {/if}
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
      <div class="roster-pagination">
        <span>{roster.start + 1}–{roster.end} of {players.length} players</span>
        <div>
          <Button variant="outline" size="icon" aria-label="Previous player page" disabled={!ready || roster.index === 0} onclick={() => changePage(roster.index - 1)}><ChevronLeft aria-hidden="true" /></Button>
          <span aria-live="polite">Page {roster.index + 1} of {roster.pages}</span>
          <Button variant="outline" size="icon" aria-label="Next player page" disabled={!ready || roster.index + 1 >= roster.pages} onclick={() => changePage(roster.index + 1)}><ChevronRight aria-hidden="true" /></Button>
        </div>
      </div>
    {/if}
  </section>

  <footer class="app-footer">
    {#if summary}
      <details class="coverage-details">
        <summary>Coverage details</summary>
        <p>{summary.matches} indexed games, {formatDate(summary.earliest)} to {formatDate(summary.latest)}. Requested since January 1, {summary.year} UTC. Last saved {formatDate(Date.parse(summary.updated))}.</p>
        <p>{summary.coverage.note}</p>
      </details>
    {/if}
    <p>Premade marks are manual, stored in this browser, and hide the entire player. Names and tags come from saved matches and may have changed.</p>
    <p>Familiar Players is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p>
  </footer>
</main>
