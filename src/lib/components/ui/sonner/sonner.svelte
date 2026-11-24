<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	theme="dark"
	class="toaster group"
	style="--normal-bg: var(--color-popover); --normal-text: var(--color-popover-foreground); --normal-border: var(--color-border);"
	toastOptions={{
		style: "font-size: 1rem; padding-inline-end: 56px;",
		classes: {
			toast: "cn-toast",
		},
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4 text-destructive" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4 text-warning" />
	{/snippet}
</Sonner>

<style>
	:global(.toaster [data-sonner-toast][data-styled="true"][data-type="error"]) {
		border-left: 3px solid var(--destructive);
	}

	:global(.toaster [data-sonner-toast][data-styled="true"][data-type="warning"]) {
		border-left: 3px solid var(--warning);
	}

	:global(.toaster [data-sonner-toast][data-styled="true"] [data-close-button]) {
		top: 4px;
		right: 4px;
		left: auto;
		transform: none;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
	}

	:global(.toaster [data-sonner-toast][data-styled="true"] [data-close-button]:hover) {
		background: var(--muted);
	}

	:global(.toaster [data-sonner-toast][data-styled="true"] [data-close-button]:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: -2px;
	}
</style>
