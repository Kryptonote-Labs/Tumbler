import { inheritWordLayoutSource } from '../layout-validation.ts';
import * as Y from "yjs";
import { validateWordSharedDocument } from "./transactions.ts";
import { retainWordSourceTextUndo } from '../source-text-undo.ts';

const filters = new WeakMap<Y.UndoManager, Y.UndoManager["deleteFilter"]>();

/** Keep document operations atomic; host callbacks must not filter individual CRDT items. */
export function createWordUndoManager(
  doc: Y.Doc,
  options: Pick<NonNullable<ConstructorParameters<typeof Y.UndoManager>[1]>, "trackedOrigins" | "captureTimeout"> = {},
) {
  const manager = new Y.UndoManager(doc, {
    trackedOrigins: options.trackedOrigins,
    captureTimeout: options.captureTimeout,
  });
  filters.set(manager, manager.deleteFilter);
  manager.on('stack-item-popped', () => retainWordSourceTextUndo(doc));
  return manager;
}

/** Validate document-wide undo against current remote edits before changing live state or history. */
export function preflightWordUndo(
  doc: Y.Doc,
  manager: Y.UndoManager,
  redo = false,
  validate: (candidate: Y.Doc) => void = validateWordSharedDocument,
) {
  if (manager.doc !== doc || manager.scope.length !== 1 || manager.scope[0] !== doc)
    throw new Error("Guarded undo requires document-wide history for this document.");
  if (!filters.has(manager) || filters.get(manager) !== manager.deleteFilter)
    throw new Error("Use createWordUndoManager for guarded undo; custom item filters are unsupported.");
  const candidate = new Y.Doc({ gc: false });
  Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
  inheritWordLayoutSource(doc, candidate);
  for (const [name, value] of doc.share) {
    if (value instanceof Y.Text) candidate.getText(name);
    else if (value instanceof Y.Map) candidate.getMap(name);
  }
  // Redone links are local undo metadata and are not encoded in a Yjs update.
  // Preserve their exact item boundaries so rehearsal follows restored characters too.
  candidate.transact(transaction => {
    for (const structs of doc.store.clients.values())
      for (const source of structs) {
        if (!(source instanceof Y.Item) || !source.redone) continue;
        const item = Y.getItemCleanStart(transaction, source.id);
        Y.getItemCleanEnd(transaction, candidate.store, Y.createID(source.id.client, source.id.clock + source.length - 1));
        item.redone = Y.createID(source.redone.client, source.redone.clock);
      }
  });
  const history = new Y.UndoManager(candidate, {
    ignoreRemoteMapChanges: manager.ignoreRemoteMapChanges,
  });
  try {
    history.undoStack = [...manager.undoStack];
    history.redoStack = [...manager.redoStack];
    const item = redo ? history.redo() : history.undo();
    if (item) retainWordSourceTextUndo(candidate);
    if (item) validate(candidate);
    return !!item;
  } finally {
    history.destroy();
    candidate.destroy();
  }
}

/** Document-wide selective undo, including cell roots created after the history starts. */
export class WordStructuredUndo {
  readonly origin = {};
  private readonly manager: Y.UndoManager;
  constructor(private readonly doc: Y.Doc) {
    this.manager = createWordUndoManager(doc, {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 0,
    });
  }
  undo() {
    preflightWordUndo(this.doc, this.manager);
    return !!this.manager.undo();
  }
  redo() {
    preflightWordUndo(this.doc, this.manager, true);
    return !!this.manager.redo();
  }
  destroy() {
    this.manager.destroy();
  }
}
