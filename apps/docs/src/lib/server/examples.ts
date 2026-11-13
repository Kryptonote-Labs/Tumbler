import { examples, type ExampleId } from '$lib/examples/registry';
import { highlight } from './highlight';

/** Highlighted source for a live example, rendered during SSR so no highlighter ships. */
export function highlightExample(id: ExampleId) {
  return highlight(examples[id].source, 'Svelte');
}

/** Caller code for an example that takes document bytes: fetch the file in the browser, then pass `bytes`. */
export async function highlightLoader(id: ExampleId) {
  const { file, sample } = examples[id];
  if (!sample) return undefined;
  const name = file.replace('.svelte', '');
  const code = `<script lang="ts">
  import { onMount } from 'svelte';
  import ${name} from './${file}';

  let bytes = $state<Uint8Array>();
  onMount(async () => {
    const response = await fetch('/${sample}');
    bytes = new Uint8Array(await response.arrayBuffer());
  });
</script>

{#if bytes}<${name} {bytes} />{/if}`;
  return { code, html: await highlight(code, 'Svelte'), title: '+page.svelte', file, sample };
}
