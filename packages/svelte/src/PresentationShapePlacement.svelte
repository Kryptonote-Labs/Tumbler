<script lang="ts">
  import { onMount } from 'svelte';
  import {
    applyPresentationCommand,
    createPresentation,
    resizeDrawingGeometry,
    shapePlacement,
    type ShapePlacement,
    type ShapeGeometry,
  } from '@tumblerjs/slides';

  let {
    shape,
    width,
    height,
    oninsert,
    oncancel,
  }: {
    shape: ShapeGeometry;
    width: number;
    height: number;
    oninsert: (placement: ShapePlacement) => void;
    oncancel: () => void;
  } = $props();
  let surface = $state<HTMLButtonElement>();
  let drag = $state<{
    pointer: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
    clientX: number;
    clientY: number;
    moved: boolean;
  }>();
  let constrained = $state(false);
  const placement = $derived(
    drag && shapePlacement(drag.start, drag.end, shape, constrained, { width, height }),
  );
  // Use Tumbler's actual preset geometry for the preview, including its resize-dependent guides.
  const sourceGeometry = $derived.by(() => {
    if (shape === 'line') return;
    const artifact = createPresentation();
    return applyPresentationCommand(artifact, {
      name: 'insert-object',
      slideId: artifact.document.slides[0]!.id,
      bounds: { x: 0, y: 0, width: 240, height: 160 },
      object: { kind: 'shape', geometry: shape },
    }).document.slides[0]!.objects.at(-1)!.drawingGeometry;
  });
  const preview = $derived(
    sourceGeometry && placement && placement.bounds.width > 0 && placement.bounds.height > 0
      ? resizeDrawingGeometry(sourceGeometry, placement.bounds.width, placement.bounds.height)
      : undefined,
  );

  onMount(() => {
    const previous = document.activeElement;
    surface?.focus({ preventScroll: true });
    return () => {
      if (
        document.activeElement === surface &&
        previous instanceof HTMLElement &&
        previous.isConnected
      )
        previous.focus({ preventScroll: true });
    };
  });
  function point(event: PointerEvent) {
    const rect = surface!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, ((event.clientX - rect.left) * width) / rect.width)),
      y: Math.max(0, Math.min(height, ((event.clientY - rect.top) * height) / rect.height)),
    };
  }
  function stop(event: Event) {
    event.preventDefault();
    event.stopPropagation();
  }
  function cancel() {
    drag = undefined;
    oncancel();
  }
  function down(event: PointerEvent) {
    if (event.button !== 0 || drag) return;
    stop(event);
    surface?.setPointerCapture(event.pointerId);
    constrained = event.shiftKey;
    const start = point(event);
    drag = {
      pointer: event.pointerId,
      start,
      end: start,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
    };
  }
  function move(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    stop(event);
    constrained = event.shiftKey;
    drag = {
      ...drag,
      end: point(event),
      moved:
        drag.moved || Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 4,
    };
  }
  function defaultPlacement(point: { x: number; y: number }): ShapePlacement {
    const w = Math.min(240, width),
      h = shape === 'line' ? 0 : Math.min(160, height);
    return {
      bounds: {
        x: Math.max(0, Math.min(width - w, point.x - w / 2)),
        y: Math.max(0, Math.min(height - h, point.y - h / 2)),
        width: w,
        height: h,
      },
      rotation: 0,
    };
  }
  function up(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    move(event);
    const result = drag.moved ? placement : defaultPlacement(drag.start);
    drag = undefined;
    if (!result || result.bounds.width <= 0 || (shape !== 'line' && result.bounds.height <= 0))
      return;
    oninsert(result);
  }
</script>

<svelte:window
  onblur={cancel}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      stop(event);
      cancel();
    } else if (event.key === 'Shift') constrained = true;
  }}
  onkeyup={(event) => {
    if (event.key === 'Shift') constrained = false;
  }}
/>
<foreignObject {width} {height}>
  <button
    bind:this={surface}
    class="placement-layer"
    aria-label="Place shape on slide. Drag to size, hold Shift to constrain, or press Enter to insert. Escape cancels."
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={cancel}
    onlostpointercapture={() => {
      drag = undefined;
    }}
    onkeydown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        stop(event);
        if (!drag) oninsert(defaultPlacement({ x: width / 2, y: height / 2 }));
      }
    }}
    onclick={stop}
  ></button>
</foreignObject>
{#if placement && drag?.moved}
  <g
    class="preview"
    transform={`translate(${placement.bounds.x} ${placement.bounds.y}) rotate(${placement.rotation} ${placement.bounds.width / 2} ${placement.bounds.height / 2})`}
    aria-hidden="true"
  >
    {#if shape === 'line'}
      <line x1="0" y1="0" x2={placement.bounds.width} y2="0" />
    {:else if preview}
      {#each preview.paths as path}<path d={path.d} />{/each}
    {/if}
  </g>
{/if}

<style>
  .placement-layer {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: crosshair;
    touch-action: none;
    outline: none;
  }
  .preview {
    pointer-events: none;
    fill: #4472c430;
    stroke: #4472c4;
    stroke-width: 1.5;
  }
  .preview :is(path, line) {
    vector-effect: non-scaling-stroke;
  }
</style>
