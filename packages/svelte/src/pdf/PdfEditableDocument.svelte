<script lang="ts">
  import { pdfTextInputChange, type PdfInputSelection } from './text-input.ts';
  import { paintEditablePdfPage } from './paint-editable-page.ts';
  import PdfTextBox from './PdfTextBox.svelte';
  import PdfEditableText from './PdfEditableText.svelte';
  import { onMount, tick } from 'svelte';
  import * as Y from 'yjs';
  import {
    PdfInterpreter,
    PdfTextModel,
    PdfEditingFonts,
    layoutPdfTextFlow,
    layoutPdfText,
    movePdfTextCaret,
    pdfContinuationHeight,
    hitPdfText,
    defaultPdfTextStyle,
    pdfTextStylePatch,
    type PdfDocument,
    type PdfTextStyle,
  } from '@tumblerjs/pdf';
  type Selection = { region: string; anchor: number[]; head: number[] };
  let {
    document: pdf,
    model,
    fonts,
    scale = 4 / 3,
    editable = true,
    adding = false,
    peers = [],
    onselection,
    onadded,
    onpagechange,
    onpages,
    onstyle,
    onbox,
  }: {
    document: PdfDocument;
    model: PdfTextModel;
    fonts: PdfEditingFonts;
    scale?: number;
    editable?: boolean;
    adding?: boolean;
    peers?: { id: string; name: string; color: string; selection?: Selection | null }[];
    onselection?: (selection: Selection | null) => void;
    onadded?: () => void;
    onpagechange?: (index: number) => void;
    onpages?: (count: number) => void;
    onstyle?: (style: PdfTextStyle) => void;
    onbox?: (box: { x: number; y: number; width: number } | null) => void;
  } = $props();
  let revision = $state(0),
    active = $state<string>(),
    selected = $state<string[]>([]),
    start = $state(0),
    end = $state(0),
    pending = $state<Partial<PdfTextStyle>>({});
  let input: HTMLTextAreaElement, root: HTMLDivElement;
  let compositionBase: PdfTextModel | undefined;
  let beforeSelection: PdfInputSelection | undefined,
    compositionSelection: PdfInputSelection | undefined;
  let value = $state(''),
    composing = false,
    dragging: { id: string; anchor: number; page: number } | undefined;
  const interpreter = $derived(new PdfInterpreter(pdf));
  const flow = $derived.by(() => {
    void revision;
    fonts.importDocument(pdf);
    return layoutPdfTextFlow(model, fonts, pdf.pages);
  });
  const layouts = $derived(flow.regions);
  const origins = $derived(new Map(layouts.map((region) => [region.id, region.origin])));
  $effect(() => onpages?.(flow.pages.length));
  let anchors:
    | { first: ReturnType<PdfTextModel['anchor']>; last: ReturnType<PdfTextModel['anchor']> }
    | undefined;
  const currentStyle = $derived.by(() => {
    void revision;
    return active
      ? { ...model.styleAt(active, start + (end > start ? 1 : 0)), ...pending }
      : defaultPdfTextStyle;
  });
  $effect(() => onstyle?.(currentStyle));
  export function format(patch: Partial<PdfTextStyle>) {
    if (!editable || !active) return;
    if (window.document.activeElement !== input) {
      formatBox(patch);
      return;
    }
    model.undo.stopCapturing();
    if (start !== end) model.format(active, start, end, patch);
    else pending = { ...pending, ...pdfTextStylePatch(currentStyle, patch) };
    input?.focus({ preventScroll: true });
  }
  $effect(() => {
    void revision;
    onbox?.(active && !model.placement(active)?.hidden ? model.geometry(active) : null);
  });
  export function place(patch: { x?: number; y?: number; width?: number }) {
    if (!editable || !active) return;
    model.undo.stopCapturing();
    model.place(active, { ...origins.get(active), ...patch });
    model.undo.stopCapturing();
  }
  export function formatBox(patch: Partial<PdfTextStyle>) {
    if (!editable || !active) return;
    model.undo.stopCapturing();
    model.format(active, 0, model.text(active).length, patch);
    model.undo.stopCapturing();
  }
  export function removeBox() {
    if (!editable || !active) return;
    model.undo.stopCapturing();
    model.doc.transact(() => {
      for (const id of selected) model.hide(id);
    }, model.origin);
    model.undo.stopCapturing();
  }
  export function duplicateBox() {
    if (!editable || !active) return;
    const id = crypto.randomUUID();
    model.undo.stopCapturing();
    model.duplicate(active, id, origins.get(active));
    model.undo.stopCapturing();
    void select(id, 0);
  }
  export function toggle(key: 'bold' | 'italic' | 'underline') {
    format({ [key]: !currentStyle[key] });
  }
  export function undo(redo = false) {
    if (editable) {
      if (redo) model.undo.redo();
      else model.undo.undo();
    }
  }
  export function goToPage(index: number) {
    root.querySelector(`[data-pdf-page="${index + 1}"]`)?.scrollIntoView({ block: 'start' });
  }
  function publish() {
    if (!active || !input) return;
    start = input.selectionStart;
    end = input.selectionEnd;
    anchors = { first: model.anchor(active, start), last: model.anchor(active, end) };
    onselection?.({
      region: active,
      anchor: [...Y.encodeRelativePosition(Y.createRelativePositionFromJSON(anchors.first))],
      head: [...Y.encodeRelativePosition(Y.createRelativePositionFromJSON(anchors.last))],
    });
  }
  async function select(id: string, first: number, last = first, extend = false) {
    if (model.placement(id)?.hidden) return;
    selected = extend ? [...new Set([...selected, id])] : [id];
    active = id;
    start = Math.min(first, last);
    end = Math.max(first, last);
    pending = {};
    value = model.text(id).toString();
    await tick();
    input.focus({ preventScroll: true });
    input.setSelectionRange(start, end, first > last ? 'backward' : 'forward');
    publish();
  }
  function changed() {
    if (!editable || !active || composing) return;
    const base = compositionBase ?? model;
    const text = base.text(active).toString(),
      next = input.value;
    const operation = pdfTextInputChange(text, next, compositionSelection ?? beforeSelection, {
      start: input.selectionStart,
      end: input.selectionEnd,
    });
    beforeSelection = undefined;
    compositionSelection = undefined;
    const first = operation.start;
    const selection = [input.selectionStart, input.selectionEnd];
    const resolvedStart = model.resolve(base.anchor(active, first))?.offset ?? first;
    const resolvedEnd = model.resolve(base.anchor(active, operation.end))?.offset ?? resolvedStart;
    model.replace(active, resolvedStart, resolvedEnd, operation.insert, {
      ...base.styleAt(active, first + (operation.end > first ? 1 : 0)),
      ...pending,
    });
    value = model.text(active).toString();
    input.value = value;
    const shift = resolvedStart - first;
    input.setSelectionRange(selection[0]! + shift, selection[1]! + shift);
    compositionBase?.doc.destroy();
    compositionBase = undefined;
    publish();
  }
  function beforeInput(event: InputEvent) {
    if (composing) return;
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault();
      undo(event.inputType === 'historyRedo');
      return;
    }
    if (!composing) beforeSelection = { start: input.selectionStart, end: input.selectionEnd };
  }
  function key(event: KeyboardEvent) {
    if (!active || composing || event.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === 'Tab') {
      const ids = model.ids().filter((id) => !model.placement(id)?.hidden),
        index = ids.indexOf(active) + (event.shiftKey ? -1 : 1),
        next = ids[index];
      if (next) {
        event.preventDefault();
        void select(next, 0);
      }
      return;
    }
    if (mod && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      toggle(
        ({ b: 'bold', i: 'italic', u: 'underline' } as const)[
          event.key.toLowerCase() as 'b' | 'i' | 'u'
        ],
      );
    }
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo(event.shiftKey);
    }
    if (event.key === 'Home' || event.key === 'End') {
      const layout = layouts.find(
          (l) =>
            l.id === active &&
            l.carets.some(
              (c) => c.offset === (input.selectionDirection === 'backward' ? start : end),
            ),
        ),
        offset = input.selectionDirection === 'backward' ? start : end,
        caret = layout?.carets.find((c) => c.offset === offset);
      if (layout && caret) {
        event.preventDefault();
        const line = layout.carets.filter((c) => Math.abs(c.y - caret.y) < 0.1),
          next = mod
            ? event.key === 'Home'
              ? 0
              : model.text(layout.id).length
            : event.key === 'Home'
              ? line[0]!.offset
              : line.at(-1)!.offset;
        void select(
          layout.id,
          event.shiftKey ? (input.selectionDirection === 'backward' ? end : start) : next,
          next,
        );
      }
    }
    if (event.key === 'Escape') {
      active = undefined;
      selected = [];
      onselection?.(null);
      return;
    }
    if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
      const layout = layoutPdfText(model, active, fonts);
      const next = movePdfTextCaret(
        layout,
        input.selectionDirection === 'backward' ? start : end,
        event.key === 'ArrowUp' ? -1 : 1,
      );
      if (next) {
        event.preventDefault();
        const anchor = event.shiftKey
          ? input.selectionDirection === 'backward'
            ? end
            : start
          : next.offset;
        void select(layout.id, anchor, next.offset);
      }
    }
  }
  function coordinates(event: MouseEvent, host: HTMLElement, index: number) {
    const rect = host.getBoundingClientRect(),
      page = flow.pages[index]!,
      x = (event.clientX - rect.left) / scale,
      y = (event.clientY - rect.top) / scale;
    switch (page.rotation) {
      case 90:
        return { x: y, y: page.source.height - x };
      case 180:
        return { x: page.source.width - x, y: page.source.height - y };
      case 270:
        return { x: page.source.width - y, y: x };
      default:
        return { x, y };
    }
  }
  function pageTransform(page: (typeof flow.pages)[number]) {
    const w = page.source.width * scale,
      h = page.source.height * scale;
    return page.rotation === 90
      ? `translate(${h}px,0) rotate(90deg)`
      : page.rotation === 180
        ? `translate(${w}px,${h}px) rotate(180deg)`
        : page.rotation === 270
          ? `translate(0,${w}px) rotate(270deg)`
          : undefined;
  }
  function pointer(event: PointerEvent, page: number) {
    if (event.button !== 0 || (adding && !editable)) return;
    const host = event.currentTarget as HTMLElement,
      { x, y } = coordinates(event, host, page);
    onpagechange?.(page);
    if (adding) {
      const targetPage = flow.pages[page]!,
        id = crypto.randomUUID();
      model.add({
        id,
        page: targetPage.source.index,
        continuation: targetPage.continuation,
        x,
        y: y + targetPage.continuation * pdfContinuationHeight(targetPage.source),
        width: Math.max(24, targetPage.source.width - x - 24),
        lineHeight: 15,
        style: { ...defaultPdfTextStyle },
        sources: [],
        delta: [],
      });
      void select(id, 0);
      onadded?.();
      event.preventDefault();
      return;
    }
    const candidates = layouts.filter((l) => l.page === page);
    const layout = candidates
      .filter((l) => {
        const s = model.geometry(l.id);
        if (model.placement(l.id)?.hidden) return false;
        const seed = model.seed(l.id),
          b = l.preserveSource ? seed.bounds : undefined;
        return b
          ? x >= b.x + s.x - seed.x - 4 &&
              x <= b.x + s.x - seed.x + b.width + 4 &&
              y >= b.y + s.y - seed.y - 4 &&
              y <= b.y + s.y - seed.y + b.height + 4
          : x >= s.x - 4 && x <= s.x + s.width + 4 && y >= l.top && y <= l.bottom;
      })
      .sort(
        (a, b) =>
          Math.min(...a.carets.map((c) => Math.abs(c.y - y))) -
          Math.min(...b.carets.map((c) => Math.abs(c.y - y))),
      )[0];
    if (!layout) {
      active = undefined;
      selected = [];
      onselection?.(null);
      return;
    }
    const offset = hitPdfText(layout, x, y).offset;
    dragging = { id: layout.id, anchor: offset, page };
    host.setPointerCapture(event.pointerId);
    event.preventDefault();
    void select(layout.id, offset, offset, event.shiftKey);
  }
  function move(event: PointerEvent) {
    if (!dragging) return;
    const host = event.currentTarget as HTMLElement,
      point = coordinates(event, host, dragging.page),
      layout = layouts.find((l) => l.id === dragging!.id && l.page === dragging!.page);
    if (layout)
      void select(layout.id, dragging.anchor, hitPdfText(layout, point.x, point.y).offset);
  }
  function double(event: MouseEvent, page: number) {
    if (!active || !layouts.some((l) => l.id === active && l.page === page)) return;
    const text = model.text(active).toString(),
      segments = new Intl.Segmenter(undefined, { granularity: 'word' });
    for (const segment of segments.segment(text))
      if (start >= segment.index && start <= segment.index + segment.segment.length) {
        void select(active, segment.index, segment.index + segment.segment.length);
        break;
      }
    event.preventDefault();
  }
  $effect(() => {
    void active;
    void start;
    void end;
    void revision;
    void tick().then(
      () =>
        window.document.activeElement === input &&
        root?.querySelector('.local')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    );
  });
  onMount(() => {
    const before = () => {
      if (active && input && window.document.activeElement === input) {
        anchors = {
          first: model.anchor(active, input.selectionStart),
          last: model.anchor(active, input.selectionEnd),
        };
      }
    };
    const after = () => {
      revision++;
      if (active && (!model.regions.has(active) || model.placement(active)?.hidden)) {
        active = undefined;
        selected = [];
        value = '';
        onselection?.(null);
        return;
      }
      if (active && !composing) {
        const first = anchors && model.resolve(anchors.first),
          last = anchors && model.resolve(anchors.last);
        value = model.text(active).toString();
        input.value = value;
        if (first && last) {
          start = first.offset;
          end = last.offset;
          input.setSelectionRange(start, end);
        }
      }
    };
    model.doc.on('beforeTransaction', before);
    model.doc.on('afterTransaction', after);
    return () => {
      model.doc.off('beforeTransaction', before);
      model.doc.off('afterTransaction', after);
      compositionBase?.doc.destroy();
      onselection?.(null);
    };
  });
