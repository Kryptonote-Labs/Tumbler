import * as Y from "yjs";
import {
  createWordCommands,
  type WordAnchor,
  type WordChange,
  type WordDelta,
  type WordRange,
} from "../commands.ts";
import { tableParagraphs } from "../tables.ts";
import type { WordOperation } from "../../operations/definitions.ts";
import { applyWordScopedOperation, type WordScopedOperationContext } from "../../operations/structured.ts";
import { stageWordUpdate, commitWordUpdate } from "./transactions.ts";
import { cellName, migrateTable, payload, tableName } from "./state.ts";
import type { WordScopedSelection, PreparedWordUpdate } from "./types.ts";
import { projectWordSharedText, type WordViewSpan, type WordViewTable } from "./view-projection.ts";
import { anchorWordView, resolveWordView } from "./view-anchors.ts";
import { syncWordView } from "./view-sync.ts";
import { applyWordViewDelta } from "./view-delta.ts";
import { applyWordViewOperation } from "./view-operations.ts";
import { applyStructuredChange } from "./edits.ts";
import { wordParagraphIdentity, setWordParagraphIdentity } from "../paragraph-identity.ts";

const views = new WeakMap<Y.Text, WordSharedText>();
const owners = new WeakMap<Y.Doc, Y.Doc>();

/** Resolve a projected editor text to its authoritative shared document. */
export function wordSharedOwner(doc: Y.Doc) {
  return owners.get(doc) ?? doc;
}
export function getWordSharedText(text: Y.Text) {
  return views.get(text);
}
export function wordSharedText(text: Y.Text) {
  const found = views.get(text);
  if (found) return found;
  if (!text.doc) throw new Error("The document is not attached.");
  const story = Y.createRelativePositionFromTypeIndex(text, 0).tname;
  if (!story) throw new Error("A document story must be a named text root.");
  return new WordSharedText(text.doc, story);
}

