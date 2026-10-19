import * as Y from "yjs";
import { importWordContent } from "../import-content.ts";
import type { WordArtifact } from "../artifact.ts";
import type { WordTextFormat } from "../create.ts";
import type { WordContentBlock } from "../create-content.ts";
import type { TextAttributes } from "../collaboration/formatting.ts";
import type { TableCell } from "../collaboration/tables.ts";
import type { DocumentImage } from "../collaboration/images.ts";

function runAttributes(format: WordTextFormat | undefined): TextAttributes {
  if (!format) return {};
  const { fontSizePoints, underline, highlight } = format;
  const rest = Object.fromEntries(
    Object.entries(format).filter(([key]) =>
      [
        "fontFamily",
        "bold",
        "italic",
        "strike",
        "color",
        "shading",
        "verticalAlign",
        "characterSpacingPoints",
      ].includes(key),
    ),
  );
  return {
    ...rest,
    ...(highlight === undefined ? {} : { highlight }),
    ...(fontSizePoints === undefined ? {} : { fontSize: fontSizePoints }),
    ...(underline === undefined
      ? {}
      : {
          underline: underline !== "none",
          ...(underline === "single" || underline === "double" ? { wordUnderline: underline } : {}),
        }),
  };
}
export function importOperationDelta(artifact: WordArtifact) {
  const delta: Parameters<Y.Text["applyDelta"]>[0] = [];
  const visit = (blocks: readonly WordContentBlock[], parents: TableCell[] = []) => {
    for (const block of blocks) {
      if (block.kind === "table") {
        const columns = block.rows.reduce(
          (maximum, row, index) =>
            Math.max(
              maximum,
              (block.rowGrids?.[index]?.before ?? 0) +
                (block.rowGrids?.[index]?.after ?? 0) +
                row.reduce((n, cell) => n + (cell.gridSpan ?? 1), 0),
            ),
          block.columnWidths?.length ?? 0,
        );
        block.rows.forEach((row, rowIndex) => {
          const grid = block.rowGrids?.[rowIndex];
          let column = grid?.before ?? 0;
          row.forEach((cell) => {
            const table: TableCell = {
              id: `source-${block.source}`,
              row: `source-${block.rowSources?.[rowIndex]}`,
              cell: `source-${cell.source}`,
              column,
              columns,
              ...(grid ? { before: grid.before, after: grid.after } : {}),
              widths: [...(block.columnWidths ?? [])],
              span: cell.gridSpan ?? 1,
              ...(cell.format ? { format: cell.format } : {}),
              ...(block.rowFormats?.[rowIndex] ? { rowFormat: block.rowFormats[rowIndex]! } : {}),
              ...(cell.verticalMerge ? { merge: cell.verticalMerge } : {}),
              source: {
                table: block.source!,
                row: block.rowSources![rowIndex]!,
                cell: cell.source!,
              },
              ...(parents.length
                ? { parents: parents.map(({ parents: _ancestors, ...parent }) => parent) }
                : {}),
            };
            visit(cell.blocks, [...parents, table]);
            column += cell.gridSpan ?? 1;
          });
        });
      } else if (block.kind === "paragraph") {
        let emptyFormats: TextAttributes = {};
        for (const run of block.runs) {
          const format = run.format;
          const drawing =
            run.source === undefined ? undefined : artifact.document.drawings.get(run.source);
          const image: DocumentImage | undefined =
            drawing?.kind === "image" &&
            (drawing.contentType === "image/png" || drawing.contentType === "image/jpeg")
              ? {
                  id: `source-image-${drawing.elementId}`,
                  type: drawing.contentType,
                  width: drawing.widthPoints,
                  height: drawing.heightPoints,
                  alt: drawing.altText ?? "",
                  layout:
                    drawing.placement === "inline"
                      ? "inline"
                      : drawing.anchor?.behindDocument
                        ? "behind"
                        : "front",
                  ...(drawing.anchor
                    ? {
                        x: drawing.anchor.horizontalOffsetPoints ?? 0,
                        y: drawing.anchor.verticalOffsetPoints ?? 0,
                        moveWithText: drawing.anchor.verticalRelativeTo !== "page",
                        ...(drawing.anchor.horizontalRelativeTo === "page" ||
                        drawing.anchor.horizontalRelativeTo === "column"
                          ? { horizontalRelativeTo: drawing.anchor.horizontalRelativeTo }
                          : {}),
                        ...(drawing.anchor.verticalRelativeTo === "page" ||
                        drawing.anchor.verticalRelativeTo === "line" ||
                        drawing.anchor.verticalRelativeTo === "paragraph"
                          ? { verticalRelativeTo: drawing.anchor.verticalRelativeTo }
                          : {}),
                      }
                    : {}),
                }
              : undefined;
          const attributes: TextAttributes = {
            ...(image ? { image } : {}),
            ...(run.shape ? { shape: run.shape } : {}),
            ...(run.breakType ? { breakType: run.breakType } : {}),
            ...(run.link !== undefined ? { link: run.link } : {}),
            ...(format?.strike !== undefined ? { strike: format.strike } : {}),
            ...(format?.shading !== undefined ? { shading: format.shading } : {}),
            ...(format?.highlight !== undefined ? { highlight: format.highlight } : {}),
            ...(format?.verticalAlign !== undefined ? { verticalAlign: format.verticalAlign } : {}),
            ...(format?.characterSpacingPoints !== undefined
              ? { characterSpacingPoints: format.characterSpacingPoints }
              : {}),
            ...(run.field ? { field: run.field } : {}),
            ...(run.tab ? { tab: run.tab } : {}),
            ...(run.source ? { wordSource: run.source } : {}),
            ...runAttributes(format),
            ...(run.drawing ? { drawing: run.drawing } : {}),
            ...(run.ink ? { ink: run.ink } : {}),
            ...(run.inkTraces ? { inkTraces: run.inkTraces } : {}),
            ...(run.chartTitle !== undefined ? { chartTitle: run.chartTitle } : {}),
            ...(run.chartTitleText ? { chartTitleText: run.chartTitleText } : {}),
          };
          if (run.text) delta.push({ insert: run.text, attributes });
          else emptyFormats = attributes;
        }
        delta.push({
          insert: "\n",
          attributes: {
            ...emptyFormats,
            wordParagraph: block.source,
            ...(block.styleId ? { styleId: block.styleId } : {}),
            ...(block.paragraph ? { paragraph: block.paragraph } : {}),
            ...(block.positioning ? { positioning: block.positioning } : {}),
            ...(block.list ? { list: block.list } : {}),
            ...(block.alignment && block.alignment !== "start"
              ? { align: block.alignment === "end" ? ("right" as const) : block.alignment }
              : {}),
            ...(parents.length ? { table: parents.at(-1)! } : {}),
          },
        });
      }
    }
  };
  visit(importWordContent(artifact));
  if (!delta.length || delta.at(-1)?.attributes?.table) delta.push({ insert: "\n" });
  return delta;
}
