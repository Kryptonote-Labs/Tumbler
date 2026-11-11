<script lang="ts">
  import { untrack } from 'svelte';
  import { chartPropertyTree, type ChartModel, type ChartContent } from '@tumblerjs/charts';
  import ChartWorkbench from '../../src/ChartWorkbench.svelte';
  import ChartFillEditor from '../../src/ChartFillEditor.svelte';
  import OoxmlChart from '../../src/OoxmlChart.svelte';
  let { initial, content, workbench = false }: { initial: ChartModel; content?: ChartContent; workbench?: boolean } = $props();
  let model = $state.raw(untrack(() => initial));
  let current = $state.raw(untrack(() => content));
  export function getContent() { return current; }
  export function setModel(next: ChartModel) { model = next; }
</script>
<OoxmlChart {model} width={400} height={300} />

{#if workbench && current}<ChartWorkbench content={current} onchange={(next) => current = next} />{:else if content}<ChartFillEditor {content} target={chartPropertyTree(new TextEncoder().encode(content.xml))} label="Entire chart" onchange={() => {}} />{/if}
