<script lang="ts">
  import { onDestroy } from 'svelte';
  import { beginPdfBoxPreview } from './pdf-box-preview.ts';
  import type { PdfTextModel, PdfFlowRegion } from '@tumblerjs/pdf';
  let {
    model,
    layout,
    revision,
    editable,
    group,
    origins,
    onedit,
  }: {
    model: PdfTextModel;
    layout: PdfFlowRegion;
    revision: number;
    editable: boolean;
    onedit: () => void;
    group: string[];
    origins: ReadonlyMap<string, PdfFlowRegion['origin']>;
  } = $props();
  const frame = $derived.by(() => {
    void revision;
    return { ...model.geometry(layout.id), ...layout.origin };
  });
  const box = $derived.by(() => {
    void revision;
    const seed = model.seed(layout.id);
    if (
      model.sourcePreserved(layout.id) &&
      layout.origin.continuation === 0 &&
      layout.carets[0]?.offset === 0 &&
      layout.carets.at(-1)?.offset === model.text(layout.id).length &&
      seed.bounds
    )
      return {
        x: seed.bounds.x + frame.x - seed.x,
        y: seed.bounds.y + (layout.carets[0]?.y ?? frame.y) - seed.y,
        width: seed.bounds.width,
        height: seed.bounds.height,
      };
    return { x: frame.x, y: layout.top, width: frame.width, height: layout.bottom - layout.top };
  });
  let gesture:
    | {
        x: number;
        y: number;
        box: typeof box;
        resize: boolean;
        captureTimeout: number;
        scale: number;
        xs: number[];
        ys: number[];
        dx: number;
        dy: number;
        changed: boolean;
        preview?: ReturnType<typeof beginPdfBoxPreview>;
        members: {
          id: string;
          frame: ReturnType<PdfTextModel['geometry']>;
          initial: ReturnType<PdfTextModel['placement']>;
        }[];
      }
    | undefined;
  let node: HTMLDivElement;
  let guide = $state('');
  onDestroy(() => {
    if (gesture) {
      gesture.preview?.finish(true);
      model.undo.captureTimeout = gesture.captureTimeout;
      model.undo.stopCapturing();
    }
  });
  function begin(event: PointerEvent, resize = false) {
    if (!editable || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    node.focus({ preventScroll: true });
    node.setPointerCapture(event.pointerId);
    model.undo.stopCapturing();
    const scale = new DOMMatrix(getComputedStyle(node.parentElement!).transform).a;
    const page = node.closest('.pdf-page')!,
      rect = page.getBoundingClientRect();
    const width = rect.width / scale,
      height = rect.height / scale;
    const xs = [0, 24, 48, width / 2, width - 48, width - 24, width],
      ys = [0, 24, 48, height / 2, height - 48, height - 24, height];
    for (const id of model.ids(frame.page)) {
      if (group.includes(id) || model.placement(id)?.hidden) continue;
      const s = model.seed(id),
        p = model.geometry(id),
        b = s.bounds;
      xs.push(p.x + (b ? b.x - s.x : 0));
      ys.push(p.y + (b ? b.y - s.y : 0));
    }
    gesture = {
      x: event.clientX,
      y: event.clientY,
      box: { ...box },
      resize,
      scale,
      xs,
      ys,
      dx: 0,
      dy: 0,
      changed: false,
      preview: resize ? undefined : beginPdfBoxPreview(node, group),
      captureTimeout: model.undo.captureTimeout,
      members: group.map((id) => ({
        id,
        frame: { ...model.geometry(id), ...origins.get(id) },
        initial: model.placement(id),
      })),
    };
    model.undo.captureTimeout = Number.MAX_SAFE_INTEGER;
  }
  $effect(() => {
    if (!editable) finish(undefined, true);
  });
  function move(event: PointerEvent) {
    if (!gesture) return;
    if (!editable) {
      finish(undefined, true);
      return;
    }
    const { scale, xs, ys } = gesture;
    let dx = (event.clientX - gesture.x) / scale,
      dy = (event.clientY - gesture.y) / scale;
    if (event.shiftKey && !gesture.resize) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    guide = '';
    if (gesture.resize) {
      gesture.changed = true;
      model.place(layout.id, {
        x: frame.x,
        y: frame.y,
        continuation: layout.origin.continuation,
        width: Math.max(1, gesture.box.width + dx),
      });
      return;
    }
    if (!event.altKey) {
      const snap = (value: number, size: number, targets: number[]) => {
        let best = 4 / scale,
          adjustment = 0;
        for (const target of targets)
          for (const edge of [value, value + size / 2, value + size]) {
            const distance = target - edge;
            if (Math.abs(distance) < best) {
              best = Math.abs(distance);
              adjustment = distance;
            }
          }
        return adjustment;
      };
      const sx = snap(gesture.box.x + dx, gesture.box.width, xs),
        sy = snap(gesture.box.y + dy, gesture.box.height, ys);
      if (!event.shiftKey || dx !== 0) dx += sx;
      if (!event.shiftKey || dy !== 0) dy += sy;
      if (sx || sy) guide = 'Snapped';
    }
    gesture.dx = dx;
    gesture.dy = dy;
    gesture.preview?.move(dx, dy);
  }
  function finish(event?: PointerEvent, cancel = false) {
    if (!gesture) return;
    cancel ||= !editable;
    if (cancel && editable && gesture.resize && gesture.changed) {
      model.doc.transact(() => {
        for (const member of gesture!.members) {
          const region = model.regions.get(member.id)!;
          if (member.initial) region.set('placement', member.initial);
          else region.delete('placement');
        }
      }, model.origin);
    }
    if (!cancel && !gesture.resize && (gesture.dx || gesture.dy)) {
      const { members, dx, dy } = gesture;
      model.doc.transact(() => {
        for (const member of members)
          model.place(member.id, {
            x: member.frame.x + dx,
            y: member.frame.y + dy,
            ...(member.frame.continuation === undefined
              ? {}
              : { continuation: member.frame.continuation }),
          });
      }, model.origin);
    }
    gesture.preview?.finish(cancel);
    model.undo.captureTimeout = gesture.captureTimeout;
    gesture = undefined;
    guide = '';
    model.undo.stopCapturing();
    if (event && node.hasPointerCapture(event.pointerId))
      node.releasePointerCapture(event.pointerId);
  }
  function key(event: KeyboardEvent) {
    if (!editable) return;
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      model.doc.transact(() => {
        for (const id of group)
          model.move(
            id,
            direction[0] * (event.shiftKey ? 10 : 1),
            direction[1] * (event.shiftKey ? 10 : 1),
            origins.get(id),
          );
      }, model.origin);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      onedit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(undefined, true);
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      model.undo.stopCapturing();
      model.doc.transact(() => {
        for (const id of group) model.hide(id);
      }, model.origin);
      model.undo.stopCapturing();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) model.undo.redo();
      else model.undo.undo();
    }
  }
