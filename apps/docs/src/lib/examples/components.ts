import type { ExampleId } from './registry';

/** A reference page under /components. The slug doubles as the live example id. */
export interface ComponentDoc {
  slug: ExampleId;
  name: string;
  /** Export path, e.g. `@tumblerjs/svelte`. */
  module: string;
  /** One sentence; the page lead and the index's "What it does" column. */
  summary: string;
  /** Inline-code markup with backticks. */
  usage: string;
  props: { name: string; type: string; description: string; required?: true }[];
  guide: { href: string; label: string };
}

export const componentDocs: ComponentDoc[] = [
  {
    slug: 'word-document-view', name: 'WordDocumentView', module: '@tumblerjs/svelte',
    summary: 'Renders a Word document as pages, with text selection, scrolling and pinch zoom.',
    usage: 'Call `openWordArtifact(bytes)` to parse the DOCX file, then pass `artifact.document` to `wordDocument`. Give the container a width and height, because the view scrolls inside it rather than growing to fit the document.',
    props: [
      { name: 'wordDocument', type: 'WordDocument', required: true, description: 'The parsed document, `artifact.document`.' },
      { name: 'scale', type: 'number', description: 'Bindable zoom factor, where `1` is 100%. Pinch and `Ctrl` + wheel keep it between `0.25` and `3`.' },
      { name: 'editable', type: 'boolean', description: 'Lets the user type into the document. The view does not change the document itself, so also handle `onedit`, `selection` and `onselectionchange`.' },
      { name: 'onedit', type: '(edit: WordDocumentEdit) => void', description: 'Called when the user edits text. Call `artifact.replaceText(edit.selection, edit.value)`, assign the returned artifact so its `document` reaches the view, and set `selection` to `{ anchor: edit.caret, focus: edit.caret }` to place the cursor.' },
      { name: 'ondrawingchange', type: '(change: WordDrawingChange) => void', description: 'Called when the user moves, resizes or rotates a picture or shape. Apply it with `artifact.updateDrawing(change)` and assign the result.' },
    ],
    guide: { href: '/docs/word-editing', label: 'Open and edit Word files' },
  },
  {
    slug: 'spreadsheet-grid', name: 'SpreadsheetGrid', module: '@tumblerjs/svelte',
    summary: 'Displays a worksheet with cell selection, frozen panes, zoom and optional cell editing.',
    usage: 'Call `openSpreadsheetArtifact(bytes)` and pass the result\'s `worksheet` and `calculation` to the grid. The worksheet holds the cells as saved; `calculation` holds the current formula results. The grid is view-only until you pass `onedit`. It tracks the selection itself; if another control, such as a formula bar, needs to know which cells are selected, pass `selection` to set it and `onselectionchange` to follow it.',
    props: [
      { name: 'worksheet', type: 'SpreadsheetWorksheet', required: true, description: 'The sheet to display, `artifact.worksheet`.' },
      { name: 'calculation', type: 'SpreadsheetCalculationSnapshot', description: 'Formula results, `artifact.calculation`. Without it the grid shows the values last saved in the file, so results go stale after an edit.' },
      { name: 'selection', type: 'GridSelection', description: 'The selected cell or range. Create one with `createGridSelection`. Defaults to A1.' },
      { name: 'onselectionchange', type: '(selection: GridSelection) => void', description: 'Called when the user selects a different cell or range.' },
      { name: 'onedit', type: '(edit: SpreadsheetGridEdit) => void', description: 'Called with `{ reference, value }` when the user commits a cell edit. Passing it turns on editing. Apply the edit with `artifact.editCell(reference, value)` and assign the returned artifact.' },
      { name: 'scale', type: 'number', description: 'Bindable zoom factor, where `1` is 100%. Pinch and `Ctrl` + wheel keep it between `0.25` and `3`.' },
      { name: 'readonly', type: 'boolean', description: 'Turns off cell editing and moving drawings, even when `onedit` is set. Selection and scrolling still work.' },
    ],
    guide: { href: '/docs/spreadsheet-viewer', label: 'Open a spreadsheet' },
  },
  {
    slug: 'spreadsheet-formula-bar', name: 'SpreadsheetFormulaBar', module: '@tumblerjs/svelte',
    summary: 'Lets the user edit one cell\'s value or formula in a text field above the grid.',
    usage: 'Pass the worksheet and the address of the cell to edit, such as `D2`. When the user presses Enter, `onedit` receives either a formula or a value: apply a formula with `artifact.editFormula` and a value with `artifact.editCell`, then assign the returned artifact. Input that starts with `=` becomes a formula, unless the cell is formatted as text. `artifact.editFormula` throws if the formula does not parse. Catch the error and return `false`, and the bar stays open so the user can fix it. Without `onedit` the bar is read-only.',
    props: [
      { name: 'worksheet', type: 'SpreadsheetWorksheet', required: true, description: 'The sheet containing the cell.' },
      { name: 'reference', type: 'string', required: true, description: 'The cell to edit, in A1 notation, such as `D2`.' },
      { name: 'onedit', type: '(edit: SpreadsheetFormulaBarEdit) => boolean | void', description: 'Called when the user commits. `edit.kind` is `\'formula\'` or `\'value\'`. Return `false` to keep the bar open.' },
      { name: 'referencePick', type: 'SpreadsheetFormulaReferencePick', description: 'Inserts a grid range into the formula being typed, at the cursor. Pass `{ id, sheet, range }`: a new numeric `id` for each pick, so picking the same range twice still inserts it; the sheet name; and the grid selection\'s `range`.' },
      { name: 'readonly', type: 'boolean', description: 'Shows the cell\'s contents without allowing edits.' },
    ],
    guide: { href: '/docs/spreadsheet-editing', label: 'Cells and formulas' },
  },
  {
    slug: 'formatting-toolbar', name: 'FormattingToolbar', module: '@tumblerjs/svelte',
    summary: 'Offers font, bold, italic, underline, colour and alignment controls for Word and spreadsheet selections.',
    usage: 'The toolbar holds no formatting of its own, so your page supplies it and applies the changes. For a spreadsheet range, pass `artifact.formattingState(range)` as `state` and `artifact.formattingCapabilities(range)` as `capabilities`. In `onformat`, call `artifact.applyFormatting(range, patch)` and assign the returned artifact. Word artifacts have the same three methods. For slides, use `PresentationFormattingToolbar` from `@tumblerjs/svelte/slides`.',
    props: [
      { name: 'state', type: 'FormattingState', required: true, description: 'The formatting of the current selection. When the selection mixes formatting, for example only some of it is bold, the control shows as mixed.' },
      { name: 'capabilities', type: 'FormattingCapabilities', required: true, description: 'Which controls to show for the current selection. The rest are hidden.' },
      { name: 'onformat', type: '(patch: FormattingPatch) => void', description: 'Called with the change when the user uses a control.' },
      { name: 'disabled', type: 'boolean', description: 'Disables every control.' },
    ],
    guide: { href: '/docs/word-formatting', label: 'Word text and styles' },
  },
  {
    slug: 'presentation-slide-view', name: 'PresentationSlideView', module: '@tumblerjs/svelte/slides',
    summary: 'Displays a PowerPoint slide with its layout, text, pictures, shapes and charts.',
    usage: 'Call `openPresentationArtifact(bytes)` from `@tumblerjs/slides`. Pass its `document` as `presentation` and one entry of `document.slides` as `slide`. The view scales the slide to fit its container.',
    props: [
      { name: 'presentation', type: 'PresentationDocument', required: true, description: 'The parsed presentation, `artifact.document`. Supplies the layouts and theme the slide inherits.' },
      { name: 'slide', type: 'PresentationSlide', required: true, description: 'The slide to display.' },
      { name: 'scale', type: 'number', description: 'Bindable zoom factor. `1` fits the slide to the container.' },
      { name: 'editable', type: 'boolean', description: 'Lets the user move, resize and rotate objects and edit their text. Moving needs `onobjectchange` and text editing needs `ontextedit`; without them nothing changes.' },
      { name: 'selectedKey', type: 'string', description: 'Bindable key of the selected object.' },
      { name: 'onobjectchange', type: '(change: PresentationObjectChange) => void', description: 'Called when the user finishes moving, resizing or rotating an object. Apply it with `artifact.updateObject(change)` and assign the result.' },
      { name: 'ontextedit', type: '(change: PresentationTextEdit) => void', description: 'Called as the user inserts, replaces or deletes text. Apply it with `artifact.editText(change)` and assign the result.' },
    ],
    guide: { href: '/docs/powerpoint-viewer', label: 'Render a presentation' },
  },
  {
    slug: 'ooxml-chart', name: 'OoxmlChart', module: '@tumblerjs/svelte',
    summary: 'Draws a chart from a chart model, without opening a document.',
    usage: 'Build a `SupportedChartModel` (exported by `@tumblerjs/charts`), or pass a chart from a parsed document. `width` and `height` set the chart\'s layout, and the component stretches to fill its container, so pass the container\'s size. The example binds `clientWidth` and keeps a fixed height. Charts Tumbler cannot draw come through as `UnsupportedChartModel`, and the component shows a "Chart preview unavailable" placeholder instead.',
    props: [
      { name: 'model', type: 'ChartModel', required: true, description: 'The chart to draw: its type, series, axes and legend.' },
      { name: 'width', type: 'number', required: true, description: 'Width the chart is laid out at, in CSS pixels. Pass the container\'s width.' },
      { name: 'height', type: 'number', required: true, description: 'Height the chart is laid out at, in CSS pixels. Pass the container\'s height.' },
      { name: 'resolveColor', type: '(color: ChartColor) => string | undefined', description: 'Turns a theme colour reference into a CSS colour.' },
      { name: 'formatNumber', type: '(value: number, formatCode: string | undefined) => string', description: 'Formats axis and label numbers, given the chart\'s number format code when it has one.' },
    ],
    guide: { href: '/docs/charts', label: 'Charts' },
  },
];
