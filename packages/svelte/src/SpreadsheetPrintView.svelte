<script lang="ts">
  import { spreadsheetPrintHeaderText, spreadsheetPrintPages, formatCellReference, projectSpreadsheetConditionalStyles, resolveSpreadsheetChartDataSet, spreadsheetDrawingBounds, type SpreadsheetArtifact } from '@tumblerjs/sheets';
  import SpreadsheetChart from './SpreadsheetChart.svelte';
  import { spreadsheetCellCss } from './spreadsheet-cell-style.ts';
  let { artifact }: { artifact: SpreadsheetArtifact } = $props();
  const pages = $derived(spreadsheetPrintPages(artifact));
  const sheet = $derived(artifact.worksheet);
  const conditional = $derived(projectSpreadsheetConditionalStyles(sheet, artifact.calculation));
  const charts = $derived(resolveSpreadsheetChartDataSet(sheet,(sheet.drawing?.charts ?? []).map(c=>c.model)));
  const rows = $derived(sheet.rowGeometry());
  const columns = $derived(sheet.columnGeometry());
</script>
<svelte:element this={"style"}>{pages.map((page,i)=>`@page tumbler-sheet-${i} { size: ${page.width}px ${page.height}px; margin: 0; }`).join('\n')}</svelte:element>
{#each pages as page,i}
  <section style={`page:tumbler-sheet-${i};width:${page.width}px;height:${page.height}px;padding:${page.margins.top}px ${page.margins.right}px ${page.margins.bottom}px ${page.margins.left}px;box-sizing:border-box;position:relative;overflow:hidden;break-after:page;background:white;color:black;display:flex;${page.horizontalCentered ? 'justify-content:center;' : ''}${page.verticalCentered ? 'align-items:center;' : 'align-items:flex-start;'}`}>
    {#each [{text:page.header,side:'top',offset:page.headerMargin},{text:page.footer,side:'bottom',offset:page.footerMargin}] as field}
      <div style={`position:absolute;left:${page.margins.left}px;right:${page.margins.right}px;${field.side}:${field.offset}px;display:flex;font-size:10pt;line-height:1.2`}>
        {#each spreadsheetPrintHeaderText(field.text,artifact.activeSheet.name,i+1,pages.length) as text,n}<span style={`flex:1;white-space:pre-wrap;text-align:${n===0?'left':n===1?'center':'right'}`}>{text}</span>{/each}
      </div>
    {/each}
    <div style={`position:relative;zoom:${page.scale}`}><table style={`border-collapse:collapse;table-layout:fixed;width:${page.columns.reduce((sum,c)=>sum+columns.size(c),page.headings ? 32 : 0)}px;font-size:11pt`}>
      <colgroup>{#if page.headings}<col style:width="32px" />{/if}{#each page.columns as column}<col style:width={`${columns.size(column)}px`} />{/each}</colgroup>
      {#if page.headings}<thead><tr style:height="20px"><th></th>{#each page.columns as column}<th>{formatCellReference({row:1,column}).replace('1','')}</th>{/each}</tr></thead>{/if}
      <tbody>{#each page.rows as row}
        {#if rows.size(row) > 0}<tr style:height={`${rows.size(row)}px`}>{#if page.headings}<th>{row}</th>{/if}
          {#each page.columns as column}
            {@const merge = sheet.merges.find(m=>row>=m.start.row && row<=m.end.row && column>=m.start.column && column<=m.end.column)}
            {@const reference = formatCellReference(merge?.start ?? {row,column})}
            {#if columns.size(column) > 0 && (!merge || row===page.rows.find(n=>n>=merge.start.row && n<=merge.end.row && rows.size(n)>0) && column===page.columns.find(n=>n>=merge.start.column && n<=merge.end.column && columns.size(n)>0))}
              <td rowspan={merge ? Math.min(merge.end.row,page.range.end.row)-row+1 : 1} colspan={merge ? Math.min(merge.end.column,page.range.end.column)-column+1 : 1} style={`padding:0;overflow:hidden;white-space:pre;box-sizing:border-box;${page.gridLines ? 'border:1px solid #ddd;' : ''}${spreadsheetCellCss(sheet,reference,conditional.formats(reference),artifact.calculation.value(reference))}`}><div style={`height:${page.rows.filter(n=>n>=row && n<=(merge?.end.row ?? row)).reduce((sum,n)=>sum+rows.size(n),0)}px;overflow:hidden;padding:0 3px;box-sizing:border-box;white-space:pre;${spreadsheetCellCss(sheet,reference,conditional.formats(reference),artifact.calculation.value(reference))}`}>{artifact.calculation.displayText(reference)}</div></td>
            {/if}
          {/each}
        </tr>{/if}
      {/each}</tbody>
    </table>
    {#each sheet.drawing?.charts ?? [] as chart,n}
      {@const bounds = spreadsheetDrawingBounds(chart.anchor,rows,columns)}
      <div style={`position:absolute;left:${bounds.x-columns.start(page.range.start.column)}px;top:${bounds.y-rows.start(page.range.start.row)}px;width:${bounds.width}px;height:${bounds.height}px`}><SpreadsheetChart patternOrigin={{ x: bounds.x, y: bounds.y }} worksheet={sheet} model={charts[n]!} width={bounds.width} height={bounds.height} clipId={`print-${i}-${n}`} /></div>
    {/each}
    </div>
  </section>
{/each}
