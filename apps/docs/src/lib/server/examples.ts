import { examples, type ExampleId } from '$lib/examples/registry';
import { highlight } from './highlight';

/** Highlighted source for a live example, rendered during SSR so no highlighter ships. */
export function highlightExample(id: ExampleId) {
  return highlight(examples[id].source, 'Svelte');
}

/** Caller code for an example that takes document bytes: fetch the file, then pass `bytes`. */
export async function highlightLoader(id: ExampleId) {
  const { file, sample } = examples[id];
  if (!sample) return undefined;
  const name = file.replace('.svelte', '');
  const code = `<script lang="ts">
  import ${name} from './${file}';

  const file = fetch('/${sample}')
    .then((response) => response.arrayBuffer())
    .then((buffer) => new Uint8Array(buffer));
</script>

{#await file then bytes}<${name} {bytes} />{/await}`;
  return { code, html: await highlight(code, 'Svelte'), title: '+page.svelte', file, sample };
}
