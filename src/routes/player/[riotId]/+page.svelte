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
  import PlayerSearch from '#lib/components/PlayerSearch.svelte';
  import { filterPlayers, formatDate, resultSummary, stats } from '#lib/encounters.ts';
  import { premadeIds } from '#lib/queue-partners.ts';
  import { queueLabel, recentChampions, rosterPage, rosterPageIndex, shouldExpandRow, sortPlayers, type PlayerSort, type SortDirection } from '#lib/scouting.ts';
  import type { Encounter, SavedData } from '#lib/types.ts';
  import { accountIcon, countNewMatches, historySummary, type History } from '#lib/history.ts';
  import { readHistory, writeHistory, readPremades, premadeStorageKey } from '#lib/browser-cache.ts';
  import { importHistory } from '#lib/import-history.ts';
  import { regions, parsePlatform, parseRiotId, type Platform } from '#lib/regions.ts';
  import { HistoryApiError, requestHistory } from '#lib/history-api.ts';
  import { parseAccount, parseDiscovery } from '#lib/validation.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  let refreshed = $state<SavedData | null>(null);
  const saved = $derived(refreshed ?? data);
  const summary = $derived(saved.summary);
  const currentAccount = $derived(parseRiotId(summary?.account ?? page.params.riotId));
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
  let refreshMessage = $state('');
  let refreshMessageTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshKnownIds: Set<string> | null = null;
  let storageError = $state('');
  let markNotice = $state('');
  let history = $state<History | null>(null);
  const scanPlayerIcon = $derived(history ? accountIcon(history.matches, history.account.puuid) : undefined);
  let platform = $state<Platform>('LA2');
  let progress = $state('');
  let cacheError = $state('');
  let stopped = false;
  let scanning = $state(true);
  let checkingCache = $state(true);
  const storageKey = $derived(premadeStorageKey(history?.account.puuid ?? ''));
  const queues = $derived([...new Set(summary?.players.flatMap(p => p.encounters.map(e => e.queue)) ?? [])]
    .sort((a, b) => queueName(b).localeCompare(queueName(a))));
  const players = $derived(sortPlayers(
    filterPlayers(summary?.players ?? [], search, queue, includePremade, premades,
      lastSeen === 'all' ? 0 : Date.now() - Number(lastSeen) * 86_400_000),
    sortColumn, sortDirection
  ));
  const roster = $derived(rosterPage(players, requestedPage));
  $effect(() => {
    if (expandedId && !players.some(player => player.id === expandedId)) expandedId = null;
  });
  const columns: { key: PlayerSort; label: string; hint?: string }[] = [
    { key: 'name', label: 'Player' },
    { key: 'lastOn', label: 'Recent champions', hint: 'Newest first; sort by latest champion name' },
    { key: 'encounters', label: 'Encounters' },
    { key: 'playedWith', label: 'WR with', hint: 'Sort by teammate wins, then fewer losses' },
    { key: 'playedAgainst', label: 'WR against', hint: 'Sort by wins against, then fewer losses' },
    { key: 'lastSeen', label: 'Last seen' }
  ];

  onMount(() => {
    ready = true;
    void openPlayer();
    return () => { stopped = true; clearTimeout(refreshMessageTimer); };
  });

  function loadPremades() {
    try {
      if (!history) return;
      const { marked, unmarked } = readPremades(localStorage, history.account);
      markedPremades = marked;
      unmarkedPremades = unmarked;
    } catch (error) {
      storageError = `${error instanceof Error ? error.message : 'Saved premade marks could not be read.'} New changes will apply only in this tab until you reload.`;
    }
  }

  function displayHistory(value: History, error: string | null = null) {
    history = value;
    platform = value.platform;
    refreshed = { summary: historySummary(value, error), error: null };
  }

  async function showHistory() {
    scanning = false;
    checkingCache = false;
    await tick();
    document.getElementById('history-heading')?.focus({ preventScroll: true });
  }

  async function persist(value: History) {
    if (cacheError) return;
    try {
      await writeHistory($state.snapshot(value));
    } catch {
      cacheError = 'Browser history could not be saved. Results remain available in this tab; allow browser storage or free space before your next scan.';
    }
  }

  async function api<T>(body: Record<string, unknown>): Promise<T> {
    if (stopped) throw new Error('Scan stopped. Reopen this player and Refresh to resume.');
    return requestHistory<T>({ ...body, platform });
  }

  async function openPlayer() {
    busy = true;
    try {
      platform = parsePlatform(page.url.searchParams.get('server'));
      const { gameName, tagLine } = parseRiotId(page.params.riotId);
      const riotId = `${gameName}#${tagLine}`;
      const fromLanding = page.state.platform === platform ? page.state.account : undefined;
      let account = fromLanding &&
        `${fromLanding.gameName}#${fromLanding.tagLine}`.toLowerCase() === riotId.toLowerCase()
        ? parseAccount(fromLanding) : null;
      let cached: History | null = null;
      try {
        cached = await readHistory(riotId, platform, new Date().getUTCFullYear(), account?.puuid,
          !!account && page.state.discovered === true);
      }
      catch { cacheError = 'Saved browser history could not be read. This scan will only be available in this tab.'; }
      if (stopped) return;
      if (cached) {
        displayHistory({ ...cached, account: account ?? cached.account });
        loadPremades();
        if (!historySummary(cached).coverage.complete) await scan();
        await showHistory();
        return;
      }
      progress = 'Looking up player…';
      if (!account) {
        const discovered = parseDiscovery(await api({ action: 'discover', riotId }));
        account = discovered.account;
        platform = discovered.platform;
      }
      if (!cacheError) {
        const previous = await readHistory(riotId, platform, new Date().getUTCFullYear(), account.puuid, true);
        if (previous) {
          displayHistory({ ...previous, account });
          loadPremades();
          if (!historySummary(previous).coverage.complete) await scan();
          await showHistory();
          return;
        }
      }
      displayHistory({
        account, platform, year: new Date().getUTCFullYear(), ids: [], matches: [],
        listed: false, until: Math.floor(Date.now() / 1000), updated: new Date().toISOString(), queues: {}
      });
      loadPremades();
      await scan();
      await showHistory();
    } catch (error) {
      if (!history && error instanceof HistoryApiError && error.status === 404 && !stopped) {
        await goto('/', { replace: true, state: {
          riotId: page.params.riotId, platform, lookupError: error.message
        } });
        return;
      }
      refreshError = error instanceof Error ? error.message : 'Could not open this player.';
    } finally {
      checkingCache = false;
      busy = false;
      progress = '';
    }
  }

  async function scan() {
    if (!history) return;
    checkingCache = false;
    const key = `rift-regulars:import:${history.year}:${history.account.puuid}`;
    if (!navigator.locks) throw new Error('Scanning needs a secure browser context (HTTPS or localhost).');
    await navigator.locks.request(key, { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('This player is already being scanned in another tab. Refresh here when it finishes.');
      let value = $state.snapshot(history!);
      if (!cacheError) {
        const cached = await readHistory(`${value.account.gameName}#${value.account.tagLine}`, value.platform, value.year, value.account.puuid, true);
        if (cached) value = { ...cached, account: value.account };
      }
      await runScan(value);
    });
  }

  async function runScan(value: History) {
    try {
      // Queue names are public metadata; no Riot key is sent from the browser.
      if (!Object.keys(value.queues).length) {
        try {
          const response = await fetch('https://static.developer.riotgames.com/docs/lol/queues.json', { signal: AbortSignal.timeout(10_000) });
          if (response.ok) {
            const queues: unknown = await response.json();
            if (Array.isArray(queues)) value.queues = Object.fromEntries(queues
              .filter(q => q && Number.isInteger(q.queueId) && typeof q.description === 'string')
              .map(q => [String(q.queueId), q.description]));
          }
        } catch { /* Queue IDs remain usable if public labels are unavailable. */ }
      }
      await importHistory(value, api, async (current, message) => {
        if (stopped) throw new Error('Scan stopped. Refresh to resume.');
        displayHistory(current);
        progress = message;
        if (refreshKnownIds && current.listed) {
          const count = countNewMatches(current.ids, refreshKnownIds);
          refreshMessage = `Found ${count} new ${count === 1 ? 'match' : 'matches'}`;
          refreshKnownIds = null;
          refreshMessageTimer = setTimeout(() => { refreshMessage = ''; }, 2000);
        }
        await persist(current);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed. Try Refresh to resume.';
      displayHistory(value, message);
      await persist(value);
      throw error;
    }
  }

  function queueName(id: string) { return queueLabel(id, summary?.queues ?? {}); }
  function focusSearch(event: KeyboardEvent) {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
      !ready || !summary || event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))) return;
    event.preventDefault();
    document.getElementById('search')?.focus();
  }
  function setPage(index: number, replaceState = false) {
    const url = new URL(page.url.href);
    if (index === 0) url.searchParams.delete('page');
    else url.searchParams.set('page', String(index + 1));
    return goto(url, { shallow: true, reset: false, replace: replaceState });
  }
  function resetPage() { void setPage(0, true); }
  function sortBy(column: PlayerSort) {
    expandedId = null;
    sortDirection = sortColumn === column ? (sortDirection === 'asc' ? 'desc' : 'asc')
      : column === 'name' || column === 'lastOn' ? 'asc' : 'desc';
    sortColumn = column;
    resetPage();
  }
  async function changePage(index: number) {
    expandedId = null;
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
        localStorage.setItem(storageKey, JSON.stringify({ marked: markedPremades, unmarked: unmarkedPremades }));
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
    if (busy || !history) return;
    clearTimeout(refreshMessageTimer);
    busy = true;
    refreshError = '';
    refreshKnownIds = new Set(history.ids);
    refreshMessage = 'Checking for new matches…';
    try {
      await scan();
      if (scanning) await showHistory();
      if (queue !== 'all' && !summary?.players.some(p => p.encounters.some(e => e.queue === queue))) queue = 'all';
      resetPage();
    } catch (error) {
      refreshMessage = '';
      refreshError = error instanceof Error ? error.message : 'Could not refresh. Try again.';
    } finally {
      refreshKnownIds = null;
      busy = false;
      progress = '';
    }
  }
