import { wordChartTitleText } from "../chart-title.ts";
import type * as Y from "yjs";
import { z } from "zod";
import type { WordArtifact } from "../artifact.ts";
import type { TextAttributes } from "../collaboration/formatting.ts";
import { WORD_BUILTIN_STYLES } from "../authored-styles.ts";

export const inspectInput = z
  .object({
    what: z.enum(["styles", "objects", "regions", "geometry"]).default("objects"),
    region: z.string().default("body"),
    offset: z.number().int().nonnegative().default(0),
  })
  .strict();
export type InspectInput = z.infer<typeof inspectInput>;
/** Bounded inspection exposes editable values and offsets without leaking source XML or image bytes. */
export function inspectWordObjects(text: Y.Text, source: WordArtifact | undefined, offset = 0) {
  const objects: { start: number; end: number; attributes: TextAttributes; source?: object }[] = [];
  let at = 0;
  const parts: { insert: string; attributes?: TextAttributes }[] = text.toDelta();
  for (const part of parts) {
    for (let i = 0; i < part.insert.length; i++)
      if (part.insert[i] === "\uFFFC" && at + i >= offset) {
        const a = part.attributes ?? {};
        const original =
          a.wordSource === undefined ? undefined : source?.document.drawings.get(a.wordSource);
        objects.push({
          start: at + i,
          end: at + i + 1,
          attributes: a,
          ...(original
            ? {
                source: {
                  kind: original.kind,
                  width: original.widthPoints,
                  height: original.heightPoints,
                  placement: original.placement,
                  anchor: original.anchor,
                  ...(original.kind === "chart"
                    ? {
                        chartTitle: original.model.title,
                        chartTitleText: wordChartTitleText(original.model),
                      }
                    : {}),
                  ...(original.kind === "image" && original.ink
                    ? { ink: { traces: original.ink.traces } }
                    : {}),
                },
              }
            : {}),
        });
        if (objects.length === 100) return { objects, next: at + i + 1 };
      }
    at += part.insert.length;
  }
  return { objects, next: null };
}
export function inspectWordStyles(source?: WordArtifact) {
  return { styles: source?.document.styles.styles ?? [], builtins: WORD_BUILTIN_STYLES };
}
