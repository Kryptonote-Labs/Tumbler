<script lang="ts">
  import { untrack } from 'svelte';
  import type { ChartModel } from '@tumblerjs/charts';
  import OoxmlChart from '../../src/OoxmlChart.svelte';
  let { initial }: { initial: ChartModel } = $props();
  let model = $state.raw(untrack(() => initial));
  export function setModel(next: ChartModel) { model = next; }
</script>
<OoxmlChart {model} width={400} height={300} />
