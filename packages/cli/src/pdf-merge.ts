import type { OperationHost } from './registry.ts';

export interface PdfMergeInput {
  sources: { document: string; pages?: string }[];
  output: string;
}
export const pdfMergeHelp = (commandName = 'tumbler') => `Usage: ${commandName} <first.pdf> pdf merge [--pages 3,1-2] --source <next.pdf> [--pages 4-2] --output <merged.pdf>
Each source contributes all pages unless --pages follows it. Repeat --source to interleave sources or reuse pages.
Selections use one-based numbers and inclusive ranges in written order, including repetitions.
Output must be a new .pdf file. Sources remain unchanged. Pages retain PDF content without rasterizing.
`;

export async function runPdfMerge(document: string, args: readonly string[], host: OperationHost): Promise<unknown> {
  const sources: PdfMergeInput['sources'] = [{ document }];
  let output: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const raw = args[i]!;
    const equal = raw.indexOf('=');
    const flag = equal < 0 ? raw : raw.slice(0, equal);
    if (!['--source', '--pages', '--output'].includes(flag)) throw new Error(`Unknown merge flag: ${flag}`);
    const value = equal < 0 ? args[++i] : raw.slice(equal + 1);
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    if (flag === '--source') sources.push({ document: value });
    else if (flag === '--pages') {
      const source = sources.at(-1)!;
      if (source.pages !== undefined) throw new Error('Use --pages once per source.');
      source.pages = value;
    } else {
      if (output !== undefined) throw new Error('Use --output once.');
      output = value;
    }
  }
  if (!output) throw new Error('PDF merge requires --output <new.pdf>.');
  if (!host.mergePdf) throw new Error('PDF merging is unavailable on this host.');
  return host.mergePdf({ sources, output });
}
