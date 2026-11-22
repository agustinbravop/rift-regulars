<script lang="ts">
  import * as Avatar from '#lib/components/ui/avatar/index.js';

  let { icon, name }: { icon?: number; name: string } = $props();
</script>

<Avatar.Root class="summoner-portrait" aria-hidden="true" title="Summoner icon from last saved game">
  {#if icon !== undefined}
    <Avatar.Image
      src={`https://ddragon.leagueoflegends.com/cdn/16.23.1/img/profileicon/${icon}.png`}
      alt="" width="44" height="44" loading="lazy" decoding="async" referrerpolicy="no-referrer"
    />
  {/if}
  <Avatar.Fallback>{name.slice(0, 2).toLocaleUpperCase()}</Avatar.Fallback>
</Avatar.Root>
