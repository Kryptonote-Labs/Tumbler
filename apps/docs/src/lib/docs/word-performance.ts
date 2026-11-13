import type { Doc } from './types';

export const wordPerformanceDoc: Doc = {
  title: 'Layout caching and projections',
  description: 'Keep editing fast by reusing layout and content that did not change.',
  sections: [
    { id: 'layout', title: 'Reuse layout work', blocks: [
      { kind: 'text', text: '`NativeWordDocument` keeps the objects for paragraphs that did not change. Layout caches each paragraph\'s measured geometry, and reuses lines and pages whose content and geometry are the same as last time.' },
      { kind: 'text', text: 'A paragraph is laid out again when any of these change:' },
      { kind: 'list', items: [
        'its content or wrapping;',
        'its list marker;',
        'the width available to it;',
        'the measurer object.',
      ] },
      { kind: 'text', text: 'So keep one measurer object for as long as its font metrics are valid, and create a new one only when fonts or measurement change.' },
      { kind: 'note', text: 'Caching does not make edits constant-time. Every update still walks the whole document, and pagination still visits all of it. A small edit can push the following content onto new pages.' },
      { kind: 'text', text: '`cache.measuredParagraphs` counts how many paragraphs have been measured in total. Use it to check that caching is working.' },
      { kind: 'text', text: '`layout` returns a `WordLayout` with page, column, line, table and fragment geometry in points. Your app draws it, handles input and selection, and converts points to screen coordinates.' },
      { kind: 'link', href: '/docs/word-layout#limits', label: 'Layout budgets' },
    ] },
    { id: 'projection', title: 'Reuse unchanged collaborative content', blocks: [
      { kind: 'text', text: 'When the document lives in Yjs, two classes from `@tumblerjs/word/collaboration` turn the shared text into your own values and redo only the parts that changed.' },
      { kind: 'table', headers: ['Class', 'Does'], rows: [
        ['`WordParagraphProjection(body, project)`', 'Watches the shared text and calls `project` only for paragraphs that changed, when you next read `paragraphs`. Call `destroy` when you are done.'],
        ['`WordTableProjection`', 'Its `update(paragraphs)` rebuilds only the tables that changed.'],
      ] },
      { kind: 'text', text: 'Each paragraph slice has a stable identity, its UTF-16 length, its formatted parts and its closing newline, if any. `wordParagraphIdentity` returns that identity. Treat slices and your projected values as read-only.' },
      { kind: 'text', text: 'Pass `immutableContent: true` to `NativeWordDocument` to skip re-checking blocks it has seen before. It compares blocks by object, so every block you pass, and everything inside it, must never change afterwards.' },
      { kind: 'note', text: 'Build the DOCX only when the user downloads or you save. Exporting and reopening it on every keystroke throws away all of this reuse.' },
    ] },
    { id: 'placement', title: 'Page numbers and alignment', blocks: [
      { kind: 'text', text: '`@tumblerjs/word/collaboration` also has helpers for edits that combine several changes. Use them for both user gestures and automated edits, so both behave the same way.' },
      { kind: 'table', headers: ['Function', 'Does'], rows: [
        ['`wordPageNumberRange`', 'Finds the page number at the caret, if there is one.'],
        ['`pageNumberEdit`', 'Updates the selected page number, or inserts a new one at the caret.'],
        ['`wordItemAlignment`', 'Reads how an inline item is aligned in its paragraph.'],
        ['`alignWordItem`', 'Aligns an inline item left, centre or right.'],
        ['`positionedWordEdit`', 'Runs your own structural edit on a staged copy and returns it as one checked change.'],
        ['`clickAndTypeEdit`', 'Applies the result of `wordClickAndTypeTarget`.'],
      ] },
      { kind: 'link', href: '/docs/word-layout#hit-testing', label: 'Points and lines' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-performance.ts',
  next: { href: '/docs/word-support', label: 'Word compatibility' },
};
