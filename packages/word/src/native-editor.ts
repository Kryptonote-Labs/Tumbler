import {
  createEditingHistory, commitEditingHistory, editingHistoryValue, editingHistoryCanUndo,
  editingHistoryCanRedo, undoEditingHistory, redoEditingHistory, type EditingHistoryOptions, type EditingHistory,
} from '@tumblerjs/core';
import { NativeWordDocument, type NativeWordOptions } from './native-document.ts';
import { importWordContent } from './import-content.ts';
import type { WordContentBlock } from './create-content.ts';
import type { WordTextRun } from './create.ts';
import { patchWordRunFormat, type WordNativeFormatPatch } from './native-formatting.ts';
import {
  nativeParagraphs, orderedNativeSelection, paragraphText, sliceNativeRuns, replaceNativeParagraphs,
  type WordNativePosition, type WordNativeSelection,
} from './native-edit.ts';
import { wordParagraphTextSegments } from './text.ts';

interface EditorState {
  readonly blocks: readonly WordContentBlock[];
  readonly selection: WordNativeSelection;
}

/** Single-user rich editing over immutable native blocks. DOCX packaging happens only on export. */
export class NativeWordEditor {
  readonly document: NativeWordDocument;
  private nextId = 0;
  private readonly ids = new Set<string>();
  private history: EditingHistory<EditorState>;
  private currentSelection: WordNativeSelection;
  private typing: WordNativeFormatPatch = {};
  private readonly listeners = new Set<() => void>();
  private version = 0;

  constructor(options: NativeWordOptions & EditingHistoryOptions = {}) {
    const content = options.content ?? (options.source ? importWordContent(options.source) : [{ kind: 'paragraph', runs: [] }] satisfies WordContentBlock[]);
    const used = this.ids;
    const collect = (blocks: readonly WordContentBlock[]) => {
      for (const block of blocks) {
        if (block.kind !== 'image' && block.id !== undefined) {
          if (used.has(block.id)) throw new Error('Duplicate native block ID.');
          used.add(block.id);
        }
        if (block.kind === 'table') for (const row of block.rows) for (const cell of row) collect(cell.blocks);
      }
    };
    collect(content);
    const identify = (blocks: readonly WordContentBlock[]): readonly WordContentBlock[] => blocks.map(block => {
      if (block.kind === 'table') return { ...block, rows: block.rows.map(row => row.map(cell => ({ ...cell, blocks: identify(cell.blocks) }))) };
      if (block.kind !== 'paragraph' || block.id !== undefined) return block;
      return { ...block, id: this.allocateId() };
    });
    const blocks = identify(content);
    const first = nativeParagraphs(blocks)[0];
    if (!first) throw new Error('NativeWordEditor requires a text paragraph.');
    this.currentSelection = { anchor: { paragraphId: first.id, offset: 0 }, focus: { paragraphId: first.id, offset: 0 } };
    this.history = createEditingHistory<EditorState>({ blocks, selection: this.currentSelection }, options);
    this.document = new NativeWordDocument({ ...options, content: blocks });
  }

  get blocks() { return editingHistoryValue(this.history).blocks; }
  get selection() { return this.currentSelection; }
  get revision() { return this.version; }
  get canUndo() { return editingHistoryCanUndo(this.history); }
  get canRedo() { return editingHistoryCanRedo(this.history); }
  get typingFormat() { return this.typing; }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setSelection(selection: WordNativeSelection) {
    orderedNativeSelection(this.blocks, selection);
    this.currentSelection = selection;
    this.typing = {};
    this.emit();
  }

  /** Pending marks belong to the caret and are applied to subsequent inserted text. */
  setTypingFormat(patch: WordNativeFormatPatch) {
    this.typing = { ...this.typing, ...patch };
    this.emit();
  }