</script>

<svelte:window onkeydown={focusSearch} />

<svelte:head>
  <title>Rift Regulars | LoL Encounter Tracker</title>
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
  <link rel="icon" href="/favicon.png" type="image/png" sizes="48x48" />
  <link rel="preload" href="/fonts/public-sans-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
  <meta name="description" content="Find League of Legends players you have encountered more than once, with match history grouped by queue." />
</svelte:head>

{#snippet results(events: Encounter[])}
  {@const result = resultSummary(events)}
  {#if events.length}
    <span class="record-cell" title={result.winRate === null ? 'Win rate unavailable' : `${result.winRate}% win rate`}><span class="result-win">{result.wins}W</span><span class="record-divider">/</span><span class="result-loss">{result.losses}L</span></span>
    {#if result.unknown}<span class="unknown-results">{result.unknown} unknown</span>{/if}
  {:else}
    <span class="text-muted-foreground" aria-label="No games">—</span>
  {/if}
{/snippet}

<a class="skip-link" href="#main-content">Skip to players</a>
<header class="app-header">
  <div class="header-inner player-header">
    <a class="wordmark" href="/" aria-label="Rift Regulars home">
      <img class="brand-symbol" src="/brand-logo.png" alt="" width="56" height="56" />Rift Regulars
    </a>
    <PlayerSearch compact />
    <div class="account-info" aria-label="Current account">
      <SummonerPortrait icon={scanPlayerIcon} name={summary?.account ?? page.params.riotId ?? ''} />
      <span>{currentAccount.gameName}<span class="player-tag">#{currentAccount.tagLine}</span></span>
      <Badge variant="outline">{regions[platform].label}</Badge>
    </div>
  </div>
</header>

<main id="main-content" class:scan-page={scanning && !checkingCache} tabindex="-1">
  {#if checkingCache}
    <p class="sr-only" role="status">Opening saved history…</p>
  {:else if scanning}
    <section class="scan-screen" aria-labelledby="scan-title" aria-busy={busy}>
      {#if busy}<RefreshCw class="scan-icon refreshing" aria-hidden="true" />{/if}
      <h1 id="scan-title">{refreshError ? 'Scan paused' : 'Scanning match history'}</h1>
      <div class="scan-player">
        <SummonerPortrait icon={scanPlayerIcon} name={summary?.account ?? page.params.riotId ?? ''} />
         <p>{currentAccount.gameName}<span class="player-tag">#{currentAccount.tagLine}</span> <span class="text-muted-foreground">· {regions[platform].label}</span></p>
      </div>
      <p class="scan-status" role="status">{refreshError || progress || 'Opening saved history…'}</p>
      {#if summary && summary.coverage.listed}
        <progress class="scan-progress" max={summary.coverage.listed} value={(history?.matches.length ?? 0) + (history?.excluded?.length ?? 0)} aria-label="Matches processed"></progress>
        <p class="text-muted-foreground">{(history?.matches.length ?? 0) + (history?.excluded?.length ?? 0)} / {summary.coverage.listed} matches processed</p>
      {/if}
      {#if cacheError}<p class="lookup-error" role="alert">{cacheError}</p>{/if}
      {#if !busy && refreshError}
        <div class="scan-actions">
          {#if history}<Button onclick={reload}>Retry scan</Button>{/if}
          {#if history?.matches.length}<Button variant="outline" onclick={showHistory}>View partial history</Button>{/if}
        </div>
      {/if}
    </section>
  {:else}
  <section class="workspace-intro">
    <h1 id="history-heading" tabindex="-1">Know the names you keep seeing on Summoner’s Rift.</h1>
    <div class="refresh-actions">
      <p class="refresh-info" role="status">{refreshMessage}</p>
      <Button variant="outline" onclick={reload} disabled={busy || !ready}>
        <span class="refresh-indicator" class:refreshing={busy} aria-hidden="true"><RefreshCw data-icon="inline-start" /></span>
        {busy ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
  </section>
  {#if summary && !busy && (!summary.coverage.complete || summary.coverage.error)}
    <Alert.Root class="mb-5">
      <Alert.Title>History import is incomplete</Alert.Title>
      <Alert.Description>{summary.coverage.missing} of {summary.coverage.listed} listed matches still need downloading. {summary.coverage.error ?? 'Refresh to finish listing and downloading history.'}</Alert.Description>
    </Alert.Root>
  {/if}
  {#if refreshError || storageError || cacheError}
    <Alert.Root variant="destructive" class="mb-5">
      <Alert.Title>{refreshError ? 'Player history unavailable' : 'Browser storage unavailable'}</Alert.Title>
      <Alert.Description>{refreshError || storageError || cacheError}</Alert.Description>
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
            <NativeSelect.Option value="all">All time</NativeSelect.Option>
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
        <Empty.Header><Empty.Title>{busy ? 'Finding your match history' : 'Choose a player to get started'}</Empty.Title><Empty.Description>{busy ? 'The first scan takes longer. Future refreshes reuse matches saved in this browser.' : 'Enter a player name and #TAG in the header search.'}</Empty.Description></Empty.Header>
      </Empty.Root>
    {:else if !players.length}
      <Empty.Root>
        <Empty.Header><Empty.Title>{busy ? 'Scanning for Rift Regulars' : 'No players match these filters'}</Empty.Title><Empty.Description>{busy ? 'Repeated players will appear as games are downloaded.' : 'Try another name or queue, a wider Last seen range, or turn on Include premades.'}</Empty.Description></Empty.Header>
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
      <section class="coverage-details" aria-label="History coverage">
        <div class="coverage-dates">
          <p>{summary.matches} indexed games, from {formatDate(summary.earliest)} to {formatDate(summary.latest)}.</p>
          <p class="coverage-scanned">Scanned on {new Date(summary.updated).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')}.</p>
        </div>
      </section>
    {/if}
    <p>Rift Regulars is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p>
  </footer>
  {/if}
</main>
