<script lang="ts">
  import type { SupportedChartModel } from '@tumblerjs/charts';
  import { OoxmlChart } from '@tumblerjs/svelte';

  let kind = $state<'column' | 'line' | 'pie' | 'doughnut'>('column');
  let width = $state(600);
  let model: SupportedChartModel = $derived({
    status: 'supported', kind, title: 'Quarterly deliveries', titleFormula: undefined,
    legend: { position: 'bottom', overlay: false }, grouping: 'standard', holeSize: 55,
    axes: [],
    series: [{
      index: 0, order: 0, title: 'Deliveries', titleFormula: undefined,
      categories: { kind: 'string', formula: undefined, formatCode: undefined,
        points: ['Q1', 'Q2', 'Q3', 'Q4'].map((value, index) => ({ index, value })) },
      values: { kind: 'number', formula: undefined, formatCode: undefined,
        points: [24, 38, 31, 52].map((value, index) => ({ index, value })) },
      fill: { kind: 'rgb', value: '#4d8060' }, line: { kind: 'rgb', value: '#4d8060' }
    }]
  });
</script>

<label>Chart type
  <select bind:value={kind}><option value="column">Column</option><option value="line">Line</option><option value="pie">Pie</option><option value="doughnut">Doughnut</option></select>
</label>
<div class="chart" bind:clientWidth={width}><OoxmlChart {model} width={Math.max(240, width)} height={280} /></div>

<style>
  label { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .chart { background: white; color: #18261d; min-width: 0; overflow: hidden; }
</style>
