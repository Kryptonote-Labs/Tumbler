import type { PdfSearchIndex, PdfTextModel } from '@tumblerjs/pdf';

/** Host-owned search state survives switching between editable and read-only views. */
export function createPdfSearch() {
  let open = $state(false),
    query = $state(''),
    matchCase = $state(false),
    wholeWord = $state(false),
    active = $state(0);
  let source = $state.raw<{
    index: () => PdfSearchIndex;
    model?: () => PdfTextModel | undefined;
  }>();
  const result = $derived.by(() => {
    try {
      return {
        ...(open && source
          ? source.index().find(query, { matchCase, wholeWord })
          : { matches: [], total: 0 }),
        error: '',
      };
    } catch (cause) {
      return {
        matches: [],
        total: 0,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });
  $effect(() => {
    void query;
    void matchCase;
    void wholeWord;
    active = 0;
  });
  $effect(() => {
    if (active >= result.total) active = Math.max(0, result.total - 1);
  });
  return {
    get open() {
      return open;
    },
    set open(value: boolean) {
      open = value;
    },
    get query() {
      return query;
    },
    set query(value: string) {
      query = value;
    },
    get matchCase() {
      return matchCase;
    },
    set matchCase(value: boolean) {
      matchCase = value;
    },
    get wholeWord() {
      return wholeWord;
    },
    set wholeWord(value: boolean) {
      wholeWord = value;
    },
    get active() {
      return active;
    },
    get matches() {
      return result.matches;
    },
    get error() {
      return result.error;
    },
    get total() {
      return result.total;
    },
    get canReplace() {
      return !!source?.model?.() && !!result.matches[active]?.range;
    },
    connect(next: NonNullable<typeof source>) {
      source = next;
      return () => {
        if (source === next) source = undefined;
      };
    },
    move(direction: number) {
      if (result.total) active = (active + direction + result.total) % result.total;
    },
    replace(value: string, all = false) {
      const model = source?.model?.();
      if (!model) return;
      const matches = all ? result.matches : result.matches.slice(active, active + 1);
      const ranges = matches.flatMap((match) => (match.range ? [match.range] : []));
      if (ranges.length) model.replaceMatches(ranges, value);
    },
  };
}
export type PdfSearchController = ReturnType<typeof createPdfSearch>;
