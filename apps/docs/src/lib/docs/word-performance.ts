import type { Doc } from './types';

export const wordPerformanceDoc: Doc = {
  title: 'Layout caching and projections',
  description: 'Reuse unchanged native geometry and collaborative content projections.',
  sections: [
    { id: 'layout', title: 'Reuse layout work', blocks: [
        { kind: 'text', text: 'Unchanged paragraphs retain their objects. Layout caches prepared paragraph geometry and reuses positioned lines and pages when their geometry and content remain unchanged. Wrapping, list markers, available width, and measurer identity participate in invalidation.' },
        { kind: 'text', text: 'Keep one measurer object while its font metrics remain valid; replace it when fonts or measurement behavior change.' },
        { kind: 'text', text: 'cache.measuredParagraphs is a cumulative measurement counter for diagnostics. Updates still walk the authored tree and pagination still visits content. This API does not promise constant-time edits or viewport-only pagination. A small edit can move following content and require new page geometry.' },
        { kind: 'text', text: 'layout returns WordLayout, with page, column, line, table, and fragment geometry in points. The application owns rendering, input, selection, and converting points to screen coordinates. Optional maxPages and maxFragments are caller-controlled layout work budgets; exceeding them throws rather than truncating content.' },
    ] },
    { id: 'projection', title: 'Reuse unchanged paragraphs and tables', blocks: [
        { kind: 'text', text: 'WordParagraphProjection(body, project) consumes transaction deltas and calls project only for changed slices when paragraphs is read. Slices include stable terminator identity, UTF-16 length, formatted parts, and the terminating newline when present. Call destroy when finished. wordParagraphIdentity exposes the underlying terminator identity.' },
        { kind: 'text', text: 'WordTableProjection.update(paragraphs) reuses unchanged table trees while checking table contiguity. Treat slices and projected values as immutable. NativeWordDocument({ immutableContent: true }) additionally caches authored signatures by object identity; every supplied descendant must remain immutable.' },
        { kind: 'text', text: 'Updates still require document traversal for offsets, numbering, and source continuations. Export at download or persistence boundaries rather than rebuilding and reparsing DOCX on every keystroke.' },
    ] },
    { id: 'placement', title: 'Composed placement and page numbers', blocks: [
        { kind: 'text', text: 'positionedWordEdit stages a composed placement edit. wordPageNumberRange and wordItemAlignment inspect existing content; pageNumberEdit and alignWordItem create edits for numbering and alignment. clickAndTypeEdit applies the intent returned by wordClickAndTypeTarget. Use these shared operations for human gestures and agent edits.' },
        { kind: 'link', href: '/docs/word-layout#positioning', label: 'Positioning and page geometry' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-performance.ts',
  next: { href: '/docs/word-support', label: 'Word compatibility' },
};
