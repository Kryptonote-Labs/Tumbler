import { expect, test } from 'bun:test';
import { createChartWorkbook, refreshChartWorkbook } from '../src/index.ts';
import { createOoxmlChart, readChartData } from '@tumblerjs/charts';
const source = () => createOoxmlChart({ type: 'barChart', categories: ['A', 'B'], series: [{ name: 'Sales', values: [2, 4] }] });

test('custom error ranges become workbook cells and refresh through formulas without losing extensions', async () => {
  const { chartContentModel } = await import('@tumblerjs/charts');
  const { resolveSpreadsheetChartData } = await import('../src/index.ts');
  const xml = new TextDecoder().decode(source()).replace('<c:cat>', '<c:errBars><c:errDir val="y"/><c:errBarType val="both"/><c:errValType val="cust"/><c:plus><c:numLit><c:formatCode>0.0</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="1"><c:v>2</c:v></c:pt><c:extLst><c:ext uri="retained"><t:source xmlns:t="urn:test"/></c:ext></c:extLst></c:numLit></c:plus><c:minus><c:numLit><c:ptCount val="2"/><c:pt idx="0"><c:v>0.5</c:v></c:pt><c:pt idx="1"><c:v>1</c:v></c:pt></c:numLit></c:minus></c:errBars><c:cat>');
  const workbook = createChartWorkbook(new TextEncoder().encode(xml));
  const data = readChartData(workbook.source)[0]!.series[0]!;
  expect(data.errorBars?.[0]?.plus?.formula).toBe("'Sheet1'!$C$2:$C$3");
  const edited = workbook.artifact.editFormula('C2', '5*2').editCell('D3', 6);
  const refreshed = refreshChartWorkbook(workbook.source, edited);
  expect(readChartData(refreshed)[0]!.series[0]!.errorBars?.[0]?.plus?.values).toEqual([10, 2]);
  expect(readChartData(refreshed)[0]!.series[0]!.errorBars?.[0]?.minus?.values).toEqual([.5, 6]);
  expect(new TextDecoder().decode(refreshed)).toContain('uri="retained"');
  const live = resolveSpreadsheetChartData(edited.worksheet, chartContentModel({ xml: new TextDecoder().decode(workbook.source) }));
  if (live.status !== 'supported') throw new Error(live.reason);
  expect(live.series[0]?.errorBars?.[0]?.plus?.points[0]?.value).toBe(10);
});
