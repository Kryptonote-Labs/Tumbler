<script lang="ts">
  import { layoutMath, mathCaretRect } from "@tumblerjs/core/math";
  import type { SlideTextRun } from "@tumblerjs/slides";
  import MathGraphic from "./MathGraphic.svelte";
  import { browserMathMeasure } from "./math-measure.ts";
  import type { SlideTextEditorOptions } from "./presentation-text-edit.ts";

  // An inline equation in slide text. It occupies one character of the text offsets; while the
  // host edits it, `editor.equation` supplies the caret and presses report equation positions.
  let {
    run,
    start,
    fontFamily,
    editor,
  }: {
    run: SlideTextRun & { equation: NonNullable<SlideTextRun["equation"]> };
    /** Offset of the equation's object character in the text. */
    start: number;
    fontFamily: string;
    editor?: Omit<SlideTextEditorOptions, "paragraphs"> | undefined;
  } = $props();
  const layout = $derived(
    layoutMath(run.equation, {
      size: run.fontSize,
      bold: run.bold,
      measure: browserMathMeasure(fontFamily),
    }),
  );
  const editing = $derived(editor?.active && editor.equation?.start === start ? editor.equation : undefined);
  const height = $derived(layout.ascent + layout.descent);
  let node = $state<HTMLElement>();

  // Input methods place candidate windows at the reported caret.
  $effect(() => {
    if (!editing || !node || !editor?.onequationcaret) return;
    const caret = mathCaretRect(layout, editing.selection.focus);
    const box = node.getBoundingClientRect();
    const scale = box.height / Math.max(0.01, height);
    if (caret)
      editor.onequationcaret({
        left: box.left + caret.x * scale,
        top: box.top + (caret.top + layout.ascent) * scale,
        height: (caret.bottom - caret.top) * scale,
      });
  });
</script>

<span
  bind:this={node}
  data-text-run
  data-text-equation
  contenteditable="false"
  role="math"
  aria-label={run.equation.body.length ? undefined : "Empty equation"}
  style:display="inline-block"
  style:vertical-align={`${-layout.descent}px`}
  style:color={run.color}
  style:font-family={fontFamily}
  ><MathGraphic
    {layout}
    width={layout.width}
    {height}
    {fontFamily}
    selection={editing?.selection}
    focused={!!editing?.focused}
    active={!!editing}
    onposition={editor?.active && editor.onequation
      ? (position, extend, event) => {
          event.preventDefault();
          event.stopPropagation();
          editor?.onequation?.(start, position, extend && !!editing);
        }
      : undefined}
  /></span
>
