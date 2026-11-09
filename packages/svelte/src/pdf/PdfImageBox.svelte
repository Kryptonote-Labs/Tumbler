<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { PdfTextModel, PdfImagePlacement } from '@tumblerjs/pdf';
  import { beginPdfBoxPreview } from './pdf-box-preview.ts';
  let { model, id, image, url, selected, group, editable, origins, onselect }: {
    model: PdfTextModel; id: string; image: PdfImagePlacement; url?: string; selected: boolean;
    group: string[]; editable: boolean; origins: ReadonlyMap<string, { x: number; y: number; continuation?: number }>;
    onselect: (id: string, extend: boolean) => void;
  } = $props();
  let node: HTMLDivElement;
  let gesture: { x: number; y: number; dx: number; dy: number; scale: number; rotation: number; resize: boolean; image: PdfImagePlacement; preview: ReturnType<typeof beginPdfBoxPreview>; members: string[]; } | undefined;
  function begin(event: PointerEvent, resize = false) {
    event.stopPropagation();
    if (!editable || event.button !== 0) return;
    event.preventDefault();
    const members = event.shiftKey ? [...new Set([...group, id])] : selected ? [...group] : [id];
    onselect(id, event.shiftKey);
    node.focus(); node.setPointerCapture(event.pointerId);
    const page = node.closest<HTMLElement>('.pdf-page')!;
    gesture = { x: event.clientX, y: event.clientY, dx: 0, dy: 0, scale: Number(new DOMMatrix(getComputedStyle(node.parentElement!).transform).a), rotation: Number(page.dataset.pdfRotation), resize, image: { ...image }, members, preview: beginPdfBoxPreview(node, members) };
  }
  function move(event: PointerEvent) {
    if (!gesture) return;
    if (!editable) { finish(true); return; }
    let dx = (event.clientX - gesture.x) / gesture.scale, dy = (event.clientY - gesture.y) / gesture.scale;
    if (gesture.rotation === 90) [dx, dy] = [dy, -dx];
    if (gesture.rotation === 180) [dx, dy] = [-dx, -dy];
    if (gesture.rotation === 270) [dx, dy] = [-dy, dx];
    if (gesture.resize) {
      const factor = Math.max(1 / Math.min(image.width, image.height), 1 + dx / image.width);
      gesture.dx = image.width * factor - image.width;
      gesture.dy = image.height * factor - image.height;
      node.style.transform = `scale(${factor})`;
      node.style.transformOrigin = '0 0';
      return;
    }
    if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    if (!event.altKey) {
      const page = node.closest<HTMLElement>('.pdf-page')!;
      const w = Number(page.dataset.pdfWidth), h = Number(page.dataset.pdfHeight);
      const xs = [0, 24, 48, w / 2, w - 48, w - 24, w], ys = [0, 24, 48, h / 2, h - 48, h - 24, h];
      for (const other of model.ids(image.page).filter(other => !group.includes(other))) { const box = model.geometry(other); xs.push(box.x, box.x + box.width); ys.push(box.y); }
      for (const [other, box] of model.images.records) if (!group.includes(other) && box.page === image.page && !box.hidden) { xs.push(box.x, box.x + box.width); ys.push(box.y, box.y + box.height); }
      const snap = (value: number, size: number, targets: number[]) => {
        let adjustment = 0, best = 4 / gesture!.scale;
        for (const target of targets) for (const edge of [value, value + size / 2, value + size]) if (Math.abs(target - edge) < best) { adjustment = target - edge; best = Math.abs(adjustment); }
        return adjustment;
      };
      if (!event.shiftKey || dx) dx += snap(image.x + dx, image.width, xs);
      if (!event.shiftKey || dy) dy += snap(image.y + dy, image.height, ys);
    }
    gesture.dx = dx; gesture.dy = dy; gesture.preview.move(dx, dy);
  }
  function finish(cancel = false) {
    if (!gesture) return;
    const g = gesture; gesture = undefined;
    if (!cancel && editable && (g.dx || g.dy)) {
      model.undo.stopCapturing();
      model.doc.transact(() => {
        if (g.resize) model.images.place(id, { ...g.image, width: g.image.width + g.dx, height: g.image.height + g.dy });
        else for (const member of g.members) {
          if (model.images.get(member)) model.images.move(member, g.dx, g.dy);
          else model.move(member, g.dx, g.dy, origins.get(member));
        }
      }, model.origin);
      model.undo.stopCapturing();
    }
    g.preview.finish(cancel); node.style.transform = '';
  }
  function key(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); finish(true); return; }
    if (!editable) return;
    const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const)[event.key as 'ArrowLeft'];
    if (direction || ['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation(); model.undo.stopCapturing();
      model.doc.transact(() => { for (const member of group) {
        if (direction) { const step = event.shiftKey ? 10 : 1; if (model.images.get(member)) model.images.move(member, direction[0] * step, direction[1] * step); else model.move(member, direction[0] * step, direction[1] * step, origins.get(member)); }
        else if (model.images.get(member)) model.images.hide(member); else model.hide(member);
      } }, model.origin); model.undo.stopCapturing();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) model.undo.redo(); else model.undo.undo(); }
  }
  onDestroy(() => finish(true));
  $effect(() => { if (!editable) finish(true); });
</script>
<div bind:this={node} data-pdf-image-box={id} class:selected role="toolbar" aria-label="PDF image" tabindex="0"
  style:left={`${image.x}px`} style:top={`${image.y}px`} style:width={`${image.width}px`} style:height={`${image.height}px`}
  onpointerdown={(e) => begin(e)} onpointermove={move} onpointerup={() => finish()} onpointercancel={() => finish(true)} onlostpointercapture={() => finish(true)} onkeydown={key}>
  {#if url}<img src={url} alt="" draggable="false" style:transform={`rotate(${image.rotation}deg)`} />{:else}<span>Image unavailable</span>{/if}
  {#if selected && editable}<button class="resize" aria-label="Resize image" onpointerdown={(e) => begin(e, true)}></button>{/if}
</div>
<style>
  div { position: absolute; pointer-events: auto; box-sizing: border-box; cursor: move; outline: none; }
  div.selected { outline: 1px solid #438ef1; }
  img { width: 100%; height: 100%; display: block; pointer-events: none; }
  span { font: 12px sans-serif; color: #666; }
  .resize { position: absolute; right: -4px; bottom: -4px; width: 8px; height: 8px; background: white; border: 1px solid #438ef1; cursor: nwse-resize; padding: 0; }
</style>
