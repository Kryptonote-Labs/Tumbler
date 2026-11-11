<script lang="ts">
  import type { ChartModel } from '@tumblerjs/charts';
  import { formatSpreadsheetCellValue, resolveSpreadsheetChartColor, type SpreadsheetWorksheet } from '@tumblerjs/sheets';
  import OoxmlChart from './OoxmlChart.svelte';
  let { worksheet, model, width, height, clipId, patternOrigin }: { worksheet: SpreadsheetWorksheet; model: ChartModel; width: number; height: number; clipId: string; patternOrigin?: { readonly x: number; readonly y: number } } = $props();
</script>
<OoxmlChart {patternOrigin} {model} {width} {height} {clipId} resolveColor={(color) => resolveSpreadsheetChartColor(worksheet.styles,color)} formatNumber={(value,formatCode) => formatSpreadsheetCellValue({type:'number',value,lexical:String(value)},{numberFormatCode:formatCode,dateSystem:worksheet.workbook.dateSystem})} />
