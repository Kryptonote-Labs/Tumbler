<script lang="ts">
  import { wordPointsToCssPixels, type WordTextPosition, type WordDrawing, type WordDrawingChange, type WordDrawingResize, type WordImageDrawing } from '@tumblerjs/word';
  import OoxmlChart from './OoxmlChart.svelte';

  let { drawing, width, height, position, scale, editable, selected, maxWidth, pageX, pageY, pageWidth, pageHeight, imageurl, inlinePosition, onselect, onresize, onchange }: {
    drawing: WordDrawing; width: number; height: number; position: string; scale: number;
    editable: boolean; selected: boolean; maxWidth: number;
    pageX: number; pageY: number; pageWidth: number; pageHeight: number;
    imageurl: (image: WordImageDrawing) => string;
    inlinePosition: (x: number, y: number) => WordTextPosition | undefined;
    onselect: (id: number | undefined) => void;
    onresize?: (size: WordDrawingResize) => void;
    onchange?: (change: WordDrawingChange) => void;
  } = $props();
  type Box = { x: number; y: number; width: number; height: number };
  type Handle = { x: number; y: number; label: string; cursor: string };
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
  let preview = $state<Box>();
  let drag: { pointer: number; clientX: number; clientY: number; box: Box; handle?: Handle } | undefined;
  let currentLayout: NonNullable<WordDrawingChange['layout']> = $derived(drawing.placement === 'inline' ? 'inline' : drawing.anchor?.behindDocument ? 'behind' : 'front');
  const label = $derived(drawing.altText ?? drawing.name ?? (drawing.kind === 'chart' ? 'Chart' : 'Image'));
  let displayWidth = $derived(wordPointsToCssPixels(preview?.width ?? width));
  let displayHeight = $derived(wordPointsToCssPixels(preview?.height ?? height));
  const box = (): Box => ({ x: pageX, y: pageY, width, height });
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));

  function resized(original: Box, handle: Handle, dx: number, dy: number): Box {
    const maxW = handle.x < 0 ? original.x + original.width : pageWidth - original.x;
    const maxH = handle.y < 0 ? original.y + original.height : pageHeight - original.y;
    let w = original.width;
    let h = original.height;
    if (handle.x !== 0 && handle.y !== 0) {
      const factor = 1 + (dx * handle.x * w + dy * handle.y * h) / (w * w + h * h);
      const ratio = clamp(factor, Math.min(1, Math.max(12 / w, 12 / h)), Math.min(maxW / w, maxH / h, currentLayout === 'inline' && handle.x > 0 ? maxWidth / w : Infinity));
      w *= ratio; h *= ratio;
    } else {
      if (handle.x !== 0) w = clamp(w + dx * handle.x, 12, maxW);
      if (handle.y !== 0) h = clamp(h + dy * handle.y, 12, maxH);
    }
    return { x: currentLayout !== 'inline' && handle.x < 0 ? original.x + original.width - w : original.x, y: currentLayout !== 'inline' && handle.y < 0 ? original.y + original.height - h : original.y, width: w, height: h };
  }

  function commit(next: Box, layout?: WordDrawingChange['layout']) {
    const moved = Math.abs(next.x - pageX) > 0.001 || Math.abs(next.y - pageY) > 0.001;
    if (onchange !== undefined) onchange({ elementId: drawing.elementId, widthPoints: next.width, heightPoints: next.height, layout: layout ?? (moved && currentLayout !== 'inline' ? currentLayout : undefined), xPoints: next.x, yPoints: next.y });
    else onresize?.({ elementId: drawing.elementId, widthPoints: next.width, heightPoints: next.height });
  }

  function start(event: PointerEvent, handle?: Handle) {
    if (event.button !== 0) return;
    onselect(drawing.elementId);
    if (handle === undefined && onchange === undefined) return;
    event.preventDefault(); event.stopPropagation();
    drag = { pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, box: box(), handle };
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function move(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return;
    const dx = (event.clientX - drag.clientX) / scale * 0.75;
    const dy = (event.clientY - drag.clientY) / scale * 0.75;
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 3) return;
    preview = drag.handle === undefined
      ? { ...drag.box, x: clamp(drag.box.x + dx, 0, pageWidth - drag.box.width), y: clamp(drag.box.y + dy, 0, pageHeight - drag.box.height) }
      : resized(drag.box, drag.handle, dx, dy);
  }

  function finish(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return;
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

  function cancel() { drag = undefined; preview = undefined; }

  function keydown(event: KeyboardEvent, handle?: Handle) {
    if (event.key === 'Escape') { event.stopPropagation(); cancel(); onselect(undefined); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (handle === undefined && onchange === undefined) return;
    event.preventDefault(); event.stopPropagation();
    const amount = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
    const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
    if (handle === undefined && currentLayout === 'inline') return;
    if (handle === undefined) commit({ ...box(), x: clamp(pageX + dx, 0, pageWidth - width), y: clamp(pageY + dy, 0, pageHeight - height) });
    else {
      // A corner's keyboard adjustment preserves its aspect ratio.
      const delta = dx || dy;
      commit(resized(box(), handle, handle.x !== 0 && handle.y !== 0 ? delta : dx, handle.x !== 0 && handle.y !== 0 ? delta * height / width : dy));
    }
  }
</script>

{#snippet content()}
  {#if drawing.kind === 'image'}
    <img src={imageurl(drawing)} alt={drawing.altText ?? ''} draggable="false" />
  {:else if drawing.kind === 'chart'}
    <OoxmlChart model={drawing.model} width={displayWidth} height={displayHeight} clipId={`word-drawing-${drawing.elementId}`} />
  {:else}
    <div class="fallback" role="img" aria-label={drawing.altText ?? 'Drawing preview unavailable'}></div>
  {/if}
{/snippet}

<div class="drawing" class:moving={preview !== undefined} class:behind={currentLayout === 'behind'} class:selected={editable && selected} data-word-drawing={drawing.elementId} contenteditable="false" style={`${position};width:${displayWidth}px;height:${displayHeight}px;translate:${preview === undefined ? 'none' : `${wordPointsToCssPixels(preview.x - pageX)}px ${wordPointsToCssPixels(preview.y - pageY)}px`};--handle-size:${10 / scale}px;--outline-size:${1 / scale}px;--inverse-scale:${1 / scale}`}>
  {#if editable && drawing.kind !== 'unsupported' && (onresize !== undefined || onchange !== undefined)}
    <button class="content" class:movable={onchange !== undefined} aria-label={`Select ${label}`} title={currentLayout === 'inline' ? 'Drag to move within text' : 'Drag to move; arrow keys nudge'} onclick={() => onselect(drawing.elementId)} onpointerdown={(event) => start(event)} onpointermove={move} onpointerup={finish} onpointercancel={cancel} onlostpointercapture={cancel} onkeydown={(event) => keydown(event)}>{@render content()}</button>
    {#if selected}
      {#if onchange !== undefined}
        <div class="controls" role="toolbar" aria-label="Drawing controls">
          <button aria-label="Move drawing" title={currentLayout === 'inline' ? 'Drag to move within text' : 'Drag to move; arrow keys nudge'} onpointerdown={(event) => start(event)} onpointermove={move} onpointerup={finish} onpointercancel={cancel} onlostpointercapture={cancel} onkeydown={(event) => keydown(event)}>✥</button>
          <select aria-label="Drawing layout" value={currentLayout} onchange={(event) => { const layout = event.currentTarget.value; if (layout === 'inline' || layout === 'front' || layout === 'behind') commit(box(), layout); }}>
            <option value="inline">In line with text</option><option value="front">In front of text</option><option value="behind">Behind text</option>
          </select>
        </div>
      {/if}
      {#each handles as handle}
        {#if onchange !== undefined || handle.x === 1 && handle.y === 1}
          <button class="resize" aria-label={handle.label} title={handle.label} style={`left:${(handle.x + 1) * 50}%;top:${(handle.y + 1) * 50}%;cursor:${handle.cursor}`} onpointerdown={(event) => start(event, handle)} onpointermove={move} onpointerup={finish} onpointercancel={cancel} onlostpointercapture={cancel} onkeydown={(event) => keydown(event, handle)}></button>
        {/if}
      {/each}
    {/if}
  {:else}
    <div class="content">{@render content()}</div>
  {/if}
</div>

<style>
  .drawing { position: absolute; }
  .drawing.moving { z-index: 3; }
  .drawing.behind .content { z-index: 0; }
  .drawing.selected { outline: var(--outline-size) solid var(--tumbler-document-accent, #25a735); }
  .content { position: relative; z-index: 2; display: block; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: pointer; touch-action: none; }
  .content.movable { cursor: grab; }
  .content.movable:active { cursor: grabbing; }
  .content:focus-visible { outline: var(--outline-size) solid var(--tumbler-document-accent, #25a735); }
  img { display: block; width: 100%; height: 100%; }
  .resize { position: absolute; z-index: 4; translate: -50% -50%; width: var(--handle-size); height: var(--handle-size); min-width: 0; min-height: 0; box-sizing: border-box; line-height: 0; padding: 0; border: var(--outline-size) solid var(--tumbler-document-accent, #25a735); border-radius: 50%; background: white; touch-action: none; }
  .controls { position: absolute; z-index: 4; right: 0; bottom: calc(100% + 10px * var(--inverse-scale)); display: flex; gap: 4px; padding: 4px; border: 1px solid #3b483e; border-radius: 6px; background: #181b18; color: #e2fee7; font: 13px/1.4 system-ui, sans-serif; transform: scale(var(--inverse-scale)); transform-origin: bottom right; }
  .controls button, select { position: static; padding: 5px 8px; border: 1px solid #3b483e; border-radius: 4px; background: #202521; color: inherit; font: inherit; }
  .controls button { cursor: move; touch-action: none; }
  .fallback { width: 100%; height: 100%; background: #eee; }
</style>
