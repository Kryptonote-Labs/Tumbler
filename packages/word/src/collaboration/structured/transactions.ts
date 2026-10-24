import { readWordDocumentSettings } from '../document-settings.ts';
import * as Y from "yjs";
import { validateWordText } from "../validation.ts";
import { tableAddresses, validateStructuredTables } from "./state.ts";
import { applyStructuredChange } from "./edits.ts";
import type {
  WordScopedSelection,
  WordStructuredChange,
  PreparedWordUpdate,
} from "./types.ts";
export type {
  WordScopedSelection,
  WordScopedAnchor,
  WordStructuredChange,
  PreparedWordUpdate,
} from "./types.ts";
export {
  selectionText,
  anchorScopedSelection,
  resolveScopedAnchor,
} from "./selection.ts";
export { editDerivedText, applyStructuredChange } from "./edits.ts";
export function validateWordSharedDocument(doc: Y.Doc) {
  readWordDocumentSettings(doc);
  for (const address of tableAddresses(doc)) doc.getText(address.story);
  for (const name of doc.share.keys())
    if (name.startsWith("word-cell-v2:")) doc.getText(name);
  for (const [name] of doc.share)
    if (
      !name.startsWith("word-table-v2:") &&
      !name.startsWith("word-cell-format-v2:")
    ) {
      const value = doc.share.get(name);
      if (value instanceof Y.Text) validateWordText(value);
    }
  validateStructuredTables(doc);
}
/** Full updates preserve edits to named cell roots and structural maps. Preparation is read-only. */
export function prepareWordUpdate(
  doc: Y.Doc,
  changes: readonly WordStructuredChange[],
): PreparedWordUpdate {
  return stageWordUpdate(doc, (replica) => {
    let selection: WordScopedSelection | undefined;
    for (const change of changes)
      selection = applyStructuredChange(replica, change);
    return selection;
  });
}
export function stageWordUpdate(
  doc: Y.Doc,
  edit: (replica: Y.Doc) => WordScopedSelection | undefined,
): PreparedWordUpdate {
  const replica = new Y.Doc();
  try {
    Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
    // Restore root constructors after decoding. Yjs initially represents unknown roots generically.
    for (const [name, value] of doc.share)
      if (value instanceof Y.Text) replica.getText(name);
      else if (value instanceof Y.Map) replica.getMap(name);
    const vector = Y.encodeStateVector(replica);
    let selection: WordScopedSelection | undefined;
    replica.transact(() => {
      selection = edit(replica);
    });
    validateWordSharedDocument(replica);
    return {
      update: Y.encodeStateAsUpdate(replica, vector),
      ...(selection ? { selection } : {}),
    };
  } finally {
    replica.destroy();
  }
}
/** Revalidate against the current document before the one atomic local commit. */
export function commitWordUpdate(
  doc: Y.Doc,
  prepared: PreparedWordUpdate,
  origin: unknown = null,
) {
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(candidate, prepared.update);
    for (const [name, value] of doc.share)
      if (value instanceof Y.Text) candidate.getText(name);
      else if (value instanceof Y.Map) candidate.getMap(name);
    for (const address of tableAddresses(candidate)) {
      candidate.getText(address.story);
      for (const name of candidate.share.keys())
        if (name.startsWith("word-cell-v2:")) candidate.getText(name);
    }
    validateWordSharedDocument(candidate);
    Y.applyUpdate(doc, prepared.update, origin);
    for (const name of candidate.share.keys())
      if (name.startsWith("word-cell-v2:")) doc.getText(name);
    return prepared.selection;
  } finally {
    candidate.destroy();
  }
}
