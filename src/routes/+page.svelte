<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import * as Field from '#lib/components/ui/field/index.js';
  import * as InputGroup from '#lib/components/ui/input-group/index.js';
  import * as NativeSelect from '#lib/components/ui/native-select/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import { regions, parseRiotId, parsePlatform } from '#lib/regions.ts';
  import { requestHistory } from '#lib/history-api.ts';
  import { playerUrl } from '#lib/player-url.ts';
  import { parseAccount } from '#lib/validation.ts';
  import { filterRecentPlayers, parseRecentPlayers, recentPlayersKey, rememberPlayer, type RecentPlayer } from '#lib/recent-players.ts';

  let riotId = $state('');
  let server = $state('LA2');
  let error = $state('');
  let busy = $state(false);
  let recentPlayers = $state<RecentPlayer[]>([]);
  let recentOpen = $state(false);
  let recentStorageError = $state('');
  let playerField: HTMLDivElement;
  const suggestions = $derived(filterRecentPlayers(recentPlayers, riotId));

  onMount(() => {
    riotId = page.state.riotId ?? '';
    server = page.state.platform ?? 'LA2';
    error = page.state.lookupError ?? '';
    try { recentPlayers = parseRecentPlayers(localStorage.getItem(recentPlayersKey)); }
    catch { recentStorageError = 'Recent players could not be read. Changes will only apply in this tab.'; }
  });

  function updateRecents(update: (players: RecentPlayer[]) => RecentPlayer[]) {
    recentPlayers = update(recentPlayers);
    if (recentStorageError) return;
    try {
      const next = update(parseRecentPlayers(localStorage.getItem(recentPlayersKey)));
      localStorage.setItem(recentPlayersKey, JSON.stringify(next));
      recentPlayers = next;
    } catch {
      recentStorageError = 'Recent players could not be saved. Changes will only apply in this tab.';
    }
  }

  async function openRecent(player: RecentPlayer) {
    if (busy) return;
    const { account, platform } = $state.snapshot(player);
    recentOpen = false;
    updateRecents(players => rememberPlayer(players, player));
    busy = true;
    try {
      await goto(playerUrl(`${account.gameName}#${account.tagLine}`, platform), { state: { account, platform } });
    } catch {
      error = 'Could not open this player. Try again.';
    } finally { busy = false; }
  }

  async function removeRecent(player: RecentPlayer) {
    updateRecents(players => players.filter(p => p.account.puuid !== player.account.puuid || p.platform !== player.platform));
    await tick();
    document.getElementById('riot-id')?.focus();
  }

  function recentKeydown(event: KeyboardEvent) {
    if (!recentOpen) return;
    if (event.key === 'Escape') {
      document.getElementById('riot-id')?.focus();
      recentOpen = false;
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const controls = [...playerField.querySelectorAll<HTMLButtonElement>('#found-players button')];
    const current = controls.indexOf(document.activeElement as HTMLButtonElement);
    if (!controls.length || !playerField.contains(document.activeElement)) return;
    event.preventDefault();
    const index = current < 0 ? (event.key === 'ArrowDown' ? 0 : controls.length - 1)
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
    controls[index].focus();
  }

  async function search(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    try {
      const { gameName, tagLine } = parseRiotId(riotId);
      const platform = parsePlatform(server);
      error = '';
      busy = true;
      recentOpen = false;
      const account = parseAccount(await requestHistory({
        action: 'account', riotId: `${gameName}#${tagLine}`, platform
      }));
      updateRecents(players => rememberPlayer(players, { account, platform }));
      await goto(playerUrl(`${account.gameName}#${account.tagLine}`, platform), {
        state: { account, platform }
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Enter a player name and #TAG.';
      busy = false;
      await tick();
      document.getElementById('riot-id')?.focus();
    } finally {
      busy = false;
    }
  }
</script>

<svelte:window
  onkeydown={recentKeydown}
  onclick={(event) => { if (event.target instanceof Node && !playerField?.contains(event.target)) recentOpen = false; }}
/>

<svelte:head>
  <title>Familiar Players | Know the names on the Rift</title>
  <meta name="description" content="Find the teammates and opponents you keep meeting in League of Legends. Search your Riot ID to scan this year's match history." />
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
  <link rel="icon" href="/favicon.png" type="image/png" sizes="48x48" />
  <link rel="preload" href="/fonts/public-sans-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<a class="skip-link" href="#main-content">Skip to player search</a>
<header class="app-header">
  <div class="header-inner">
    <a class="wordmark" href="/" aria-label="Familiar Players home">
      <img class="brand-symbol" src="/brand-logo.png" alt="" width="56" height="56" />Familiar Players
    </a>
  </div>
</header>

<main id="main-content" class="landing" tabindex="-1">
  <section class="landing-hero" aria-labelledby="hero-title">
    <h1 id="hero-title">Know the names you keep seeing on the Rift.</h1>
    <p class="hero-description">Find the teammates and opponents you meet most often in this year’s matches.</p>
    <form onsubmit={search} aria-busy={busy}>
      <Field.Group class="lookup-fields">
        <Field.Field class="lookup-server">
          <Field.Label for="server">Server</Field.Label>
          <NativeSelect.Root id="server" name="server" bind:value={server} disabled={busy}>
            {#each Object.entries(regions).sort(([, a], [, b]) => a.label.localeCompare(b.label)) as [id, region]}
              <NativeSelect.Option value={id}>{region.label}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </Field.Field>
        <Field.Field class="lookup-player" data-invalid={!!error}>
          <Field.Label for="riot-id">Player name and tag</Field.Label>
          <div class="recent-player-search" bind:this={playerField}
            onfocusout={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) recentOpen = false; }}>
            <InputGroup.Root>
              <InputGroup.Input id="riot-id" name="player" bind:value={riotId} placeholder="Player name#TAG" required maxlength={121} autocomplete="off" spellcheck="false" disabled={busy} aria-invalid={!!error} aria-controls={recentOpen && recentPlayers.length ? 'found-players' : undefined} aria-describedby={[error ? 'lookup-error' : '', recentOpen && recentPlayers.length ? 'recent-player-help' : ''].filter(Boolean).join(' ') || undefined}
                onfocus={() => recentOpen = true}
                onclick={() => recentOpen = true}
                oninput={() => { error = ''; recentOpen = true; }} />
              <InputGroup.Addon><Search aria-hidden="true" /></InputGroup.Addon>
            </InputGroup.Root>
            {#if recentOpen && recentPlayers.length && !busy}
              <div id="found-players" class="recent-players-dropdown">
                <p class="recent-players-heading">Previously found</p>
                <p id="recent-player-help" class="sr-only">Saved players are available below. Use Tab or the arrow keys to choose one. Escape closes this list.</p>
                {#if suggestions.length}
                  <ul aria-label="Previously found players">
                    {#each suggestions as player (`${player.platform}:${player.account.puuid}`)}
                      <li>
                        <Button variant="ghost" class="recent-player-choice" onclick={() => openRecent(player)}>
                          <span class="recent-player-name">{player.account.gameName}<span class="text-muted-foreground">#{player.account.tagLine}</span></span>
                          <span class="recent-player-server">{regions[player.platform].label}</span>
                        </Button>
                        <Button variant="ghost" size="icon" class="recent-player-remove" aria-label={`Remove ${player.account.gameName}#${player.account.tagLine} (${regions[player.platform].label}) from recent players`} onclick={() => removeRecent(player)}>
                          <X aria-hidden="true" />
                        </Button>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="recent-players-empty" role="status">No saved players match.</p>
                {/if}
              </div>
            {/if}
          </div>
        </Field.Field>
        {#if error}<p id="lookup-error" class="lookup-error" role="alert">{error}</p>{/if}
        <Button type="submit" class="lookup-submit" disabled={busy}>{busy ? 'Finding player…' : 'Find familiar players'}</Button>
      </Field.Group>
      {#if recentStorageError}<p class="recent-storage-error" role="status">{recentStorageError}</p>{/if}
    </form>
  </section>
</main>
