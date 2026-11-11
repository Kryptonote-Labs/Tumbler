import { chartCreateInput, runChartCreation, type ChartCreationHost } from './chart-create.ts';
import { OOXML_CHART_TYPES } from '@tumblerjs/charts';
import { z } from 'zod';

const address = { node: z.number().int().nonnegative() };
export const chartSourceEdit = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('attribute'), ...address, name: z.string().min(1), value: z.string().nullable() }).strict(),
  z.object({ kind: z.literal('text'), ...address, value: z.string() }).strict(),
  z.object({ kind: z.literal('replace'), ...address, markup: z.string() }).strict(),
  z.object({ kind: z.literal('append'), ...address, markup: z.string() }).strict(),
  z.object({ kind: z.literal('before'), ...address, markup: z.string() }).strict(),
  z.object({ kind: z.literal('remove'), ...address }).strict(),
]);
const chartTarget = { page: z.string().min(1), part: z.string().min(1) };
const sequence = z.object({ kind: z.enum(['string', 'number']), values: z.array(z.union([z.string(), z.number().finite(), z.null()])), formula: z.string().optional(), formatCode: z.string().optional(), levels: z.array(z.array(z.union([z.string(), z.number().finite(), z.null()]))).optional() }).strict();
const seriesData = z.object({ name: z.string(), nameFormula: z.string().optional(), categories: sequence.optional(), values: sequence.optional(), xValues: sequence.optional(), bubbleSizes: sequence.optional(), errorBars: z.array(z.object({ plus: sequence.optional(), minus: sequence.optional() }).strict()).optional() }).strict();
const seriesEdit = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), plot: z.number().int().nonnegative().optional(), series: seriesData }).strict(),
  z.object({ action: z.enum(['duplicate', 'remove']), plot: z.number().int().nonnegative().optional(), series: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal('move'), plot: z.number().int().nonnegative().optional(), series: z.number().int().nonnegative(), to: z.number().int().nonnegative() }).strict(),
]);
export const chartEditInput = z.union([
  z.object({ ...chartTarget, edits: z.array(chartSourceEdit).min(1) }).strict(),
  z.object({ ...chartTarget, plot: z.number().int().nonnegative().optional(), type: z.enum(OOXML_CHART_TYPES), direction: z.enum(['bar', 'col']).optional(), grouping: z.enum(['standard', 'clustered', 'stacked', 'percentStacked']).optional(), radarStyle: z.enum(['standard', 'marker', 'filled']).optional(), scatterStyle: z.enum(['none', 'line', 'lineMarker', 'marker', 'smooth', 'smoothMarker']).optional(), splitType: z.enum(['pie', 'bar']).optional(), wireframe: z.boolean().optional() }).strict(),
  z.object({ ...chartTarget, series: seriesEdit }).strict(),
  z.object({ ...chartTarget, data: z.array(z.object({ type: z.enum(OOXML_CHART_TYPES), series: z.array(seriesData.extend({ index: z.number().int().nonnegative() })) }).strict()) }).strict(),
  z.object({ ...chartTarget, cells: z.array(z.object({ sheet: z.string().optional(), reference: z.string().min(1), value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]).optional(), formula: z.string().optional() }).strict().refine(cell => (cell.value !== undefined) !== (cell.formula !== undefined), 'Supply a value or a formula.')).min(1) }).strict(),
]);
export type ChartEditInput = z.infer<typeof chartEditInput>;
export interface ChartOperationHost {
  readCharts?(document: string, input: { part?: string }): Promise<unknown>;
  editChart?(document: string, input: ChartEditInput): Promise<unknown>;
}

export function chartHelp(commandName = 'tumbler', command?: string): string {
  return [
    `${commandName} <document> charts read [--part /word/charts/chart1.xml]`,
    `${commandName} <document> charts create|edit|convert|data --input JSON`,
    'Create takes a native document page handle and a word/presentation/spreadsheet target. Word dimensions are points; slide and sheet bounds are pixels. Word and slides get a real embedded workbook; sheets get real source cells in the host workbook. Omitted category labels use consecutive numbers.',
    'Available for DOCX, PPTX and XLSX. Read lists chart parts; read --part returns the complete property tree and a page revision.',
    'Edit uses that page, part and snapshot node IDs. All edits address the original snapshot; overlapping edits fail atomically. Reread after every edit.',
    'Source edits retain unknown properties and theme references. They validate XML, not chart schema, formulas, or referenced workbook consistency. Update linked workbook data through the sheet engine in the same host transaction.',
    'edit changes source properties, convert changes a plot type while retaining data and inactive formatting, and data changes embedded workbook cells and refreshes the chart. For XLSX source cells use sheets operations.',
    JSON.stringify(z.toJSONSchema(command === 'create' ? chartCreateInput : chartEditInput, { io: 'input' }), null, 2),
  ].join('\n') + '\n';
}

/** Hosts retain responsibility for authorization, revision checks and atomic persistence. */
export async function runCharts(argv: readonly string[], options: {
  host: ChartOperationHost & ChartCreationHost;
  commandName?: string;
  stdout: (text: string) => void;
}): Promise<void> {
  const [document, , command, ...flags] = argv;
  if (!document) throw new Error('Supply a document.');
  if (!command || command === '--help' || flags.includes('--help')) {
    options.stdout(chartHelp(options.commandName, command));
    return;
  }
  const values: Record<string, string> = {};
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i]!;
    if (!['--part', '--input'].includes(flag) || values[flag] !== undefined || flags[i + 1] === undefined)
      throw new Error('Use charts read [--part path] or charts edit --input JSON.');
    values[flag] = flags[i + 1]!;
  }
  let result: unknown;
  if (command === 'read') {
    if (values['--input']) throw new Error('Use --part for chart reads.');
    if (!options.host.readCharts) throw new Error('Chart reading is unavailable on this host.');
    result = await options.host.readCharts(document, values['--part'] === undefined ? {} : { part: values['--part'] });
  } else if (command === 'create') {
    if (values['--part'] || !values['--input']) throw new Error('Chart creation requires --input JSON.');
    result = await runChartCreation(document, chartCreateInput.parse(JSON.parse(values['--input'])), options.host);
  } else if (['edit', 'convert', 'data'].includes(command ?? '')) {
    if (values['--part'] || !values['--input']) throw new Error('Chart edits require --input JSON.');
    if (!options.host.editChart) throw new Error('Chart editing is unavailable on this host.');
    result = await options.host.editChart(document, chartEditInput.parse(JSON.parse(values['--input'])));
  } else throw new Error(`Unknown chart command: ${command}`);
  options.stdout(JSON.stringify(result) + '\n');
}
