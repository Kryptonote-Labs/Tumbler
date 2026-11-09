# `@tumblerjs/svelte`

Replaceable Svelte 5 UI heads for Tumbler document models. Applications retain
complete ownership of their surrounding interface and styling.

> **Extremely early alpha.** Components and props can change without notice,
> and Office-format coverage remains incomplete.

```sh
bun add @tumblerjs/svelte @tumblerjs/sheets @tumblerjs/core
```

```svelte
<script lang="ts">
  import { createGridSelection } from "@tumblerjs/core";
  import { FormattingToolbar, SpreadsheetFormulaBar, SpreadsheetGrid } from "@tumblerjs/svelte";

  let selection = $state(createGridSelection({ row: 1, column: 1 }));
</script>

<SpreadsheetFormulaBar worksheet={artifact.worksheet} reference="A1" />
<FormattingToolbar
  state={artifact.formattingState(selection.range)}
  capabilities={artifact.formattingCapabilities(selection.range)}
  onformat={(patch) => artifact = artifact.applyFormatting(selection.range, patch)}
/>
<SpreadsheetGrid
  worksheet={artifact.worksheet}
  calculation={artifact.calculation}
  {selection}
  onselectionchange={(next) => selection = next}
/>
```

`FormattingToolbar` is format-neutral. Word, Sheets, and Slides supply the same state
and capability contract without replacing application UI. Its
font-family field writes arbitrary Office font names rather than limiting files
to a browser-dependent preset list.

The grid automatically projects supported conditional font, fill, and border
rules from the worksheet. Its source rules and package bytes remain unchanged.

Inline grid edits are always literals. The explicit formula bar treats input
beginning with `=` as a formula and emits a typed formula edit; applications own
applying the edit and replacing the artifact.

Unwrapped left-aligned text paints across consecutive empty cells, matching the
worksheet convention without widening those cells' interactive hit areas.

`browserWordLineMetrics` measures and caches normal font line boxes, including
leading, at a large reference size to avoid cumulative pixel rounding. Custom
renderers can supply their CSS font stack and clear this cache when fonts load.
`browserWordTextMeasurer` uses these metrics automatically in the browser.

`WordDocumentView` composes destination-dependent ink in affected-region tiles.
Its optional `inkMaxPixels` prop sets the retained pixel budget per page, from 1 to
1,048,576. The renderer lowers resolution to fit, caps resolution at four device
pixels per point, and shares a finite budget across mounted pages. Cached ink
images stay visible until the replacement succeeds. See
[ink rendering limits](../../docs/ink-conformance.md) for allocation and cancellation behavior.

Word font leading is placed above the baseline, and automatic paragraph spacing
advances below it in whole twips. Custom HTML renderers should use
`wordTextTop(fragment, cssFontStack)` for a text span's top position, with
`fragment.height` as its CSS line height, converting both from points to pixels.
This aligns the painted baseline with `fragment.baseline` despite browser font
rounding. The optional font stack must match the one used to measure and paint
the text. Font loading invalidates the cached CSS baseline measurements.

`browserWordBaselineOffset(format, cssFontStack, heightPoints)` returns the CSS
line box's baseline offset in points. Custom carets and placement previews can
use the same measurement as `wordTextTop`, including browser rounding at the
rendered font size. It returns `undefined` when no browser document is available.

`wordTextCss` and `browserWordTextMeasurer` explicitly disable font kerning to
match the engine's unkerned advances and Word's default when `w:kern` is absent.
Custom renderers must also set `font-kerning:none`; inherited
`text-rendering:optimizeLegibility` can otherwise change painted positions.
Explicit `w:kern` thresholds are not yet interpreted by the layout engine.

The Word head exposes controlled selection and editing without making the DOM
canonical state:

```svelte
<WordDocumentView
  wordDocument={session.artifact.document}
  editable
  {selection}
  onselectionchange={(next) => selection = next}
  ondrawingchange={(change) => session.updateDrawing(change)}
  onedit={(edit) => {
    session.replaceText(edit.selection, edit.value);
    selection = { anchor: edit.caret, focus: edit.caret };
  }}
/>
```

Body input is controlled through `onedit`. Unsupported browser formatting and drag
mutations are cancelled; use the host formatting controls to apply model changes.
Replacement text and soft-line deletion use browser target ranges when available.
Browser history intents call `oncommand` with `undo` or `redo`. Non-cancellable
input is reconciled against the document. Composition text stays provisional in
the DOM and commits as one replacement at composition end; cancellation restores
the original text. Automated Chromium composition coverage does not establish
native OS IME compatibility across platforms.

