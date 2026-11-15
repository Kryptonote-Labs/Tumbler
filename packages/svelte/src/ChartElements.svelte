<script lang="ts">
  import {
    chartPropertyDefinition,
    chartPropertyTree,
    editChartSource,
    insertChartProperty,
    updateChartTitle,
    isOoxmlChartType,
    type ChartPropertyNode,
  } from '@tumblerjs/charts';
  import { chartPropertyChild as child, chartFormatTargets } from './chart-properties.ts';
  let {
    inline = false,
    bytes,
    open = $bindable(false),
    disabled = false,
    onchange,
  }: {
    inline?: boolean;
    bytes: Uint8Array;
    open?: boolean;
    disabled?: boolean;
    onchange: (bytes: Uint8Array) => void;
  } = $props();
  const root = $derived(chartPropertyTree(bytes));
  const plotArea = $derived(child(child(root, 'chart'), 'plotArea'));
  const plots = $derived(
    plotArea?.children.filter((node) => isOoxmlChartType(node.name.split(':').at(-1)!)) ?? [],
  );
  const axes = $derived(
    chartFormatTargets(root).filter((target) =>
      /^(catAx|valAx|dateAx|serAx):[^:]+$/.test(target.key),
    ),
  );
  let error = $state<string>();
  function commit(run: () => Uint8Array) {
    try {
      onchange(run());
      error = undefined;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'This chart element could not be changed.';
    }
  }
  function toggle(owner: ChartPropertyNode, name: string, enabled: boolean) {
    commit(() => {
      const node = child(owner, name);
      if (!enabled)
        return node ? editChartSource(bytes, [{ kind: 'remove', node: node.id }]) : bytes;
      if (node) return bytes;
      const definition = owner.availableChildren.find(
        (entry) => chartPropertyDefinition(entry.definition)?.name === `c:${name}`,
      )?.definition;
      if (!definition) throw Error('This chart does not support that element.');
      return insertChartProperty(bytes, owner.id, definition);
    });
  }
  function titleText(node: ChartPropertyNode | undefined): string {
    return node
      ? node.name.endsWith(':t')
        ? node.text
        : node.children.map(titleText).join('')
      : '';
  }
  const supported = (owner: ChartPropertyNode, name: string) =>
    !!child(owner, name) ||
    owner.availableChildren.some(
      (entry) => chartPropertyDefinition(entry.definition)?.name === `c:${name}`,
    );
  function labels(plot: ChartPropertyNode, enabled: boolean) {
    commit(() => {
      let source = bytes;
      const plotIndex = plots.indexOf(plot);
      const original = child(plot, 'dLbls');
      // Per-series overrides take precedence over plot labels; clear them when toggling all labels.
      const overrides = plot.children
        .filter((node) => node.name.endsWith(':ser'))
        .flatMap((series) => series.children.filter((node) => node.name.endsWith(':dLbls')));
      if (overrides.length)
        source = editChartSource(
          source,
          overrides.map((node) => ({ kind: 'remove', node: node.id })),
        );
      const fresh = child(child(chartPropertyTree(source), 'chart'), 'plotArea')?.children.filter(
        (node) => isOoxmlChartType(node.name.split(':').at(-1)!),
      )[plotIndex];
      if (!fresh) return source;
      const current = child(fresh, 'dLbls');
      if (!enabled)
        return current ? editChartSource(source, [{ kind: 'remove', node: current.id }]) : source;
      if (!original || !current)
        source = insertChartProperty(
          source,
          fresh.id,
          fresh.availableChildren.find(
            (entry) => chartPropertyDefinition(entry.definition)?.name === 'c:dLbls',
          )!.definition,
        );
      const owner = child(child(chartPropertyTree(source), 'chart'), 'plotArea')?.children.filter(
        (node) => isOoxmlChartType(node.name.split(':').at(-1)!),
      )[plotIndex];
      const list = child(owner, 'dLbls')!;
      const definition = list.availableChildren.find(
        (entry) => chartPropertyDefinition(entry.definition)?.name === 'c:showVal',
      )?.definition;
      if (definition) source = insertChartProperty(source, list.id, definition);
      const updated = child(
        child(child(chartPropertyTree(source), 'chart'), 'plotArea')?.children.filter((node) =>
          isOoxmlChartType(node.name.split(':').at(-1)!),
        )[plotIndex],
        'dLbls',
      );
      const show = child(updated, 'showVal');
      return show
        ? editChartSource(source, [{ kind: 'attribute', node: show.id, name: 'val', value: '1' }])
        : source;
    });
  }
</script>

<details
  class="elements"
  class:inline
  open={inline || open}
  ontoggle={(event) => {
    if (!inline) open = event.currentTarget.open;
  }}
>
  <summary>Chart elements</summary>
  <fieldset {disabled}>
    {#each plots as plot, index}
      {#if supported(plot, 'dLbls')}<label
          ><span>{plots.length > 1 ? `Group ${index + 1} data labels` : 'Data labels'}</span><input
            type="checkbox"
            checked={!!child(plot, 'dLbls')}
            onchange={(event) => labels(plot, event.currentTarget.checked)}
          /></label
        >{/if}
    {/each}
    {#each axes as axis (axis.key)}
      <details>
        <summary>{axis.label}</summary>
        <label
          ><span>Axis title</span><input
            type="text"
            placeholder="Add a title"
            value={titleText(child(axis.node, 'title'))}
            onchange={(event) =>
              commit(() =>
                event.currentTarget.value
                  ? updateChartTitle(bytes, event.currentTarget.value, axis.node.id)
                  : child(axis.node, 'title')
                    ? editChartSource(bytes, [
                        { kind: 'remove', node: child(axis.node, 'title')!.id },
                      ])
                    : bytes,
              )}
          /></label
        >
        <label
          ><span>Major gridlines</span><input
            type="checkbox"
            checked={!!child(axis.node, 'majorGridlines')}
            onchange={(event) => toggle(axis.node, 'majorGridlines', event.currentTarget.checked)}
          /></label
        >
        <label
          ><span>Minor gridlines</span><input
            type="checkbox"
            checked={!!child(axis.node, 'minorGridlines')}
            onchange={(event) => toggle(axis.node, 'minorGridlines', event.currentTarget.checked)}
          /></label
        >
      </details>
    {/each}
    {#if plotArea && supported(plotArea, 'dTable')}<label
        ><span>Data table</span><input
          type="checkbox"
          checked={!!child(plotArea, 'dTable')}
          onchange={(event) => toggle(plotArea!, 'dTable', event.currentTarget.checked)}
        /></label
      >{/if}
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
    margin: 8px 0 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  fieldset details {
    padding-left: 10px;
    border-left: 1px solid var(--border, #303030);
  }
  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 28px;
  }
  input[type='text'] {
    width: 128px;
    min-width: 0;
    height: 28px;
    box-sizing: border-box;
    color: inherit;
    background: var(--surface, #181818);
    border: 1px solid var(--border, #303030);
    border-radius: 4px;
    padding: 3px 6px;
    font: inherit;
  }
  p {
    color: var(--danger, #ff6b6b);
    margin: 4px 0;
  }
</style>
