<script lang="ts">
  import { tick } from 'svelte';
  import { wordInkPoints, moveWordInkPoint, type WordDrawing, type WordInkTraceChange } from '@tumblerjs/word';
  let { drawing, scale, onchange, onfinish }: { drawing: WordDrawing; scale: number; onchange: (change: WordInkTraceChange) => void; onfinish: () => void } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let active = $state(0);
  let preview = $state<{ x: number; y: number }>();
  let drag: { pointer: number; x: number; y: number; startX: number; startY: number; scale: number; drawing: WordDrawing } | undefined;
  const points = $derived(wordInkPoints(drawing));
  const margin = $derived(8 / scale * .75);
  const bounds = $derived.by(() => {
    let left = 0, top = 0, right = drawing.widthPoints, bottom = drawing.heightPoints;
    for (const point of points) { left = Math.min(left, point.x); top = Math.min(top, point.y); right = Math.max(right, point.x); bottom = Math.max(bottom, point.y); }
    if (preview) { left = Math.min(left, preview.x); top = Math.min(top, preview.y); right = Math.max(right, preview.x); bottom = Math.max(bottom, preview.y); }
    return { x: left - margin, y: top - margin, width: right - left + margin * 2, height: bottom - top + margin * 2 };
  });
  $effect(() => {
    if (!canvas) return;
    const ratio = scale * 4 / 3 * (window.devicePixelRatio || 1);
    canvas.width = Math.ceil(bounds.width * ratio); canvas.height = Math.ceil(bounds.height * ratio);
    const context = canvas.getContext('2d')!;
    context.scale(ratio, ratio); context.translate(-bounds.x, -bounds.y);
    for (let index = 0; index < points.length; index++) {
      const point = index === active && preview ? preview : points[index]!;
      context.beginPath(); context.arc(point.x, point.y, (index === active ? 4 : 2) * .75 / scale, 0, Math.PI * 2);
      context.fillStyle = index === active ? '#25a735' : '#fff'; context.fill();
      context.lineWidth = .75 / scale; context.strokeStyle = '#166522'; context.stroke();
    }
  });
  $effect(() => { scale; drawing; cancel(); });
  function cancel() {
    const pointer = drag?.pointer; drag = undefined; preview = undefined;
    if (pointer !== undefined && canvas?.parentElement?.hasPointerCapture(pointer)) canvas.parentElement.releasePointerCapture(pointer);
  }
  function start(event: PointerEvent) {
    if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * .75 / scale + bounds.x, y = (event.clientY - rect.top) * .75 / scale + bounds.y;
    let nearest = -1, distance = margin;
    points.forEach((point, index) => { const next = Math.hypot(point.x - x, point.y - y); if (next <= distance) { distance = next; nearest = index; } });
    if (nearest < 0) return;
    active = nearest;
    const point = points[active]!;
    drag = { pointer: event.pointerId, x: point.x, y: point.y, startX: event.clientX, startY: event.clientY, scale, drawing };
    event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return;
    preview = { x: drag.x + (event.clientX - drag.startX) * .75 / drag.scale, y: drag.y + (event.clientY - drag.startY) * .75 / drag.scale };
  }
  function finish(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return;
    const point = points[active], next = preview, original = drag.drawing;
    cancel();
    if (point && next) void commit(moveWordInkPoint(original, point, next.x, next.y));
  }
  async function commit(change: WordInkTraceChange) {
    const focused = canvas?.parentElement === document.activeElement;
    onchange(change);
    await tick();
    if (focused) canvas?.parentElement?.focus({ preventScroll: true });
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (drag) cancel(); else onfinish(); return; }
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault(); event.stopPropagation(); active = (active + (event.key === 'PageDown' ? 1 : points.length - 1)) % Math.max(1, points.length); return;
    }
    const point = points[active];
    if (!point || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const amount = event.shiftKey ? 10 : 1;
    void commit(moveWordInkPoint(drawing, point, point.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0), point.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0)));
  }
</script>
<button class="points" aria-label={`Ink point ${active + 1} of ${points.length}`} title="Drag a point or use arrow keys. Page Up/Down selects a point. Escape finishes." style={`left:${bounds.x * 4 / 3}px;top:${bounds.y * 4 / 3}px;width:${bounds.width * 4 / 3}px;height:${bounds.height * 4 / 3}px`} onpointerdown={start} onpointermove={move} onpointerup={finish} onpointercancel={cancel} onlostpointercapture={cancel} onkeydown={keydown}>
  <canvas bind:this={canvas} aria-hidden="true"></canvas>
</button>
<style>
  .points { position:absolute; z-index:var(--word-drawing-points-z-index, 5); background:transparent; border:0; padding:0; touch-action:none; cursor:crosshair; }
  .points:focus-visible { outline:1px dotted #25a735; }
  canvas { display:block; width:100%; height:100%; pointer-events:none; }
</style>
