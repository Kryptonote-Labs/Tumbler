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
export const chartEditInput = z.object({
  page: z.string().min(1),
  part: z.string().min(1),
  edits: z.array(chartSourceEdit).min(1),
}).strict();
export type ChartEditInput = z.infer<typeof chartEditInput>;
export interface ChartOperationHost {
  readCharts?(document: string, input: { part?: string }): Promise<unknown>;
  editChart?(document: string, input: ChartEditInput): Promise<unknown>;
}

export function chartHelp(commandName = 'tumbler'): string {
  return [
    `${commandName} <document> charts read [--part /word/charts/chart1.xml]`,
    `${commandName} <document> charts edit --input JSON`,
    'Available for DOCX, PPTX and XLSX. Read lists chart parts; read --part returns the complete property tree and a page revision.',
    'Edit uses that page, part and snapshot node IDs. All edits address the original snapshot; overlapping edits fail atomically. Reread after every edit.',
    'Source edits retain unknown properties and theme references. They validate XML, not chart schema, formulas, or referenced workbook consistency. Update linked workbook data through the sheet engine in the same host transaction.',
    'These are advanced source edits, including Microsoft extension properties. Creating host drawings and automatic type conversion are separate operations.',
    JSON.stringify(z.toJSONSchema(chartEditInput), null, 2),
  ].join('\n') + '\n';
}

/** Hosts retain responsibility for authorization, revision checks and atomic persistence. */
export async function runCharts(argv: readonly string[], options: {
  host: ChartOperationHost;
  commandName?: string;
  stdout: (text: string) => void;
}): Promise<void> {
  const [document, , command, ...flags] = argv;
  if (!document) throw new Error('Supply a document.');
  if (!command || command === '--help' || flags.includes('--help')) {
    options.stdout(chartHelp(options.commandName));
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
  } else if (command === 'edit') {
    if (values['--part'] || !values['--input']) throw new Error('Chart edits require --input JSON.');
    if (!options.host.editChart) throw new Error('Chart editing is unavailable on this host.');
    result = await options.host.editChart(document, chartEditInput.parse(JSON.parse(values['--input'])));
  } else throw new Error(`Unknown chart command: ${command}`);
  options.stdout(JSON.stringify(result) + '\n');
}
