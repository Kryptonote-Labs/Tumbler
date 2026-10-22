import * as Y from "yjs";
import { validateWordSharedDocument } from "./transactions.ts";

type Entry =
  | { kind: "update"; update: Uint8Array; local: boolean }
  | { kind: "undo" | "redo" };
/** Replay history on an isolated document before undo, so conflicts never mutate live state. */
export class WordStructuredUndo {
  readonly origin = {};
  private readonly initial: Uint8Array;
  private readonly entries: Entry[] = [];
  private performing = false;
  private readonly replayClientID = new Y.Doc().clientID;
  private readonly observe = (update: Uint8Array, origin: unknown) => {
    if (!this.performing)
      this.entries.push({
        kind: "update",
        update: update.slice(),
        local: origin === this.origin,
      });
  };
  constructor(private readonly doc: Y.Doc) {
    this.initial = Y.encodeStateAsUpdate(doc);
    doc.on("update", this.observe);
  }
  private replay() {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, this.initial);
    doc.clientID = this.replayClientID;
    const restoreTypes = () => {
      for (const [name, value] of this.doc.share)
        if (value instanceof Y.Text) doc.getText(name);
        else if (value instanceof Y.Map) doc.getMap(name);
    };
    restoreTypes();
    const local = {};
    const undo = new Y.UndoManager(doc, {
      trackedOrigins: new Set([local]),
      captureTimeout: 0,
    });
    for (const entry of this.entries) {
      if (entry.kind === "update")
        Y.applyUpdate(doc, entry.update, entry.local ? local : null);
      else undo[entry.kind]();
    }
    restoreTypes();
    return { doc, undo };
  }
  private change(kind: "undo" | "redo") {
    const { doc, undo } = this.replay();
    try {
      const vector = Y.encodeStateVector(doc);
      const changed = undo[kind]();
      if (!changed) return false;
      validateWordSharedDocument(doc);
      const update = Y.encodeStateAsUpdate(doc, vector);
      this.performing = true;
      try {
        Y.applyUpdate(this.doc, update, this.origin);
      } finally {
        this.performing = false;
      }
      // Persist the resulting update and action together: later replays need exactly
      // these generated redo item identities, rather than fresh replay client IDs.
      this.entries.push({ kind });
      return true;
    } finally {
      undo.destroy();
      doc.destroy();
    }
  }
  undo() {
    return this.change("undo");
  }
  redo() {
    return this.change("redo");
  }
  destroy() {
    this.doc.off("update", this.observe);
  }
}
