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

Word font leading is placed above the baseline, and automatic paragraph spacing
advances below it in whole twips. Custom HTML renderers should use
`wordTextTop(fragment, cssFontStack)` for a text span's top position, with
`fragment.height` as its CSS line height, converting both from points to pixels.
This aligns the painted baseline with `fragment.baseline` despite browser font
rounding. The optional font stack must match the one used to measure and paint
the text. Font loading invalidates the cached CSS baseline measurements.

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

In edit mode, `ondrawingchange` enables dragging, eight resize handles, and inline,
in-front-of-text, or behind-text placement. Corners preserve proportions; edges
resize one dimension. Dragging an inline drawing moves it within the text flow without changing its layout.
Arrow keys nudge a focused floating drawing, Shift increases the step, and Escape cancels
a drag. Changing the document zoom also cancels an active drawing drag or resize.
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
`onchange` or `onresize` for committing edits. The component renders in place;
it never attaches controls to `document.body`. Put it inside a positioned,
clipped page container, such as `position: relative; overflow: hidden`, to keep
previews and handles out of surrounding UI. `WordDocumentView` already provides
that container.

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

Pass a presentation document and its active slide to `PresentationSlideView`.
Bind `PresentationSlideRail` to the active slide index for thumbnail navigation.
In edit mode, connect object, text, formatting, and shape callbacks to a
`PresentationEditingSession`, then pass the updated document back to the view.

The [PowerPoint guide](https://tumbler.alexco.dev/docs/powerpoint) provides complete
examples, including undo, redo, and downloading edits. The same guide describes
text editing, table-cell navigation, resize handles, and rotation controls.

Tumbler is developed at
[Kryptonote-Labs/Tumbler](https://github.com/Kryptonote-Labs/Tumbler).

MIT licensed. See [LICENSE](LICENSE).
