import { pdfDeletePagesInput } from "./pdf-pages.ts";
import type { OperationHost } from "./registry.ts";
import type { PdfSearchOptions, PdfSearchResult } from "@tumblerjs/pdf";
export interface PdfMergeInput {
  sources: { path: string; pages?: string; password?: string }[];
  output: string;
}
export interface PdfOperationHost {
  mergePdf?(input: PdfMergeInput): Promise<unknown>;
  findPdf?(
    document: string,
    query: string,
    options: PdfSearchOptions,
  ): Promise<PdfSearchResult>;
}
async function runPdfFind(
  argv: readonly string[],
  options: {
    host: PdfOperationHost;
    commandName?: string;
    stdout: (text: string) => void;
  },
) {
  const [document, , command, query, ...flags] = argv;
  if (command !== "find" || !query?.trim())
    throw new Error(
      "Use pdf find <non-empty text> [--match-case] [--pages 2-8].",
    );
  const search: PdfSearchOptions = {};
  const seen = new Set<string>();
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    if (seen.has(flag)) throw new Error(`Duplicate flag: ${flag}`);
    seen.add(flag);
    if (flag === "--match-case") search.matchCase = true;
    else if (flag === "--pages") {
      const value = flags[++i];
      if (!value || !/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(value))
        throw new Error(
          "Use --pages with one-based pages or ranges, e.g. 2-8.",
        );
      const pages = new Set<number>();
      for (const part of value.split(",")) {
        const [first, last = first] = part.split("-").map(Number) as [
          number,
          number?,
        ];
        if (
          !Number.isSafeInteger(first) ||
          !Number.isSafeInteger(last) ||
          first < 1 ||
          last < first ||
          last - first > 100000
        )
          throw new Error("Invalid page range.");
        for (let page = first; page <= last; page++) pages.add(page);
      }
      search.pages = [...pages];
    } else throw new Error(`Unknown flag: ${flag}`);
  }
  if (!options.host.findPdf)
    throw new Error("PDF search is unavailable on this host.");
  options.stdout(
    JSON.stringify(await options.host.findPdf(document!, query, search)) + "\n",
  );
}

export function pdfHelp(commandName = "tumbler", name?: string): string {
  if (name && !["delete-pages", "find", "merge"].includes(name))
    throw new Error(`Unknown PDF command: ${name}`);
  const findHelp = `Usage: ${commandName} <document.pdf> pdf find <text> [--match-case] [--pages 2-8]\nReturns matches, total, one-based pages, context, and top-left page rectangles in points.\n`;
  const mergeHelp = `Usage: ${commandName} <first.pdf> pdf merge [--pages 3,1-2,1] [--password PASSWORD] --source next.pdf [--pages 2-1] [--password PASSWORD] --output merged.pdf
Sources are merged in command order. Omit --pages for all pages. Pages start at 1; inclusive descending ranges and repeated pages are supported.
Repeat --source to interleave blocks from the same PDF. --pages and --password apply to the most recent source (initially first.pdf).
Creates a new PDF without overwriting an existing file. Passwords unlock inputs; the output is unencrypted.
`;
  if (name === "merge") return mergeHelp;
  if (name === "find") return findHelp;
  return (
    (name ? "" : findHelp + mergeHelp) +
    [
      `Usage: ${commandName} <document.pdf> pdf delete-pages 2,4-6`,
      "Delete pages in place. Page numbers start at 1 and refer to the original document.",
      "Use comma-separated numbers and inclusive ranges. Descending ranges are accepted; duplicate or overlapping selections are rejected.",
      "Remaining pages keep their original order. At least one page must remain. File writes use a sibling lock and atomic replacement.",
      "Documents with unsupported structures (including attachments, metadata and page labels) are rejected without changing the file.",
      "The PDF is rebuilt without removed page streams or historical revisions. This is not content redaction: shared resources may remain.",
    ].join("\n") +
    "\n"
  );
}

export async function runPdf(
  argv: readonly string[],
  options: {
    host: OperationHost;
    commandName?: string;
    stdout: (text: string) => void;
  },
): Promise<void> {
  const [document, , name, ...args] = argv;
  if (!name || name === "--help" || (name !== "merge" && args.includes("--help"))) {
    options.stdout(
      pdfHelp(options.commandName, name === "--help" ? undefined : name),
    );
    return;
  }
  if (name === "merge") {
    if (!document) throw new Error('Specify the first PDF source.');
    const input: PdfMergeInput = { sources: [{ path: document }], output: '' };
    for (let i = 0; i < args.length; i++) {
      const argument = args[i]!;
      const equals = argument.indexOf('=');
      const flag = equals < 0 ? argument : argument.slice(0, equals);
      if (argument === '--help') {
        options.stdout(pdfHelp(options.commandName, 'merge'));
        return;
      }
      if (!['--source', '--output', '--pages', '--password'].includes(flag))
        throw new Error('Unknown PDF merge flag. Use pdf merge --help.');
      const value = equals < 0 ? args[++i] : argument.slice(equals + 1);
      // Passwords are literal strings, including empty strings and flag-shaped values.
      if (value === undefined || (flag !== '--password' && (!value || (equals < 0 && value.startsWith('--')))))
        throw new Error(`Missing value for ${flag}.`);
      const current = input.sources[input.sources.length - 1]!;
      if (flag === '--source') input.sources.push({ path: value });
      else if (flag === '--output' && !input.output) input.output = value;
      else if (flag === '--pages' && current.pages === undefined) current.pages = value;
      else if (flag === '--password' && current.password === undefined) current.password = value;
      else throw new Error(`Duplicate flag: ${flag}`);
    }
    if (!input.output) throw new Error('Specify --output merged.pdf.');
    if (!options.host.mergePdf) throw new Error('PDF merging is unavailable on this host.');
    options.stdout(JSON.stringify(await options.host.mergePdf(input)) + '\n');
    return;
  }
  if (name === "find") {
    await runPdfFind(argv, options);
    return;
  }
  if (name !== "delete-pages") throw new Error(`Unknown PDF command: ${name}`);
  if (!document || args.length !== 1)
    throw new Error(
      "Use pdf delete-pages <pages>, such as pdf delete-pages 2,4-6.",
    );
  const input = pdfDeletePagesInput.parse({ pages: args[0] });
  if (!options.host.deletePdfPages)
    throw new Error("PDF page deletion is unavailable on this host.");
  options.stdout(
    JSON.stringify(await options.host.deletePdfPages(document, input)) + "\n",
  );
}
