import { inheritWordLayoutSource, validateWordLayout } from '../layout-validation.ts';
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

import {
  checkpoint, takeReplica, discardReplica, provePreparation, consumePreparation,
  retainCommittedReplica, observeInlineEdit,
} from './preparation-cache.ts';
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
  validateWordLayout(doc);
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
  const before = checkpoint(doc);
  const { replica: retained, validated } = takeReplica(doc);
  const replica = retained.doc;
  try {
    if (!validated) {
      // Rich-text roots must exist before decoding so Yjs installs formatting state.
      // Upgrading a generic root afterward loses Y.Text's formatting seek flags.
      for (const [name, value] of doc.share)
        if (value instanceof Y.Text) replica.getText(name);
        else if (value instanceof Y.Map) replica.getMap(name);
      Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
      inheritWordLayoutSource(doc, replica);
    }
    const vector = Y.encodeStateVector(replica);
    const inline = validated ? observeInlineEdit(replica, doc) : undefined;
    let selection: WordScopedSelection | undefined;
    try {
      replica.transact(() => { selection = edit(replica); });
    } finally { inline?.stop(); }
    if (!inline?.valid()) validateWordSharedDocument(replica);
    const prepared = {
      update: Y.encodeStateAsUpdate(replica, vector),
      ...(selection ? { selection } : {}),
    };
    provePreparation(doc, before, prepared.update, retained);
    return prepared;
  } catch (error) {
    discardReplica(retained);
    throw error;
  }
}
/** Revalidate against the current document before the one atomic local commit. */
export function commitWordUpdate(
  doc: Y.Doc,
  prepared: PreparedWordUpdate,
  origin: unknown = null,
) {
  const validated = consumePreparation(doc, prepared.update);
  if (validated) {
    Y.applyUpdate(doc, prepared.update, origin);
    // New cells were validated in the prepared replica and need concrete root constructors.
    for (const name of doc.share.keys())
      if (name.startsWith("word-cell-v2:")) doc.getText(name);
    retainCommittedReplica(doc, validated);
    return prepared.selection;
  }
  const candidate = new Y.Doc();
  try {
    for (const [name, value] of doc.share)
      if (value instanceof Y.Text) candidate.getText(name);
      else if (value instanceof Y.Map) candidate.getMap(name);
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
    inheritWordLayoutSource(doc, candidate);
    Y.applyUpdate(candidate, prepared.update);
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
