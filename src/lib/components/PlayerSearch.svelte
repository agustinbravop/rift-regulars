<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import * as Field from '#lib/components/ui/field/index.js';
  import * as InputGroup from '#lib/components/ui/input-group/index.js';
  import { Button } from '#lib/components/ui/button/index.js';
  import SummonerPortrait from '#lib/components/SummonerPortrait.svelte';
  import { readHistory } from '#lib/browser-cache.ts';
  import { accountIcon } from '#lib/history.ts';
  import { regions, parseRiotId } from '#lib/regions.ts';
  import { requestHistory } from '#lib/history-api.ts';
  import { playerUrl } from '#lib/player-url.ts';
  import { parseDiscovery } from '#lib/validation.ts';
  import { featuredAccounts } from '#lib/featured.ts';
  import { filterRecentPlayers, parseRecentPlayers, recentPlayersKey, rememberPlayer, type RecentPlayer } from '#lib/recent-players.ts';

  let { compact = false }: { compact?: boolean } = $props();
  let riotId = $state('');
  let error = $state('');
  let busy = $state(false);
  let recentPlayers = $state<RecentPlayer[]>([]);
  let recentIcons = $state<Record<string, number | undefined>>({});
  let recentOpen = $state(false);
  let recentStorageError = $state('');
  let playerField: HTMLDivElement;
  const suggestions = $derived(filterRecentPlayers(recentPlayers, riotId));
  const showSearchAction = $derived(riotId.trim().length > 0);
  const dropdownOpen = $derived(recentOpen && !busy && (suggestions.length > 0 || showSearchAction));

  $effect(() => {
    if (error) toast.error(error, { id: 'player-search-error' });
    else toast.dismiss('player-search-error');
  });
  $effect(() => {
    if (recentStorageError) toast.warning(recentStorageError, { id: 'recent-players-storage' });
  });

  onMount(() => {
    if (!compact) {
      riotId = page.state.riotId ?? '';
      error = page.state.lookupError ?? '';
    }
    try { recentPlayers = parseRecentPlayers(localStorage.getItem(recentPlayersKey)); }
    catch { recentStorageError = 'Recent players could not be read. Changes will only apply in this tab.'; }
    for (const { account, platform } of recentPlayers) {
      readHistory(`${account.gameName}#${account.tagLine}`, platform, new Date().getUTCFullYear(), account.puuid)
        .then(history => {
          if (history) recentIcons[`${platform}:${account.puuid}`] = accountIcon(history.matches, account.puuid);
        })
        .catch(() => {}); // Optional artwork falls back to initials when history is unavailable.
    }
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
      await goto(playerUrl(`${account.gameName}#${account.tagLine}`), { state: { account, platform } });
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
      error = '';
      busy = true;
      recentOpen = false;
      if (featuredAccounts.some(entry => entry.riotId?.toLowerCase() === `${gameName}#${tagLine}`.toLowerCase())) {
        await goto(playerUrl(`${gameName}#${tagLine}`));
        return;
      }
      const { account, platform } = parseDiscovery(await requestHistory({
        action: 'discover', riotId: `${gameName}#${tagLine}`
      }));
      updateRecents(players => rememberPlayer(players, { account, platform }));
      await goto(playerUrl(`${account.gameName}#${account.tagLine}`), {
        state: { account, platform, discovered: true }
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

    <form onsubmit={search} aria-busy={busy} aria-label="Find a player" class:header-search={compact}>
      <Field.Group class="lookup-fields">
        <Field.Field class="lookup-player" data-invalid={!!error}>
           <Field.Label for="riot-id" class="sr-only">Player name and tag</Field.Label>
          <div class="recent-player-search" bind:this={playerField}
            onfocusout={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) recentOpen = false; }}>
            <InputGroup.Root>
              <InputGroup.Input id="riot-id" name="player" bind:value={riotId} placeholder="Player name#TAG" required maxlength={121} autocomplete="off" spellcheck="false" disabled={busy} aria-invalid={!!error} aria-controls={dropdownOpen ? 'found-players' : undefined} aria-describedby={[error ? 'lookup-error' : '', dropdownOpen ? 'recent-player-help' : ''].filter(Boolean).join(' ') || undefined}
                onfocus={() => recentOpen = true}
                onclick={() => recentOpen = true}
                oninput={() => { error = ''; recentOpen = true; }} />
              <InputGroup.Addon><Search aria-hidden="true" /></InputGroup.Addon>
            </InputGroup.Root>
            {#if dropdownOpen}
              <div id="found-players" class="recent-players-dropdown">
                {#if showSearchAction}
                  <Button type="submit" variant="ghost" class="player-search-action">
                    <Search aria-hidden="true" data-icon="inline-start" />
                    <span>Search for <strong>{riotId.trim()}</strong></span>
                  </Button>
                {/if}
                <p id="recent-player-help" class="sr-only">Use Tab or the arrow keys to choose an action. Escape closes this list. Enter in the search field searches the entered player.</p>
                 {#if suggestions.length}
                 <p class="recent-players-heading">Previously found</p>
                   <ul aria-label="Previously found players">
                    {#each suggestions as player (`${player.platform}:${player.account.puuid}`)}
                      <li>
                         <Button variant="ghost" class="recent-player-choice" onclick={() => openRecent(player)}>
                           <SummonerPortrait icon={recentIcons[`${player.platform}:${player.account.puuid}`]} name={player.account.gameName} />
                           <span class="recent-player-name">{player.account.gameName}<span class="player-tag">#{player.account.tagLine}</span></span>
                          <span class="recent-player-server">{regions[player.platform].label}</span>
                        </Button>
                        <Button variant="ghost" size="icon" class="recent-player-remove" aria-label={`Remove ${player.account.gameName}#${player.account.tagLine} (${regions[player.platform].label}) from recent players`} onclick={() => removeRecent(player)}>
                          <X aria-hidden="true" />
                        </Button>
                      </li>
                    {/each}
                  </ul>
                 {/if}
              </div>
            {/if}
          </div>
        </Field.Field>
        {#if error}<p id="lookup-error" class="sr-only">{error}</p>{/if}
        {#if !compact}
          <Button type="submit" class="lookup-submit" disabled={busy}>{busy ? 'Finding player…' : 'Search'}</Button>
        {/if}
      </Field.Group>
      {#if compact && busy}<p class="sr-only" role="status">Finding player…</p>{/if}
    </form>
