import * as Y from "yjs";
import type { WordDelta } from "../commands.ts";

/** Stage a local payload under its real root name with isolated document metadata. */
export function withWordOperationText<T>(source: Y.Text, content: WordDelta, edit: (text: Y.Text) => T): T {
  if (!source.doc) throw new Error("The document is not attached.");
  const name = Y.createRelativePositionFromTypeIndex(source, 0).tname;
  if (!name) throw new Error("Missing document story.");
  const temporary = new Y.Doc();
  try {
    Y.applyUpdate(temporary, Y.encodeStateAsUpdate(source.doc));
    for (const [root, value] of source.doc.share)
      if (value instanceof Y.Text) temporary.getText(root);
      else if (value instanceof Y.Map) temporary.getMap(root);
    const local = temporary.getText(name);
    local.delete(0, local.length);
    local.applyDelta(content);
    return edit(local);
  } finally { temporary.destroy(); }
}
