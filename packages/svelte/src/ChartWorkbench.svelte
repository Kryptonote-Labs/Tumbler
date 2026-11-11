<script lang="ts">
  import { chartBase64ToBytes, chartBytesToBase64, chartContentModel, convertChartType, type ChartContent, type ChartModel } from '@tumblerjs/charts';
  import { createChartWorkbook, extendChartWorkbook, openSpreadsheetArtifact, refreshChartWorkbook, type SpreadsheetArtifact } from '@tumblerjs/sheets';
  import ChartProperties from './ChartProperties.svelte';
  import ChartDataEditor from './ChartDataEditor.svelte';
  import OoxmlChart from './OoxmlChart.svelte';
  import type { ChartTypeChange } from './chart-properties.ts';

  let { content, disabled = false, themeColors = {}, embeddedData = true, oneditdata, onchange }: {
    content: ChartContent;
    disabled?: boolean;
    themeColors?: Readonly<Record<string, string>>;
    embeddedData?: boolean;
    oneditdata?: () => void;
    onchange: (content: ChartContent) => void;
  } = $props();
  let current = $derived(content);
  const bytes = $derived(new TextEncoder().encode(current.xml));
  const encoded = $derived(current.workbook);
  let sheet = $state<string>();
  const workbook = $derived(encoded === undefined ? undefined : openSpreadsheetArtifact(chartBase64ToBytes(encoded), sheet === undefined ? {} : { sheet }));
  let dataOpen = $state(false);
  let preview = $state<ChartTypeChange>();
  let error = $state<string>();
  const previewModel = $derived.by((): ChartModel => {
    try {
      const xml = preview ? new TextDecoder().decode(convertChartType(bytes, preview)) : current.xml;
      return { ...chartContentModel({ xml }), themeColors };
    } catch (cause) { return { status: 'unsupported', chartType: undefined, reason: cause instanceof Error ? cause.message : 'This data cannot use that chart type.', title: undefined, legend: undefined }; }
  });
  function publish(content: ChartContent) { if (disabled) return; current = content; error = undefined; onchange(content); }
  function changeType(change: ChartTypeChange) {
    try {
      const source = convertChartType(bytes, change);
      if (embeddedData && workbook) {
        const bound = extendChartWorkbook(source, workbook);
        publish({ xml: new TextDecoder().decode(bound.source), workbook: chartBytesToBase64(bound.artifact.bytes()) });
      } else publish({ ...current, xml: new TextDecoder().decode(source) });
    } catch (cause) { error = cause instanceof Error ? cause.message : 'This chart type could not be applied.'; }
  }
  function openData() {
    if (disabled) return;
    if (!workbook) {
      try {
        const created = createChartWorkbook(bytes);
        publish({ xml: new TextDecoder().decode(created.source), workbook: chartBytesToBase64(created.artifact.bytes()) });
      } catch (cause) { error = cause instanceof Error ? cause.message : 'The data workbook could not be opened.'; return; }
    }
    dataOpen = true;
  }
  function changeData(artifact: SpreadsheetArtifact) {
    try {
      sheet = artifact.activeSheet.name;
      const source = refreshChartWorkbook(bytes, artifact);
      publish({ xml: new TextDecoder().decode(source), workbook: chartBytesToBase64(artifact.bytes()) });
    } catch (cause) { error = cause instanceof Error ? cause.message : 'The chart data could not be saved.'; }
  }
</script>

<ChartProperties {bytes} {disabled} {themeColors}
  onchange={(source) => publish({ ...current, xml: new TextDecoder().decode(source) })}
  ontypechange={changeType} ontypepreview={(value) => { preview = value; }} oneditdata={embeddedData ? openData : oneditdata}>
  {#snippet typePreview()}
    <OoxmlChart model={previewModel} width={320} height={160} />
    {#if previewModel.status === 'unsupported'}<p class="preview-error" role="status">{previewModel.reason}</p>{/if}
  {/snippet}
  {#snippet dataEditor()}
    {#if embeddedData && dataOpen && workbook}<ChartDataEditor artifact={workbook} {disabled} onchange={changeData} onclose={() => { dataOpen = false; }} />{/if}
  {/snippet}
</ChartProperties>
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .error { color: var(--tumbler-control-danger, var(--danger, #ff6b6b)); font-size: 12px; margin: 4px 0; }
  .preview-error { position: absolute; inset: auto 6px 4px; margin: 0; padding: 4px; background: var(--surface, #181818); color: var(--text, #e2fee7); font-size: 11px; }
</style>
