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
  // SVG titles place the alphabetic baseline one font size below the top inset.
  // Measure the browser baseline so font metrics and document zoom cannot move it.
  function alignBaselines(root: HTMLDivElement) {
    const scale = root.getBoundingClientRect().width / parseFloat(getComputedStyle(root).width);
    for (const paragraph of root.querySelectorAll<HTMLElement>('[data-shape-paragraph]')) {
      const size = Math.max(1, ...Array.from(paragraph.querySelectorAll('span'), span => parseFloat(getComputedStyle(span).fontSize)));
      paragraph.style.fontSize = `${size}px`;
      paragraph.style.lineHeight = '1.2';
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline';
      paragraph.prepend(probe);
      const baseline = (probe.getBoundingClientRect().top - paragraph.getBoundingClientRect().top) / scale;
      probe.remove();
      paragraph.style.position = 'relative';
      paragraph.style.top = `${size - baseline}px`;
    }
  }
  function mount(root: HTMLDivElement) {
    const current = new ShapeTextEditorView(root, shape, oncommit, () => onselection?.(), oncancel, redo => onundo?.(redo), alignBaselines);
    view = current;
    return { destroy() { view = undefined; current.destroy(); } };
  }
  $effect(() => { const current = view, value = shape; untrack(() => current?.update(value, true)); });
  $effect(() => { const current = view; if (!current) return; untrack(() => oneditor?.(current)); return () => untrack(() => oneditor?.(undefined)); });
</script>

<div class="title-editor" style:min-height={`${titleHeight}px`} data-shape-text role="textbox" aria-label="Chart title" aria-multiline="true" contenteditable="true" tabindex="0" use:mount></div>

<style>
  .title-editor { position:absolute;left:8px;right:8px;top:8px;box-sizing:border-box;padding:0;min-height:1em;text-align:center;background:white;border:0;outline:1px solid #777;z-index:3;cursor:text;white-space:pre-wrap; }
</style>
