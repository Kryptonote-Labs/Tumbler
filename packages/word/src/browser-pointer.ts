import type { NativeWordEditor } from './native-editor.ts';
import { nativeParagraphs, paragraphText, type WordNativePosition, type WordNativeSelection } from './native-edit.ts';
import { restoreWordBrowserSelection, sameWordBrowserSelection } from './browser-selection.ts';
import { wordBrowserPositionAtPoint } from './browser-hit-testing.ts';

export interface WordBrowserPointerOptions {
  /** Override DOM hit testing when a host has additional clipping or custom geometry. */
  readonly positionAtPoint?: (x: number, y: number) => WordNativePosition | undefined;
  /** Scroll this element during selection; otherwise find scrollable ancestors or the window. */
  readonly scrollElement?: HTMLElement;
}

type Granularity = 'character' | 'word' | 'paragraph';

/** Mouse selection for positioned DOM text. Touch retains the browser's native selection handles. */
export class WordBrowserPointer {
  private drag: { origin: WordNativeSelection; granularity: Granularity } | undefined;
  private point: { x: number; y: number } | undefined;
  private pointerType = 'mouse';
  private frame = 0;
  private readonly view: Window;

  constructor(
    private readonly root: HTMLElement,
    private readonly editor: NativeWordEditor,
    private readonly options: WordBrowserPointerOptions & { enabled: () => boolean },
  ) {
    this.view = root.ownerDocument.defaultView!;
    root.addEventListener('pointerdown', this.pointerDown);
    root.addEventListener('mousedown', this.mouseDown);
    root.ownerDocument.addEventListener('mousemove', this.mouseMove);
    root.ownerDocument.addEventListener('mouseup', this.mouseUp);
    this.view.addEventListener('blur', this.finish);
  }

  get dragging() { return this.drag !== undefined; }

  destroy() {
    this.finish();
    this.root.removeEventListener('pointerdown', this.pointerDown);
    this.root.removeEventListener('mousedown', this.mouseDown);
    this.root.ownerDocument.removeEventListener('mousemove', this.mouseMove);
    this.root.ownerDocument.removeEventListener('mouseup', this.mouseUp);
    this.view.removeEventListener('blur', this.finish);
  }

  private position(x: number, y: number) {
    return this.options.positionAtPoint ? this.options.positionAtPoint(x, y) : wordBrowserPositionAtPoint(this.root, x, y);
  }

  private compare(left: WordNativePosition, right: WordNativePosition) {
    const paragraphs = nativeParagraphs(this.editor.blocks);
    return paragraphs.findIndex(p => p.id === left.paragraphId) - paragraphs.findIndex(p => p.id === right.paragraphId) || left.offset - right.offset;
  }

  private extent(position: WordNativePosition, granularity: Granularity): WordNativeSelection {
    if (granularity === 'character') return { anchor: position, focus: position };
    const paragraph = nativeParagraphs(this.editor.blocks).find(p => p.id === position.paragraphId)!;
    const text = paragraphText(paragraph);
    const word = granularity === 'word' ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)]
      .find(segment => segment.index + segment.segment.length > Math.min(position.offset, text.length - 1)) : undefined;
    return {
      anchor: { ...position, offset: word?.index ?? 0, affinity: 'before' },
      focus: { ...position, offset: word ? word.index + word.segment.length : text.length, affinity: 'after' },
    };
  }

  private select(selection: WordNativeSelection) {
    if (!sameWordBrowserSelection(selection, this.editor.selection)) this.editor.setSelection(selection);
    restoreWordBrowserSelection(this.root, selection);
  }

  private pointerDown = (event: PointerEvent) => { this.pointerType = event.pointerType; };

  private mouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || this.pointerType === 'touch' || !this.options.enabled()) return;
    const target = event.target instanceof Element ? event.target : undefined;
    const blocked = target?.closest('[contenteditable="false"],input,button,select,textarea');
    if (blocked && this.root.contains(blocked)) return;
    if ((event.ctrlKey || event.metaKey) && target?.closest('a[href]')) return;
    const position = this.position(event.clientX, event.clientY);
    if (!position) return;
    const granularity: Granularity = event.shiftKey ? 'character' : event.detail >= 3 ? 'paragraph' : event.detail === 2 ? 'word' : 'character';
    const selection = event.shiftKey ? { anchor: this.editor.selection.anchor, focus: position } : this.extent(position, granularity);
    this.drag = { origin: event.shiftKey ? { anchor: selection.anchor, focus: selection.anchor } : selection, granularity };
    this.point = { x: event.clientX, y: event.clientY };
    event.preventDefault();
    this.root.focus({ preventScroll: true });
    this.select(selection);
  };

  private mouseMove = (event: MouseEvent) => {
    if (!this.drag) return;
    if (!(event.buttons & 1)) { this.finish(); return; }
    event.preventDefault();
    this.point = { x: event.clientX, y: event.clientY };
    this.extend();
    if (!this.frame) this.frame = this.view.requestAnimationFrame(this.scroll);
  };

  private mouseUp = () => { this.finish(); };

  private extend() {
    if (!this.drag || !this.point) return;
    const position = this.position(this.point.x, this.point.y);
    if (!position) return;
    const extent = this.extent(position, this.drag.granularity);
    const backward = this.compare(position, this.drag.origin.anchor) < 0;
    this.select({
      anchor: backward ? this.drag.origin.focus : this.drag.origin.anchor,
      focus: backward ? extent.anchor : extent.focus,
    });
  }

  private scroller(axis: 'x' | 'y') {
    if (this.options.scrollElement) return this.options.scrollElement;
    for (let element: HTMLElement | null = this.root; element; element = element.parentElement) {
      const style = this.view.getComputedStyle(element);
      const overflow = axis === 'x' ? style.overflowX : style.overflowY;
      if (/auto|scroll/.test(overflow) && (axis === 'x' ? element.scrollWidth > element.clientWidth : element.scrollHeight > element.clientHeight)) return element;
    }
    return this.root.ownerDocument.scrollingElement as HTMLElement;
  }

  private scroll = () => {
    this.frame = 0;
    if (!this.drag || !this.point) return;
    let moved = false;
    for (const axis of ['x', 'y'] as const) {
      const element = this.scroller(axis);
      const viewport = element === this.root.ownerDocument.scrollingElement;
      const rect = viewport ? { left: 0, top: 0, right: this.view.innerWidth, bottom: this.view.innerHeight } : element.getBoundingClientRect();
      const point = axis === 'x' ? this.point.x : this.point.y;
      const start = axis === 'x' ? rect.left : rect.top;
      const end = axis === 'x' ? rect.right : rect.bottom;
      const delta = point < start + 24 ? Math.max(-20, (point - start - 24) / 3) : point > end - 24 ? Math.min(20, (point - end + 24) / 3) : 0;
      const before = axis === 'x' ? element.scrollLeft : element.scrollTop;
      element.scrollBy({ left: axis === 'x' ? delta : 0, top: axis === 'y' ? delta : 0, behavior: 'instant' });
      moved ||= before !== (axis === 'x' ? element.scrollLeft : element.scrollTop);
    }
    if (moved) {
      this.extend();
      this.frame = this.view.requestAnimationFrame(this.scroll);
    }
  };

  private finish = () => {
    this.drag = undefined;
    this.point = undefined;
    this.view.cancelAnimationFrame(this.frame);
    this.frame = 0;
  };
}
