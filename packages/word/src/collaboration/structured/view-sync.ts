import * as Y from "yjs";
import type { WordDelta } from "../commands.ts";

/** Preserve unchanged view characters, then update only attributes that actually differ. */
export function syncWordView(text: Y.Text, next: WordDelta) {
  const before = text.toString();
  const after = next.map((part) => (typeof part.insert === "string" ? part.insert : "")).join("");
  let start = 0,
    tail = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  if (start && /[\uD800-\uDBFF]/.test(before[start - 1]!)) start--;
  while (
    tail < before.length - start &&
    tail < after.length - start &&
    before.at(-tail - 1) === after.at(-tail - 1)
  )
    tail++;
  if (tail && /[\uDC00-\uDFFF]/.test(before[before.length - tail]!)) tail--;
  text.doc!.transact(() => {
    if (before.length - start - tail) text.delete(start, before.length - start - tail);
    if (after.length - start - tail) text.insert(start, after.slice(start, after.length - tail));
    let at = 0;
    const old: { insert: string; attributes?: Record<string, unknown> }[] = text.toDelta();
    let oldIndex = 0,
      oldEnd = old[0]?.insert.length ?? 0;
    for (const part of next) {
      if (typeof part.insert !== "string") throw new Error("Only text can be projected.");
      const end = at + part.insert.length;
      while (at < end) {
        while (oldEnd <= at && oldIndex < old.length - 1) oldEnd += old[++oldIndex]!.insert.length;
        const count = Math.min(end, oldEnd) - at;
        if (count <= 0) throw new Error("Invalid projected text length.");
        const previous = old[oldIndex]?.attributes ?? {},
          attributes = part.attributes ?? {};
        const patch: Record<string, unknown> = {};
        for (const key of new Set([...Object.keys(previous), ...Object.keys(attributes)]))
          if (JSON.stringify(previous[key]) !== JSON.stringify(attributes[key]))
            patch[key] = attributes[key] ?? null;
        if (Object.keys(patch).length) text.format(at, count, patch);
        at += count;
      }
    }
  });
}