Enter expands a standalone `=rand()` or `=lorem()` paragraph through one `onedit`
replacement, using `wordSampleTextEdit` from `@tumblerjs/word`. Optional arguments
set paragraph and sentence counts, such as `=lorem(5,3)`. Both counts default to
three. The replacement ends with an empty paragraph for continued typing;
resolve its caret against the resulting paragraphs as for other multiline edits.
Shift+Enter, typing and paste keep the command literal.

In edit mode, `ondrawingchange` enables dragging, eight resize handles, and inline,
in-front-of-text, or behind-text placement. Corners preserve proportions; edges
resize one dimension. Dragging an inline drawing moves it within the text flow without changing its layout.
Arrow keys nudge a focused floating drawing, Shift increases the step, and Escape cancels
a drag. Changing the document zoom also cancels an active drawing drag or resize.
Shape resize previews recalculate paths at the current size, keeping outline thickness consistent throughout the drag.
`session.updateDrawing(change)` records the position and dimensions as one
undoable revision and saves them in the DOCX. Square and tight wrapping are not
exposed. Hosts needing only the bottom-right resize handle can still use
`ondrawingresize` with `session.resizeDrawing(size)`.

Word and Sheets support Ctrl+wheel, two-finger touch, and Safari trackpad pinch zoom
inside the document viewport without magnifying the surrounding application.

Drawing previews and handles remain inside the rendered page. Clipping does not
change document geometry: floating drawings can have negative page offsets or
extend beyond the page, and resizing does not impose page or column size limits.
The headless engine validates serialized dimensions and signed OOXML position offsets.

Custom document renderers can import `WordDrawingView` from `@tumblerjs/svelte`
to reuse the same image/chart rendering, selection, dragging, resize handles, and
keyboard controls. Pass the layout fragment's `drawing`, `width`, `height`,
`pageX`, and `pageY` in points, plus `position` as CSS positioning within your
page. The host applies CSS zoom or a transform to the page and passes that factor
as `scale` for gesture coordinates and handle sizing. The host supplies `editable`,
`selected`, `imageurl`, `inlinePosition` for text hit-testing, `onselect`, and
`onchange` or `onresize` for committing edits. Pass `layoutControl={false}` to omit
the built-in layout select when the host offers placement in its own UI.
The component renders in place;
it never attaches controls to `document.body`. Put it inside a positioned,
clipped page container, such as `position: relative; overflow: hidden`, to keep
previews and handles out of surrounding UI. `WordDocumentView` already provides
that container.

`WordDocumentView` owns its embedded image blob URLs. It reuses unchanged image
bytes across artifact replacements and releases URLs after their image elements
leave the rendered page window or the viewer is destroyed. Keep supplied image
bytes immutable; replace the byte array when changing an image.

Applications own history and persistence, or can use `WordEditingSession` from
`@tumblerjs/word`. Internal bookmark links scroll inside the owned page surface;
external targets are passed to the host for its security policy.

## PowerPoint

Use the dedicated Slides entry point:

```ts
import {
  PresentationSlideView,
  PresentationSlideRail,
  PresentationFormattingToolbar,
} from "@tumblerjs/svelte/slides";
```

Pass a presentation document and its active slide to `PresentationSlideView`. Its optional `minimumEditingTextSize` prop zooms small text to that screen-pixel size when text editing starts, up to the existing 3× zoom ceiling. It preserves the clicked caret position, keeps the caret visible during entry and typing, and changes only viewing scale. Omit it to retain the current zoom.
Bind `PresentationSlideRail` to the active slide index for thumbnail navigation.
Pass `onreorder(slideId, index)` to enable dragging thumbnails and Alt + Up/Down
keyboard reordering. The index is the slide's final, zero-based position. Apply a
`move-slide` command and pass the updated presentation back to the rail. Preserve
the active slide by ID when updating its index. Omit the callback for read-only
navigation. Dragging shows an insertion marker, scrolls at the rail edges, and
cancels on Escape or a drop outside the rail. On touchscreens, swipe thumbnails to
scroll and drag the grip beside the slide number to reorder.
Pass a `reorderHint` attachment to use the host's tooltip on each thumbnail button
instead of the native reorder hint. It attaches only when reordering is enabled
and no drag is active.
In edit mode, connect object, text, formatting, and shape callbacks to a
`PresentationEditingSession`, then pass the updated document back to the view.

