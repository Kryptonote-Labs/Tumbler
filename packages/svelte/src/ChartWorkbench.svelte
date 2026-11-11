<script lang="ts">
  import { chartBase64ToBytes, chartBytesToBase64, chartContentModel, convertChartType, readChartData, type ChartContent, type ChartModel } from '@tumblerjs/charts';
  import { createChartWorkbook, extendChartWorkbook, openSpreadsheetArtifact, refreshChartWorkbook, type SpreadsheetArtifact } from '@tumblerjs/sheets';
  import ChartSeriesProperties from './ChartSeriesProperties.svelte';
  import ChartProperties from './ChartProperties.svelte';
  import ChartDataEditor from './ChartDataEditor.svelte';
  import OoxmlChart from './OoxmlChart.svelte';
  import type { ChartTypeChange } from './chart-properties.ts';

  let { content, disabled = false, themeColors = {}, themeFonts = {}, embeddedData = true, oneditdata, onchange }: {
    content: ChartContent;
    disabled?: boolean;
    themeColors?: Readonly<Record<string, string>>;
    themeFonts?: Readonly<Record<string, string>>;
    embeddedData?: boolean;
    oneditdata?: () => void;
    onchange: (content: ChartContent, reason?: 'type' | 'series') => void;
  } = $props();
  let current = $derived(content);
  const bytes = $derived(new TextEncoder().encode(current.xml));
  const encoded = $derived(current.workbook);
  let sheet = $state<string>();
  let dataOpen = $state(false);
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
  let preview = $state<ChartTypeChange>();
  let plotIndex = $state(0);
  const selectedPlot = $derived(Math.max(0, Math.min(plotIndex, readChartData(bytes).length - 1)));
  let error = $state<string>(), typeError = $state<string>();
  let sourcePreview = $state<Uint8Array>();
  const previewModel = $derived.by((): ChartModel => {
    try {
      const xml = sourcePreview ? new TextDecoder().decode(sourcePreview) : preview ? new TextDecoder().decode(convertChartType(bytes, preview, selectedPlot)) : current.xml;
      return { ...chartContentModel({ xml }), themeColors, themeFonts };
    } catch (cause) { return { status: 'unsupported', chartType: undefined, reason: cause instanceof Error ? cause.message : 'This data cannot use that chart type.', title: undefined, legend: undefined }; }
  });
  function publish(content: ChartContent, reason?: 'type' | 'series') { if (disabled) return; current = content; error = undefined; typeError = undefined; sourcePreview = undefined; onchange(content, reason); }
  function changeType(change: ChartTypeChange) {
    try {
      const source = convertChartType(bytes, change, selectedPlot);
      if (embeddedData && workbook) {
        const bound = extendChartWorkbook(source, workbook);
        publish({ xml: new TextDecoder().decode(bound.source), workbook: chartBytesToBase64(bound.artifact.bytes()) }, 'type');
      } else publish({ ...current, xml: new TextDecoder().decode(source) }, 'type');
    } catch (cause) { typeError = cause instanceof Error ? cause.message : 'This chart type could not be applied.'; }
  }
  function openData() { if (!disabled) dataOpen = !dataOpen; }
  function changeSource(source: Uint8Array) {
    try {
      if (embeddedData && workbook) {
        const bound = extendChartWorkbook(source, workbook);
        const refreshed = refreshChartWorkbook(bound.source, bound.artifact);
        publish({ xml: new TextDecoder().decode(refreshed), workbook: chartBytesToBase64(bound.artifact.bytes()) }, 'series');
      } else publish({ ...current, xml: new TextDecoder().decode(source) }, 'series');
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The series could not be changed.'; }
  }
  function changeData(artifact: SpreadsheetArtifact) {
    try {
      sheet = artifact.activeSheet.name;
      const source = refreshChartWorkbook(dataBytes, artifact);
      publish({ xml: new TextDecoder().decode(source), workbook: chartBytesToBase64(artifact.bytes()) });
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The chart data could not be saved.'; }
  }
</script>

<ChartProperties {bytes} {disabled} {themeColors} plotIndex={selectedPlot} onplotselect={(index) => { plotIndex = index; preview = undefined; }}
  {typeError} dataExpanded={embeddedData ? dataOpen : undefined} onsourcepreview={(source) => { sourcePreview = source; }}
  onchange={(source) => publish({ ...current, xml: new TextDecoder().decode(source) })}
  ontypechange={changeType} ontypepreview={(value) => { preview = value; }} oneditdata={embeddedData ? openData : oneditdata}>
  {#snippet typePreview(width: number)}
    <OoxmlChart model={previewModel} {width} height={160} />
    {#if previewModel.status === 'unsupported'}<p class="preview-error" role="status">{previewModel.reason}</p>{/if}
  {/snippet}
  {#snippet viewPreview(width: number)}<OoxmlChart model={previewModel} width={Math.max(1, width)} height={160} />{/snippet}
  {#snippet dataEditor(returnFocus: () => void)}
    <ChartSeriesProperties bytes={dataBytes} {disabled} onchange={changeSource} />
    {#if error || draft?.error}<p class="error" role="alert">{error ?? draft?.error}</p>{/if}
    {#if embeddedData && dataOpen && workbook}<ChartDataEditor artifact={workbook} source={dataBytes} {themeColors} {disabled} onchange={changeData} onsheetselect={(name) => { sheet = name; }} onclose={() => { dataOpen = false; returnFocus(); }} />{/if}
  {/snippet}
</ChartProperties>
<style>
  .error { color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); font-size: 12px; margin: 4px 0; }
  .preview-error { position: absolute; inset: auto 6px 4px; margin: 0; padding: 4px; background: var(--surface, #181818); color: var(--text, #e2fee7); font-size: 11px; }
</style>
