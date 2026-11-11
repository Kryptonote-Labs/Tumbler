<script lang="ts">
  import { untrack } from 'svelte';
  import { chartPropertyTree, type ChartModel, type ChartContent } from '@tumblerjs/charts';
  import ChartFillEditor from '../../src/ChartFillEditor.svelte';
  import OoxmlChart from '../../src/OoxmlChart.svelte';
  let { initial, content }: { initial: ChartModel; content?: ChartContent } = $props();
  let model = $state.raw(untrack(() => initial));
  export function setModel(next: ChartModel) { model = next; }
</script>
<OoxmlChart {model} width={400} height={300} />

{#if content}<ChartFillEditor {content} target={chartPropertyTree(new TextEncoder().encode(content.xml))} label="Entire chart" onchange={() => {}} />{/if}
