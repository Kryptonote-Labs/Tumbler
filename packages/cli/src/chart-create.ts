import { z } from 'zod';
import { OOXML_CHART_TYPES, createOoxmlChart, chartBytesToBase64 } from '@tumblerjs/charts';
import { createChartWorkbook } from '@tumblerjs/sheets';
import type { OperationHost } from './registry.ts';

const size = { width: z.number().finite().positive(), height: z.number().finite().positive() };
const bounds = z.object({ x: z.number().finite(), y: z.number().finite(), ...size }).strict();
const numbers = z.array(z.number().finite().nullable());
export const chartCreateInput = z.object({
  page: z.string().min(1),
  target: z.discriminatedUnion('family', [
    z.object({ family: z.literal('word'), start: z.number().int().nonnegative(), end: z.number().int().nonnegative().optional(), width: size.width.default(360), height: size.height.default(240) }).strict(),
    z.object({ family: z.literal('presentation'), slideId: z.string().min(1), bounds: bounds.default({ x: 80, y: 80, width: 480, height: 320 }) }).strict(),
    z.object({ family: z.literal('spreadsheet'), sheetId: z.string().min(1), x: z.number().finite().default(100), y: z.number().finite().default(60), width: size.width.default(480), height: size.height.default(320) }).strict(),
  ]),
  chart: z.object({
    type: z.enum(OOXML_CHART_TYPES), title: z.string().optional(), conformance: z.enum(['strict', 'transitional']).optional(),
    categories: z.array(z.string()).optional(),
    series: z.array(z.object({ name: z.string(), values: numbers, xValues: numbers.optional(), bubbleSizes: numbers.optional() }).strict()),
    direction: z.enum(['bar', 'col']).optional(), grouping: z.enum(['standard', 'clustered', 'stacked', 'percentStacked']).optional(),
    radarStyle: z.enum(['standard', 'marker', 'filled']).optional(), scatterStyle: z.enum(['none', 'line', 'lineMarker', 'marker', 'smooth', 'smoothMarker']).optional(),
    splitType: z.enum(['pie', 'bar']).optional(), wireframe: z.boolean().optional(),
  }).strict(),
}).strict();
export type ChartCreateInput = z.infer<typeof chartCreateInput>;
export type ChartCreationHost = Partial<Pick<OperationHost, 'operate' | 'operatePresentation' | 'operateSpreadsheet'>>;

/** Creation uses the same native insertion commands as human editing and their existing revision/undo boundary. */
export async function runChartCreation(document: string, input: ChartCreateInput, host: ChartCreationHost): Promise<unknown> {
  const { chart, target, page } = input;
  const categories = chart.categories ?? Array.from({ length: Math.max(0, ...chart.series.map(series => series.values.length)) }, (_, index) => String(index + 1));
  const source = createOoxmlChart({ ...chart, categories });
  if (target.family === 'spreadsheet') {
    if (!host.operateSpreadsheet) throw new Error('Spreadsheet chart creation is unavailable on this host.');
    const { family: _family, ...position } = target;
    return host.operateSpreadsheet(document, { page, command: { name: 'insert-chart', ...position, content: { xml: new TextDecoder().decode(source) }, bindUnboundData: true } });
  }
  const created = createChartWorkbook(source);
  const content = { xml: new TextDecoder().decode(created.source), workbook: chartBytesToBase64(created.artifact.bytes()) };
  if (target.family === 'presentation') {
    if (!host.operatePresentation) throw new Error('Presentation chart creation is unavailable on this host.');
    return host.operatePresentation(document, { page, command: { name: 'insert-chart', slideId: target.slideId, bounds: target.bounds, content } });
  }
  if (!host.operate) throw new Error('Word chart creation is unavailable on this host.');
  return host.operate(document, { page, target: { kind: 'range', start: target.start, end: target.end ?? target.start }, operation: { name: 'insert-chart', input: { chart: { width: target.width, height: target.height, content } } } });
}