/** Linear editing coordinates over a shared grid. The view is local and never persisted. */
export class WordSharedText {
  private readonly projectedText: Y.Text;
  get text(): Y.Text {
    if (this.conflict) throw this.conflict;
    return this.projectedText;
  }
  readonly sourceText: Y.Text;
  private readonly projection = new Y.Doc();
  private spans: WordViewSpan[] = [];
  private tables: WordViewTable[] = [];
  conflict: Error | undefined;
  private structured(doc = this.doc) {
    return [...doc.share.keys()].some((name) => name.startsWith("word-table-v2:"));
  }
  private readonly sourceChanged = (event: Y.YTextEvent) => {
    if (!this.structured()) {
      // Y.Text fills missing formatting keys in the supplied delta. Other source observers
      // must receive the original event, including incremental validation and history.
      this.text.applyDelta(event.delta.map(part => ({
        ...part,
        ...(part.attributes ? { attributes: { ...part.attributes } } : {}),
      })));
      this.spans = this.text.length
        ? [{ start: 0, end: this.text.length, root: this.story, offset: 0 }]
        : [];
    }
  };
  private readonly disposed = () => this.destroy();
  private readonly refresh = () => {
    this.conflict = undefined;
    try {
      if (this.structured()) this.sync();
      else {
        this.syncMetadata();
        this.spans = this.text.length
          ? [{ start: 0, end: this.text.length, root: this.story, offset: 0 }]
          : [];
      }
      this.conflict = undefined;
    } catch (error) {
      this.conflict = error instanceof Error ? error : new Error(String(error));
    }
  };
  constructor(
    readonly doc: Y.Doc,
    readonly story: string,
  ) {
    this.sourceText = doc.getText(story);
    wordParagraphIdentity(this.sourceText, this.sourceText.length);
    this.projectedText = this.projection.getText(story);
    views.set(this.sourceText, this);
    views.set(this.text, this);
    owners.set(this.projection, doc);
    this.sync();
    setWordParagraphIdentity(this.text, (at) => {
      if (!this.structured()) return wordParagraphIdentity(this.sourceText, at);
      let low = 0, high = this.spans.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (this.spans[middle]!.end <= at) low = middle + 1;
        else high = middle;
      }
      const span = this.spans[low];
      if (!span) return `${this.story}:end`;
      return span.virtual
        ? `${span.root}:end`
        : wordParagraphIdentity(doc.getText(span.root), span.offset + at - span.start);
    });
    this.sourceText.observe(this.sourceChanged);
    doc.on("afterTransaction", this.refresh);
    doc.on("destroy", this.disposed);
  }
  private syncMetadata() {
    const source = this.doc.getMap("word"),
      target = this.projection.getMap("word");
    for (const key of target.keys()) if (!source.has(key)) target.delete(key);
    for (const [key, value] of source) if (target.get(key) !== value) target.set(key, value);
  }
  sync() {
    const next = projectWordSharedText(this.doc, this.story);
    this.spans = next.spans;
    this.tables = next.tables;
    this.projection.transact(() => {
      this.syncMetadata();
      syncWordView(this.text, next.delta);
    });
  }
  anchor(range: WordRange) {
    return anchorWordView(this.doc, this.spans, range);
  }
  resolve(anchor: WordAnchor) {
    return resolveWordView(this.doc, this.spans, anchor);
  }
  range(selection: WordScopedSelection): WordRange {
    const value =
      "cell" in selection
        ? payload(this.doc, selection.cell)
        : { text: this.doc.getText(selection.story), start: 0 };
    const root = value
      ? Y.createRelativePositionFromTypeIndex(value.text, 0).tname!
      : "cell" in selection
        ? cellName(selection.cell)
        : selection.story;
    const at = (offset: number) =>
      value
        ? Y.createRelativePositionFromTypeIndex(value.text, value.start + offset)
        : Y.createRelativePositionFromJSON({ tname: root, assoc: 0 });
    return this.resolve({ start: at(selection.range.start), end: at(selection.range.end) });
  }
  /** Locate the actual payload; implicit cells need no root until their first edit. */
  selection(range: WordRange): WordScopedSelection {
    const span =
      this.spans.find((span) => range.start >= span.start && range.start < span.end) ??
      this.spans.at(-1);
    if (!span) return { story: this.story, range };
    const last =
      range.start === range.end
        ? span
        : (this.spans.find((span) => range.end > span.start && range.end <= span.end) ?? span);
    if (JSON.stringify(span.cell) !== JSON.stringify(last.cell) || span.root !== last.root)
      throw new Error("This operation needs a selection within one cell or story.");
    const offset = (at: number, side: WordViewSpan) =>
      side.offset + (side.virtual ? 0 : at - side.start);
    if (span.cell) {
      const reference = tableParagraphs(this.text).find(
        (p) => range.start >= p.start && range.start < p.end,
      )?.table;
      const members = tableParagraphs(this.sourceText).filter(
        (p) => p.table?.cell === reference?.cell,
      );
      const source = this.doc.share.has(tableName(span.cell))
        ? payload(this.doc, span.cell)
        : members.length
          ? { start: members[0]!.start, end: members.at(-1)!.end - 1 }
          : undefined;
      const from = source?.start ?? 0,
        end = source?.end ?? 0;
      return {
        cell: span.cell,
        range: {
          start: Math.max(0, Math.min(end, offset(range.start, span)) - from),
          end: Math.max(0, Math.min(end, offset(range.end, last)) - from),
        },
      };
    }
    return {
      story: span.root,
      range: { start: offset(range.start, span), end: offset(range.end, last) },
    };
  }
  prepareMigration(): PreparedWordUpdate {
    return stageWordUpdate(this.doc, (staged) => {
      this.migrate(staged);
      return undefined;
    });
  }
  prepareDelta(delta: WordDelta): PreparedWordUpdate {
    if (this.conflict) throw this.conflict;
    if (!this.structured()) this.sync();
    return stageWordUpdate(this.doc, (staged) => {
      const migrated = this.migrate(staged);
      const tables = migrated ? projectWordSharedText(staged, this.story).tables : this.tables;
      applyWordViewDelta(staged, this.story, this.text, this.spans, delta, tables);
      return undefined;
    });
  }
  prepareOperation(
    range: WordRange,
    operation: WordOperation,
    context: WordScopedOperationContext = {},
  ): PreparedWordUpdate & { range: WordRange } {
    if (this.conflict) throw this.conflict;
    if (!this.structured()) this.sync();
    const cellId = "cellId" in operation.input ? operation.input.cellId : undefined;
    const target = cellId && tableParagraphs(this.text).find((p) => p.table?.cell === cellId);
    if (cellId && !target) throw new Error("The table cell changed. Read the document again.");
    const selection = this.selection(target ? { start: target.start, end: target.start } : range);
    let result = range;
    const migration = stageWordUpdate(this.doc, (staged) => {
      this.migrate(staged);
      if (!cellId && operation.name !== "fit-table" && this.structured(staged)) {
        result = applyWordViewOperation(staged, this.story, this.text, selection, range, operation, context);
        const after = new WordSharedText(staged, this.story);
        try {
          const scoped = after.selection(result);
          return scoped.range.end - scoped.range.start === result.end - result.start ? scoped : undefined;
        } finally { after.destroy(); }
      }
      const after = applyWordScopedOperation(staged, selection, operation, context);
      const view = new WordSharedText(staged, this.story);
      try {
        if (after) result = view.range(after);
        else {
          const at = Math.min(target ? target.start : range.start, Math.max(0, view.text.length - 1));
          result = { start: at, end: at };
        }
        return after ?? view.selection(result);
      } finally {
        view.destroy();
      }
    });
    return { ...migration, range: result };
  }
  prepareChanges(changes: readonly WordChange[]): PreparedWordUpdate {
    if (this.conflict) throw this.conflict;
    const commands = createWordCommands();
    const canonical = (anchor: WordAnchor) => {
      try { this.resolve(anchor); return anchor; }
      catch { return this.anchor(commands.resolveWordRange(this.text, anchor)); }
    };
    const anchored = changes.map(change => change.kind === 'image-move'
      ? { ...change, target: canonical(change.target), destination: canonical(change.destination) }
      : { ...change, target: canonical(change.target) });
    return stageWordUpdate(this.doc, (staged) => {
      this.migrate(staged);
      const view = new WordSharedText(staged, this.story);
      const commands = createWordCommands();
      try {
        for (const change of anchored) {
          view.sync();
          const range = view.resolve(change.target);
          if (
            change.expected !== undefined &&
            view.text.toString().slice(range.start, range.end) !== change.expected
          )
            throw new Error("Target changed. Read the document again.");
          if (change.kind === "table-edit" || change.kind === "table-format") {
            const target = tableParagraphs(view.text).find(
              (p) => p.table?.id === change.tableId && p.table.cell === change.cellId,
            );
            if (!target) throw new Error("The table cell changed. Read the document again.");
            const selection = view.selection({ start: target.start, end: target.start });
            if (!("cell" in selection)) throw new Error("Select a table cell.");
            if (change.kind === "table-format")
              applyStructuredChange(staged, {
                kind: "table-format",
                cell: selection.cell,
                patch: change.patch,
              });
            else
              applyWordScopedOperation(staged, selection, {
                name: "edit-table",
                input: { cellId: change.cellId, action: change.action },
              });
          } else {
            const target = commands.anchorWordRange(view.text, range);
            const local =
              change.kind === "image-move"
                ? {
                    ...change,
                    target,
                    destination: commands.anchorWordRange(
                      view.text,
                      view.resolve(change.destination),
                    ),
                  }
                : { ...change, target };
            const delta = commands.wordTransaction(view.text, [local]);
            applyWordViewDelta(staged, this.story, view.text, view.spans, delta, view.tables);
          }
        }
      } finally {
        view.destroy();
      }
      return undefined;
    });
  }
  private migrate(doc: Y.Doc) {
    let migrated = false;
    for (const [name, value] of doc.share) {
      if (!(value instanceof Y.Text)) continue;
      const seen = new Set<string>();
      for (const p of tableParagraphs(value))
        for (const ref of [...(p.table?.parents ?? []), ...(p.table ? [p.table] : [])])
          if (ref.schema !== 2 && !seen.has(ref.id)) {
            migrateTable(doc, { story: name, table: ref.id });
            migrated = true;
            seen.add(ref.id);
          }
    }
    return migrated;
  }
  commit(prepared: PreparedWordUpdate, origin?: unknown) {
    return commitWordUpdate(this.doc, prepared, origin);
  }
  destroy() {
    setWordParagraphIdentity(this.projectedText, undefined);
    this.doc.off("afterTransaction", this.refresh);
    this.doc.off("destroy", this.disposed);
    this.sourceText.unobserve(this.sourceChanged);
    views.delete(this.sourceText);
    views.delete(this.projectedText);
    this.projection.destroy();
  }
}
