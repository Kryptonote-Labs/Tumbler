<script lang="ts">
  import { untrack, tick, type Snippet } from "svelte";
  import {
    chartPropertyDefinition,
    chartPropertyTree,
    editChartSource,
    insertChartProperty,
    updateChartTitle,
    type ChartPropertyNode,
  } from "@tumblerjs/charts";
  import Chart3DProperties from "./Chart3DProperties.svelte";
  import ChartFormatOptions from "./ChartFormatOptions.svelte";
  import ChartTypePreview from "./ChartTypePreview.svelte";
  import ChartElements from "./ChartElements.svelte";
  import { chartDataState } from './chart-data-state.ts';

  import {
    CHART_TYPE_FAMILIES,
    chartFormatTargets,
    chartPropertyChild,
    chartPropertyValue,
    chartTitleText,
    currentChartType,
    sameChartType,
    setChartPropertyValue as setValue,
    type ChartTypeChange,
  } from "./chart-properties.ts";

  /** Office-style chart authoring. Document-format internals stay in the headless API. */
  interface Props {
    readonly request?: { readonly sequence: number; readonly action: 'data' | 'type' | 'elements' | 'format' };
    readonly mode?: 'all' | 'type' | 'elements' | 'format';
    readonly onchoose?: () => void;
    readonly bytes: Uint8Array;
    readonly disabled?: boolean;
    /** Scheme colour names (accent1, tx1, …) to CSS colours, for swatches. */
    readonly themeColors?: Readonly<Record<string, string>>;
    /** Receives each successful edit. Rejected edits report inline and never reach the host. */
    readonly onchange: (bytes: Uint8Array) => void;
    /** A committed type choice. The host converts the chart. */
    readonly ontypechange?: (options: ChartTypeChange) => void;
    readonly ontypepreview?: (options: ChartTypeChange | undefined) => void;
    /** A hovered or focused type, or undefined when previewing ends. The document is unchanged. */
    readonly oneditdata?: () => void;
    readonly typePreview?: Snippet<[ChartTypeChange | undefined]>;
    readonly viewPreview?: Snippet;
    readonly onsourcepreview?: (bytes: Uint8Array | undefined) => void;
    readonly typeError?: string;
    readonly dataExpanded?: boolean;
    readonly appearance?: Snippet;
    readonly dataEditor?: Snippet<[() => void]>;
    readonly pictureEditor?: Snippet<[ChartPropertyNode, string]>;
    readonly fillEditor?: Snippet<[ChartPropertyNode, string, string]>;
    readonly plotIndex?: number;
    readonly onplotselect?: (index: number) => void;
  }

  let { bytes, mode = 'all', onchoose, request, disabled = false, themeColors = {}, onchange, ontypechange, ontypepreview, oneditdata, typePreview, viewPreview, onsourcepreview, typeError, dataExpanded, dataEditor, appearance, pictureEditor, fillEditor, plotIndex = 0, onplotselect }: Props = $props();

  const id = $props.id();
  // Follows the host's bytes, and runs ahead of them between an edit and the host's next render.
  let current = $derived(bytes);
  const parsed = $derived.by(() => {
    try { return chartPropertyTree(current); } catch { return undefined; }
  });
  let error = $state<string>();
  let targetKey = $state("chart");
  let picking = $state(false);
  let elementsOpen = $state(false);
  $effect(() => { if (mode === "type") untrack(() => { void openPicker(); }); });
  let formatSelect = $state<HTMLSelectElement>();
  let handledRequest: number | undefined;
  $effect(() => {
    const next = request;
    if (!next || next.sequence === handledRequest) return;
    handledRequest = next.sequence;
    if (next) untrack(() => {
      if (next.action === 'type') void openPicker();
      if (next.action === 'elements') elementsOpen = true;
      if (next.action === 'format') void tick().then(() => formatSelect?.focus());
    });
  });
  let previewed = $state.raw<ChartTypeChange>();
  let trigger = $state<HTMLButtonElement>();
  let listbox = $state<HTMLDivElement>();
  let dataTrigger = $state<HTMLButtonElement>();
  let typed = "", lastTyped = 0;

  const chart = $derived(chartPropertyChild(parsed, "chart"));
  const title = $derived(parsed && chartTitleText(parsed));
  const legend = $derived(chartPropertyChild(chart, "legend"));
  const legendPosition = $derived(chartPropertyValue(chartPropertyChild(legend, "legendPos")) ?? "r");
  const legendChoices = chartPropertyDefinition("c:CT_LegendPos/c:legendPos")?.attributes[0]?.choices ?? [];
  const data = $derived(chartDataState(current));
  const plots = $derived(data.plots);
  const type = $derived(parsed && currentChartType(parsed, plotIndex));
  const targets = $derived(parsed && (mode === "all" || mode === "format") ? chartFormatTargets(parsed) : []);
  $effect(() => { if (targets.length && !targets.some(entry => entry.key === targetKey)) targetKey = targets[0]!.key; });
  const target = $derived(targets.find((entry) => entry.key === targetKey) ?? targets[0]);
  /** Runs a transform on the current bytes and publishes only a changed, successful result. */
  function commit(transform: (bytes: Uint8Array) => Uint8Array): string | undefined {
    try {
      const next = transform(current);
      if (next !== current) { onchange(next); current = next; }
      return undefined;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "This change could not be applied.";
    }
  }
  type Locate = (root: ChartPropertyNode) => ChartPropertyNode | undefined;
  const locateChart: Locate = (root) => chartPropertyChild(root, "chart");
  const locateLegend: Locate = (root) => chartPropertyChild(locateChart(root), "legend");

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
    if (option && type && sameChartType(type.change, option)) option = undefined;
    if (previewed === option || (previewed && option && sameChartType(previewed, option))) return;
    previewed = option;
    ontypepreview?.(option);
  }
  async function openPicker() {
    picking = true; typed = "";
    await tick();
    (listbox?.querySelector<HTMLElement>('[aria-selected="true"]') ?? listbox?.querySelector<HTMLElement>('[role="option"]'))?.focus();
  }
  function closePicker(restoreFocus: boolean) {
    picking = false;
    preview(undefined);
    if (restoreFocus) trigger?.focus();
  }
  function unavailable(option: ChartTypeChange): string | undefined {
    const count = plots[plotIndex]?.series.length ?? 0;
    return option.type === 'stockChart' && (count < 3 || count > 4) ? 'Stock charts need three or four price series.' : undefined;
  }
  function choose(option: ChartTypeChange) {
    if (unavailable(option)) return;
    const change = !type || !sameChartType(type.change, option) ? ontypechange : undefined;
    const close = onchoose;
    // Closing the ribbon gallery tears down this picker. Capture its handlers before closing.
    closePicker(!close);
    close?.();
    change?.(option);
  }
  function navigate(event: KeyboardEvent) {
    const options = [...(listbox?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const width = options[0]?.getBoundingClientRect().width ?? 1;
    const columns = Math.max(1, Math.round((listbox?.querySelector<HTMLElement>('.family-options')?.clientWidth ?? width) / width));
    const move = (next: number) => { event.preventDefault(); options[Math.max(0, Math.min(options.length - 1, next))]?.focus(); };
    if (event.key === "ArrowDown") move(index + columns);
    else if (event.key === "ArrowUp") move(index - columns);
    else if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(options.length - 1);
    else if (event.key === "Escape") { if (mode === "type") preview(undefined); else { event.preventDefault(); closePicker(true); } }
    else if (event.key === "Tab") closePicker(false);
    else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now(); typed = (now - lastTyped < 700 ? typed : '') + event.key.toLowerCase(); lastTyped = now;
      const query = [...typed].every(character => character === typed[0]) ? typed[0]! : typed;
      const match = [...options.slice(index + 1), ...options.slice(0, index + 1)].find(option => option.textContent?.trim().toLowerCase().startsWith(query));
      if (match) { event.preventDefault(); match.focus(); }
    }
  }
  function leave(event: FocusEvent) {
    if (mode === "type") return;
    const next = event.relatedTarget as Node | null;
    if (next && (listbox?.contains(next) || next === trigger)) return;
    closePicker(false);
  }
</script>

{#if !parsed}
  <p class="error" role="alert">This chart can't be edited.</p>
{:else}
  <div class="chart-properties">
    {#if mode !== "format"}<fieldset {disabled}>
      {#if mode === "all" || mode === "type"}
      {#if plots.length > 1}<label class="row"><span>Chart group</span><select aria-label="Chart plot" value={plotIndex} onchange={(event) => { preview(undefined); onplotselect?.(Number(event.currentTarget.value)); }}>
        {#each plots as plot, index}<option value={index}>{index + 1} · {plot.series.map(series => series.name).join(', ')}</option>{/each}
      </select></label>{/if}
      {#if mode === "all"}<div class="row">
        <span id={`${id}-type`}>Type</span>
        <button bind:this={trigger} type="button" class="picker" disabled={disabled || !ontypechange}
            aria-haspopup="listbox" aria-expanded={picking} aria-controls={`${id}-types`} aria-labelledby={`${id}-type ${id}-type-value`}
            onclick={() => picking ? closePicker(false) : openPicker()}>
          <span id={`${id}-type-value`}>{type?.label ?? "Custom chart"}</span>
        </button>
      </div>
      {/if}
      {#if typeError}<p class="error" role="alert">{typeError}</p>{/if}
      {#if data.error}<p class="error" role="alert">{data.error}</p>{/if}
      {#if mode === "all" && oneditdata}
        <div class="row"><span>Data</span><button bind:this={dataTrigger} type="button" class="button" aria-expanded={dataExpanded} aria-controls={dataExpanded === undefined ? undefined : `${id}-data`} onclick={() => oneditdata?.()}>Edit data</button></div>
      {/if}
      {#if mode === "type" || picking}
        {#if typePreview}<div class="type-preview">{@render typePreview(previewed)}</div>{/if}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div bind:this={listbox} id={`${id}-types`} class="types" role="listbox" tabindex="-1" aria-label="Chart types"
          onkeydown={navigate} onfocusout={leave} onpointerleave={() => preview(undefined)}>
          {#each CHART_TYPE_FAMILIES as family (family.label)}
            <div role="group" aria-labelledby={`${id}-family-${family.label}`}>
              <div id={`${id}-family-${family.label}`} class="family">{family.label}</div>
              <div class="family-options">{#each family.options as option (option.label)}
                {@const selected = type !== undefined && sameChartType(type.change, option.change)}
                <div role="option" tabindex="-1" aria-selected={selected} aria-disabled={!!unavailable(option.change)} title={unavailable(option.change)} class="option"
                  onpointerenter={() => preview(option.change)} onfocus={() => preview(option.change)}
                  onclick={() => choose(option.change)}
                  onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(option.change); } }}>
                  <ChartTypePreview change={option.change} /><span>{option.label}</span>
                </div>
              {/each}</div>
            </div>
          {/each}
        </div>
      {/if}

      {/if}
      {#if mode === "all" || mode === "elements"}
      <label for={`${id}-title`}>Chart title</label>
        <textarea id={`${id}-title`} aria-label="Title text" placeholder="Add a title" rows={Math.max(1, title?.split("\n").length ?? 1)} value={title ?? ""}
          onchange={(event) => event.currentTarget.value ? editTitle(event.currentTarget.value) : toggleTitle(false)}
          onkeydown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur(); } }}></textarea>

      <label class="row"><span>Legend</span>
        <input type="checkbox" checked={legend !== undefined} onchange={(event) => toggleLegend(event.currentTarget.checked)} /></label>
      {#if legend}<label class="row"><span>Position</span>
        <select class="tumbler-select" disabled={disabled || !legend} value={legendPosition} onchange={(event) => positionLegend(event.currentTarget.value)}>
          {#each [...legendChoices].sort((a,b) => ["t","b","l","r","tr"].indexOf(a.value) - ["t","b","l","r","tr"].indexOf(b.value)) as choice (choice.value)}<option value={choice.value}>{choice.label}</option>{/each}
        </select></label>
      {/if}
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </fieldset>{/if}

    {#if mode === "all" && dataEditor}<fieldset id={`${id}-data`} {disabled}>{@render dataEditor(() => dataTrigger?.focus())}</fieldset>{/if}

    {#if mode === "all" && appearance}{@render appearance()}{/if}

    {#if mode === "all" || mode === "elements"}<ChartElements inline={mode === "elements"} bind:open={elementsOpen} bytes={current} {disabled} onchange={(next) => { onchange(next); current = next; }} />{/if}

    {#if mode === "all" || mode === "format"}<fieldset {disabled}>
      <legend>Format</legend>
      <select bind:this={formatSelect} class="tumbler-select target" aria-label="Format target" value={target?.key} onchange={(event) => { targetKey = event.currentTarget.value; }}>
        {#each targets as entry (entry.key)}<option value={entry.key}>{entry.label}</option>{/each}
      </select>
      {#if target && fillEditor}{@render fillEditor(target.node, target.label, target.key)}{:else if target && pictureEditor}{@render pictureEditor(target.node, target.label)}{/if}
      {#if target}<ChartFormatOptions bytes={current} targetKey={target.key} {disabled} onchange={(next) => { onchange(next); current = next; }} />{/if}
    </fieldset>
    <Chart3DProperties bytes={current} root={parsed} {disabled} {plotIndex} preview={viewPreview} onpreview={onsourcepreview} onchange={(next) => { onchange(next); current = next; }} />
    {/if}
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
  .family-options { display:grid; grid-template-columns:repeat(auto-fit,minmax(115px,1fr)); gap:4px; }
  .option { display:flex; flex-direction:column; align-items:center; gap:5px; text-align:center; min-height:70px; font-size:11px; padding:8px 4px; border-radius: 4px; cursor: pointer; }
  .option:hover, .option:focus { background: var(--tumbler-control-hover, var(--surface-hover, #252825)); outline: none; }
  .option:focus-visible { outline: 1px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: -1px; }
  .option[aria-disabled="true"] { opacity:.45; cursor:default; }
  .option[aria-selected="true"] { color: var(--tumbler-control-accent, var(--accent, #4fe519)); }
  textarea {
    box-sizing: border-box; width: 100%; min-height: 28px; padding: 5px 8px; font: inherit; resize: vertical;
    color: var(--tumbler-control-text, var(--text, #e2fee7)); background: var(--tumbler-control-bg, var(--surface, #181818));
    border: 1px solid var(--tumbler-control-border, var(--border, #303030)); border-radius: 4px;
  }
  select.target { width: 100%; max-width:none; }
  :is(textarea, .button, .picker):focus-visible { outline: 2px solid var(--tumbler-control-accent, var(--accent, #4fe519)); outline-offset: 1px; }
  :is(button, select):disabled { opacity: 0.4; cursor: default; }
  .error { margin: 0; font-size: 11px; color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); }
</style>
