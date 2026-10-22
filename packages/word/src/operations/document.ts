import { setWordResetSource } from '../collaboration/source-resets.ts';
import { hasWordParagraphReset, readWordParagraphFormat } from "../collaboration/paragraph-attributes.ts";
import type { DocumentImage } from "../collaboration/images.ts";
import * as Y from "yjs";
import type { WordArtifact } from "../artifact.ts";
import type { WordTextParagraph, WordTextRun } from "../create.ts";
import type { TextAttributes } from "../collaboration/formatting.ts";
import { groupTableParagraphs, type TableCell } from "../collaboration/tables.ts";
import { reconcileWordContent } from "../package-document.ts";
import { importOperationDelta } from "./import.ts";

/** A disposable editing session retaining source XML identities for faithful package reconciliation. */
export function openWordOperationDocument(
  source: WordArtifact,
  resolveImage?: (image: DocumentImage) => Uint8Array,
) {
  const doc = new Y.Doc();
  const text = doc.getText("body");
  text.applyDelta(importOperationDelta(source));
  setWordResetSource(text, source.document);
  return {
    text,
    destroy: () => doc.destroy(),
    artifact: () => reconcileWordContent(source, project(text, source, resolveImage)),
  };
}
function project(
  text: Y.Text,
  source: WordArtifact,
  resolveImage?: (image: DocumentImage) => Uint8Array,
) {
  const paragraphs: (WordTextParagraph & { kind: "paragraph"; table?: TableCell })[] = [];
  let runs: WordTextRun[] = [];
  const parts: { insert: string; attributes?: TextAttributes }[] = text.toDelta();
  for (const part of parts) {
    const a = part.attributes ?? {};
    const paragraph = readWordParagraphFormat(a);
    const {
      fontFamily,
      bold,
      italic,
      strike,
      color,
      highlight,
      shading,
      verticalAlign,
      characterSpacingPoints,
    } = a;
    const format = Object.fromEntries(
      Object.entries({
        fontFamily,
        bold,
        italic,
        strike,
        color,
        highlight,
        shading,
        verticalAlign,
        characterSpacingPoints,
        fontSizePoints: a.fontSize,
        underline:
          a.underline === undefined
            ? undefined
            : a.underline
              ? (a.wordUnderline ?? "single")
              : "none",
      }).filter(([, v]) => v !== undefined),
    ) as NonNullable<WordTextRun["format"]>;
    const {
      shape,
      drawing,
      ink,
      inkTraces,
      chartTitle,
      chartTitleText,
      breakType,
      link,
      field,
      tab,
    } = a;
    const properties = Object.fromEntries(
      Object.entries({
        shape,
        drawing,
        ink,
        inkTraces,
        chartTitle,
        chartTitleText,
        breakType,
        link,
        field,
        tab,
        source: a.wordSource,
        sourceCopy: a.wordCopy,
      }).filter(([, v]) => v !== undefined),
    );
    const original =
      a.wordSource === undefined ? undefined : source.document.drawings.get(a.wordSource);
    const imageBytes = a.image
      ? original?.kind === "image"
        ? original.bytes
        : resolveImage?.(a.image)
      : undefined;
    if (a.image && !imageBytes)
      throw new Error("Image source unavailable. Supply an image resolver.");
    const image =
      a.image && imageBytes
        ? (() => {
            const { id: _id, type, ...placement } = a.image!;
            return { ...placement, bytes: imageBytes, contentType: type };
          })()
        : undefined;
    const lines = part.insert.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const value = lines[i]!;
      if (value)
        for (const content of a.shape || a.image || a.field || a.breakType || a.tab || a.drawing
          ? [...value]
          : [value])
          runs.push({
            text: content,
            format,
            resetFormat: true,
            ...properties,
            ...(image ? { image } : {}),
          });
      if (i < lines.length - 1) {
        paragraphs.push({
          kind: "paragraph",
          runs,
          ...(a.wordParagraph === undefined ? {} : { source: a.wordParagraph }),
          ...(a.wordCopy === undefined ? {} : { sourceCopy: a.wordCopy }),
          ...(a.styleId ? { styleId: a.styleId } : {}),
          ...(paragraph !== undefined ? { paragraph } : {}),
          ...(hasWordParagraphReset(a) ? { resetParagraphFormat: true } : {}),
          ...(a.positioning ? { positioning: a.positioning } : {}),
          ...(a.list ? { list: a.list } : {}),
          ...(a.table ? { table: a.table } : {}),
          alignment:
            a.align === "right"
              ? "end"
              : a.align === "center" || a.align === "justify"
                ? a.align
                : "start",
        });
        runs = [];
      }
    }
  }
  if (runs.length) paragraphs.push({ kind: "paragraph", runs });
  return groupTableParagraphs(paragraphs);
}
