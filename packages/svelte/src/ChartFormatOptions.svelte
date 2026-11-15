<script lang="ts">
  import { chartPropertyTree } from '@tumblerjs/charts';
  import { chartFormatTargets, chartBoolean } from './chart-properties.ts';
  import {
    chartFormatOptions,
    chartOptionNode,
    editChartFormatOption,
    type ChartFormatOption,
  } from './chart-format-options.ts';
  let {
    bytes,
    targetKey,
    disabled = false,
    onchange,
  }: {
    bytes: Uint8Array;
    targetKey: string;
    disabled?: boolean;
    onchange: (bytes: Uint8Array) => void;
  } = $props();
  const target = $derived(
    chartFormatTargets(chartPropertyTree(bytes)).find((target) => target.key === targetKey),
  );
  const options = $derived(target ? chartFormatOptions(target.node) : []);
  let error = $state<string>();
  function value(option: ChartFormatOption) {
    const node = target && chartOptionNode(target.node, option);
    return option.textContent
      ? node?.text
      : node?.attributes.find((attribute) => attribute.name === (option.attribute ?? 'val'))?.value;
  }
  function visible(option: ChartFormatOption) {
    const group = option.path[0];
    if (!target || !['trendline', 'errBars'].includes(group!)) return true;
    if (option.label === 'Trendline' || option.label === 'Error bars') return true;
    if (!chartOptionNode(target.node, { ...option, path: [group!] })) return false;
    const type = chartOptionNode(target.node, {
      ...option,
      path: [group!, group === 'trendline' ? 'trendlineType' : 'errValType'],
    })?.attributes.find((attribute) => attribute.name === 'val')?.value;
    if (option.label === 'Polynomial order') return type === 'poly';
    if (option.label === 'Moving average period') return type === 'movingAvg';
    if (option.label === 'Positive error values' || option.label === 'Negative error values')
      return type === 'cust';
    if (option.label === 'Error amount')
      return type === 'fixedVal' || type === 'percentage' || type === 'stdDev';
    return true;
  }
  function set(option: ChartFormatOption, next: string | undefined) {
    try {
      onchange(editChartFormatOption(bytes, targetKey, option, next));
      error = undefined;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'This option could not be changed.';
    }
  }
</script>

{#snippet controls(fields: readonly ChartFormatOption[])}
  {#each fields as option (option.label)}
    {@const current = value(option)}
    {@const inverted = option.label === 'Show axis'}
    {#if visible(option)}
      <label
        ><span>{option.label}</span>
        {#if option.kind === 'toggle'}
          <input
            type="checkbox"
            {disabled}
            checked={inverted
              ? !chartBoolean(current ?? option.defaultValue)
              : chartBoolean(current ?? option.defaultValue)}
            onchange={(event) => set(option, event.currentTarget.checked !== inverted ? '1' : '0')}
          />
        {:else if option.kind === 'choice'}
          <select
            class="tumbler-select"
            {disabled}
            value={current ?? option.defaultValue ?? ''}
            onchange={(event) => set(option, event.currentTarget.value || undefined)}
          >
            {#if !option.defaultValue}<option value="">None</option>{/if}
            {#each option.choices ?? [] as [value, label]}<option {value}>{label}</option>{/each}
          </select>
        {:else if option.kind === 'number'}
          <input
            type="number"
            {disabled}
            value={current === undefined ? '' : Number(current) / (option.scale ?? 1)}
            min={option.min}
            max={option.max}
            step="any"
            placeholder="Auto"
            onchange={(event) => {
              const input = event.currentTarget;
              if (
                input.checkValidity() &&
                (input.value === '' || Number.isFinite(input.valueAsNumber))
              )
                set(
                  option,
                  input.value
                    ? String(
                        option.scale
                          ? Math.round(input.valueAsNumber * option.scale)
                          : input.valueAsNumber,
                      )
                    : undefined,
                );
              else input.reportValidity();
            }}
          />
        {:else if option.kind === 'color'}
          <input
            type="color"
            {disabled}
            value={`#${current ?? '000000'}`}
            onchange={(event) => set(option, event.currentTarget.value.slice(1).toUpperCase())}
          />
        {:else}
          <input
            type="text"
            {disabled}
            value={current ?? option.defaultValue ?? ''}
            onchange={(event) => set(option, event.currentTarget.value || undefined)}
          />
        {/if}
      </label>{/if}
  {/each}
{/snippet}
<div class="options">
  {@render controls(options.filter((option) => !['spPr', 'txPr'].includes(option.path[0]!)))}
  {#if options.some((option) => option.path[0] === 'spPr')}<details>
      <summary>Line &amp; border</summary>
      <div class="options">
        {@render controls(options.filter((option) => option.path[0] === 'spPr'))}
      </div>
    </details>{/if}
  {#if options.some((option) => option.path[0] === 'txPr')}<details>
      <summary>Text</summary>
      <div class="options">
        {@render controls(options.filter((option) => option.path[0] === 'txPr'))}
      </div>
    </details>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  summary {
    cursor: pointer;
    padding: 5px 0;
    font-weight: 550;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 28px;
  }
  label span {
    min-width: 0;
  }
  input:not([type='checkbox']),
  select {
    box-sizing: border-box;
    width: 140px;
    white-space: nowrap;
    min-width: 0;
    height: 28px;
    padding: 3px 6px;
    font: inherit;
    color: inherit;
    background: var(--tumbler-control-bg, var(--surface, #181818));
    border: 1px solid var(--tumbler-control-border, var(--border, #303030));
    border-radius: 4px;
  }
  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519));
  }
  p {
    margin: 0;
    color: var(--danger, #ff6b6b);
  }
</style>
