<script lang="ts">
  import {
    chartPropertyTree,
    setChartSolidFill,
    clearChartFill,
    type ChartPropertyNode,
  } from '@tumblerjs/charts';
  import { chartFormatTargets, chartPropertyChild as child } from './chart-properties.ts';
  import { chartFormatOptions, editChartFormatOption } from './chart-format-options.ts';
  let {
    inline = false,
    bytes,
    disabled = false,
    themeColors,
    onchange,
  }: {
    inline?: boolean;
    bytes: Uint8Array;
    disabled?: boolean;
    themeColors: Readonly<Record<string, string>>;
    onchange: (bytes: Uint8Array) => void;
  } = $props();
  let error = $state<string>();
  const palettes = [
    {
      label: 'Colourful',
      colours: ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'],
    },
    { label: 'Blue', colours: ['#156082', '#0F9ED5', '#46B1E1', '#83CBEB', '#B2DFF3'] },
    { label: 'Green', colours: ['#196B24', '#2D8C3C', '#4EA72E', '#8ED973', '#C1F0C8'] },
    { label: 'Warm', colours: ['#C04F15', '#E97132', '#F2AA84', '#FFC000', '#FBE2D5'] },
  ];
  function run(transform: (source: Uint8Array) => Uint8Array) {
    try {
      onchange(transform(bytes));
      error = undefined;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'This style could not be applied.';
    }
  }
  function colours(palette: (typeof palettes)[number]) {
    run((input) => {
      let source = input;
      const series = chartFormatTargets(chartPropertyTree(source)).filter((target) =>
        target.key.startsWith('series:'),
      );
      series.forEach((series, index) => {
        const target = chartFormatTargets(chartPropertyTree(source)).find(
          (target) => target.key === series.key,
        )!;
        const colour = palette.colours[index % palette.colours.length]!;
        source = setChartSolidFill(source, target.node.id, {
          color: { kind: colour.startsWith('#') ? 'rgb' : 'scheme', value: colour },
        });
        const refreshed = chartFormatTargets(chartPropertyTree(source)).find(
          (target) => target.key === series.key,
        )!;
        const line = chartFormatOptions(refreshed.node).find(
          (option) => option.label === 'Line colour',
        );
        if (line && colour.startsWith('#'))
          source = editChartFormatOption(source, series.key, line, colour.slice(1));
      });
      return source;
    });
  }
  function style(kind: 'default' | 'minimal' | 'dark') {
    run((input) => {
      let source = input;
      const root = chartPropertyTree(source);
      source =
        kind === 'default'
          ? clearChartFill(source, root.id)
          : setChartSolidFill(source, root.id, {
              color: { kind: 'rgb', value: kind === 'dark' ? '#20242B' : '#FFFFFF' },
            });
      const text = chartFormatOptions(chartPropertyTree(source)).find(
        (option) => option.label === 'Text colour',
      );
      if (text)
        source = editChartFormatOption(
          source,
          'chart',
          text,
          kind === 'dark' ? 'FFFFFF' : '404040',
        );
      return source;
    });
  }
</script>

<details class="appearance" class:inline open={inline}>
  <summary>Colours &amp; styles</summary>
  <fieldset {disabled}>
    <div class="palettes" aria-label="Chart colour palettes">
      {#each palettes as palette}<button
          type="button"
          aria-label={`${palette.label} chart colours`}
          title={palette.label}
          onclick={() => colours(palette)}
          >{#each palette.colours.slice(0, 5) as colour}<span
              style:background={themeColors[colour] ?? colour}
            ></span>{/each}</button
        >{/each}
    </div>
    <div class="styles" aria-label="Chart styles">
      <button type="button" onclick={() => style('default')}>Default</button><button
        type="button"
        onclick={() => style('minimal')}>Light</button
      ><button type="button" onclick={() => style('dark')}>Dark</button>
    </div>
  </fieldset>
  {#if error}<p role="alert">{error}</p>{/if}
</details>

<style>
  .inline > summary {
    display: none;
  }
  .inline > fieldset {
    padding-top: 0;
    margin-top: 0;
  }
  summary {
    cursor: pointer;
    padding: 5px 0;
    font-weight: 550;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 0;
    padding: 8px 0 0;
    margin: 0;
    min-width: 0;
  }
  .palettes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  button {
    border: 1px solid var(--border, #303030);
    border-radius: 4px;
    background: var(--surface, #181818);
    color: inherit;
    min-height: 28px;
    font: inherit;
    cursor: pointer;
  }
  .palettes button {
    display: flex;
    gap: 2px;
    padding: 6px;
  }
  span {
    height: 16px;
    flex: 1;
    border-radius: 2px;
    background: var(--accent, #4fe519);
  }
  .styles {
    display: flex;
    gap: 6px;
  }
  .styles button {
    flex: 1;
  }
  p {
    margin: 4px 0;
    color: var(--danger, #ff6b6b);
  }
</style>
