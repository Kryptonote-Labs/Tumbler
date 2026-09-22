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
a drag. `session.updateDrawing(change)` records the position and dimensions as one
undoable revision and saves them in the DOCX. Square and tight wrapping are not
exposed. Hosts needing only the bottom-right resize handle can still use
`ondrawingresize` with `session.resizeDrawing(size)`.

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
