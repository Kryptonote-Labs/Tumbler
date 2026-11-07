import type { PdfSearchOptions, PdfSearchResult } from "@tumblerjs/pdf";
export interface PdfOperationHost {
  findPdf?(
    document: string,
    query: string,
    options: PdfSearchOptions,
  ): Promise<PdfSearchResult>;
}
export async function runPdf(
  argv: readonly string[],
  options: {
    host: PdfOperationHost;
    commandName?: string;
    stdout: (text: string) => void;
  },
) {
  const [document, , command, query, ...flags] = argv;
  if (!command || command === "--help" || argv.includes("--help")) {
    options.stdout(
      `Usage: ${options.commandName ?? "tumbler"} <document> pdf find <text> [--match-case] [--pages 2-8]\nReturns matches, total, one-based pages, context, and top-left page rectangles in points.\n`,
    );
    return;
  }
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
