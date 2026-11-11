<script lang="ts">
  import { bindChartData, editChartSeries, type ChartEditableSeries, type ChartEditableSequence, type ChartSeriesEdit } from '@tumblerjs/charts';
  import { chartDataState } from './chart-data-state.ts';
  let { bytes, disabled = false, onchange }: { bytes: Uint8Array; disabled?: boolean; onchange: (bytes: Uint8Array) => void } = $props();
  const plots = $derived(chartDataState(bytes).plots);
  let error = $state<string>();
  const sequences = [ ['categories', 'Categories'], ['xValues', 'X values'], ['values', 'Values'], ['bubbleSizes', 'Bubble sizes'] ] as const;
  function commit(run: () => Uint8Array) {
    try { const next = run(); error = undefined; onchange(next); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'This series could not be changed.'; }
  }
  function edit(input: ChartSeriesEdit) { commit(() => editChartSeries(bytes, input)); }
  function bind(plot: number, index: number, key: keyof ChartEditableSeries, formula: string) {
    if (!formula.trim()) { error = 'Enter a source range, such as Sheet1!$B$2:$B$5.'; return; }
    commit(() => bindChartData(bytes, plots.map((entry, p) => p !== plot ? entry : {
      ...entry, series: entry.series.map((series, s) => s !== index ? series : key === 'nameFormula'
        ? { ...series, nameFormula: formula.replace(/^=/, '') }
        : { ...series, [key]: { ...series[key] as ChartEditableSequence, formula: formula.replace(/^=/, '') } }),
    })));
  }
  function add(plot: number) {
    const data = plots[plot]!;
    const first = data.series[0];
    const count = first?.values?.values.length ?? 4;
    const values = Array.from({ length: count }, () => 0);
    const xy = data.type === 'scatterChart' || data.type === 'bubbleChart';
    edit({ action: 'add', plot, series: {
      name: `Series ${data.series.length + 1}`, values: { kind: 'number', values },
      ...(xy ? { xValues: first?.xValues ?? { kind: 'number', values: values.map((_, index) => index + 1) } }
        : { categories: first?.categories ?? { kind: 'string', values: values.map((_, index) => `Category ${index + 1}`) } }),
      ...(data.type === 'bubbleChart' ? { bubbleSizes: { kind: 'number', values: values.map(() => 1) } } : {}),
    } });
  }
</script>
<details class="source">
  <summary>Series and ranges</summary>
  <fieldset {disabled}>
    {#each plots as plot, p}
      {#if plots.length > 1}<div class="plot">Plot {p + 1}</div>{/if}
      {#each plot.series as series, s (series.index)}
        <details class="series">
          <summary>{series.name}</summary>
          <div class="actions">
            <button type="button" onclick={() => edit({ action: 'duplicate', plot: p, series: s })}>Duplicate</button>
            <button type="button" aria-label={`Move ${series.name} up`} disabled={disabled || s === 0} onclick={() => edit({ action: 'move', plot: p, series: s, to: s - 1 })}>↑</button>
            <button type="button" aria-label={`Move ${series.name} down`} disabled={disabled || s === plot.series.length - 1} onclick={() => edit({ action: 'move', plot: p, series: s, to: s + 1 })}>↓</button>
            <button type="button" onclick={() => edit({ action: 'remove', plot: p, series: s })}>Remove</button>
          </div>
          <label><span>Name range</span><input type="text" value={series.nameFormula ?? ''} placeholder="Inline name" onchange={(event) => bind(p, s, 'nameFormula', event.currentTarget.value)} /></label>
          {#each sequences as [key, label]}
            {#if series[key]}<label><span>{label}</span><input type="text" value={series[key]?.formula ?? ''} placeholder="Inline data" onchange={(event) => bind(p, s, key, event.currentTarget.value)} /></label>{/if}
          {/each}
        </details>
      {/each}
      <button type="button" onclick={() => add(p)}>Add series</button>
    {/each}
  </fieldset>
  {#if error}<p role="alert">{error}</p>{/if}
</details>
<style>
  .source { min-width: 0; font-size: 12px; }
  summary { cursor: pointer; padding: 5px 0; }
  fieldset { min-width: 0; border: 0; margin: 0; padding: 4px 0; display: flex; flex-direction: column; gap: 6px; }
  .series { padding-left: 8px; border-left: 1px solid var(--border, #303030); }
  .actions { display: flex; gap: 4px; margin: 4px 0; }
  button, input { box-sizing: border-box; color: inherit; font: inherit; background: var(--surface, #181818); border: 1px solid var(--border, #303030); border-radius: 4px; min-height: 26px; padding: 3px 6px; min-width: 0; }
  button { cursor: pointer; } button:disabled { opacity: .4; cursor: default; }
  label { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  label span { flex: 0 0 80px; }
  input { width: 100%; }
  p { color: var(--danger, #ff6b6b); margin: 4px 0; }
</style>
