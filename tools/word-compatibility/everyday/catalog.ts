export const categories = ['formatting', 'editing', 'structure', 'content', 'viewing', 'rendering', 'roundtrip'] as const;
export type Category = typeof categories[number];
export interface EverydayTask {
  readonly id: string;
  readonly category: Category;
  readonly title: string;
  readonly criteria: string;
  readonly layer: 'headless' | 'browser';
  readonly requirements: readonly string[];
}
// Inventory v1: six equally weighted tasks per category. Empty mappings remain untested.
const rows: readonly (readonly [Category, string, string, string, 'headless' | 'browser', ...string[]])[] = [
  ['formatting', 'emphasis', 'Apply emphasis to selected text', 'Apply bold to a substring, retain plain neighbours, save and reopen through LibreOffice.', 'headless', 'edit.bold-range', 'interoperate.bold'],
  ['formatting', 'letter-heading', 'Format a letter heading', 'Set a heading to 18pt bold and centred while retaining 11pt body text; reopen with those properties.', 'headless', 'everyday.letter'],
  ['formatting', 'fonts-colours', 'Change fonts and colours', 'Change font family, size, colour and highlighting on a selected range; preserve adjacent formatting through save/reopen.', 'headless'],
  ['formatting', 'paragraphs', 'Format paragraphs', 'Apply left/centre/right/justified alignment, indentation and before/after spacing; verify unaffected paragraphs after reopening.', 'headless'],
  ['formatting', 'lists', 'Format lists', 'Create bullets and numbering, indent/outdent items and restart numbering without changing other lists.', 'headless'],
  ['formatting', 'styles', 'Use heading and body styles', 'Apply named styles, resolve inheritance and direct overrides, and retain them after saving.', 'headless'],
  ['editing', 'replace', 'Replace selected text', 'Replace text containing Unicode and XML metacharacters, retain surrounding content, and save valid output.', 'headless', 'edit.text-history'],
  ['editing', 'history', 'Undo and redo edits', 'Undo restores the exact package and redo restores the edited text for ASCII, spaces and Unicode fixtures.', 'headless', 'edit.text-history'],
  ['editing', 'split-join', 'Split and join paragraphs', 'Split a meeting-note paragraph, join it again, then save and verify the text and history.', 'headless', 'everyday.notes'],
  ['editing', 'typing', 'Type in the editor', 'Keyboard typing, backspace and selection replacement update visible content and caret correctly in the browser.', 'browser'],
  ['editing', 'clipboard', 'Copy and paste content', 'Browser clipboard paste retains supported formatted text and lists; plain-text paste removes formatting.', 'browser'],
  ['editing', 'find-replace', 'Find and replace', 'Find repeated phrases and replace one or all matches across paragraphs, including undo.', 'browser'],
  ['structure', 'table-read', 'Open merged tables', 'Read horizontal spans, leading/trailing omissions and vertical merges without losing cell text or ownership in both profiles.', 'headless', 'read.table-grid-span', 'read.table-grid-before', 'read.table-grid-after', 'read.table-vertical-merge'],
  ['structure', 'table-edit', 'Edit table structure', 'Insert/delete rows and columns, merge/split cells, and retain surrounding content through save/reopen.', 'headless'],
  ['structure', 'sections', 'Use sections', 'Edit section sizes and margins independently, preserving their boundaries and orientation on export.', 'headless'],
  ['structure', 'headers', 'Edit headers and footers', 'Edit default, first and even-page stories while retaining shared and independent references across sections.', 'headless'],
  ['structure', 'page-numbers', 'Use page numbers', 'Insert page and total-page fields, restart a section, and preserve neighbouring footer text on export.', 'headless'],
  ['structure', 'notes', 'Use footnotes and endnotes', 'Open and edit notes without losing references, separator notes or other note content.', 'headless'],
  ['content', 'unicode', 'Open multilingual text', 'Read exact accented, Greek, Arabic, Chinese, emoji and combining-character text without asserting glyph layout.', 'headless', 'read.text-values'],
  ['content', 'images', 'Insert images', 'Insert and resize inline images, retain alternative text and surrounding content after export.', 'headless'],
  ['content', 'links', 'Use hyperlinks', 'Create and edit external links and internal bookmark links while preserving targets and display text.', 'headless'],
  ['content', 'comments', 'Use comments', 'Read and edit comments with authors and ranges retained after save/reopen.', 'headless'],
  ['content', 'revisions', 'Review tracked changes', 'Display, accept and reject insertions/deletions without losing unrelated text or revision metadata.', 'headless'],
  ['content', 'equations', 'Use basic equations', 'Open and save editable fractions and superscripts with their operands and structure intact.', 'headless'],
  ['viewing', 'open', 'Read document text', 'Expose complete paragraph text in logical order, including spaces and Unicode, from both OOXML profiles.', 'headless', 'read.text-values'],
  ['viewing', 'format-state', 'Inspect selection formatting', 'Distinguish bold and plain ranges after saving and reopening the selected-range fixture.', 'headless', 'read.direct-bold'],
  ['viewing', 'pages', 'View and scroll pages', 'Browser page navigation and scrolling show all document content without missing or duplicated page regions.', 'browser'],
  ['viewing', 'zoom', 'Zoom the document', 'Browser zoom preserves page content, selection and usable hit testing at multiple zoom levels.', 'browser'],
  ['viewing', 'selection', 'Select document content', 'Mouse and keyboard selection correctly follows visible text across wrapped lines and table cells.', 'browser'],
  ['viewing', 'outline', 'Navigate headings', 'Navigate a document outline to the intended visible heading and retain the correct selection.', 'browser'],
  ['rendering', 'page-size', 'Display page sizes', 'Match pinned LibreOffice page dimensions for portrait, landscape, custom sizes and section changes.', 'headless', 'render.reference-size'],
  ['rendering', 'breaks', 'Display explicit breaks', 'Match page assignment for explicit page breaks and line advances for explicit text-wrapping breaks.', 'headless', 'render.reference-breaks'],
  ['rendering', 'spacing', 'Display common line spacing', 'Match single, 1.15, double, exact and minimum advances for uniform 11pt text against pinned PDFs.', 'headless', 'render.reference-spacing'],
  ['rendering', 'wrapping', 'Wrap and paginate body text', 'Match an independent reference for mixed-font wrapping, paragraph spacing and page boundaries under pinned fonts.', 'headless'],
  ['rendering', 'tables', 'Paginate tables', 'Match an independent reference for row splitting, repeated headers and merged cells across pages.', 'headless'],
  ['rendering', 'glyphs', 'Paint text and images', 'Browser rendering matches reference glyph ordering and image placement for representative Latin and RTL documents.', 'browser'],
  ['roundtrip', 'text', 'Round-trip edited text', 'LibreOffice open/save retains exact literal and edited Unicode text for both input profiles.', 'headless', 'interoperate.text'],
  ['roundtrip', 'formatting', 'Round-trip mixed formatting', 'LibreOffice open/save retains authored paragraphs and asserted bold/italic ranges.', 'headless', 'interoperate.authored'],
  ['roundtrip', 'tables', 'Retain tables during nearby edits', 'Neighbouring text and formatting edits retain all table XML and effective grid/merge semantics through Tumbler save/reopen.', 'headless', 'preserve.table-grid-span', 'preserve.table-grid-before', 'preserve.table-grid-after', 'preserve.table-vertical-merge'],
  ['roundtrip', 'letter', 'Edit and reopen a letter', 'Create a heading and body, edit the body, undo/redo, format the heading and reopen through LibreOffice with explicit text/format assertions.', 'headless', 'everyday.letter'],
  ['roundtrip', 'report', 'Edit a multi-page report', 'Edit a report with lists, an image, merged tables and a footer; verify unaffected content and page geometry after external round-trip.', 'headless'],
  ['roundtrip', 'product', 'Save and reopen in Kryptonote', 'Edit through Kryptonote, save, reload the workspace and export a DOCX with the same supported content and formatting.', 'browser'],
];
export const everydayTasks: readonly EverydayTask[] = rows.map(([category, name, title, criteria, layer, ...requirements]) => ({ id: `${category}.${name}`, category, title, criteria, layer, requirements }));