</script>

<div
  data-pdf-document
  data-pdf-max-width={pdf.pages.reduce((maximum, page) => Math.max(maximum, page.width), 0)}
  class="pdf-editable"
  bind:this={root}
>
  {#each flow.pages as page (page.id)}
    <div
      class="pdf-page-frame"
      style:width={`${(page.rotation % 180 ? page.source.height : page.source.width) * scale}px`}
      style:height={`${(page.rotation % 180 ? page.source.width : page.source.height) * scale}px`}
    >
      <div
        class="pdf-page"
        data-pdf-rotation={page.rotation}
        data-pdf-width={page.source.width}
        data-pdf-height={page.source.height}
        style:transform={pageTransform(page)}
        data-pdf-page={page.index + 1}
        style:width={`${page.source.width * scale}px`}
        style:height={`${page.source.height * scale}px`}
        onpointerdown={(e) => pointer(e, page.index)}
        onpointermove={move}
        onpointerup={() => (dragging = undefined)}
        onpointercancel={() => (dragging = undefined)}
        ondblclick={(e) => double(e, page.index)}
        role="group"
        aria-label="PDF page"
      >
        <canvas
          use:paintEditablePdfPage={{
            index: page.index,
            scale,
            source: page.source.index,
            continuation: page.continuation,
            interpreter,
            model,
            fonts,
            pdf,
            flow,
            selected,
          }}
          aria-label={`Page ${page.index + 1}`}
          style:width="100%"
          style:height="100%"
        ></canvas>
        <div class="text-layer" style:transform={`scale(${scale})`}>
          {#each layouts.filter((l) => l.page === page.index && selected.includes(l.id) && !adding && !model.placement(l.id)?.hidden) as layout (layout.id)}
            <PdfTextBox
              {model}
              {layout}
              {revision}
              {editable}
              group={selected}
              {origins}
              onedit={() => void select(layout.id, start, end)}
            />
          {/each}
          <PdfEditableText
            {model}
            layouts={layouts.filter((l) => l.page === page.index)}
            {peers}
            {active}
            {start}
            {end}
            onfocus={(id) => void select(id, 0)}
          />
        </div>
      </div>
    </div>
  {/each}
  <textarea
    wrap="off"
    bind:this={input}
    aria-label="Edit PDF text"
    readonly={!editable}
    {value}
    onbeforeinput={beforeInput}
    oninput={changed}
    onselect={publish}
    onkeyup={publish}
    onkeydown={key}
    oncompositionstart={() => {
      composing = true;
      compositionSelection = { start: input.selectionStart, end: input.selectionEnd };
      compositionBase = new PdfTextModel();
      Y.applyUpdate(compositionBase.doc, Y.encodeStateAsUpdate(model.doc));
    }}
    oncompositionend={() => {
      composing = false;
      changed();
    }}
    onblur={() => onselection?.(null)}
    spellcheck="false"
    style:left={`${(active ? layouts.find((l) => l.id === active)?.carets.find((c) => c.offset === start)?.x : 0) ?? 0}px`}
  ></textarea>
</div>

<style>
  .pdf-editable {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 24px;
    min-width: min-content;
  }
  .pdf-page-frame {
    position: relative;
    flex: none;
  }
  .pdf-page {
    position: absolute;
    transform-origin: 0 0;
    flex: none;
    background: white;
    box-shadow: 0 1px 5px #0005;
    color-scheme: light;
    touch-action: none;
    cursor: text;
  }
  canvas {
    display: block;
    pointer-events: none;
  }
  .text-layer {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    pointer-events: none;
  }
  textarea {
    position: fixed;
    bottom: 0;
    width: 1px;
    height: 1px;
    opacity: 0.01;
    resize: none;
    padding: 0;
    border: 0;
    overflow: hidden;
  }
</style>
