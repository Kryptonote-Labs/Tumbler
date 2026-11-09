<script lang="ts">
  import type { ChartModel } from '@tumblerjs/charts';
  import { formatSpreadsheetCellValue, resolveSpreadsheetChartColor, type SpreadsheetWorksheet } from '@tumblerjs/sheets';
  import OoxmlChart from './OoxmlChart.svelte';
  let { worksheet, model, width, height, clipId }: { worksheet: SpreadsheetWorksheet; model: ChartModel; width: number; height: number; clipId: string } = $props();
</script>
<OoxmlChart {model} {width} {height} {clipId} resolveColor={(color) => resolveSpreadsheetChartColor(worksheet.styles,color)} formatNumber={(value,formatCode) => formatSpreadsheetCellValue({type:'number',value,lexical:String(value)},{numberFormatCode:formatCode,dateSystem:worksheet.workbook.dateSystem})} />