</script>

<div
  bind:this={node}
  class="text-box"
  data-pdf-text-box={layout.id}
  role="toolbar"
  aria-label="Selected text box"
  tabindex="0"
  style:left={`${box.x - 4}px`}
  style:top={`${box.y - 4}px`}
  style:width={`${box.width + 8}px`}
  style:height={`${box.height + 8}px`}
  onpointerdown={(e) => begin(e)}
  onpointermove={move}
  onpointerup={(e) => finish(e)}
  onpointercancel={(e) => finish(e, true)}
  onlostpointercapture={() => finish(undefined, true)}
  onkeydown={key}
>
  {#if editable}
    <button
      class="move"
      aria-label="Move text box"
      title="Drag to move · Shift-click text to select more · arrows to nudge · Shift for 10 points · Alt to skip snapping"
      onpointerdown={(e) => begin(e)}>⠿</button
    >
    <button
      class="resize"
      aria-label="Resize text box"
      title="Drag to change wrapping width"
      onpointerdown={(e) => begin(e, true)}
    ></button>
  {/if}
  {#if guide}<span class="guide">{guide}</span>{/if}
</div>

<style>
  .text-box {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid #438ef1;
    pointer-events: none;
    outline: none;
    z-index: 4;
  }
  .text-box:focus {
    border-color: #146ce0;
    box-shadow: 0 0 0 1px #438ef144;
  }
  .text-box::before {
    content: '';
    position: absolute;
    inset: -4px;
    border: 5px solid transparent;
    /* Only the border moves the box; its interior must pass clicks through to the text. */
    clip-path: polygon(
      evenodd,
      0 0, 100% 0, 100% 100%, 0 100%, 0 0,
      5px 5px, calc(100% - 5px) 5px,
      calc(100% - 5px) calc(100% - 5px), 5px calc(100% - 5px), 5px 5px
    );
    pointer-events: auto;
    cursor: move;
  }
  button {
    position: absolute;
    pointer-events: auto;
    border: 1px solid #438ef1;
    background: white;
    color: #146ce0;
    padding: 0;
    box-sizing: border-box;
  }
  .move {
    left: calc(50% - 12px);
    top: -20px;
    width: 24px;
    height: 19px;
    border-radius: 3px 3px 0 0;
    font-size: 16px;
    line-height: 16px;
    cursor: move;
  }
  .resize {
    right: -4px;
    top: calc(50% - 4px);
    width: 8px;
    height: 8px;
    cursor: ew-resize;
  }
  .guide {
    position: absolute;
    top: 100%;
    left: 0;
    font: 9px sans-serif;
    color: #146ce0;
    background: white;
    white-space: nowrap;
  }
</style>
