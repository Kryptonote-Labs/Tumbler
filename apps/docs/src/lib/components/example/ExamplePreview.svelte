<!-- Runs one registered example: loads its component and, when it needs one, its sample document. -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { loadSample } from '$lib/samples';
  import type { ExampleDefinition } from '$lib/examples/registry';

  let { example }: { example: ExampleDefinition } = $props();
  let attempt = $state(0);
  // Examples run in the browser only; during SSR they stay in their loading state.
  const ready = $derived.by(() => {
    void attempt;
    if (!browser) return new Promise<never>(() => {});
    return example.sample
      ? Promise.all([example.component(), loadSample(example.sample)]).then(([module, bytes]) => ({ kind: 'sample' as const, Preview: module.default, bytes }))
      : example.component().then(module => ({ kind: 'standalone' as const, Preview: module.default }));
  });
</script>

{#await ready}
  <p class="preview-status" role="status">Loading{example.sample ? ` ${example.sample}` : ''}…</p>
{:then loaded}
  {#if loaded.kind === 'sample'}<loaded.Preview bytes={loaded.bytes} />{:else}<loaded.Preview />{/if}
{:catch}
  <p class="preview-status" role="alert">Could not load this example. <button onclick={() => attempt++}>Retry</button></p>
{/await}
