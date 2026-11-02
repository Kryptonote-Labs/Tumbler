<script lang="ts">
  import { presentationSearchHighlights } from './presentation-search-highlights.ts';
  import type { PresentationSearchMatch } from '@tumblerjs/slides';
  import PresentationRemoteSelections from './PresentationRemoteSelections.svelte';
  import type { PresentationRemoteSelection } from './presentation-presence.ts';
  import PresentationFormattingToolbar from "./PresentationFormattingToolbar.svelte";
  import {
    slideObjectEnclosed,
    translateSlideObject,
    type SlideSelectionRect,
    presentationFormattingState,
    presentationTextTarget,
    type PresentationTableCellAddress,
    shapeMatrix,
    multiply,
    resizeSlideTransform,
    slideTextValue,
    type PresentationTextRange,
    type PresentationTextEdit,
    type PresentationFormatChange,
    type PresentationShapeChange,
    type PresentationShapeStyle,
    type SlideText,
  } from "@tumblerjs/slides";
  import type { FormattingPatch, FormattingState } from "@tumblerjs/core";
  import { onDestroy, onMount, tick, setContext, untrack, type Snippet } from "svelte";
  import type {
    PresentationDocument,
    PresentationObjectChange,
    PresentationSlide,
    SlideObject,
  } from "@tumblerjs/slides";
  import PresentationReflection from "./PresentationReflection.svelte";
  import PresentationShape from "./PresentationShape.svelte";
  import PresentationGradient from "./PresentationGradient.svelte";
  import {
    loadPresentationFonts,
    presentationFontContext,
    type PresentationFontContext,
  } from "./presentation-fonts.ts";
  import { presentationPlayback, nextPresentationAnimationStep } from "./presentation-playback.ts";
  import PresentationPattern from "./PresentationPattern.svelte";
  import PresentationPictureFill from "./PresentationPictureFill.svelte";
  import PresentationMedia from "./PresentationMedia.svelte";
  import PresentationText from "./PresentationText.svelte";
  import { placeholderPrompt } from "./presentation-prompt.ts";
  import PresentationTable from "./PresentationTable.svelte";
  import OoxmlChart from "./OoxmlChart.svelte";
  import { zoomGesture } from "./zoom-gesture.ts";

  let {
    searchMatches = [],
    currentSearchMatch,
    presentation,
    slide,
    thumbnail = false,
    playing: controlledPlaying,
    toolbar = true,
    onselectionchange,
    editable = false,
    scale = $bindable(1),
    selectedKey = $bindable<string | undefined>(),
    selectedKeys = $bindable<string[]>([]),
    onobjectschange,
    onobjectchange,
    ontextchange,
    ontextedit,
    onformat,
    onshapechange,
    onundo,
    onslide,
    overlay,
    remoteSelections = [],
  }: {
    searchMatches?: readonly PresentationSearchMatch[];
    currentSearchMatch?: PresentationSearchMatch | undefined;
    presentation: PresentationDocument;
    slide: PresentationSlide;
    thumbnail?: boolean;
    /** Play existing slide effects without showing playback controls. */
    playing?: boolean;
    /** Host decorations in slide coordinates, excluded from thumbnail views. */
    overlay?: Snippet;
    /** Named remote selections. Hosts resolve document revisions before providing them. */
    remoteSelections?: readonly PresentationRemoteSelection[];
    toolbar?: boolean;
    onselectionchange?: (selection: {object:SlideObject | undefined;state:FormattingState; range: ReturnType<typeof currentSelection>}) => void;
    editable?: boolean;
    scale?: number;
    selectedKey?: string;
    selectedKeys?: string[];
    onobjectschange?: (changes: PresentationObjectChange[]) => void;
    onslide?: (part: string) => void;
    ontextedit?: (change: PresentationTextEdit, undoGroup?: string) => void;
    onformat?: (change: PresentationFormatChange) => void;
    onshapechange?: (change: PresentationShapeChange) => void;
    onundo?: (redo: boolean) => void;
    onobjectchange?: (change: PresentationObjectChange) => void;
    ontextchange?: (change: {
      slideId: string;
      objectKey: string;
      value: string;
    }) => void;
  } = $props();
  const viewId = $props.id();
  let host = $state<HTMLDivElement>();
  let svg = $state<SVGSVGElement>();
  let width = $state(800),
    height = $state(500);
  // A host-controlled show is edge to edge; the editing gutter would letterbox every slide.
  const stage = $derived(!thumbnail && controlledPlaying === true);
  const gutter = $derived(thumbnail || stage ? 0 : 32);
  let fit = $derived(
    Math.max(
      0.001,
      Math.min(
        (width - gutter) / presentation.width,
        (height - gutter) / presentation.height,
      ),
    ),
  );
  let factor = $derived(fit * scale);
  let selected = $derived(
    slide.objects.find((item) => item.key === selectedKey),
  );
  let selectedObjects = $derived(slide.objects.filter(object => selectedKeys.includes(object.key)));
  let lastSelectedKey: string | undefined;
  let lastSelectedKeys: string[] | undefined;
  function select(keys: string[]) {
    selectedKeys = keys;
    selectedKey = keys.at(-1);
    lastSelectedKey = keys.at(-1);
    lastSelectedKeys = untrack(() => selectedKeys);
  }
  // Accept host updates through either binding without overwriting the other with stale state.
  $effect(() => {
    const keys = selectedKeys;
    const key = selectedKey;
    if (lastSelectedKeys === undefined)
      select(keys.length ? keys : key ? [key] : []);
    else if (keys !== lastSelectedKeys) select(keys);
    else if (key !== lastSelectedKey) select(key ? [key] : []);
  });
  $effect(() => {
    const remaining = selectedKeys.filter(key => slide.objects.some(object => object.key === key));
    if (remaining.length !== selectedKeys.length) select(remaining);
  });
  function commit(changes: PresentationObjectChange[]) {
    if (!changes.length) return;
    if (onobjectschange) onobjectschange(changes);
    else for (const change of changes) onobjectchange?.(change);
  }
  let activeCell = $state<
    PresentationTableCellAddress & { objectKey: string }
  >();
  let cellAddress = $derived.by(() => {
    if (activeCell?.objectKey !== selectedKey || !selected?.table) return undefined;
    // Structural edits can remove a cell or make it part of a larger merged cell.
    const cells = selected.table.cells;
    const cell = cells.find((cell) =>
      activeCell!.row >= cell.row && activeCell!.row < cell.row + cell.rowSpan &&
      activeCell!.column >= cell.column && activeCell!.column < cell.column + cell.columnSpan,
    ) ?? cells.at(-1);
    return cell ? { row: cell.row, column: cell.column } : undefined;
  });
  let textTarget = $derived(
    selected && selectedKeys.length === 1 ? presentationTextTarget(selected, cellAddress) : undefined,
  );
  function selectCell(
    object: SlideObject,
    address: PresentationTableCellAddress,
  ) {
    if (
      editing &&
      (selectedKey !== object.key ||
        cellAddress?.row !== address.row ||
        cellAddress?.column !== address.column)
    )
      editing = undefined;
    select([object.key]);
    if (
      activeCell?.objectKey !== object.key ||
      activeCell.row !== address.row ||
      activeCell.column !== address.column
    ) {
      activeCell = {
        objectKey: object.key,
        row: address.row,
        column: address.column,
      };
      pendingFormat = undefined;
    }
  }
  function editCell(
    object: SlideObject,
    address: PresentationTableCellAddress,
    event?: MouseEvent,
  ) {
    selectCell(object, address);
    void edit(presentationTextTarget(object, address), event);
  }
  function navigateCell(backward: boolean) {
    if (!selected?.table || !cellAddress) return false;
    const cells = selected.table.cells.filter((cell) => cell.text?.editable);
    const index = cells.findIndex(
      (cell) =>
        cell.row === cellAddress.row && cell.column === cellAddress.column,
    );
    const next = cells[index + (backward ? -1 : 1)];
    if (!next) {
      editing = undefined;
      return false;
    }
    editCell(selected, next);
    return true;
  }
  const handles = [
    { x: -1, y: -1, name: "top left", cursor: "nwse-resize" },
    { x: 0, y: -1, name: "top", cursor: "ns-resize" },
    { x: 1, y: -1, name: "top right", cursor: "nesw-resize" },
    { x: -1, y: 0, name: "left", cursor: "ew-resize" },
    { x: 1, y: 0, name: "right", cursor: "ew-resize" },
    { x: -1, y: 1, name: "bottom left", cursor: "nesw-resize" },
    { x: 0, y: 1, name: "bottom", cursor: "ns-resize" },
    { x: 1, y: 1, name: "bottom right", cursor: "nwse-resize" },
  ] as const;
  type Handle = (typeof handles)[number];
  let previews = $state<PresentationObjectChange[]>([]);
  let marquee = $state<{
    pointer: number;
    start: { x: number; y: number };
    rect: SlideSelectionRect;
    base: string[];
    clientX: number;
    clientY: number;
    moved: boolean;
  }>();
  let drag:
    | {
        objects: SlideObject[];
        pointer: number;
        x: number;
        y: number;
        object: SlideObject;
        mode: "move" | "rotate" | Handle;
        center: { x: number; y: number };
        inverse: DOMMatrix;
      }
    | undefined;
  let editing = $state<string>();
  let textHead = $state(0);
  let textRange = $state<PresentationTextRange>({ start: 0, end: 0 });
  let editPoint = $state<{ x: number; y: number }>();
  let focusToken = $state(0);
  let pendingFormat = $state<FormattingPatch>();
  let formattingState = $derived.by(() => {
    const state = presentationFormattingState(
      textTarget,
      editing ? textRange : undefined,
    );
    const text = { ...state.text };
    const p = pendingFormat?.text;
    if (p?.bold && "set" in p.bold)
      text.bold = { state: "value", value: p.bold.set };
    if (p?.italic && "set" in p.italic)
      text.italic = { state: "value", value: p.italic.set };
    if (p?.underline && "set" in p.underline)
      text.underline = { state: "value", value: p.underline.set };
    if (p?.fontFamily && "set" in p.fontFamily)
      text.fontFamily = { state: "value", value: p.fontFamily.set };
    if (p?.fontSize && "set" in p.fontSize)
      text.fontSize = { state: "value", value: p.fontSize.set };
    if (p?.color && "set" in p.color)
      text.color = { state: "value", value: p.color.set };
    return { ...state, text };
  });
  export function applyFormatting(patch: FormattingPatch) { format(patch); }
  export function currentSelection(): PresentationTextRange & {
    objectKey?: string; editing?: boolean; head?: number; cell?: PresentationTableCellAddress;
  } {
    if(!selected || !textTarget) return {start:0,end:0};
    return {objectKey:selected.key, editing:!!editing, ...(editing ? {head:textHead} : {}), ...(cellAddress ? {cell:cellAddress} : {}), ...(editing ? textRange : {start:0,end:slideTextValue(textTarget).length})};
  }
  $effect(() => {onselectionchange?.({object:textTarget,state:formattingState,range:currentSelection()});});
  function format(patch: FormattingPatch) {
    if (!selected || !textTarget?.textEditable) return;
    if (editing && textRange.start === textRange.end && !patch.block) {
      pendingFormat = { text: { ...pendingFormat?.text, ...patch.text } };
      focusToken++;
      return;
    }
    const range = editing
      ? textRange
      : { start: 0, end: slideTextValue(textTarget).length };
    onformat?.({
      slideId: slide.id,
      objectKey: selected.key,
      cell: cellAddress,
      ...range,
      patch,
    });
    if (editing) focusToken++;
  }
  function shortcut(key: "bold" | "italic" | "underline") {
    const value = formattingState.text[key];
    const active =
      (value.state === "value" || value.state === "inherited") &&
      !!value.value &&
      value.value !== "none";
    format(
      key === "underline"
        ? { text: { underline: { set: active ? "none" : "single" } } }
        : { text: { [key]: { set: !active } } },
    );
  }
  function shapeStyle(patch: PresentationShapeStyle) {
    if (selected)
      onshapechange?.({ slideId: slide.id, objectKey: selected.key, ...patch });
  }
  function replace(
    object: SlideObject,
    range: PresentationTextRange,
    value: string,
    undoGroup?: string,
  ) {
    if (ontextedit)
      ontextedit({
        slideId: slide.id,
        objectKey: object.key,
        cell: object.table ? cellAddress : undefined,
        ...range,
        value,
        formatting: pendingFormat,
      }, undoGroup);
    else {
      const old = slideTextValue(object);
      ontextchange?.({
        slideId: slide.id,
        objectKey: object.key,
        value: old.slice(0, range.start) + value + old.slice(range.end),
      });
    }
  }
  let loadedFonts = $state<ReturnType<typeof loadPresentationFonts>>();
  setContext<PresentationFontContext>(presentationFontContext, {
    family: (name) => loadedFonts?.family(name) ?? JSON.stringify(name),
  });
  $effect(() => {
    const loaded = loadPresentationFonts(presentation.embeddedFonts ?? []);
    loadedFonts = loaded;
    return loaded.destroy;
  });
  let manualPlaying = $state(false);
  const playing = $derived(controlledPlaying ?? manualPlaying);
  $effect(() => { slide.part; manualPlaying = false; });
  let playbackStep = $state(0);
  $effect(() => {
    slide.part;
    playing;
    playbackStep = 0;
  });
  /** Consume the next click group; false lets the host advance to another slide. */
  export function advanceAnimation() {
    if (!playing || editable || thumbnail) return false;
    const next = nextPresentationAnimationStep(slide, playbackStep);
    if (next === undefined) return false;
    playbackStep = next;
    return true;
  }
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
  let fittedHeights = $state.raw<
    Record<string, { text: SlideText; height: number }>
  >({});
  function objectHeight(object: SlideObject) {
    const fitted = fittedHeights[object.key];
    return fitted && fitted.text === object.text
      ? Math.max(object.transform.height, fitted.height)
      : object.transform.height;
  }
  const images = new Map<Uint8Array, string>();
  function imageUrl(object: SlideObject) {
    if (!mounted || !object.image) return "";
    const existing = images.get(object.image.bytes);
    if (existing) return existing;
    const url = URL.createObjectURL(
      new Blob([Uint8Array.from(object.image.bytes).buffer], {
        type: object.image.contentType,
      }),
    );
    images.set(object.image.bytes, url);
    return url;
  }
  $effect(() => {
    const current = new Set(
      slide.objects.flatMap((item) => (item.image ? [item.image.bytes] : [])),
    );
    for (const [bytes, url] of images)
      if (!current.has(bytes)) {
        URL.revokeObjectURL(url);
        images.delete(bytes);
      }
  });
  onDestroy(() => {
    for (const url of images.values()) URL.revokeObjectURL(url);
  });
  let slideId = $derived(slide.id);
  $effect(() => {
    const id = slideId;
    void id;
    select([]);
    editing = undefined;
    activeCell = undefined;
    cancel();
  });
  $effect(() => {
    if (!editable) {
      editing = undefined;
      select([]);
      cancel();
    }
  });
  function start(
    event: PointerEvent,
    object: SlideObject,
    mode: "move" | "rotate" | Handle = "move",
  ) {
    if (!editable || event.button !== 0) return;
    if (editing === object.key) return;
    if (editing) {
      editing = undefined;
      pendingFormat = undefined;
    }
    event.stopPropagation();
    if (event.shiftKey && mode === "move") {
      event.preventDefault();
      select(selectedKeys.includes(object.key)
        ? selectedKeys.filter(key => key !== object.key)
        : [...selectedKeys, object.key]);
      svg?.focus({ preventScroll: true });
      return;
    }
    if (mode !== "move" || !selectedKeys.includes(object.key)) select([object.key]);
    if (!object.movable || !(onobjectchange || onobjectschange)) return;
    event.preventDefault();
    const matrix = svg?.getScreenCTM();
    if (!matrix) return;
    const parent = new DOMMatrix(
      object.parentMatrix ? [...object.parentMatrix] : undefined,
    );
    const inverse = new DOMMatrix([
      matrix.a,
      matrix.b,
      matrix.c,
      matrix.d,
      matrix.e,
      matrix.f,
    ])
      .multiply(parent)
      .inverse();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      inverse,
    );
    drag = {
      objects: mode === "move" ? selectedObjects.filter(item => item.movable) : [object],
      pointer: event.pointerId,
      x: point.x,
      y: point.y,
      object,
      mode,
      center: {
        x: object.transform.x + object.transform.width / 2,
        y: object.transform.y + object.transform.height / 2,
      },
      inverse,
    };
    svg?.focus({ preventScroll: true });
  }
  function move(event: PointerEvent) {
    if (marquee && marquee.pointer === event.pointerId) {
      const matrix = svg?.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      const start = marquee.start;
      marquee.rect = {
        x: Math.min(start.x, point.x), y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y),
      };
      marquee.moved ||= Math.hypot(event.clientX - marquee.clientX, event.clientY - marquee.clientY) >= 4;
      if (marquee.moved) select([...new Set([...marquee.base, ...slide.objects
        .filter(object => object.movable && slideObjectEnclosed(object, marquee!.rect,
          objectHeight(object)))
        .map(object => object.key)])]);
      return;
    }
    if (!drag || event.pointerId !== drag.pointer) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      drag.inverse,
    );
    const dx = point.x - drag.x,
      dy = point.y - drag.y;
    const { transform, key } = drag.object;
    if (Math.hypot(dx, dy) < 5 / factor) {
      previews = [];
      return;
    }
    svg?.setPointerCapture(event.pointerId);
    let next = { ...transform };
    if (drag.mode === "rotate") {
      const initial = Math.atan2(
        drag.y - drag.center.y,
        drag.x - drag.center.x,
      );
      const current = Math.atan2(
        point.y - drag.center.y,
        point.x - drag.center.x,
      );
      const angle = transform.rotation + ((current - initial) * 180) / Math.PI;
      next.rotation =
        (((event.shiftKey ? Math.round(angle / 15) * 15 : angle) % 360) + 360) %
        360;
    } else if (drag.mode === "move")
      next = { ...transform, x: transform.x + dx, y: transform.y + dy };
    else next = resizeSlideTransform(transform, drag.mode, dx, dy, {
      preserveAspectRatio: drag.object.kind === "picture" || event.shiftKey,
    });
    if (drag.mode === "move") {
      const parent = drag.object.parentMatrix ?? [1, 0, 0, 1, 0, 0];
      const sx = parent[0] * dx + parent[2] * dy;
      const sy = parent[1] * dx + parent[3] * dy;
      previews = drag.objects.map(object => ({ slideId: slide.id, objectKey: object.key, ...translateSlideObject(object, sx, sy) }));
    } else previews = [{ slideId: slide.id, objectKey: key, ...next }];
  }
  function resizeKey(
    event: KeyboardEvent,
    object: SlideObject,
    handle: Handle,
  ) {
    const dx =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const dy = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const inverse = new DOMMatrix(
      object.parentMatrix ? [...object.parentMatrix] : undefined,
    ).inverse();
    const delta = new DOMPoint(dx * step, dy * step, 0, 0).matrixTransform(
      inverse,
    );
    commit([{
      slideId: slide.id,
      objectKey: object.key,
      ...resizeSlideTransform(object.transform, handle, delta.x, delta.y, {
        preserveAspectRatio: object.kind === "picture" || event.shiftKey,
      }),
    }]);
  }

  function finish(event: PointerEvent) {
    if (event.pointerId === marquee?.pointer) {
      marquee = undefined;
      return;
    }
    if (event.pointerId !== drag?.pointer) return;
    const changes = previews;
    cancel();
    commit(changes);
  }
  function cancel() {
    const pointer = drag?.pointer;
    drag = undefined;
    previews = [];
    marquee = undefined;
    if (pointer !== undefined && svg?.hasPointerCapture(pointer))
      svg.releasePointerCapture(pointer);
  }
  async function edit(object: SlideObject, event?: MouseEvent) {
    if (!editable || !object.textEditable || !(ontextedit || ontextchange))
      return;
    cancel();
    select([object.key]);
    editPoint = event ? { x: event.clientX, y: event.clientY } : undefined;
    textRange = { start: 0, end: slideTextValue(object).length };
    textHead = textRange.end;
    pendingFormat = undefined;
    editing = object.key;
  }
  function keydown(event: KeyboardEvent) {
    if (editing) return;
    if (event.key === "Escape") {
      cancel();
      select([]);
      return;
    }
    if (!editable || !selected) return;
    if (
      onformat && textTarget?.textEditable &&
      (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
    ) {
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i" || key === "u") {
        event.preventDefault();
        event.stopPropagation();
        shortcut(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
        return;
      }
    }
    if (event.key === "Enter" && selectedKeys.length === 1) {
      event.preventDefault();
      if (selected.table) {
        const cell = cellAddress ?? selected.table.cells[0];
        if (cell) editCell(selected, cell);
      } else void edit(selected);
      return;
    }
    if (!(onobjectchange || onobjectschange) ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    commit(selectedObjects.filter(object => object.movable).map(object => ({
      slideId: slide.id, objectKey: object.key, ...translateSlideObject(object, dx, dy),
    })));
  }

  function blankSelection(node: HTMLElement) {
    const pointerdown = (event: PointerEvent) => {
      if (
        !editable ||
        event.button !== 0 ||
        !(event.target instanceof Element) ||
        event.target.closest("[data-slide-object]")
      )
        return;
      cancel();
      editing = undefined;
      activeCell = undefined;
      pendingFormat = undefined;
      textRange = { start: 0, end: 0 };
      const matrix = svg?.getScreenCTM();
      if (!matrix) return;
      event.preventDefault();
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      const base = event.shiftKey ? [...selectedKeys] : [];
      select(base);
      marquee = { pointer: event.pointerId, start: point,
        rect: { x: point.x, y: point.y, width: 0, height: 0 }, base,
        clientX: event.clientX, clientY: event.clientY, moved: false };
      const selection = window.getSelection();
      if (selection?.anchorNode && node.contains(selection.anchorNode))
        selection.removeAllRanges();
      svg?.focus({ preventScroll: true });
    };
    node.addEventListener("pointerdown", pointerdown);
    return {
      destroy() {
        node.removeEventListener("pointerdown", pointerdown);
      },
    };
  }
  function gestures(node: HTMLElement) {
    return thumbnail ? {} : zoomGesture(node, zoom);
  }
  async function zoom(gesture: {
    factor: number;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
  }) {
    if (!host) return;
    const bounds = svg?.getBoundingClientRect();
    if (!bounds) return;
    const x = (gesture.x - bounds.left) / factor,
      y = (gesture.y - bounds.top) / factor;
    scale = Math.max(0.25, Math.min(3, scale * gesture.factor));
    await tick();
    const next = svg?.getBoundingClientRect();
    if (next) {
      host.scrollLeft += next.left + x * factor - gesture.targetX;
      host.scrollTop += next.top + y * factor - gesture.targetY;
    }
  }
</script>

<svelte:window onpointermove={move} onpointerup={finish} onpointercancel={cancel} onblur={cancel} />
<div class="presentation-surface">
  {#if toolbar && editable && (onformat || onshapechange)}<PresentationFormattingToolbar
      object={textTarget}
      state={formattingState}
      onformat={format}
      onshape={shapeStyle}
    />{/if}
  {#if controlledPlaying === undefined && !thumbnail && !editable && slide.animations?.length}
    <div class="playback-controls">
      <button onclick={() => { manualPlaying = !manualPlaying; }}>
        {playing ? "Stop playback" : "Play animations"}
      </button>
      {#if playing}<button
          disabled={nextPresentationAnimationStep(slide, playbackStep) === undefined}
          onclick={() => advanceAnimation()}>Next animation</button>{/if}
    </div>
  {/if}
  <div
    class="presentation-view"
    bind:this={host}
    use:presentationSearchHighlights={{slide, matches: thumbnail ? [] : searchMatches, current: currentSearchMatch}}
    bind:clientWidth={width}
    bind:clientHeight={height}
    use:gestures
    use:blankSelection
    class:thumbnail
    class:stage
  >
    <div
      class="slide-space"
      style={`width:${Math.max(width, presentation.width * factor + gutter)}px;min-height:${Math.max(height, presentation.height * factor + gutter)}px`}
    >
      <!-- The slide surface handles keyboard manipulation only in Edit mode. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <svg
        use:presentationPlayback={{
          slide,
          playing: playing && !thumbnail,
          step: playbackStep,
          editable: editable || thumbnail,
        }}
        bind:this={svg}
        class="slide"
        role="group"
        aria-label={slide.title}
        tabindex={editable ? 0 : undefined}
        width={presentation.width * factor}
        height={presentation.height * factor}
        viewBox={`0 0 ${presentation.width} ${presentation.height}`}
        onpointerup={finish}
        onpointercancel={cancel}
        onlostpointercapture={cancel}
        onkeydown={keydown}
      >
        {#if !stage}<title>{slide.title}</title>{/if}
        {#if slide.backgroundPattern}<defs
            ><PresentationPattern
              pattern={slide.backgroundPattern}
              id={`${viewId}-background-pattern`}
            /></defs
          >{/if}
        {#if slide.backgroundPicture}<defs
            ><PresentationPictureFill
              picture={slide.backgroundPicture}
              id={`${viewId}-background-picture`}
              width={presentation.width}
              height={presentation.height}
            /></defs
          >{/if}
        {#if slide.backgroundGradient}<defs
            ><PresentationGradient
              gradient={slide.backgroundGradient}
              id={`${viewId}-background`}
              width={presentation.width}
              height={presentation.height}
            /></defs
          >{/if}
        <rect
          width={presentation.width}
          height={presentation.height}
          fill={slide.backgroundPattern
            ? `url(#${viewId}-background-pattern)`
            : slide.backgroundPicture
              ? `url(#${viewId}-background-picture)`
              : slide.backgroundGradient
                ? `url(#${viewId}-background)`
                : slide.background}
          role="presentation"
        />
        {#each slide.objects as object (object.key)}
          {@const change =
            previews.find(change => change.objectKey === object.key)}
          {@const w = change?.width ?? object.transform.width}
          {@const h = change?.height ?? objectHeight(object)}
          {@const matrix = change
            ? multiply(
                object.parentMatrix ?? [1, 0, 0, 1, 0, 0],
                shapeMatrix({ ...object.transform, ...change }),
              )
            : object.matrix}
          <!-- Object buttons are focusable only in Edit mode. -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <g
            transform={`matrix(${matrix.join(" ")})`}
            role={editable ? "button" : "group"}
            tabindex={editable ? 0 : undefined}
            aria-label={object.name}
            data-slide-object={object.key}
            data-object-width={w}
            data-object-height={h}
            data-animation-target={object.layer === "slide" &&
            object.sourcePart === slide.part
              ? object.shapeId
              : undefined}
            class:movable={editable && object.movable}
            onfocus={() => {
              if (editable && !selectedKeys.includes(object.key)) select([object.key]);
            }}
            onpointerdowncapture={(event) => {
              if (object.table && editing !== object.key &&
                (event.shiftKey || (selectedKeys.length > 1 && selectedKeys.includes(object.key))) &&
                event.target instanceof Element && event.target.closest("[data-table-cell]"))
                start(event, object);
            }}
            onpointerdown={(event) => start(event, object)}
            ondblclick={(event) => {
              if (editing !== object.key) void edit(object, event);
            }}
            onkeydown={(event) => {
              if (
                editable &&
                !editing &&
                (event.key === "Enter" || event.key === " ")
              ) {
                select([object.key]);
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Enter") {
                  if (object.table) {
                    const cell = cellAddress ?? object.table.cells[0];
                    if (cell) editCell(object, cell);
                  } else void edit(object);
                }
              }
            }}
          >
            {#if object.reflection && !object.media}
              <PresentationReflection
                reflection={object.reflection}
                width={w}
                height={h}
                source={`${viewId}-content-${object.elementId}`}
                id={`${viewId}-reflection-${object.elementId}`}
              />
            {/if}
            <g id={`${viewId}-content-${object.elementId}`}>
              {#if object.kind === "unsupported" && !object.media}
                <rect
                  width={w}
                  height={h}
                  fill="#eef0ee"
                  stroke="#99a49b"
                  stroke-dasharray="5 4"
                />
                <text x="12" y="24" fill="#55615a" font-size="14"
                  >Preview unavailable</text
                >
              {:else if object.media && !thumbnail}
                <foreignObject width={w} height={h}
                  ><PresentationMedia
                    media={object.media}
                    poster={object.image ? imageUrl(object) : undefined}
                    active={!editable}
                  /></foreignObject
                >
              {:else if object.kind === "picture" && object.image}
                <defs
                  ><PresentationPictureFill
                    picture={object.image}
                    id={`${viewId}-image-${object.elementId}`}
                    width={w}
                    height={h}
                  />
                  <clipPath
                    id={`${viewId}-clip-${object.elementId}`}
                    transform={`scale(${w / object.transform.width} ${h / object.transform.height})`}
                    >{#each object.drawingGeometry?.paths ?? [] as path}<path
                        d={path.d}
                      />{/each}</clipPath
                  ></defs
                >
                <rect
                  width={w}
                  height={h}
                  fill={`url(#${viewId}-image-${object.elementId})`}
                  clip-path={object.drawingGeometry?.paths.length
                    ? `url(#${viewId}-clip-${object.elementId})`
                    : undefined}
                />
              {:else if object.table}<PresentationTable
                  {onslide}
                  table={object.table}
                  width={w}
                  height={h}
                  editable={editable && !object.restriction}
                  selectedCell={selectedKey === object.key
                    ? cellAddress
                    : undefined}
                  editing={editing === object.key}
                  oncellselect={(cell) => selectCell(object, cell)}
                  oncellactivate={(cell, event) =>
                    editCell(object, cell, event)}
                  onnavigate={navigateCell}
                  editor={{
                    point: editPoint,
                    focusToken,
                    onselect: (range, head) => {
                      textHead = head ?? range.end;
                      if (
                        textRange.start !== range.start ||
                        textRange.end !== range.end
                      ) {
                        textRange = range;
                        pendingFormat = undefined;
                      }
                    },
                    onreplace: (range, value, undoGroup) => replace(object, range, value, undoGroup),
                    onfinish: () => {
                      editing = undefined;
                      pendingFormat = undefined;
                      svg?.focus();
                    },
                    onundo,
                    onshortcut: shortcut,
                  }}
                />
              {:else if object.kind === "chart" && object.chart}
                <foreignObject width={w} height={h}
                  ><div class="chart-frame">
                    <OoxmlChart
                      model={object.chart}
                      width={w}
                      height={h}
                      clipId={`${viewId}-slide-chart-${object.elementId}`}
                    />
                  </div></foreignObject
                >
              {:else}
                <PresentationShape
                  {object}
                  width={w}
                  height={h}
                  id={`${viewId}-shape-${object.elementId}`}
                />
              {/if}
              {#if object.text}
                {@const rect = object.drawingGeometry?.textRect ?? [
                  0,
                  0,
                  object.transform.width,
                  object.transform.height,
                ]}
                {@const sx = object.transform.width
                  ? w / object.transform.width
                  : 1}
                {@const sy = object.transform.height
                  ? h / object.transform.height
                  : 1}
                <foreignObject
                  style:overflow="visible"
                  x={rect[0] * sx}
                  y={rect[1] * sy}
                  width={Math.max(0, (rect[2] - rect[0]) * sx)}
                  height={Math.max(0, (rect[3] - rect[1]) * sy)}
                >
                  <PresentationText
                    text={(editable && editing !== object.key && placeholderPrompt(object)) ||
                      object.text}
                    linksEnabled={!editable}
                    onheight={(height) => {
                      if (object.text?.autoFit === "shape")
                        fittedHeights = {
                          ...fittedHeights,
                          [object.key]: { text: object.text, height },
                        };
                    }}
                    {onslide}
                    editor={{
                      active: editing === object.key,
                      point: editPoint,
                      focusToken,
                      onselect: (range, head) => {
                      textHead = head ?? range.end;
                        if (
                          textRange.start !== range.start ||
                          textRange.end !== range.end
                        ) {
                          textRange = range;
                          pendingFormat = undefined;
                        }
                      },
                      onreplace: (range, value, undoGroup) =>
                        replace(object, range, value, undoGroup),
                      onfinish: () => {
                        editing = undefined;
                        pendingFormat = undefined;
                        svg?.focus();
                      },
                      onundo,
                      onshortcut: shortcut,
                    }}
                  />
                </foreignObject>
              {/if}
            </g>
            {#if editable && object.placeholder && object.layer === 'slide' && object.textEditable && !slideTextValue(object) && editing !== object.key}
              <rect width={w} height={h} fill="none" stroke="#82928a" stroke-width="1" stroke-dasharray="5 4" pointer-events="none"/>
            {/if}
            {#if editable && editing !== object.key && !object.table}<rect
                class="hit"
                width={Math.max(w, 8)}
                height={Math.max(h, 8)}
                fill="transparent"
              />{/if}
            {#if editable && selectedKeys.includes(object.key)}
              <rect
                width={w}
                height={h}
                fill="none"
                stroke="#278044"
                stroke-width={1.5 / factor}
                pointer-events={object.table && editing !== object.key
                  ? "stroke"
                  : "none"}
                class:table-outline={!!object.table}
              />
              {#if selectedKeys.length === 1 && object.movable && (onobjectchange || onobjectschange) && editing !== object.key}
                <line
                  x1={w / 2}
                  y1="0"
                  x2={w / 2}
                  y2={-26 / factor}
                  stroke="#278044"
                  stroke-width={1 / factor}
                  pointer-events="none"
                />
                <circle
                  role="button"
                  tabindex="0"
                  aria-label={`Rotate ${object.name}`}
                  cx={w / 2}
                  cy={-26 / factor}
                  r={7 / factor}
                  fill="white"
                  stroke="#278044"
                  stroke-width={1.5 / factor}
                  class="rotate"
                  onpointerdown={(event) => start(event, object, "rotate")}
                  onkeydown={(event) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                        "Home",
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      const step = event.shiftKey ? 15 : 1;
                      commit([{
                        slideId: slide.id,
                        objectKey: object.key,
                        ...object.transform,
                        rotation:
                          event.key === "Home"
                            ? 0
                            : object.transform.rotation +
                              (["ArrowLeft", "ArrowDown"].includes(event.key)
                                ? -step
                                : step),
                      }]);
                    }
                  }}
                  ><title
                    >Drag to rotate. Hold Shift to snap to 15°. Arrow keys
                    rotate; Home resets.</title
                  ></circle
                >
                {#each handles as handle}
                  <rect
                    role="button"
                    tabindex="0"
                    aria-label={`Resize ${object.name} ${handle.name}`}
                    x={((handle.x + 1) * w) / 2 - 5 / factor}
                    y={((handle.y + 1) * h) / 2 - 5 / factor}
                    width={10 / factor}
                    height={10 / factor}
                    fill="white"
                    stroke="#278044"
                    stroke-width={1 / factor}
                    class="resize"
                    style:cursor={handle.cursor}
                    onpointerdown={(event) => start(event, object, handle)}
                    onkeydown={(event) => resizeKey(event, object, handle)}
                  />
                {/each}
              {/if}
            {/if}
          </g>
        {/each}
        {#if !thumbnail}{@render overlay?.()}{/if}
      </svg>
    </div>
    {#if !thumbnail && !playing && host && svg}
      <PresentationRemoteSelections {host} {svg} {slide} selections={remoteSelections} />
    {/if}
    {#if marquee?.moved && svg && host}
      <div class="marquee" style={`left:${svg.getBoundingClientRect().left - host.getBoundingClientRect().left + host.scrollLeft + marquee.rect.x * factor}px;top:${svg.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop + marquee.rect.y * factor}px;width:${marquee.rect.width * factor}px;height:${marquee.rect.height * factor}px`}></div>
    {/if}
  </div>
</div>

<style>
  .playback-controls { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid #333; }
  .playback-controls button { font: inherit; color: inherit; background: transparent; border: 1px solid #555; border-radius: 4px; padding: 5px 10px; }

  :global(::highlight(tumbler-slide-search)) { background-color: #ffe47a; color: #111; }
  :global(::highlight(tumbler-slide-search-current)) { background-color: #ffbd49; color: #111; }

  .presentation-surface {
    height: 100%;
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .thumbnail {
    overflow: hidden !important;
    background: white;
    pointer-events: none;
  }
  .thumbnail .slide-space {
    padding: 0;
  }
  .thumbnail .slide {
    box-shadow: none;
  }
  .marquee {
    position: absolute;
    pointer-events: none;
    border: 1px solid #278044;
    background: #27804422;
    box-sizing: border-box;
  }
  .presentation-view {
    position: relative;
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: auto;
    background: #e7e8ea;
    min-width: 0;
    min-height: 0;
  }
  .slide-space {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
  }
  .slide {
    flex: none;
    display: block;
    background: white;
    box-shadow: 0 1px 6px #0002;
    overflow: hidden;
    touch-action: pan-x pan-y;
  }
  .slide:focus-visible {
    outline: 2px solid #278044;
  }
  .stage {
    overflow: hidden;
    background: #000;
  }
  .stage .slide-space {
    padding: 0;
  }
  .stage .slide {
    box-shadow: none;
  }
  .movable {
    cursor: move;
  }
  .hit,
  .resize {
    touch-action: none;
  }
  .rotate {
    cursor: grab;
    touch-action: none;
  }
  .rotate:active {
    cursor: grabbing;
  }
  .table-outline {
    cursor: move;
  }
  .chart-frame {
    width: 100%;
    height: 100%;
  }
</style>
