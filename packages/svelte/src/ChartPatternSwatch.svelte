<script lang="ts">
  import PresentationPattern from './PresentationPattern.svelte';
  let { preset, foreground, background }: { preset: string; foreground: string; background: string } = $props();
  const id = $props.id();
  const pattern = $derived({ preset, foreground, background });
</script>
<svg viewBox="0 0 32 32" aria-hidden="true"><defs><PresentationPattern {pattern} {id} /></defs><rect width="32" height="32" fill={`url(#${id})`} /></svg>
<style>svg { display: block; width: 100%; height: 100%; }</style>
