import * as Y from "yjs";
import { validateWordSharedDocument } from "./transactions.ts";

/** Validate document-wide undo against current remote edits before changing live state or history. */
export function preflightWordUndo(
  doc: Y.Doc,
  manager: Y.UndoManager,
  redo = false,
  validate: (candidate: Y.Doc) => void = validateWordSharedDocument,
) {
  if (manager.doc !== doc || manager.scope.length !== 1 || manager.scope[0] !== doc)
    throw new Error("Guarded undo requires document-wide history for this document.");
  const candidate = new Y.Doc({ gc: false });
  Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
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
    deleteFilter: manager.deleteFilter,
    ignoreRemoteMapChanges: manager.ignoreRemoteMapChanges,
  });
  try {
    history.undoStack = [...manager.undoStack];
    history.redoStack = [...manager.redoStack];
    const item = redo ? history.redo() : history.undo();
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
    this.manager = new Y.UndoManager(doc, {
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
