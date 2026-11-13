import type { NativeWordEditor } from './native-editor.ts';
import { nativeParagraphs, paragraphText, orderedNativeSelection, type WordNativeSelection } from './native-edit.ts';
import { restoreWordBrowserSelection, wordBrowserSelection, wordPositionFromDom } from './browser-selection.ts';

/** Optional DOM adapter for host-rendered contenteditable paragraphs. Clipboard input is plain text. */
export class WordBrowserInput {
  private composition: WordNativeSelection | undefined;
  private compositionCommit: string | undefined;
  private commitTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly root: HTMLElement, private readonly editor: NativeWordEditor) {
    root.addEventListener('beforeinput', this.beforeInput);
    root.addEventListener('keydown', this.keyDown);
    root.addEventListener('paste', this.paste);
    root.addEventListener('copy', this.copy);
    root.addEventListener('cut', this.cut);
    root.addEventListener('compositionstart', this.compositionStart);
    root.addEventListener('compositionend', this.compositionEnd);
    root.ownerDocument.addEventListener('selectionchange', this.selectionChange);
  }

  get composing() { return this.composition !== undefined; }

  /** Restore after the host commits its render, never during IME composition. */
  restoreSelection() {
    if (!this.composing && this.root.contains(this.root.ownerDocument.activeElement) &&
      JSON.stringify(wordBrowserSelection(this.root)) !== JSON.stringify(this.editor.selection))
      restoreWordBrowserSelection(this.root, this.editor.selection);
  }

  destroy() {
    clearTimeout(this.commitTimer);
    this.root.removeEventListener('beforeinput', this.beforeInput);
    this.root.removeEventListener('keydown', this.keyDown);
    this.root.removeEventListener('paste', this.paste);
    this.root.removeEventListener('copy', this.copy);
    this.root.removeEventListener('cut', this.cut);
    this.root.removeEventListener('compositionstart', this.compositionStart);
    this.root.removeEventListener('compositionend', this.compositionEnd);
    this.root.ownerDocument.removeEventListener('selectionchange', this.selectionChange);
  }

  private selectionChange = () => {
    if (this.composing) return;
    const selection = wordBrowserSelection(this.root);
    if (selection && JSON.stringify(selection) !== JSON.stringify(this.editor.selection)) this.editor.setSelection(selection);
  };

  private beforeInput = (event: InputEvent) => {
    if (this.composing || event.isComposing) return;
    if (this.compositionCommit !== undefined && (event.inputType === 'insertFromComposition' ||
      event.inputType === 'insertText' && event.data === this.compositionCommit)) {
      event.preventDefault();
      this.compositionCommit = undefined;
      return;
    }
    if (!event.cancelable) return;
    event.preventDefault();
    const selection = wordBrowserSelection(this.root) ?? this.editor.selection;
    if (event.inputType === 'historyUndo') { this.editor.undo(); return; }
    if (event.inputType === 'historyRedo') { this.editor.redo(); return; }
    if (event.inputType === 'insertText' || event.inputType === 'insertReplacementText') {
      if (event.data !== null) this.editor.replaceText(event.data, selection);
    } else if (event.inputType === 'insertParagraph') this.editor.replaceText('\n', selection);
    else if (event.inputType === 'insertLineBreak') this.editor.replaceText('\u2028', selection);
    else if (event.inputType.startsWith('delete')) {
      const target = event.getTargetRanges?.()[0];
      const anchor = target && wordPositionFromDom(this.root, target.startContainer, target.startOffset);
      const focus = target && wordPositionFromDom(this.root, target.endContainer, target.endOffset);
      const range = anchor && focus && JSON.stringify(anchor) !== JSON.stringify(focus) ? { anchor, focus } : this.deletionRange(selection, event.inputType);
      if (range) this.editor.replaceText('', this.expandDeletion(range));
    }
  };

  /** Browser target ranges can cover only a combining mark or part of an emoji. */
  private expandDeletion(selection: WordNativeSelection): WordNativeSelection {
    const paragraphs = nativeParagraphs(this.editor.blocks);
    const anchorIndex = paragraphs.findIndex(paragraph => paragraph.id === selection.anchor.paragraphId);
    const focusIndex = paragraphs.findIndex(paragraph => paragraph.id === selection.focus.paragraphId);
    const forward = anchorIndex < focusIndex || anchorIndex === focusIndex && selection.anchor.offset <= selection.focus.offset;
    const start = forward ? selection.anchor : selection.focus;
    const end = forward ? selection.focus : selection.anchor;
    const snap = (position: typeof start, after: boolean) => {
      const paragraph = paragraphs.find(paragraph => paragraph.id === position.paragraphId)!;
      const text = paragraphText(paragraph);
      const boundaries = [0, ...[...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(segment => segment.index + segment.segment.length)];
      const offset = after ? boundaries.find(value => value >= position.offset) : boundaries.findLast(value => value <= position.offset);
      return { ...position, offset: offset ?? position.offset };
    };
    return { anchor: snap(start, false), focus: snap(end, true) };
  }

  private deletionRange(selection: WordNativeSelection, inputType: string): WordNativeSelection | undefined {
    if (JSON.stringify(selection.anchor) !== JSON.stringify(selection.focus)) return selection;
    if (inputType !== 'deleteContentBackward' && inputType !== 'deleteContentForward' && inputType !== 'deleteWordBackward' && inputType !== 'deleteWordForward') return;
    const paragraphs = nativeParagraphs(this.editor.blocks);
    const index = paragraphs.findIndex(paragraph => paragraph.id === selection.focus.paragraphId);
    const paragraph = paragraphs[index]!;
    const text = paragraphText(paragraph);
    const backward = inputType.endsWith('Backward');
    const segments = [...new Intl.Segmenter(undefined, { granularity: inputType.includes('Word') ? 'word' : 'grapheme' }).segment(text)];
    const offset = selection.focus.offset;
    const boundary = backward ? segments.findLast(segment => segment.index < offset)?.index
      : segments.find(segment => segment.index + segment.segment.length > offset);
    const nextOffset = typeof boundary === 'number' ? boundary : boundary ? boundary.index + boundary.segment.length : undefined;
    const adjacent = paragraphs[index + (backward ? -1 : 1)];
    const position = nextOffset !== undefined ? { ...selection.focus, offset: nextOffset }
      : adjacent ? { paragraphId: adjacent.id, offset: backward ? paragraphText(adjacent).length : 0 } : undefined;
    return position ? { anchor: selection.focus, focus: position } : undefined;
  }

  private keyDown = (event: KeyboardEvent) => {
    if (this.composing || event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y') return;
    event.preventDefault();
    if (event.shiftKey || event.key.toLowerCase() === 'y') this.editor.redo(); else this.editor.undo();
  };

  private paste = (event: ClipboardEvent) => {
    if (this.composing) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain');
    if (text !== undefined) this.editor.replaceText(text, wordBrowserSelection(this.root) ?? this.editor.selection);
  };

  private copy = (event: ClipboardEvent) => {
    if (this.composing || !event.clipboardData) return;
    const { start, end, paragraphs } = orderedNativeSelection(this.editor.blocks, wordBrowserSelection(this.root) ?? this.editor.selection);
    if (start.paragraphId === end.paragraphId && start.offset === end.offset) return;
    const text = paragraphs.map(paragraph => paragraphText(paragraph).slice(paragraph.id === start.paragraphId ? start.offset : 0, paragraph.id === end.paragraphId ? end.offset : undefined)).join('\n');
    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
  };

  private cut = (event: ClipboardEvent) => {
    this.copy(event);
    if (event.defaultPrevented) this.editor.replaceText('', wordBrowserSelection(this.root) ?? this.editor.selection);
  };

  private compositionStart = () => {
    this.composition = wordBrowserSelection(this.root) ?? this.editor.selection;
  };

  private compositionEnd = (event: CompositionEvent) => {
    const selection = this.composition;
    this.composition = undefined;
    this.compositionCommit = event.data;
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => { this.compositionCommit = undefined; }, 0);
    if (selection && event.data) this.editor.replaceText(event.data, selection);
    else this.editor.setSelection(this.editor.selection);
  };
}