  replaceText(value: string, selection = this.selection) {
    const normalized = value.replace(/\r\n?/g, '\n');
    const { start, end, paragraphs } = orderedNativeSelection(this.blocks, selection);
    if (!normalized && start.paragraphId === end.paragraphId && start.offset === end.offset) return;
    const first = paragraphs[0]!;
    const last = paragraphs.at(-1)!;
    const before = sliceNativeRuns(first.runs, 0, start.offset);
    const after = sliceNativeRuns(last.runs, end.offset, paragraphText(last).length);
    let offset = 0;
    const template = first.runs.find(run => {
      offset += run.text.length;
      return start.affinity === 'before' ? offset > start.offset : offset >= start.offset;
    }) ?? first.runs.at(-1);
    // New text inherits formatting and links, never drawing/field/tab payloads.
    const inserted = (text: string): WordTextRun => patchWordRunFormat({
      text,
      ...(template?.format ? { format: template.format } : {}),
      ...(template?.resetFormat !== undefined ? { resetFormat: template.resetFormat } : {}),
      ...(template?.source !== undefined && !template.text.includes('\uFFFC') && !template.breakType && !template.tab
        ? { source: template.source, ...(template.sourceCopy !== undefined ? { sourceCopy: template.sourceCopy } : {}) } : {}),
      ...(template?.link !== undefined ? { link: template.link } : {}),
    }, this.typing);
    const lines = normalized.split('\n');
    const { section: _section, ...base } = first;
    const replacement = lines.map((text, index) => ({
      ...base,
      ...(index === lines.length - 1 && last.section !== undefined ? { section: last.section } : {}),
      id: index === 0 ? first.id : this.allocateId(),
      runs: [...(index === 0 ? before : []), ...(text ? [inserted(text)] : []), ...(index === lines.length - 1 ? after : [])],
    }));
    const caret: WordNativePosition = {
      paragraphId: replacement.at(-1)!.id,
      affinity: 'after',
      offset: lines.length === 1 ? start.offset + normalized.length : lines.at(-1)!.length,
    };
    const blocks = replaceNativeParagraphs(this.blocks, paragraphs.map(paragraph => paragraph.id), replacement);
    this.commit({ blocks, selection: { anchor: caret, focus: caret } }, selection);
  }

  applyFormatting(patch: WordNativeFormatPatch, selection = this.selection) {
    const { start, end, paragraphs } = orderedNativeSelection(this.blocks, selection);
    if (start.paragraphId === end.paragraphId && start.offset === end.offset) {
      this.setTypingFormat(patch);
      return;
    }
    const replacements = new Map(paragraphs.map(paragraph => {
      const from = paragraph.id === start.paragraphId ? start.offset : 0;
      const to = paragraph.id === end.paragraphId ? end.offset : paragraphText(paragraph).length;
      return [paragraph.id, { ...paragraph, runs: [
        ...sliceNativeRuns(paragraph.runs, 0, from),
        ...sliceNativeRuns(paragraph.runs, from, to).map(run => patchWordRunFormat(run, patch)),
        ...sliceNativeRuns(paragraph.runs, to, paragraphText(paragraph).length),
      ] }] as const;
    }));
    const visit = (blocks: readonly WordContentBlock[]): readonly WordContentBlock[] => blocks.map(block =>
      block.kind === 'paragraph' ? replacements.get(block.id!) ?? block
        : block.kind === 'table' ? { ...block, rows: block.rows.map(row => row.map(cell => ({ ...cell, blocks: visit(cell.blocks) }))) } : block);
    this.commit({ blocks: visit(this.blocks), selection }, selection);
  }

  /** Resolve toolbar values directly from the model, without requiring layout or painting. */
  formatAt(position = this.selection.focus) {
    orderedNativeSelection(this.blocks, { anchor: position, focus: position });
    const index = nativeParagraphs(this.blocks).findIndex(paragraph => paragraph.id === position.paragraphId);
    const visit = (blocks: NativeWordDocument['blocks']): import('./document.ts').WordParagraph[] => blocks.flatMap(block =>
      block.kind === 'paragraph' ? [block] : block.kind === 'table' ? block.rows.flatMap(row => row.cells.flatMap(cell => visit(cell.blocks))) : []);
    const paragraph = visit(this.document.blocks)[index]!;
    const segments = wordParagraphTextSegments(undefined, paragraph);
    const preceding = position.affinity === 'after' ? segments.findLast(segment => segment.start < position.offset && position.offset <= segment.end) : undefined;
    const segment = preceding ?? segments.find(segment => segment.start <= position.offset && position.offset < segment.end) ?? segments.at(-1);
    const runs = paragraph.inlines.flatMap(inline => inline.kind === 'run' ? [inline] : inline.kind === 'hyperlink' || inline.kind === 'insertion' ? inline.runs : []);
    return this.document.runFormat(paragraph, runs.find(run => run.elementId === segment?.runElementId));
  }

  undo() { this.restore(undoEditingHistory(this.captureSelection())); }
  redo() { this.restore(redoEditingHistory(this.captureSelection())); }

  private allocateId() {
    let id: string;
    do { id = `native-${++this.nextId}`; } while (this.ids.has(id));
    return id;
  }

  private captureSelection(selection = this.selection) {
    const entries = [...this.history.entries];
    entries[this.history.index] = { blocks: this.blocks, selection };
    return { ...this.history, entries };
  }

  private commit(state: EditorState, previousSelection: WordNativeSelection) {
    this.document.update(state.blocks);
    this.history = commitEditingHistory(this.captureSelection(previousSelection), state);
    this.currentSelection = state.selection;
    this.emit();
  }

  private restore(history: typeof this.history) {
    if (history.index === this.history.index) return;
    const state = editingHistoryValue(history);
    this.document.update(state.blocks);
    this.history = history;
    this.currentSelection = state.selection;
    this.typing = {};
    this.emit();
  }

  private emit() {
    this.version++;
    for (const listener of [...this.listeners]) listener();
  }
}