Bind `selectedKeys` for multi-object selection. Drag from empty canvas space or the
surrounding workspace to enclose objects; Shift-click toggles objects and Shift-drag
adds to the selection. Drag a selected object or use arrow keys to move the selection.
Escape clears it. Resize and rotation handles appear for a single selected object.
`selectedKey` remains available for existing single-selection hosts.
Shape resize previews retain their outline width, dash spacing, and arrowhead dimensions.
Preset adjustments and custom geometry guides are evaluated at the preview size.

Use `onobjectschange` to receive a group move as one array of object changes. Hosts can
apply these through a `batch` presentation command to persist and undo the move together.
Without this callback, the view calls `onobjectchange` for each changed object.

The [PowerPoint guide](https://tumbler.alexco.dev/docs/powerpoint) provides complete
examples, including undo, redo, and downloading edits. The same guide describes
text editing, table-cell navigation, resize handles, and rotation controls.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).

Chart legends use measured SVG swatch/label bounds for horizontal centring and
refresh their placement when fonts load or the chart dimensions change.

### Word display colours

`WordDocumentView` accepts `displayMode="light"` or `displayMode="dark"`, defaulting to light.
The mode affects rendering only. Print styles force the original light appearance.
Pictures, shapes and charts retain their original colours.

Custom renderers can use `wordDisplayColour(resolvedColour, originalBackground?)` and
`wordTextCss(format, originalBackground?)`. These emit CSS `light-dark()` values. Set
`color-scheme: light` or `dark` on the paper, and `color-scheme: only light !important`
for print. Pass the original background to text styling, including inherited cell and
paragraph shading. The helper accounts for run shading and highlights itself.
`wordDarkColour` returns the mapped hex colour for non-CSS consumers. Transparent or
unsupported colours pass through unchanged. The mapping approximates Word's unpublished
viewing palette; it does not change document formatting, theme resolution or export.
Use `wordDisplaySurface(shading, ancestorBackground)` to resolve explicitly transparent
shading against its visible ancestor. `WordDrawingView` accepts an original `background`
colour for readable vector ink, defaulting to white. The built-in document view supplies
these backgrounds for body, header, footer, and note content.

`WordPageLayoutDecorations` accepts a `fontFamily` resolver for hosts with a custom
font fallback stack. Pass the same resolver used to measure and render body text
so line-number advances and baselines agree with the host's layout. The default
uses Tumbler's standard Word font stack. Numbers anchor their right edge at the
layout's number gutter, so browser advance rounding does not shift individual labels.

### Loading embedded fonts

`loadEmbeddedFonts(fonts)` registers regular/bold/italic faces under private CSS
family names, shared until the last consumer calls `destroy()`. `family(name)`
resolves a document family to its private alias, and `ready` resolves after all
font loads settle. Failed faces keep the supplied fallback available. Use the same
resolver for layout measurements, text CSS and baseline probes. The loader does
not install fonts on the system or affect another document's font family.

## Themed native controls

The drawing layout picker and spreadsheet filter checkboxes use `controls.css`.
Hosts can also import `@tumblerjs/svelte/controls.css` for native checkboxes outside
these components and add `class="tumbler-select"` to native selects. Inputs with
`role="switch"` retain their host styling. Native keyboard, form and disabled behavior
is preserved, with a system appearance in forced-colors mode.

Set `--tumbler-control-bg`, `--tumbler-control-text`, `--tumbler-control-border`,
`--tumbler-control-hover`, `--tumbler-control-accent` and `--tumbler-control-accent-ink`
to match the host theme. These fall back to `--surface`, `--text`, `--border-strong`,
`--surface-hover`, `--accent` and `--accent-ink`. Unchecked checkboxes use
`--text-faint` for a visible outline when no control border is supplied. Browsers without customizable select
support retain their native popup.

Presentation text callbacks receive an optional second `undoGroup` argument. Adjacent typing or deletion in one direction shares a group until a one-second pause, caret movement, focus change or shortcut. Paste, selection replacement, paragraph breaks and composition commits use separate groups. Hosts may use this hint to group undo while retaining a separate durable operation identity for every edit. They must close groups when accepting remote edits and check all grouped operations before undoing them.

