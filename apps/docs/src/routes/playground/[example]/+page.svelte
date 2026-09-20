<script lang="ts">
  import Playground from '$lib/components/Playground.svelte';
  let { data } = $props();
</script>
<svelte:head><title>{data.sample.label} · Tumbler playground</title><meta name="description" content={data.sample.description} /></svelte:head>
<Playground sample={data.sample} />
