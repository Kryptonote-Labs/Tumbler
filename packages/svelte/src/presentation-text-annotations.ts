import { tick } from 'svelte';
import type { PresentationSlide } from '@tumblerjs/slides';
import { presentationTextRange, type PresentationTextLocation } from './presentation-text-range.ts';

/** Host-owned diagnostic identity and expected text; never part of the saved document. */
export interface PresentationTextAnnotation extends PresentationTextLocation {
  id: string;
  text: string;
  kind: 'spelling' | 'grammar';
}
export interface PresentationAnnotationActivation {
  annotation: PresentationTextAnnotation;
  anchor: DOMRectReadOnly;
  source: 'pointer' | 'context-menu' | 'keyboard';
}
interface Options {
  slide: PresentationSlide;
  annotations: readonly PresentationTextAnnotation[];
  onactivate?: (activation: PresentationAnnotationActivation) => void;
}

/** Paint and activate diagnostics using live text ranges, independently of search and selection. */
export function presentationTextAnnotations(node: HTMLElement, initial: Options) {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const names = { spelling: `spelling-${suffix}`, grammar: `grammar-${suffix}` };
  const style = document.createElement('style');
  style.media = 'screen';
  style.textContent = `::highlight(${names.spelling}), ::highlight(${names.grammar}) {
    text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 1px;
    text-underline-offset: 3px; text-decoration-skip-ink: none;
  }
  ::highlight(${names.spelling}) { text-decoration-color: #c62828; }
  ::highlight(${names.grammar}) { text-decoration-color: #245bc4; }`;
  let options = initial;
  let generation = 0;
  let composing = false;
  let frame: number | undefined;
  let pointer: { x: number; y: number; moved: boolean } | undefined;
  let entries: { annotation: PresentationTextAnnotation; root: HTMLElement; range: Range }[] = [];
  const events = new AbortController();
  const capture = { capture: true, signal: events.signal };

  function clear() {
    entries = [];
    for (const name of Object.values(names)) globalThis.CSS?.highlights?.delete(name);
  }
  async function update(next: Options) {
    options = next;
    const version = ++generation;
    clear();
    await tick();
    if (version !== generation || composing) return;
    entries = options.annotations.flatMap((annotation) => {
      const resolved = presentationTextRange(node, options.slide, annotation, annotation.text);
      return resolved ? [{ annotation, ...resolved }] : [];
    });
    if (!entries.length || !globalThis.CSS?.highlights || typeof Highlight === 'undefined') return;
    if (!style.isConnected) document.head.append(style);
    for (const kind of ['spelling', 'grammar'] as const) {
      const highlight = new Highlight();
      for (const entry of entries) if (entry.annotation.kind === kind) highlight.add(entry.range);
      CSS.highlights.set(names[kind], highlight);
    }
  }
  function activate(event: MouseEvent | KeyboardEvent, keyboard = false) {
    if (events.signal.aborted || composing || !options.onactivate || event.defaultPrevented) return;
    if (
      event instanceof MouseEvent &&
      (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
    )
      return;
    const selection = window.getSelection();
    // A drag selection is editing, not an annotation activation.
    if (event.type === 'pointerup' && (pointer?.moved || (selection && !selection.isCollapsed)))
      return;
    for (const entry of entries) {
      const caret = keyboard && selection?.rangeCount ? selection.getRangeAt(0) : undefined;
      if (
        keyboard &&
        (!caret ||
          !entry.root.contains(caret.startContainer) ||
          entry.range.comparePoint(caret.startContainer, caret.startOffset) !== 0)
      )
        continue;
      const rectangles = Array.from(entry.range.getClientRects());
      const anchor = keyboard
        ? rectangles.at(-1)
        : rectangles.find(
            (rect) =>
              event instanceof MouseEvent &&
              event.clientX >= rect.left &&
              event.clientX <= rect.right &&
              event.clientY >= rect.top &&
              event.clientY <= rect.bottom,
          );
      if (!anchor) continue;
      // Ranges are live, but document updates can make an old diagnostic semantically stale.
      if (!presentationTextRange(node, options.slide, entry.annotation, entry.annotation.text))
        return;
      event.preventDefault();
      event.stopPropagation();
      options.onactivate({
        annotation: entry.annotation,
        anchor,
        source: keyboard ? 'keyboard' : event.type === 'contextmenu' ? 'context-menu' : 'pointer',
      });
      return;
    }
  }
  node.addEventListener(
    'pointerdown',
    (event) => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      pointer =
        event.button === 0 ? { x: event.clientX, y: event.clientY, moved: false } : undefined;
    },
    capture,
  );
  node.addEventListener(
    'pointermove',
    (event) => {
      if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) >= 5)
        pointer.moved = true;
    },
    capture,
  );
  node.addEventListener(
    'pointerup',
    (event) => {
      if (event.button !== 0 || !pointer || pointer.moved) return;
      // Entering editing replaces text runs during pointerup, which can suppress click entirely.
      // Wait until editing and any trailing click finish before measuring and opening host UI.
      frame = requestAnimationFrame(() => {
        frame = undefined;
        activate(event);
      });
    },
    capture,
  );
  node.addEventListener(
    'pointercancel',
    () => {
      pointer = undefined;
    },
    capture,
  );
  node.addEventListener('contextmenu', (event) => activate(event), capture);
  node.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))
        activate(event, true);
    },
    capture,
  );
  node.addEventListener(
    'compositionstart',
    () => {
      composing = true;
      generation++;
      clear();
    },
    capture,
  );
  node.addEventListener(
    'compositionend',
    () => {
      composing = false;
      void update(options);
    },
    capture,
  );
  void update(initial);
  return {
    update: (next: Options) => {
      void update(next);
    },
    destroy() {
      generation++;
      if (frame !== undefined) cancelAnimationFrame(frame);
      events.abort();
      clear();
      style.remove();
    },
  };
}
