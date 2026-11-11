<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import {
    chartPropertyDefinition,
    chartPropertyTree,
    editChartSource,
    insertChartProperty,
    updateChartTitle,
    type ChartPropertyNode,
  } from "@tumblerjs/charts";
  import ChartPropertyFields from "./ChartPropertyFields.svelte";
  import {
    CHART_TYPE_FAMILIES,
    chartBoolean,
    chartFormatTargets,
    chartPropertyChild,
    chartPropertyLabels,
    chartPropertyValue,
    chartTitleText,
    currentChartType,
    removableChartProperties,
    sameChartType,
    searchChartProperties,
    type ChartPropertyApply,
    type ChartTypeChange,
  } from "./chart-properties.ts";

  /** Chart properties for a host's object pane: main controls first, then every schema property. */
  interface Props {
    readonly bytes: Uint8Array;
    readonly disabled?: boolean;
    /** Scheme colour names (accent1, tx1, …) to CSS colours, for swatches. */
    readonly themeColors?: Readonly<Record<string, string>>;
    /** Receives each successful edit. Rejected edits report inline and never reach the host. */
    readonly onchange: (bytes: Uint8Array) => void;
    /** A committed type choice. The host converts the chart. */
    readonly ontypechange?: (options: ChartTypeChange) => void;
    /** A hovered or focused type, or undefined when previewing ends. The document is unchanged. */
    readonly ontypepreview?: (options: ChartTypeChange | undefined) => void;
    readonly oneditdata?: () => void;
    readonly typePreview?: Snippet;
    readonly dataEditor?: Snippet;
  }

  let { bytes, disabled = false, themeColors = {}, onchange, ontypechange, ontypepreview, oneditdata, typePreview, dataEditor }: Props = $props();

  const id = $props.id();
  // Follows the host's bytes, and runs ahead of them between an edit and the host's next render.
  let current = $derived(bytes);
  const parsed = $derived.by(() => {
    try { return chartPropertyTree(current); } catch { return undefined; }
  });
  let error = $state<string>();
  let targetKey = $state("chart");
  let query = $state("");
  let picking = $state(false);
  let previewed: ChartTypeChange | undefined;
  let trigger = $state<HTMLButtonElement>();
  let listbox = $state<HTMLDivElement>();

  const chart = $derived(chartPropertyChild(parsed, "chart"));
  const title = $derived(parsed && chartTitleText(parsed));
  const legend = $derived(chartPropertyChild(chart, "legend"));
  const legendPosition = $derived(chartPropertyValue(chartPropertyChild(legend, "legendPos")) ?? "r");
  const legendChoices = chartPropertyDefinition("c:CT_LegendPos/c:legendPos")?.attributes[0]?.choices ?? [];
  const type = $derived(parsed && currentChartType(parsed));
  const targets = $derived(parsed ? chartFormatTargets(parsed) : []);
  const target = $derived(targets.find((entry) => entry.key === targetKey) ?? targets[0]);
  const labels = $derived(parsed ? chartPropertyLabels(parsed) : new Map<number, string>());
  const removable = $derived(parsed ? removableChartProperties(parsed) : new Set<number>());
  const shown = $derived(target && searchChartProperties(target.node, query, labels));

  /** Runs a transform on the current bytes and publishes only a changed, successful result. */
  function commit(transform: (bytes: Uint8Array) => Uint8Array): string | undefined {
    try {
      const next = transform(current);
      if (next !== current) { current = next; onchange(next); }
      return undefined;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "This change could not be applied.";
    }
  }
  const apply: ChartPropertyApply = (change) => commit((source) =>
    change.kind === "insert" ? insertChartProperty(source, change.node, change.definition) : editChartSource(source, change.edits));

  type Locate = (root: ChartPropertyNode) => ChartPropertyNode | undefined;
  const locateChart: Locate = (root) => chartPropertyChild(root, "chart");
  const locateLegend: Locate = (root) => chartPropertyChild(locateChart(root), "legend");

  /** Sets `val` on a child property, adding the property first when it is absent. */
  function setValue(source: Uint8Array, parent: Locate, name: string, definition: string, value: string): Uint8Array {
    const owner = parent(chartPropertyTree(source));
    if (!owner) throw new TypeError("This chart has no place for that property.");
    let next = source;
    let node = chartPropertyChild(owner, name);
    if (!node) {
      next = insertChartProperty(source, owner.id, definition);
      node = chartPropertyChild(parent(chartPropertyTree(next)), name)!;
    }
    return editChartSource(next, [{ kind: "attribute", node: node.id, name: "val", value }]);
  }

  function toggleTitle(show: boolean) {
    error = commit((source) => {
      if (show) return updateChartTitle(source, "Chart Title");
      const node = chartPropertyChild(locateChart(chartPropertyTree(source)), "title");
      const removed = node ? editChartSource(source, [{ kind: "remove", node: node.id }]) : source;
      return setValue(removed, locateChart, "autoTitleDeleted", "c:CT_Boolean/c:autoTitleDeleted", "1");
    });
  }
  function editTitle(text: string) {
    if (text !== title) error = commit((source) => updateChartTitle(source, text));
  }
  function toggleLegend(show: boolean) {
    error = commit((source) => {
      const owner = locateChart(chartPropertyTree(source));
      if (!owner) throw new TypeError("This chart has no plot.");
      const node = chartPropertyChild(owner, "legend");
      if (show) return node ? source : insertChartProperty(source, owner.id, "c:CT_Legend/c:legend");
      return node ? editChartSource(source, [{ kind: "remove", node: node.id }]) : source;
    });
  }
  function positionLegend(position: string) {
    error = commit((source) => setValue(source, locateLegend, "legendPos", "c:CT_LegendPos/c:legendPos", position));
  }

  function preview(option: ChartTypeChange | undefined) {
    if (previewed === option || (previewed && option && sameChartType(previewed, option))) return;
    previewed = option;
    ontypepreview?.(option);
  }
  async function openPicker() {
    picking = true;
    await tick();
    (listbox?.querySelector<HTMLElement>('[aria-selected="true"]') ?? listbox?.querySelector<HTMLElement>('[role="option"]'))?.focus();
  }
  function closePicker(restoreFocus: boolean) {
    picking = false;
    preview(undefined);
    if (restoreFocus) trigger?.focus();
  }
  function choose(option: ChartTypeChange) {
    closePicker(true);
    if (!type || !sameChartType(type.change, option)) ontypechange?.(option);
  }
  function navigate(event: KeyboardEvent) {
    const options = [...(listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => { event.preventDefault(); options[Math.max(0, Math.min(options.length - 1, next))]?.focus(); };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(options.length - 1);
    else if (event.key === "Escape") { event.preventDefault(); closePicker(true); }
    else if (event.key === "Tab") closePicker(false);
  }
  function leave(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (next && (listbox?.contains(next) || next === trigger)) return;
    closePicker(false);
  }
</script>

{#if !parsed}
  <p class="error" role="alert">This chart can't be edited.</p>
{:else}
  <div class="chart-properties">
    <fieldset {disabled}>
      <legend>Chart</legend>
      <div class="row">
        <span id={`${id}-type`}>Type</span>
        <button bind:this={trigger} type="button" class="picker" disabled={disabled || !ontypechange}
            aria-haspopup="listbox" aria-expanded={picking} aria-controls={`${id}-types`} aria-labelledby={`${id}-type ${id}-type-value`}
            onclick={() => picking ? closePicker(false) : openPicker()}>
          <span id={`${id}-type-value`}>{type?.label ?? "Other"}</span>
        </button>
      </div>
      {#if oneditdata}
        <div class="row"><span>Data</span><button type="button" class="button" onclick={oneditdata}>Edit data</button></div>
      {/if}
      {@render dataEditor?.()}
      {#if picking}
        {#if typePreview}<div class="type-preview">{@render typePreview()}</div>{/if}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div bind:this={listbox} id={`${id}-types`} class="types" role="listbox" tabindex="-1" aria-labelledby={`${id}-type`}
          onkeydown={navigate} onfocusout={leave} onpointerleave={() => preview(undefined)}>
          {#each CHART_TYPE_FAMILIES as family (family.label)}
            <div role="group" aria-labelledby={`${id}-family-${family.label}`}>
              <div id={`${id}-family-${family.label}`} class="family">{family.label}</div>
              {#each family.options as option (option.label)}
                {@const selected = type !== undefined && sameChartType(type.change, option.change)}
                <div role="option" tabindex="-1" aria-selected={selected} class="option"
                  onpointerenter={() => preview(option.change)} onfocus={() => preview(option.change)}
                  onclick={() => choose(option.change)}
                  onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(option.change); } }}>
                  {option.label}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      {/if}

      <label class="row"><span>Title</span>
        <input type="checkbox" checked={title !== undefined} onchange={(event) => toggleTitle(event.currentTarget.checked)} /></label>
      {#if title !== undefined}
        <textarea aria-label="Title text" placeholder="Automatic" rows={Math.max(1, title.split("\n").length)} value={title}
          onchange={(event) => editTitle(event.currentTarget.value)}
          onkeydown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } }}></textarea>
      {/if}

      <label class="row"><span>Legend</span>
        <input type="checkbox" checked={legend !== undefined} onchange={(event) => toggleLegend(event.currentTarget.checked)} /></label>
      <label class="row"><span>Position</span>
        <select class="tumbler-select" disabled={disabled || !legend} value={legendPosition} onchange={(event) => positionLegend(event.currentTarget.value)}>
          {#each legendChoices as choice (choice.value)}<option value={choice.value}>{choice.label}</option>{/each}
        </select></label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </fieldset>

    <fieldset {disabled}>
      <legend>Format</legend>
      <select class="tumbler-select target" aria-label="Format target" value={target?.key} onchange={(event) => { targetKey = event.currentTarget.value; }}>
        {#each targets as entry (entry.key)}<option value={entry.key}>{entry.label}</option>{/each}
      </select>
      <input class="search" type="search" placeholder="Search properties" aria-label="Search properties" bind:value={query} />
      {#if shown}
        {#key target?.key}
          <ChartPropertyFields node={shown} {labels} {removable} {apply} {themeColors} {disabled} searching={query.trim() !== ""} />
        {/key}
      {:else}
        <p class="empty">No matching properties</p>
      {/if}
    </fieldset>
  </div>
{/if}

<style>
  .type-preview { height: 160px; overflow: hidden; position: relative; border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px; }
  .chart-properties { display: flex; flex-direction: column; gap: 20px; min-width: 0; font-size: 12px; color: var(--tumbler-control-text, var(--text, #e2fee7)); }
  fieldset { display: flex; flex-direction: column; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; }
  legend { padding: 0; margin: 0 0 8px; font-size: 12px; font-weight: 550; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; min-width: 0; }
  .button, .picker {
    box-sizing: border-box; height: 28px; padding: 0 10px; font: inherit; cursor: pointer;
    color: var(--tumbler-control-text, var(--text, #e2fee7)); border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px;
  }
  .button { background: var(--tumbler-control-hover, var(--surface-hover, #252825)); }
  .picker { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start; background: var(--tumbler-control-bg, var(--surface, #181818)); }
  .types {
    max-height: 280px; overflow: auto; padding: 4px; border-radius: 6px; outline: none;
    border: 1px solid var(--tumbler-control-border, var(--border, #303030)); background: var(--tumbler-control-bg, var(--surface, #181818));
  }
  .family { padding: 8px 8px 4px; font-size: 11px; color: var(--tumbler-control-muted, var(--text-soft, #9baa9d)); }
  .option { padding: 6px 8px; border-radius: 4px; cursor: pointer; }
  .option:hover, .option:focus { background: var(--tumbler-control-hover, var(--surface-hover, #252825)); outline: none; }
  .option:focus-visible { outline: 1px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: -1px; }
  .option[aria-selected="true"] { color: var(--tumbler-control-accent, var(--accent, #4fe519)); }
  textarea, .search {
    box-sizing: border-box; width: 100%; min-height: 28px; padding: 5px 8px; font: inherit; resize: vertical;
    color: var(--tumbler-control-text, var(--text, #e2fee7)); background: var(--tumbler-control-bg, var(--surface, #181818));
    border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px;
  }
  select.target { width: 100%; }
  :is(textarea, .search, .button, .picker):focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  :is(button, select):disabled { opacity: 0.4; cursor: default; }
  .empty { margin: 0; color: var(--tumbler-control-muted, var(--text-soft, #9baa9d)); }
  .error { margin: 0; font-size: 11px; color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); }
</style>
