<script lang="ts">
  import { EQUATION_FONT, layoutMath, mathCaretRect, type MathPosition } from "@tumblerjs/core/math";
  import type { SpreadsheetDrawingEquation } from "@tumblerjs/sheets";
  import MathGraphic from "./MathGraphic.svelte";
  import { cssFontFamily } from "./font-family.ts";
  import { browserMathMeasure } from "./math-measure.ts";
  import type { SpreadsheetEquationEditing } from "./spreadsheet-equation.ts";

  // An Excel equation text box's math, drawn in the drawing's own pixel space.
  let {
    equation,
    width,
    editing,
    onposition,
    oncaret,
  }: {
    equation: SpreadsheetDrawingEquation;
    /** The text box width; display equations centre within it. */
    width: number;
    editing?: SpreadsheetEquationEditing | undefined;
    onposition?: ((position: MathPosition, extend: boolean) => void) | undefined;
    /** Reports the caret in client pixels, so input methods open beside it. */
    oncaret?: ((rect: { left: number; top: number; height: number }) => void) | undefined;
  } = $props();
  const fontFamily = cssFontFamily(EQUATION_FONT);
  const layout = $derived(
    layoutMath(editing?.math ?? equation.math, { size: equation.size, measure: browserMathMeasure(fontFamily) }),
  );
  const x = $derived(
    equation.display
      ? Math.max(equation.inset.left, (width - layout.width) / 2)
      : equation.inset.left,
  );
  let node = $state<SVGGElement>();

  $effect(() => {
    if (!editing || !node || !oncaret) return;
    const caret = mathCaretRect(layout, editing.selection.focus);
    const matrix = node.getScreenCTM();
    if (caret && matrix)
      oncaret({
        left: matrix.a * caret.x + matrix.e,
        top: matrix.d * (caret.top + layout.ascent) + matrix.f,
        height: matrix.d * (caret.bottom - caret.top),
      });
  });
</script>

<g bind:this={node} transform={`translate(${x} ${equation.inset.top})`}>
  <MathGraphic
    {layout}
    width={layout.width}
    height={layout.ascent + layout.descent}
    {fontFamily}
    color="#111"
    selection={editing?.selection}
    focused={!!editing?.focused}
    active={!!editing}
    onposition={onposition &&
      ((position, extend, event) => {
        event.preventDefault();
        event.stopPropagation();
        onposition?.(position, extend && !!editing);
      })}
  />
</g>
