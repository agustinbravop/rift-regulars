<script lang="ts">
  import * as Avatar from '#lib/components/ui/avatar/index.js';
  let { champion }: { champion: string } = $props();
  // shortcut: portraits use Data Dragon 16.23.1, update the patch for newer champions.
</script>

<Avatar.Root class="champion-portrait" aria-hidden="true">
  <Avatar.Image
    src={`https://ddragon.leagueoflegends.com/cdn/16.23.1/img/champion/${encodeURIComponent(champion)}.png`}
    alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer"
  />
  <Avatar.Fallback>{champion.slice(0, 2)}</Avatar.Fallback>
</Avatar.Root>
