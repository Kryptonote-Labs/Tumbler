<script lang="ts">
  import { untrack } from 'svelte';
  import {
    shapeTextParagraphs,
    shapePlainText,
    resolveWordColour,
    resolveWordShapeTextInsets,
    wordShapePath,
    type WordTextParagraph,
    type WordAuthoredShape,
  } from '@tumblerjs/word';
  import { ShapeTextEditorView, type ShapeTextEditor } from './word-shape-text-editor.ts';
  let {
    shape,
    editing = false,
    selected = false,
    initialText,
    oncommit,
    oneditor,
    onselection,
    onundo,
  }: {
    shape: WordAuthoredShape;
    /** Edits the shape's text in place, as Word does after a double-click. */
    editing?: boolean;
    selected?: boolean;
    oneditor?: (editor: ShapeTextEditor | undefined) => void;
    onselection?: () => void;
    onundo?: (redo: boolean) => void;
    /** Text to start editing with when it differs from the shape's, such as a typed first character. */
    initialText?: string;
    /** Receives rich text on each edit. Escape leaves the shape selected. */
    oncommit?: (textBody: readonly WordTextParagraph[], reason: 'input' | 'escape') => void;
  } = $props();
  let view = $state.raw<ShapeTextEditorView>();
  const inset = $derived(resolveWordShapeTextInsets(shape));
  function mount(root: HTMLDivElement) {
    const current = new ShapeTextEditorView(
      root,
      shape,
      (paragraphs) => oncommit?.(paragraphs, 'input'),
      () => onselection?.(),
      () => oncommit?.(shapeTextParagraphs(shape), 'escape'),
      (redo) => onundo?.(redo),
    );
    view = current;
    return {
      destroy: () => {
        view = undefined;
        current.destroy();
      },
    };
  }
  $effect(() => {
    const current = view,
      value = shape,
      active = editing,
      initial = initialText;
    untrack(() => current?.update(value, active, initial));
  });
  $effect(() => {
    if (!selected || !view) return;
    untrack(() => oneditor?.(view));
    return () => untrack(() => oneditor?.(undefined));
  });
</script>

<div
  class="shape"
  role={editing ? 'group' : 'img'}
  aria-label={shape.alt ?? (shapePlainText(shape) || shape.preset)}
>
  <svg viewBox={`0 0 ${shape.width} ${shape.height}`} preserveAspectRatio="none" aria-hidden="true">
    <path d={wordShapePath(shape)} fill={resolveWordColour(shape.fill)} stroke={resolveWordColour(shape.outline)} stroke-width={shape.outlineWidth} />
  </svg>
  <div
    class="text"
    style:top={`${inset.top * 4 / 3}px`}
    style:right={`${inset.right * 4 / 3}px`}
    style:bottom={`${inset.bottom * 4 / 3}px`}
    style:left={`${inset.left * 4 / 3}px`}
    style:justify-content={shape.textAnchor === 'top'
      ? 'flex-start'
      : shape.textAnchor === 'bottom'
        ? 'flex-end'
        : 'center'}
  >
    <div
      class="story"
      data-shape-text
      role="textbox"
      aria-label="Shape text"
      aria-multiline="true"
      aria-readonly={!editing}
      contenteditable={editing}
      tabindex={editing ? 0 : -1}
      use:mount
    ></div>
  </div>
</div>

<style>
  .shape {
    color-scheme: only light;
    position: relative;
    width: 100%;
    height: 100%;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .text {
    position: absolute;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    pointer-events: none;
  }
  .story {
    flex-shrink: 0;
    color: #000;
    font:
      16px Aptos,
      sans-serif;
    outline: none;
    min-height: 1em;
    width: 100%;
  }
  .story[contenteditable='true'] {
    pointer-events: auto;
    cursor: text;
  }
</style>
