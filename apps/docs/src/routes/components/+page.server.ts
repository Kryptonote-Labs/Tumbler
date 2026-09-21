import { highlight } from '$lib/server/highlight';
import word from '$lib/components/showcase/WordPreview.svelte?raw';
import grid from '$lib/components/showcase/GridPreview.svelte?raw';
import formula from '$lib/components/showcase/FormulaPreview.svelte?raw';
import toolbar from '$lib/components/showcase/ToolbarPreview.svelte?raw';
import chart from '$lib/components/showcase/ChartPreview.svelte?raw';

import slides from '$lib/components/showcase/SlidePreview.svelte?raw';

const examples = [
  { id: 'slides', name: 'PresentationSlideView', description: 'PresentationML slides with inherited layouts, text, pictures, shapes, and charts. Local preview API.', hint: 'Choose a slide or pinch to zoom. Open the PowerPoint playground to try editing.', code: slides, props: [['presentation / slide', 'The parsed presentation and active slide.'], ['scale', 'Bindable zoom relative to fit-to-view.'], ['editable / selectedKey', 'Editing interactions and bindable selected object.'], ['onobjectchange / ontextchange', 'Committed geometry or text edits for an artifact or session.']], href: '/docs/powerpoint' },
  { id: 'word', name: 'WordDocumentView', description: 'Paginated Word documents with text selection, scrolling, and pinch zoom.', hint: 'Select text or pinch to zoom. For editing and drawing controls, open the Word playground.', code: word, props: [['wordDocument', 'Parsed Word document from openWordArtifact(bytes).'], ['scale', 'Bindable zoom factor. Pinch gestures update this value.'], ['editable', 'Enables editing interactions when connected to edit callbacks.'], ['onedit / ondrawingchange', 'Report edits for the host to apply to its artifact or editing session.']], href: '/docs/word' },
  { id: 'grid', name: 'SpreadsheetGrid', description: 'A virtualised worksheet with selection, cell editing, frozen panes, and zoom.', hint: 'Double-click a value to edit it. Changing Quantity or Unit cost recalculates Total.', code: grid, props: [['worksheet', 'Worksheet model from a spreadsheet artifact.'], ['calculation', 'Calculated values for the active worksheet.'], ['selection / onselectionchange', 'Controlled cell or range selection.'], ['onedit', 'Receives a cell reference and its new value.'], ['scale / readonly', 'Bindable zoom factor and editing mode.']], href: '/docs/spreadsheets' },
  { id: 'formula', name: 'SpreadsheetFormulaBar', description: 'Edit cell values and formulas independently of the grid.', hint: 'Try =B2*C2 in D2. Enter applies the edit; Escape cancels it.', code: formula, props: [['worksheet / reference', 'The worksheet and cell being edited.'], ['onedit', 'Receives a value or formula edit. Return false to keep the draft open.'], ['referencePick', 'Optional grid selection events for inserting references into a formula.'], ['readonly', 'Displays the current value without allowing edits.']], href: '/docs/spreadsheets' },
  { id: 'toolbar', name: 'FormattingToolbar', description: 'Formatting controls shared by Word and spreadsheets, driven by the current selection.', hint: 'Select a cell or range, then change its formatting. The toolbar reflects mixed values and available controls.', code: toolbar, props: [['state', 'Formatting values for the current selection, including mixed states.'], ['capabilities', 'Determines which controls the document supports.'], ['onformat', 'Receives a FormattingPatch for the host to apply.'], ['disabled', 'Disables the formatting controls.']], href: '/docs/word' },
  { id: 'chart', name: 'OoxmlChart', description: 'Render a chart model directly, without opening a Word document or spreadsheet.', hint: 'Switch chart types to render the same data in different ways.', code: chart, props: [['model', 'A chart model from @tumblerjs/charts. This example supplies its own data.'], ['width / height', 'Chart dimensions in CSS pixels.'], ['resolveColor', 'Optional resolver for document theme colours.'], ['formatNumber', 'Optional formatting for chart values.']], href: '/docs/architecture' }
] as const;

export async function load() {
  return { examples: await Promise.all(examples.map(async example => ({ ...example, html: await highlight(example.code, 'Svelte') }))) };
}
