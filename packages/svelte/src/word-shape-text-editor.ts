import {
  isShapeTextBody,
  NativeWordDocument,
  shapeTextParagraphs,
  shapePlainText,
  type WordAuthoredShape,
  type WordTextParagraph,
} from '@tumblerjs/word';
import {
  WordShapeText,
  type WordFormatPatch,
  type WordRange,
  type TextAttributes,
} from '@tumblerjs/word/collaboration';
import { renderShapeText } from './word-shape-text-render.ts';

export interface ShapeTextEditor {
  format(patch: WordFormatPatch, focus?: boolean): void;
  formats(): TextAttributes;
  focus(): void;
  continueList(): void;
}

/** Browser selection is retained independently of focus, including while ribbon inputs own focus. */
export class ShapeTextEditorView implements ShapeTextEditor {
  private story: WordShapeText;
  private range: WordRange = { start: 0, end: 0 };
  private editing = false;
  private backward = false;
  private signature: string;
  private composing = false;
  private compositionCommit: string | undefined;
  private compositionTimer?: ReturnType<typeof setTimeout>;
  private compositionRange: WordRange | undefined;
  private model = new NativeWordDocument({
    defaultFormat: { fontFamily: 'Aptos', fontSizePoints: 12 },
  });
  constructor(
    private root: HTMLDivElement,
    shape: WordAuthoredShape,
    private changed: (paragraphs: readonly WordTextParagraph[]) => void,
    private selectionChanged: () => void,
    private escape: () => void,
    private undo: (redo: boolean) => void,
  ) {
    this.story = new WordShapeText(shape);
    this.signature = JSON.stringify(shapeTextParagraphs(shape));
    root.addEventListener('beforeinput', this.input);
    root.addEventListener('keydown', this.key);
    root.addEventListener('paste', this.paste);
    root.addEventListener('copy', this.copy);
    root.addEventListener('cut', this.copy);
    root.addEventListener('compositionstart', this.compositionStart);
    root.addEventListener('compositionend', this.compositionEnd);
    root.ownerDocument.addEventListener('selectionchange', this.selection);
    this.render();
  }
  update(shape: WordAuthoredShape, editing: boolean, initialText?: string) {
    const signature = JSON.stringify(shapeTextParagraphs(shape));
    if (signature !== this.signature) {
      this.signature = signature;
      this.story.load(shapeTextParagraphs(shape));
      this.range = {
        start: Math.min(this.range.start, this.story.length),
        end: Math.min(this.range.end, this.story.length),
      };
      this.render();
    }
    this.root.contentEditable = String(editing);
    if (editing && !this.editing) {
      this.editing = true;
      this.range = { start: this.story.length, end: this.story.length };
      const plain = shapePlainText(shape);
      if (
        initialText !== undefined &&
        initialText.startsWith(plain) &&
        initialText.length > plain.length
      )
        this.replace(initialText.slice(plain.length));
      else this.focus();
    } else this.editing = editing;
  }
  formats() {
    return this.story.formats(this.editing ? this.range : { start: 0, end: this.story.length });
  }
  format(patch: WordFormatPatch, focus = true) {
    this.story.format(this.editing ? this.range : { start: 0, end: this.story.length }, patch);
    this.commit();
    if (focus && this.editing) this.focus();
  }
  continueList() {
    const list = this.story.previousList(this.range);
    if (list) this.format({ list });
  }
  focus() {
    if (!this.editing) return;
    this.root.focus({ preventScroll: true });
    this.restore();
  }
  private selection = () => {
    const s = this.root.ownerDocument.getSelection();
    if (
      !s?.anchorNode ||
      !s.focusNode ||
      !this.root.contains(s.anchorNode) ||
      !this.root.contains(s.focusNode)
    )
      return;
    const a = this.offset(s.anchorNode, s.anchorOffset),
      b = this.offset(s.focusNode, s.focusOffset);
    this.backward = a > b;
    const next = { start: Math.min(a, b), end: Math.max(a, b) };
    if (next.start !== this.range.start || next.end !== this.range.end) {
      this.range = next;
      this.story.resetTyping();
      this.selectionChanged();
    }
  };
  private offset(node: Node, offset: number) {
    const element = node instanceof Element ? node : node.parentElement;
    const paragraph = element?.closest<HTMLElement>('[data-shape-paragraph]');
    if (!paragraph) return offset === 0 ? 0 : this.story.length;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.setEnd(node, offset);
    return Math.min(
      this.story.length,
      Number(paragraph.dataset.shapeParagraph) + range.toString().length,
    );
  }
  private point(offset: number): { node: Node; offset: number } {
    const paragraphs = [...this.root.querySelectorAll<HTMLElement>('[data-shape-paragraph]')];
    const p = paragraphs.findLast((p) => Number(p.dataset.shapeParagraph) <= offset) ?? this.root;
    let remaining = offset - Number(p.dataset.shapeParagraph ?? 0);
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (remaining <= (node.textContent?.length ?? 0)) return { node, offset: remaining };
      remaining -= node.textContent?.length ?? 0;
    }
    return {
      node: p,
      offset: p.childNodes.length && p.firstChild?.nodeName !== 'BR' ? p.childNodes.length : 0,
    };
  }
  private restore() {
    const a = this.point(this.range.start),
      b = this.point(this.range.end);
    this.root.ownerDocument
      .getSelection()
      ?.setBaseAndExtent(
        this.backward ? b.node : a.node,
        this.backward ? b.offset : a.offset,
        this.backward ? a.node : b.node,
        this.backward ? a.offset : b.offset,
      );
  }
  private commit() {
    const paragraphs = this.story.paragraphs();
    this.signature = JSON.stringify(paragraphs);
    this.render();
    this.changed(paragraphs);
    this.selectionChanged();
  }
  private replace(value: string, range = this.range) {
    this.story.replace(range, value);
    const at = range.start + value.replace(/\r\n?/g, '\n').length;
    this.range = { start: at, end: at };
    this.commit();
    this.focus();
  }
  private input = (event: InputEvent) => {
    event.stopPropagation();
    if (event.isComposing || this.composing) return;
    event.preventDefault();
    if (
      this.compositionCommit !== undefined &&
      event.inputType.startsWith('insert') &&
      event.data === this.compositionCommit
    ) {
      this.compositionCommit = undefined;
      return;
    }
    if (event.inputType === 'insertReplacementText') {
      const target = event.getTargetRanges?.()[0];
      if (
        target &&
        this.root.contains(target.startContainer) &&
        this.root.contains(target.endContainer)
      )
        this.range = {
          start: this.offset(target.startContainer, target.startOffset),
          end: this.offset(target.endContainer, target.endOffset),
        };
    }
    const mark =
      event.inputType === 'formatBold'
        ? 'bold'
        : event.inputType === 'formatItalic'
          ? 'italic'
          : event.inputType === 'formatUnderline'
            ? 'underline'
            : undefined;
    if (mark) {
      this.format({ [mark]: !this.formats()[mark] });
      return;
    }
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      this.undo(event.inputType === 'historyRedo');
      return;
    }
    if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
      this.replace('\n');
      return;
    }
    if (event.inputType.startsWith('insert')) {
      if (event.data !== null) this.replace(event.data);
      return;
    }
    if (event.inputType.startsWith('delete')) {
      let { start, end } = this.range;
      if (start === end) {
        const text = this.story.text.toString().slice(0, this.story.length);
        const backward = event.inputType.endsWith('Backward');
        const segments = [
          ...new Intl.Segmenter(undefined, {
            granularity: event.inputType.includes('Word') ? 'word' : 'grapheme',
          }).segment(text),
        ];
        if (backward) start = segments.findLast((s) => s.index < start)?.index ?? 0;
        else {
          const s = segments.find((s) => s.index >= end);
          end = s ? s.index + s.segment.length : this.story.length;
        }
      }
      this.replace('', { start, end });
    }
  };
  private key = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.escape();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'a') {
        event.preventDefault();
        this.range = { start: 0, end: this.story.length };
        this.restore();
      }
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        this.undo(key === 'y' || event.shiftKey);
      }
      const name =
        key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : undefined;
      if (name) {
        event.preventDefault();
        this.format({ [name]: !this.formats()[name] });
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      this.replace('\t');
    }
  };
  private paste = (event: ClipboardEvent) => {
    event.stopPropagation();
    event.preventDefault();
    const rich = event.clipboardData?.getData('application/x-tumbler-shape-text');
    if (rich) {
      try {
        const paragraphs: unknown = JSON.parse(rich);
        if (isShapeTextBody(paragraphs)) {
          const length = this.story.paste(this.range, paragraphs);
          this.range = { start: this.range.start + length, end: this.range.start + length };
          this.commit();
          this.focus();
          return;
        }
      } catch {
        /* External clipboard data falls back to its plain text representation. */
      }
    }
    this.replace(event.clipboardData?.getData('text/plain') ?? '');
  };
  private copy = (event: ClipboardEvent) => {
    event.stopPropagation();
    if (this.range.start === this.range.end) return;
    event.preventDefault();
    event.clipboardData?.setData(
      'application/x-tumbler-shape-text',
      JSON.stringify(this.story.slice(this.range)),
    );
    const selection = document.getSelection();
    if (selection?.rangeCount) {
      const container = document.createElement('div');
      container.append(selection.getRangeAt(0).cloneContents());
      event.clipboardData?.setData('text/html', container.innerHTML);
    }
    event.clipboardData?.setData(
      'text/plain',
      this.story.text.toString().slice(this.range.start, this.range.end),
    );
    if (event.type === 'cut') this.replace('');
  };
  private compositionStart = (event: CompositionEvent) => {
    event.stopPropagation();
    this.composing = true;
    this.compositionRange = { ...this.range };
  };
  private compositionEnd = (event: CompositionEvent) => {
    event.stopPropagation();
    this.composing = false;
    const range = this.compositionRange;
    this.compositionRange = undefined;
    this.compositionCommit = event.data;
    clearTimeout(this.compositionTimer);
    this.compositionTimer = setTimeout(() => {
      this.compositionCommit = undefined;
    }, 0);
    if (range && event.data) this.replace(event.data, range);
    else {
      this.render();
      this.focus();
    }
  };
  private render() {
    if (this.composing) return;
    const focused = this.root.ownerDocument.activeElement === this.root;
    const paragraphs = this.story.paragraphs();
    renderShapeText(this.root, paragraphs, this.model);
    if (focused) this.restore();
  }
  destroy() {
    clearTimeout(this.compositionTimer);
    this.root.removeEventListener('beforeinput', this.input);
    this.root.removeEventListener('keydown', this.key);
    this.root.removeEventListener('paste', this.paste);
    this.root.removeEventListener('copy', this.copy);
    this.root.removeEventListener('cut', this.copy);
    this.root.removeEventListener('compositionstart', this.compositionStart);
    this.root.removeEventListener('compositionend', this.compositionEnd);
    this.root.ownerDocument.removeEventListener('selectionchange', this.selection);
    this.story.destroy();
  }
}
