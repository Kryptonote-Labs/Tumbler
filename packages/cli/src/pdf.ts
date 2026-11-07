import { pdfDeletePagesInput } from './pdf-pages.ts';
import type { OperationHost } from './registry.ts';

export function pdfHelp(commandName = 'tumbler', name?: string): string {
  if (name && name !== 'delete-pages') throw new Error(`Unknown PDF command: ${name}`);
  return [
    `Usage: ${commandName} <document.pdf> pdf delete-pages 2,4-6`,
    'Delete pages in place. Page numbers start at 1 and refer to the original document.',
    'Use comma-separated numbers and inclusive ranges. Descending ranges are accepted; duplicate or overlapping selections are rejected.',
    'Remaining pages keep their original order. At least one page must remain. File writes use a sibling lock and atomic replacement.',
    'The PDF is rebuilt without removed page streams or historical revisions. This is not content redaction: shared resources may remain.',
  ].join('\n') + '\n';
}

export async function runPdf(
  argv: readonly string[],
  options: { host: OperationHost; commandName?: string; stdout: (text: string) => void },
): Promise<void> {
  const [document, , name, ...args] = argv;
  if (!name || name === '--help' || args.includes('--help')) {
    options.stdout(pdfHelp(options.commandName, name === '--help' ? undefined : name));
    return;
  }
  if (name !== 'delete-pages') throw new Error(`Unknown PDF command: ${name}`);
  if (!document || args.length !== 1)
    throw new Error('Use pdf delete-pages <pages>, such as pdf delete-pages 2,4-6.');
  const input = pdfDeletePagesInput.parse({ pages: args[0] });
  if (!options.host.deletePdfPages) throw new Error('PDF page deletion is unavailable on this host.');
  options.stdout(JSON.stringify(await options.host.deletePdfPages(document, input)) + '\n');
}
