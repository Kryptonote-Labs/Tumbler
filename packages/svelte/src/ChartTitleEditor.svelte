<script lang="ts">
  import { untrack } from 'svelte';
  import type { ChartModel } from '@tumblerjs/charts';
  import { wordChartTitleText, type WordAuthoredShape, type WordTextParagraph } from '@tumblerjs/word';
  import { ShapeTextEditorView, type ShapeTextEditor } from './word-shape-text-editor.ts';
  let { model, oncommit, oncancel, oneditor, onselection, onundo }: {
    model: ChartModel;
    oncommit: (paragraphs: readonly WordTextParagraph[]) => void;
    oncancel: () => void;
    oneditor?: (view: ShapeTextEditor | undefined) => void;
    onselection?: () => void;
    onundo?: (redo: boolean) => void;
  } = $props();
  let view = $state.raw<ShapeTextEditorView>();
  const text = $derived(wordChartTitleText(model));
  const titleHeight = $derived(text.reduce((height, p) => height + Math.max(14, ...p.runs.map(r => r.format?.fontSizePoints ?? 14)) * 4 / 3 * 1.4, 8));
  const shape = $derived<WordAuthoredShape>({ preset: 'rect', width: 100, height: 30, fill: 'none', outline: 'none', outlineWidth: 0, textBody: text });
  function mount(root: HTMLDivElement) {
    const current = new ShapeTextEditorView(root, shape, oncommit, () => onselection?.(), oncancel, redo => onundo?.(redo));
    view = current;
    return { destroy() { view = undefined; current.destroy(); } };
  }
  $effect(() => { const current = view, value = shape; untrack(() => current?.update(value, true)); });
  $effect(() => { const current = view; if (!current) return; untrack(() => oneditor?.(current)); return () => untrack(() => oneditor?.(undefined)); });
</script>

<div class="title-editor" style:min-height={`${titleHeight}px`} data-shape-text role="textbox" aria-label="Chart title" aria-multiline="true" contenteditable="true" tabindex="0" use:mount></div>

<style>
  .title-editor { position:absolute;left:8px;right:8px;top:4px;box-sizing:border-box;padding:0;min-height:1em;text-align:center;background:white;border:1px solid #777;outline:none;z-index:3;cursor:text;white-space:pre-wrap; }
</style>
