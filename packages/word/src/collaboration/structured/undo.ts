import * as Y from "yjs";
import { validateWordSharedDocument } from "./transactions.ts";

/** Validate undo against current remote edits before changing the live document or its history. */
export function preflightWordUndo(
  doc: Y.Doc,
  manager: Y.UndoManager,
  redo = false,
  validate: (candidate: Y.Doc) => void = validateWordSharedDocument,
) {
  const candidate = new Y.Doc({ gc: false });
  Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
  for (const [name, value] of doc.share) {
    if (value instanceof Y.Text) candidate.getText(name);
    else if (value instanceof Y.Map) candidate.getMap(name);
  }
  const history = new Y.UndoManager(candidate);
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
