<script lang="ts">
  import { wordDisplayInkSvg } from './word-display-ink.ts';
  import WordPictureView from "./WordPictureView.svelte";
  import { wordContentClipCss } from "./word-content-clip.ts";
  import WordInkPointEditor from "./WordInkPointEditor.svelte";
  import ChartTitleEditor from "./ChartTitleEditor.svelte";
  import WordShapeView from "./WordShapeView.svelte";
  import { shapePlainText, wordImagePaintBounds, wordPointsToCssPixels, type WordTextPosition, type WordDrawing, type WordDrawingChange, type WordDrawingResize, type WordImageDrawing, type WordShapeTextChange } from '@tumblerjs/word';
  import OoxmlChart from './OoxmlChart.svelte';
  import { resizeWordDrawingBox, type WordDrawingBox, type WordDrawingHandle } from './word-drawing-geometry.ts';

  let { drawing, background = '#ffffff', width, height, position, clip, scale, editable, selected, pageX, pageY, imageurl, imageLoading = "lazy", layoutControl = true, inlinePosition, onselect, onresize, onchange, ontextchange, ontexteditor, ontextselection, ontextundo, oncharttitlechange, oncharttitletextchange, oninkchange }: {
    /** Original visible surface behind vector ink. */
    background?: string;
    drawing: WordDrawing; width: number; height: number; position: string; scale: number;
    editable: boolean; selected: boolean;
    pageX: number; pageY: number;
    /** Page-point content clip. Editing controls remain outside it. */
    clip?: import("@tumblerjs/word").WordContentBounds;
    imageurl: (image: WordImageDrawing) => string;
    imageLoading?: "eager" | "lazy";
    /** Hosts that offer placement in their own UI can omit the built-in layout select. */
    layoutControl?: boolean;
    inlinePosition: (x: number, y: number) => WordTextPosition | undefined;
    onselect: (id: number | undefined) => void;
    oninkchange?: (change: import('@tumblerjs/word').WordInkTraceChange) => void;
    onresize?: (size: WordDrawingResize) => void;
    onchange?: (change: WordDrawingChange) => void;
    /** Enables in-place shape text editing: double-click a shape, or type while it is selected. */
    ontexteditor?: (editor: import('./word-shape-text-editor.ts').ShapeTextEditor | undefined) => void;
    ontextselection?: () => void;
    ontextundo?: (redo: boolean) => void;
    oncharttitletextchange?: (paragraphs: readonly import('@tumblerjs/word').WordTextParagraph[]) => void;
    oncharttitlechange?: (title: string) => void;
    ontextchange?: (change: WordShapeTextChange) => void;
  } = $props();
  type Handle = WordDrawingHandle & { label: string; cursor: string };
  const handles: readonly Handle[] = [
    { x: -1, y: -1, label: 'Resize drawing top left', cursor: 'nwse-resize' },
    { x: 0, y: -1, label: 'Resize drawing top', cursor: 'ns-resize' },
    { x: 1, y: -1, label: 'Resize drawing top right', cursor: 'nesw-resize' },
    { x: -1, y: 0, label: 'Resize drawing left', cursor: 'ew-resize' },
    { x: 1, y: 0, label: 'Resize drawing right', cursor: 'ew-resize' },
    { x: -1, y: 1, label: 'Resize drawing bottom left', cursor: 'nesw-resize' },
    { x: 0, y: 1, label: 'Resize drawing bottom', cursor: 'ns-resize' },
    { x: 1, y: 1, label: 'Resize drawing', cursor: 'nwse-resize' },
  ];
  let preview = $state<WordDrawingBox>();
  let drag: { pointer: number; scale: number; target: HTMLElement | undefined; clientX: number; clientY: number; box: WordDrawingBox; handle?: Handle } | undefined;
  let currentLayout: NonNullable<WordDrawingChange['layout']> = $derived(drawing.placement === 'inline' ? 'inline' : drawing.anchor?.behindDocument ? 'behind' : 'front');
  const inkSvg = $derived(wordDisplayInkSvg(drawing, background));
  const label = $derived(drawing.altText ?? drawing.name ?? (drawing.kind === 'chart' ? 'Chart' : 'Image'));
  let displayWidth = $derived(wordPointsToCssPixels(preview?.width ?? width));
  let displayHeight = $derived(wordPointsToCssPixels(preview?.height ?? height));
  const contentClip = $derived(wordContentClipCss(clip, preview?.x ?? pageX, preview?.y ?? pageY));
  // Undefined while not editing; otherwise the text editing starts with.
  let editingTitle = $state(false);
  let editingInk = $state(false);
  let editingText = $state<string>();
  const textEditable = $derived(editable && drawing.kind === 'shape' && ontextchange !== undefined);
  const box = (): WordDrawingBox => ({ x: pageX, y: pageY, width, height });

  // Pointer deltas belong to the scale at which the drag started.
  $effect(() => { scale; cancel(); });

  function resized(original: WordDrawingBox, handle: Handle, dx: number, dy: number) {
    return resizeWordDrawingBox(original, handle, dx, dy, currentLayout === 'inline');
  }

  function commit(next: WordDrawingBox, layout?: WordDrawingChange['layout']) {
    const moved = Math.abs(next.x - pageX) > 0.001 || Math.abs(next.y - pageY) > 0.001;
    if (onchange !== undefined) onchange({ elementId: drawing.elementId, widthPoints: next.width, heightPoints: next.height, layout: layout ?? (moved && currentLayout !== 'inline' ? currentLayout : undefined), xPoints: next.x, yPoints: next.y });
    else onresize?.({ elementId: drawing.elementId, widthPoints: next.width, heightPoints: next.height });
  }

  function start(event: PointerEvent, handle?: Handle) {
    if (event.button !== 0) return;
    editingText = undefined;
    onselect(drawing.elementId);
    if (handle === undefined && onchange === undefined) return;
    event.preventDefault(); event.stopPropagation();
    drag = { pointer: event.pointerId, scale, target: event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined, clientX: event.clientX, clientY: event.clientY, box: box(), handle };
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function move(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return;
    if (drag.scale !== scale) { cancel(); return; }
    const dx = (event.clientX - drag.clientX) / scale * 0.75;
    const dy = (event.clientY - drag.clientY) / scale * 0.75;
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 3) return;
    preview = drag.handle === undefined
      ? { ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy }
      : resized(drag.box, drag.handle, dx, dy);
  }

  function finish(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return;
    if (drag.scale !== scale) { cancel(); return; }
    const next = preview;
    const inlineMove = drag.handle === undefined && currentLayout === 'inline';
    cancel();
    if (next === undefined) return;
    if (inlineMove) {
      const destination = inlinePosition(event.clientX, event.clientY);
      if (destination !== undefined) {
        onchange?.({ elementId: drawing.elementId, widthPoints: width, heightPoints: height, inlinePosition: destination });
        onselect(undefined);
      }
    } else commit(next);
  }

  function cancel() {
    const current = drag;
    drag = undefined;
    preview = undefined;
    if (current?.target?.hasPointerCapture(current.pointer)) current.target.releasePointerCapture(current.pointer);
  }

  function editText(initial: string) {
    if (!textEditable || drawing.kind !== 'shape') return;
    cancel();
    onselect(drawing.elementId);
    editingText = initial;
  }

  function finishText(textBody: readonly import('@tumblerjs/word').WordTextParagraph[], reason: 'input' | 'escape') {
    if (reason === 'escape') { editingText = undefined; onselect(drawing.elementId); }
    else ontextchange?.({ elementId: drawing.elementId, textBody, text: textBody.map(p => p.runs.map(r => r.text).join('')).join('\n'), reason });
  }
  $effect(() => { if (!selected) { editingText = undefined; editingTitle = false; editingInk = false; } });

  function editTitle() {
    if (!editable || drawing.kind !== 'chart' || (!oncharttitlechange && !oncharttitletextchange)) return;
    cancel(); onselect(drawing.elementId); editingTitle = true;
  }
  function doubleClick(event: MouseEvent) {
    if (drawing.kind === 'chart') {
      const bounds = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined;
      if (bounds && (event.clientY - bounds.top) / scale < 44) { event.preventDefault(); editTitle(); }
    } else if (drawing.kind === 'image' && drawing.inkProjection && oninkchange) { event.preventDefault(); editingInk = true; } else if (textEditable && drawing.kind === 'shape') { event.preventDefault(); editText(shapePlainText(drawing.shape)); }
  }
  function keydown(event: KeyboardEvent, handle?: Handle) {
    if (event.key === 'F2' && drawing.kind === 'chart') { event.preventDefault(); event.stopPropagation(); editTitle(); return; }
    // As in Word, typing while a shape is selected adds to its text.
    if (handle === undefined && textEditable && drawing.kind === 'shape' && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
      event.preventDefault(); event.stopPropagation();
      editText((shapePlainText(drawing.shape)) + event.key);
      return;
    }
    if (event.key === 'Escape') { event.stopPropagation(); cancel(); onselect(undefined); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (handle === undefined && onchange === undefined) return;
    event.preventDefault(); event.stopPropagation();
    const amount = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
    const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
    if (handle === undefined && currentLayout === 'inline') return;
    if (handle === undefined) commit({ ...box(), x: pageX + dx, y: pageY + dy });
    else {
      // A corner's keyboard adjustment preserves its aspect ratio.
      const delta = dx || dy;
      commit(resized(box(), handle, handle.x !== 0 && handle.y !== 0 ? delta : dx, handle.x !== 0 && handle.y !== 0 ? delta * height / width : dy));
    }
  }
</script>

{#snippet content()}
  {#if drawing.kind === 'shape'}
    <WordShapeView shape={drawing.shape} {selected} oneditor={ontexteditor} onselection={ontextselection} onundo={ontextundo} editing={editingText !== undefined} initialText={editingText} oncommit={finishText} />
  {:else if drawing.kind === 'image'}
    {@const painted = wordImagePaintBounds(drawing)}
    {#if drawing.picture}
      <WordPictureView {drawing} src={imageurl(drawing)} loading={imageLoading} />
    {:else if inkSvg !== undefined}
      <span class="ink-vector" data-word-ink-rendering="vector" role="img" aria-label={drawing.altText ?? 'Ink'} style={`position:absolute;left:${painted.x / drawing.widthPoints * 100}%;top:${painted.y / drawing.heightPoints * 100}%;width:${painted.width / drawing.widthPoints * 100}%;height:${painted.height / drawing.heightPoints * 100}%`}>
        {@html inkSvg}
      </span>
    {:else}
      <img data-word-ink-rendering={drawing.inkRendering} src={imageurl(drawing)} alt={drawing.altText ?? ''} draggable="false" loading={imageLoading} decoding="async" style={`position:absolute;left:${painted.x / drawing.widthPoints * 100}%;top:${painted.y / drawing.heightPoints * 100}%;width:${painted.width / drawing.widthPoints * 100}%;height:${painted.height / drawing.heightPoints * 100}%`} />
    {/if}
  {:else if drawing.kind === 'chart'}
    <OoxmlChart model={drawing.model} width={displayWidth} height={displayHeight} clipId={`word-drawing-${drawing.elementId}`} />
  {:else}
    <div class="fallback" role="img" aria-label={drawing.altText ?? 'Drawing preview unavailable'}></div>
  {/if}
{/snippet}

<div class="drawing" class:ink={inkSvg !== undefined} class:moving={preview !== undefined} class:behind={currentLayout === 'behind'} class:selected={editable && selected} data-word-drawing={drawing.elementId} contenteditable="false" style={`${position};width:${displayWidth}px;height:${displayHeight}px;translate:${preview === undefined ? 'none' : `${wordPointsToCssPixels(preview.x - pageX)}px ${wordPointsToCssPixels(preview.y - pageY)}px`};--handle-size:${10 / scale}px;--outline-size:${1 / scale}px;--inverse-scale:${1 / scale}`}>
  {#if editingTitle && editable && drawing.kind === 'chart'}
    <ChartTitleEditor model={drawing.model} oneditor={ontexteditor} onselection={ontextselection} onundo={ontextundo} oncommit={(paragraphs) => { if (oncharttitletextchange) oncharttitletextchange(paragraphs); else oncharttitlechange?.(paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n')); }} oncancel={() => { editingTitle = false; onselect(drawing.elementId); }} />
  {/if}
  {#if editable && drawing.kind !== 'unsupported' && (onresize !== undefined || onchange !== undefined)}
    {#if editingText !== undefined}
      <div class="content editing" style={contentClip}>{@render content()}</div>
    {:else}
    <button class="content" style={contentClip} class:movable={onchange !== undefined} aria-label={`Select ${label}`} title={currentLayout === 'inline' ? 'Drag to move within text' : 'Drag to move; arrow keys nudge'} onclick={() => onselect(drawing.elementId)} onpointerdown={(event) => start(event)} onpointermove={move} onpointerup={finish} onpointercancel={cancel} onlostpointercapture={cancel} onkeydown={(event) => keydown(event)} ondblclick={doubleClick}>{@render content()}</button>
    {/if}
    {#if selected}
      {#if drawing.kind === 'image' && drawing.inkProjection && oninkchange}
        <div class="ink-controls"><button onclick={() => editingInk = !editingInk}>{editingInk ? 'Done' : 'Edit points'}</button></div>
        {#if editingInk}<WordInkPointEditor {drawing} {scale} onchange={oninkchange} onfinish={() => editingInk = false} />{/if}
      {/if}
      {#if onchange !== undefined}
        <div class="controls" role="toolbar" aria-label="Drawing controls">
          <button aria-label="Move drawing" title={currentLayout === 'inline' ? 'Drag to move within text' : 'Drag to move; arrow keys nudge'} onpointerdown={(event) => start(event)} onpointermove={move} onpointerup={finish} onpointercancel={cancel} onlostpointercapture={cancel} onkeydown={(event) => keydown(event)}>✥</button>
          {#if layoutControl}
            <select aria-label="Drawing layout" value={currentLayout} onchange={(event) => { const layout = event.currentTarget.value; if (layout === 'inline' || layout === 'front' || layout === 'behind') commit(box(), layout); }}>
              <option value="inline">In line with text</option><option value="front">In front of text</option><option value="behind">Behind text</option>
            </select>
          {/if}
        </div>
      {/if}
      {#each handles as handle}
        {#if onchange !== undefined || handle.x === 1 && handle.y === 1}
          <button class="resize" aria-label={handle.label} title={handle.label} style={`left:${(handle.x + 1) * 50}%;top:${(handle.y + 1) * 50}%;cursor:${handle.cursor}`} onpointerdown={(event) => start(event, handle)} onpointermove={move} onpointerup={finish} onpointercancel={cancel} onlostpointercapture={cancel} onkeydown={(event) => keydown(event, handle)}></button>
        {/if}
      {/each}
    {/if}
  {:else}
    <div class="content" style={contentClip}>{@render content()}</div>
  {/if}
</div>

<style>
  /* Document lines preserve whitespace and may be as tall as an inline drawing. */
  /* Stationary wrappers do not stack. Points sit above composited ink; toolbars sit above expanded point hit areas. */
  .drawing { color-scheme: only light; --word-drawing-points-z-index: calc(var(--word-ink-layer-z-index, 3) + 1); --word-drawing-controls-z-index: calc(var(--word-ink-layer-z-index, 3) + 2); position: absolute; white-space: normal; line-height: normal; }
  .drawing.moving { z-index: var(--word-drawing-controls-z-index); }
  .drawing.behind .content { z-index: var(--word-drawing-rank, 0); }
  .drawing.ink { color-scheme: inherit; }
  .drawing.selected { outline: var(--outline-size) solid var(--tumbler-document-accent, #25a735); }
  .content { position: absolute; inset: 0; z-index: var(--word-drawing-rank, 2); display: block; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; touch-action: none; }
  .content.movable { cursor: grab; }
  .content.movable:active { cursor: grabbing; }
  .content.editing { z-index: var(--word-drawing-controls-z-index); cursor: text; outline: var(--outline-size) dashed var(--tumbler-document-accent, #25a735); }
  .content:focus-visible { outline: var(--outline-size) solid var(--tumbler-document-accent, #25a735); }
  .ink-vector :global(svg) { display: block; width: 100%; height: 100%; }
  img { display: block; width: 100%; height: 100%; }
  .resize { position: absolute; z-index: var(--word-drawing-controls-z-index); translate: -50% -50%; width: var(--handle-size); height: var(--handle-size); min-width: 0; min-height: 0; box-sizing: border-box; line-height: 0; padding: 0; border: var(--outline-size) solid var(--tumbler-document-accent, #25a735); border-radius: 50%; background: white; touch-action: none; }
  .controls { position: absolute; z-index: var(--word-drawing-controls-z-index); right: 0; bottom: calc(100% + 10px * var(--inverse-scale)); display: flex; gap: 4px; padding: 4px; border: 1px solid #3b483e; border-radius: 6px; background: #181b18; color: #e2fee7; font: 13px/1.4 system-ui, sans-serif; transform: scale(var(--inverse-scale)); transform-origin: bottom right; }
  .controls button, select { position: static; padding: 5px 8px; border: 1px solid #3b483e; border-radius: 4px; background: #202521; color: inherit; font: inherit; }
  .ink-controls { position:absolute; z-index:var(--word-drawing-controls-z-index); left:0; top:calc(100% + 8px); transform:scale(var(--inverse-scale)); transform-origin:top left; }
  .ink-controls button { padding:4px 8px; border:1px solid #3b483e; border-radius:4px; background:#202521; color:#e2fee7; font:13px/1.4 system-ui; }
  .controls button { cursor: move; touch-action: none; }
  .fallback { width: 100%; height: 100%; background: #eee; }
</style>
