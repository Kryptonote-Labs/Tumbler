import { DEFAULT_WORD_THEME } from './theme-colours.ts';
import type { ThemeColorScheme, ThemeFontScheme } from '@tumblerjs/ooxml';
import { chartTitleFromWord } from './chart-title.ts';
import { inspectChartSource, chartContentModel, updateChartTitle, decodeChartWorkbook, mergeChartContent, bindChartTheme, type ChartContent } from '@tumblerjs/charts';
import { PartName } from '@tumblerjs/opc';
import type { WordChartDrawing } from './drawings.ts';
import { imagePlacement, type WordImagePosition } from './image-placement.ts';
import { nativeDrawingGeometry } from './native-drawing.ts';

export interface WordAuthoredChart extends WordImagePosition {
  readonly width: number;
  readonly height: number;
  readonly alt?: string;
  readonly content: ChartContent;
}
export function isWordChartContent(value: unknown): value is ChartContent {
  if (!value || typeof value !== 'object' || !('xml' in value) || typeof value.xml !== 'string' || 'workbook' in value && value.workbook !== undefined && typeof value.workbook !== 'string') return false;
  try {
    const bytes = new TextEncoder().encode(value.xml);
    const root = inspectChartSource(bytes);
    if (!root.namespace.endsWith('/chart') || !root.children.some(child => child.name.split(':').at(-1) === 'chart' && child.children.some(child => child.name.split(':').at(-1) === 'plotArea'))) return false;
    if ('workbook' in value && typeof value.workbook === 'string') decodeChartWorkbook(value.workbook);
    return true;
  } catch { return false; }
}
export function isWordAuthoredChart(value: unknown): value is WordAuthoredChart {
  if (!value || typeof value !== 'object' || !('width' in value) || typeof value.width !== 'number' || !('height' in value) || typeof value.height !== 'number' || !('content' in value) || !isWordChartContent(value.content)) return false;
  if (![value.width, value.height].every(number => Number.isFinite(number) && number > 0 && Number.isSafeInteger(Math.round(number * 12700)))) return false;
  // Structural values above are checked; imagePlacement validates every optional placement field.
  try { imagePlacement(value as WordAuthoredChart, value.width, value.width); return true; } catch { return false; }
}
export function nativeChartDrawing(id: number, chart: WordAuthoredChart, availableWidth: number): WordChartDrawing {
  if (!isWordAuthoredChart(chart)) throw new TypeError('Invalid chart content or geometry.');
  return { ...nativeDrawingGeometry(id, chart, availableWidth, 'Chart'), kind: 'chart', partName: PartName.parse(`/word/charts/native-${id}.xml`), relationshipId: `native-chart-${id}`, model: chartContentModel(chart.content), content: chart.content };
}

/** Inline title editing and property-pane edits compose before persistence. */
export function authoredChartContent(run: Pick<import('./create.ts').WordTextRun, 'chart' | 'chartContent' | 'chartTitle' | 'chartTitleText'>, themeColors: ThemeColorScheme = DEFAULT_WORD_THEME, themeFonts?: ThemeFontScheme): ChartContent | undefined {
  const content = run.chartContent ? run.chart ? mergeChartContent(run.chart.content, run.chartContent) : run.chartContent : run.chart?.content;
  if (!content || run.chartTitle === undefined && run.chartTitleText === undefined) return content;
  const source = new TextEncoder().encode(content.xml);
  return { ...content, xml: new TextDecoder().decode(updateChartTitle(source, run.chartTitleText ? chartTitleFromWord(run.chartTitleText, bindChartTheme(chartContentModel(content), themeColors, themeFonts)) : run.chartTitle!)) };
}
