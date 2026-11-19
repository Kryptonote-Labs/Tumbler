<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { chartBase64ToBytes, chartBytesToBase64, chartContentModel, convertChartType, type ChartContent, type ChartModel } from '@tumblerjs/charts';
  import { applyChartContentEdit, createChartWorkbook, extendChartWorkbook, openSpreadsheetArtifact, refreshChartWorkbook, type SpreadsheetArtifact } from '@tumblerjs/sheets';
  import ChartSeriesProperties from './ChartSeriesProperties.svelte';
  import ChartProperties from './ChartProperties.svelte';
  import ChartDataEditor from './ChartDataEditor.svelte';
  import ChartAppearance from "./ChartAppearance.svelte";
  import ChartFillEditor from './ChartFillEditor.svelte';
  import OoxmlChart from './OoxmlChart.svelte';
  import type { ChartTypeChange } from './chart-properties.ts';
  import type { ChartDesignControls } from './chart-design-controls.ts';
  import { chartDataState } from './chart-data-state.ts';

  let { content, oncontrols, request, selectedRange, dataSourceEditor, disabled = false, themeColors = {}, themeFonts = {}, previewSize = { width: 480, height: 320 }, patternOrigin, embeddedData = true, oneditdata, onchange }: {
    oncontrols?: (controls: ChartDesignControls) => void | (() => void);
    selectedRange?: string;
    dataSourceEditor?: Snippet<[close: () => void]>;
    content: ChartContent;
    request?: { readonly sequence: number; readonly action: 'data' | 'type' | 'elements' | 'format' };
    disabled?: boolean;
    themeColors?: Readonly<Record<string, string>>;
    themeFonts?: Readonly<Record<string, string>>;
    /** Layout at the document object size, then scale the SVG into the preview pane. */
    previewSize?: { readonly width: number; readonly height: number };
    patternOrigin?: { readonly x: number; readonly y: number };
    embeddedData?: boolean;
    oneditdata?: (open?: boolean) => void;
    onchange: (content: ChartContent, reason?: 'type' | 'series') => void;
  } = $props();
  let current = $derived(content);
  const bytes = $derived(new TextEncoder().encode(current.xml));
  const encoded = $derived(current.workbook);
  let sheet = $state<string>();
  let dataOpen = $state(false);
  let embeddedRange = $state<string>();
  let handledRequest: number | undefined;
  $effect(() => { const next = request; if (!next || next.sequence === handledRequest) return; handledRequest = next.sequence; if (next.action === 'data') untrack(() => { if (embeddedData) dataOpen = true; else oneditdata?.(true); }); });
  const draft = $derived.by(() => {
    if (!embeddedData || encoded !== undefined || !dataOpen) return undefined;
    try { return { value: createChartWorkbook(bytes) }; }
    catch (cause) { return { error: cause instanceof Error ? cause.message : 'The data workbook could not be opened.' }; }
  });
  const dataBytes = $derived(draft?.value?.source ?? bytes);
  const workbook = $derived.by(() => {
    const artifact = encoded === undefined ? draft?.value?.artifact : openSpreadsheetArtifact(chartBase64ToBytes(encoded));
    return artifact && sheet !== undefined && artifact.workbook.sheet(sheet) ? artifact.selectSheet(sheet) : artifact;
  });
  let plotIndex = $state(0);
  const selectedPlot = $derived(Math.max(0, Math.min(plotIndex, chartDataState(bytes).plots.length - 1)));
  let error = $state<string>(), typeError = $state<string>();
  let sourcePreview = $state<Uint8Array>();
  function chartPreview(change?: ChartTypeChange): ChartModel {
    try {
      const source = change ? convertChartType(bytes, change, selectedPlot) : sourcePreview;
      const xml = source ? new TextDecoder().decode(source) : current.xml;
      return { ...chartContentModel({ ...current, xml }), themeColors, themeFonts };
    } catch (cause) { return { status: 'unsupported', chartType: undefined, reason: cause instanceof Error ? cause.message : 'This data cannot use that chart type.', title: undefined, legend: undefined }; }
  }
  const previewModel = $derived(chartPreview());
  function publish(content: ChartContent, reason?: 'type' | 'series') { if (disabled || content === current) return; onchange(content, reason); current = content; error = undefined; typeError = undefined; sourcePreview = undefined; }
  function changeType(change: ChartTypeChange) {
    try {
      publish(applyChartContentEdit(current, { ...change, plot: selectedPlot }), 'type');
    } catch (cause) { typeError = cause instanceof Error ? cause.message : 'This chart type could not be applied.'; }
  }
  function openData() { if (!disabled) { if (embeddedData) dataOpen = true; else oneditdata?.(true); } }
  function changeSource(source: Uint8Array) {
    try {
      if (embeddedData && workbook) {
        const bound = extendChartWorkbook(source, workbook);
        publish({ ...current, xml: new TextDecoder().decode(refreshChartWorkbook(bound.source, bound.artifact)), workbook: chartBytesToBase64(bound.artifact.bytes()) }, 'series');
      } else publish({ ...current, xml: new TextDecoder().decode(source) }, 'series');
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The series could not be changed.'; }
  }
  function changeData(artifact: SpreadsheetArtifact) {
    const source = refreshChartWorkbook(dataBytes, artifact);
    publish({ ...current, xml: new TextDecoder().decode(source), workbook: chartBytesToBase64(artifact.bytes()) });
    sheet = artifact.activeSheet.name;
  }
  $effect(() => oncontrols?.({ type: typeControls, elements: elementControls, appearance: appearanceControls, data: dataControls, editData: openData, embeddedData }));
</script>

{@render properties(oncontrols ? 'format' : 'all')}

{#snippet typeControls(close: () => void)}{@render properties('type', close)}{/snippet}
{#snippet elementControls()}{@render properties('elements')}{/snippet}
{#snippet appearanceControls()}<ChartAppearance inline {bytes} {disabled} {themeColors} onchange={(source) => publish({ ...current, xml: new TextDecoder().decode(source) })} />{/snippet}
{#snippet dataControls(close: () => void)}
  {@render dataSourceEditor?.(close)}
  <ChartSeriesProperties onedit={(input) => { try { publish(applyChartContentEdit(current,input), 'series'); } catch (cause) { error = cause instanceof Error ? cause.message : 'The series could not be changed.'; } }} bytes={dataBytes} ranges={!embeddedData || workbook !== undefined} selectedRange={embeddedData ? (dataOpen ? embeddedRange : undefined) : selectedRange} {disabled} onchange={changeSource} />
  {#if error || draft?.error}<p class="error" role="alert">{error ?? draft?.error}</p>{/if}
{/snippet}
{#snippet properties(mode: 'all' | 'type' | 'elements' | 'format', close?: () => void)}
<ChartProperties {mode} onchoose={close} {bytes} {request} {disabled} {themeColors} plotIndex={selectedPlot} onplotselect={(index) => { plotIndex = index; }}
  {typeError} dataExpanded={embeddedData ? dataOpen : undefined} onsourcepreview={(source) => { sourcePreview = source; }}
  onchange={(source) => publish({ ...current, xml: new TextDecoder().decode(source) })}
  ontypechange={changeType} oneditdata={embeddedData ? openData : oneditdata}>
  {#snippet typePreview(change)}
    {@const model = chartPreview(change)}
    <OoxmlChart {patternOrigin} {model} width={previewSize.width} height={previewSize.height} />
    {#if model.status === 'unsupported'}<p class="preview-error" role="status">{model.reason}</p>{/if}
  {/snippet}
  {#snippet viewPreview()}<OoxmlChart {patternOrigin} model={previewModel} width={previewSize.width} height={previewSize.height} />{/snippet}
  {#snippet fillEditor(target, label, targetKey)}<ChartFillEditor {targetKey} content={current} {target} {label} {themeColors} {disabled} preview={viewPreview} onpreview={(source) => { sourcePreview = source; }} onchange={(content) => publish(content)} />{/snippet}
  {#snippet appearance()}<ChartAppearance {bytes} {disabled} {themeColors} onchange={(source) => publish({ ...current, xml:new TextDecoder().decode(source) })} />{/snippet}
  {#snippet dataEditor(returnFocus: () => void)}
    {@render dataControls(returnFocus)}
  {/snippet}
</ChartProperties>
{/snippet}
{#if embeddedData && dataOpen && workbook}<ChartDataEditor artifact={workbook} source={dataBytes} {themeColors} {disabled} onchange={changeData} onrangeselect={(reference) => { embeddedRange = reference; }} onsheetselect={(name) => { sheet = name; }} onclose={() => { dataOpen = false; }} />{/if}
<style>
  .error { color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); font-size: 12px; margin: 4px 0; }
  .preview-error { position: absolute; inset: auto 6px 4px; margin: 0; padding: 4px; background: var(--surface, #181818); color: var(--text, #e2fee7); font-size: 11px; }
</style>