For a slideshow, pass `playing={true}` to `PresentationSlideView`. Automatic
animations start on slide entry. Call the component's `advanceAnimation()` method
on forward navigation; it returns `true` when it consumes a click group and
`false` when the host should move to the next slide. Changing slides or leaving
playback resets the effects. Editing and thumbnails remain static. Playback adds
no animation authoring controls.

Hosts that omit `PresentationSlideView.playing` retain its built-in read-only playback controls. Passing an explicit `playing` boolean opts into host-controlled playback and hides those controls; forward navigation can call `advanceAnimation()` before changing slides. Pass `stage={true}` for a fullscreen show: the slide fills the view edge to edge on black, with no gutter or hover title, and its text cannot be selected but stays readable by screen readers. No animation authoring controls are provided.


`PresentationSlideView.onselectionchange` includes `range`, the same object returned
by `currentSelection()`. It reports text offsets, the caret endpoint for backward selections, editing state and an optional
table cell address, including caret moves that do not change formatting. Hosts
can pass `remoteSelections` with session IDs, names, colours, selected object keys
and optional text ranges. Text offsets count paragraph separators but exclude
bullets. The view draws object outlines and named carets, and uses CSS Custom
Highlights for text ranges. Rotation, zoom, font layout and table cells use the
rendered document geometry. Remote decorations are absent from thumbnails and
playback and never change the document or browser selection. Hosts own
transport, permissions, visibility and revision reconciliation; supply ranges
only for the document revision currently rendered.

PDF pages are available through `@tumblerjs/svelte/pdf`. `PdfDocumentView` accepts an
`@tumblerjs/pdf` document, a display scale and page/error callbacks. It keeps page dimensions
stable while a shared module worker interprets and paints nearby pages. The viewer retains a
page preview at display resolution, capped at 2048 pixels on its longest side. After scrolling
settles for 100 ms, it replaces visible regions with 512-device-pixel tiles at the exact screen density. It releases offscreen rasters, page scenes and decoded images. Large zooms
allocate tiles around the viewport rather than full-page canvases. Source content and final
render resolution are unchanged. `goToPage(index)` scrolls to a zero-based page index. Product navigation,
authorization, uploads and download controls belong to the host application.

`pdfZoomPreview(viewport, getScale, commit)` separates gesture presentation from PDF rendering.
Call `zoom(nextScale, clientPoint)` for gesture updates, `pan(dx, dy)` for touch movement, and
`finish()` at gesture end. Wheel gestures also settle after 140 ms without input. The helper
updates compositor transforms on cached pages once per animation frame, preserves the page gaps,
and suspends full-resolution page painting during the gesture. It supplies the original page point
under the final focal point to `commit`. That callback must
synchronously apply the new display scale, then adjust the viewport scroll using the supplied
page element, `offsetX`, `offsetY`, `x` and `y`. Call `destroy()` when the viewport unmounts.
The current bitmap can soften during a pinch; final tiles render at the exact device resolution.
Newly revealed pages receive worker previews during the gesture, with selection text deferred
until it ends. Native scroll bounds are applied during the preview, including when the
document becomes smaller than the viewport. Use `scrollbar-gutter: stable` on the scroll
viewport so its width stays stable when a vertical scrollbar appears or disappears.

The viewer requires module workers, OffscreenCanvas and a bundler that handles
`new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' })`, such as Vite.
Its worker must be allowed by the host's content security policy. When consuming vendored sources
outside the app directory in development, include their directory in Vite's `server.fs.allow` so
it can serve the worker module.

`PdfEditableDocument` shares a worker across nearby pages for source interpretation, source placement
and painting. It transfers source bitmaps into a background canvas and paints changed text on a separate
transparent canvas. Unchanged pages allocate no text canvas. Drag previews reuse prepared source and
text layers. Both views prepare two viewport heights ahead and release rasters outside that window.

The transparent selection layer batches compatible glyphs into SVG text spans with explicit character
positions. Contextually shaped scripts and multi-character glyphs retain independent source widths.
Per-item UTF-16 offsets and the headless hit-test index still determine native selection and copying.

Hosts can call `PresentationSlideView.editText(objectKey)` after rendering an inserted
text box or table to focus its text editor. Tables start in the first editable cell.
The method ignores missing objects and read-only views. Typing on a selected text
shape starts editing; double-clicking text selects its word. Tab navigates table
cells, and Up/Down moves between rows at the first or last text line. Ctrl/Cmd+Z
undoes; Ctrl+Y and Ctrl/Cmd+Shift+Z redo inside text editing. Home and
Shift+Home keep the selection in editable text, excluding bullet markers.

`PresentationSlideView.contentBounds()` returns rendered text bounds keyed by object
key, in slide coordinates. Hosts can use them to place new content in free space;
these measurements do not change saved object geometry.

`PresentationSlideView.restoreSelection({objectKey, start, end, head?, cell?})` waits for
the current render and restores a text selection, including its caret direction.
Hosts can record selections beside history groups and restore them with undo/redo.

`PresentationSlideRail` accepts `oninsert(index)` to enable insertion points before,
between and after slide thumbnails. Clicking a gap selects its line; Enter calls
`oninsert` with a zero-based insertion index. Focus stays after the inserted slide
so repeated Enter presses add slides in sequence. `oninsertionfocus()` lets the
host clear object or text editing when a gap receives focus. Omit `oninsert` for a
read-only rail. Hosts own the insertion command, layout choice and saving.

`PresentationShapePlacement`, exported from `@tumblerjs/svelte/slides`, mounts in
`PresentationSlideView`'s `overlay` snippet. Supply `shape: ShapeGeometry`, slide
`width` and `height`, `oninsert(placement)`, and `oncancel()`. It draws the actual
Tumbler preset geometry while dragging, converts zoomed pointer positions into
slide coordinates, and captures the active pointer. Shift constrains proportions
or snaps lines to 45-degree angles. A click inserts the default size at the chosen
point; Enter or Space requests a default-size insertion at the slide centre.
Escape, pointer cancellation, and window blur call `oncancel` without an edit.

The component does not mutate a document. Pass its result to
`placedShapeCommand` from `@tumblerjs/slides` and execute the returned command once.
Hosts own menus, touch insertion policy, permissions, saving, error display, and
selection after a successful command. Unmount the placement component when the
active slide, tool or editing permission changes. After pointerup, keep it mounted
through the following click event before removing it to avoid click-through.

### Merge PDFs

`PdfMerge` from `@tumblerjs/svelte/pdf` provides a local PDF merge workflow. Add
multiple PDFs, enter optional source passwords, select one-based page numbers or
inclusive ranges (including descending ranges and repeats), then move, duplicate,
or remove source blocks to interleave pages. An empty selection uses every page.
The component uses `mergePdfDocuments` and `parsePdfPageSelection` from
`@tumblerjs/pdf`, so content preservation and selection behavior match the CLI.
It creates a fresh PDF download and leaves the input files untouched. Unsupported
structures fail visibly before a download is created. Pass
`onmerge={(bytes, filename) => save(bytes, filename)}` to handle the completed
bytes yourself instead of downloading them. Passwords and file bytes remain in
browser memory. The docs example is `/playground/pdf-merge`.

### Remote spreadsheet selections

Pass `remoteSelections` to `SpreadsheetGrid` as an array of `{ id, name, color, range }`. Ranges use one-based, inclusive `start` and `end` cell coordinates. The host supplies selections for the displayed worksheet and owns presence transport. The grid projects ranges through filtered rows and clips them against scrolling and frozen panes. Overlays do not intercept pointer input.

### Visual PDF merging

`PdfMerge` shows expandable source rows with lazy page thumbnails, checkbox and Shift-click
selection, editable page ranges, source drag ordering and keyboard alternatives. Custom ordered
or repeated page ranges remain intact until the user explicitly chooses page order. None and
all-pages selections are distinct. Only one source grid opens at a time.

Hosts can add an immediate loading row with `addSource(name, signal => readBytes(signal))`.
Removing that source or destroying the component cancels the read. Undoing a removal starts a fresh read with a new signal, so host readers must support being called again. The optional `sourcePicker`
snippet receives upload and close callbacks for a workspace picker inside the Add PDFs popover.
File drops and uploads use the same source flow. A successful `onmerge` can return `{name, href}`
for an Open link; the merge setup remains intact. Host `disabled` prevents creation and edits.
`PdfPageThumbnail` is exported from `@tumblerjs/svelte/pdf` and shares a worker render queue
between visible thumbnails of the same source document.

Hosts can retain a reactive `createPdfMergeState()` per document and pass it as `session` to preserve source choices, output name and expanded row across mounts.
