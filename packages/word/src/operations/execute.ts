import type * as Y from "yjs";
import { createWordCommands, type WordRange } from "../collaboration/commands.ts";
import {
  positionedWordEdit,
  pageNumberEdit,
  alignWordItem,
  type WordPositionedEdit,
} from "../collaboration/page-number.ts";
import { tableParagraphs, insertTableDelta } from "../collaboration/tables.ts";
import { findWordMatches } from "../collaboration/search.ts";
import { normalizeImage } from "../collaboration/images.ts";
import { wordOperation, type WordOperation } from "./definitions.ts";
import {
  clearCharacterFormatting,
  paragraphStylePatch,
  containingParagraphRange,
} from "./formatting.ts";

// Zod accepts explicit undefined for optional fields; engine patches distinguish absence from a value.
function defined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

/** Produce one validated edit without mutating the caller. UI and service hosts commit it. */
export function createWordOperations(commands = createWordCommands()) {
  return function prepareWordOperation(
    text: Y.Text,
    range: WordRange,
    unvalidated: WordOperation,
    context: { availableWidthPoints?: number } = {},
  ): WordPositionedEdit {
    const operation = wordOperation.parse(unvalidated);
    // This also validates UTF-16/grapheme boundaries before a structural helper runs.
    commands.anchorWordRange(text, range);
    // Character formatting already has a pure delta builder. Validate that delta once;
    // rehearsing it with positionedWordEdit first would clone and scan the same text twice.
    if (operation.name === 'format') {
      const delta = commands.formatWordDelta(text, range, defined(operation.input));
      commands.validateWordDelta(text, delta);
      return { delta, selection: range };
    }
    const edit = positionedWordEdit(text, (staged) => {
      const format = (patch: Parameters<typeof commands.formatWordDelta>[2], target = range) => {
        staged.applyDelta(commands.formatWordDelta(staged, target, patch));
        return range;
      };
      switch (operation.name) {
        case 'section-layout':
        case 'section-break':
        case 'remove-section-break':
        case 'page-color':
          throw new Error('Document settings require prepareWordScopedOperation or WordSharedText.prepareOperation.');
        case "fit-table": {
          const cell = findCell(staged, range, operation.input.cellId);
          const width = context.availableWidthPoints;
          if (!width || !Number.isFinite(width))
            throw new Error("The host must resolve the actual containing width.");
          const weights =
            operation.input.columnWeights ??
            (cell.structure.widths?.length ? cell.structure.widths : undefined) ??
            Array.from({ length: cell.structure.columns }, () => 1);
          if (weights.length !== cell.structure.columns || weights.some((w) => w <= 0))
            throw new Error("Supply a positive weight per column.");
          const total = weights.reduce((a, b) => a + b, 0);
          staged.applyDelta(
            commands.wordTransaction(staged, [
              {
                kind: "table-format",
                target: commands.anchorWordRange(staged, { start: cell.start, end: cell.start }),
                tableId: cell.structure.id,
                cellId: cell.structure.cell,
                patch: {
                  scope: "table",
                  columnWidths: weights.map((w) => (width * operation.input.fraction * w) / total),
                },
              },
            ]),
          );
          return range;
        }
        case "edit-object":
        case "move-object": {
          if (range.end !== range.start + 1 || staged.toString()[range.start] !== "\uFFFC")
            throw new Error("Target exactly one inspected object.");
          const current = wordObjectAttributes(staged, range.start);
          if (operation.name === "edit-object") {
            const patch = defined(operation.input);
            if (
              (patch.image && !current.image) ||
              (patch.shape && !current.shape) ||
              (patch.ink && !current.ink)
            )
              throw new Error("The patch must match the existing object type.");
            if (current.image && (patch.image || patch.drawing)) {
              const { image, drawing, ...other } = patch;
              staged.applyDelta(commands.wordTransaction(staged, [{
                kind: "image-update",
                target: commands.anchorWordRange(staged, range),
                previous: current.image,
                image: normalizeImage({
                  ...(image ?? current.image),
                  ...drawing,
                  ...(drawing?.verticalRelativeTo
                    ? { moveWithText: drawing.verticalRelativeTo !== "page" }
                    : {}),
                }),
              }]));
              if (Object.keys(other).length) format(other);
              return range;
            }
            return format(patch);
          }
          const at = operation.input.destination;
          commands.anchorWordRange(staged, { start: at, end: at });
          if (at >= range.start && at <= range.end) return range;
          const start = at > range.start ? at - 1 : at;
          if (current.image) {
            staged.applyDelta(commands.wordTransaction(staged, [{
              kind: "image-move",
              target: commands.anchorWordRange(staged, range),
              destination: commands.anchorWordRange(staged, { start: at, end: at }),
              previous: current.image,
            }]));
          } else {
            // Moving an object carries its complete attributes, including field and source identity.
            staged.delete(range.start, 1);
            staged.insert(start, "\uFFFC", current);
          }
          return { start, end: start + 1 };
        }

        case "paragraph":
          return format(defined(operation.input));
        case "clear-formatting":
          return format(clearCharacterFormatting);
        case "style":
          return format(
            paragraphStylePatch(operation.input.styleId),
            containingParagraphRange(staged.toString(), range),
          );
        case "replace": {
          staged.applyDelta(
            commands.wordTransaction(staged, [
              {
                kind: "replace",
                target: commands.anchorWordRange(staged, range),
                value: operation.input.value,
                ...(operation.input.format ? { format: defined(operation.input.format) } : {}),
              },
            ]),
          );
          const end = range.start + operation.input.value.replace(/\r\n?/g, "\n").length;
          return { start: end, end };
        }
        case "list": {
          const { kind, restart, ...properties } = operation.input;
          if (!kind || kind === "none") return format({ list: null });
          const current = commands.wordFormats(staged, range).list;
          const id =
            restart || current?.kind !== kind || Object.keys(properties).length
              ? crypto.randomUUID()
              : (current?.id ?? crypto.randomUUID());
          const { marker, ...existing } = current ?? {};
          return format({
            list: {
              ...existing,
              ...defined(properties),
              ...(kind === "bullet" && (properties.marker ?? marker)
                ? { marker: (properties.marker ?? marker)! }
                : {}),
              id,
              kind,
              level: current?.level ?? 0,
            },
          });
        }
        case "indent-list": {
          const paragraphs = tableParagraphs(staged).filter(
            (p) =>
              p.start <= range.end &&
              p.end > range.start &&
              (range.start === range.end || p.start < range.end),
          );
          for (const paragraph of paragraphs) {
            const list = commands.wordFormats(staged, {
              start: paragraph.start,
              end: paragraph.start,
            }).list;
            if (list)
              format(
                {
                  list: {
                    ...list,
                    level: Math.max(0, Math.min(8, list.level + operation.input.amount)),
                  },
                },
                { start: paragraph.start, end: paragraph.start },
              );
          }
          return range;
        }
        case "continue-list": {
          const previous = tableParagraphs(staged)
            .filter((p) => p.end <= range.start)
            .findLast((p) => commands.wordFormats(staged, { start: p.start, end: p.start }).list);
          if (!previous) throw new Error("No preceding list in this region.");
          return format({
            list: commands.wordFormats(staged, { start: previous.start, end: previous.start })
              .list!,
          });
        }
        case "break": {
          const value = operation.input.blankPage ? "\u2028\u2028" : "\u2028";
          staged.applyDelta(
            commands.replaceWordDelta(staged, range, value, { breakType: operation.input.type }),
          );
          const end = range.start + 1;
          return { start: end, end };
        }
        case "page-number": {
          const edit = pageNumberEdit(
            staged,
            range,
            operation.input.preset,
            operation.input.alignment,
          );
          staged.applyDelta(edit.delta);
          return edit.selection;
        }
        case "align-item": {
          const edit = alignWordItem(staged, range, operation.input.alignment);
          staged.applyDelta(edit.delta);
          return edit.selection;
        }
        case "insert-table": {
          if (range.start !== range.end) throw new Error("Insert a table at a collapsed target.");
          const edit = insertTableDelta(staged, range.start, operation.input.rows);
          staged.applyDelta(edit.delta);
          return { start: edit.start, end: edit.start };
        }
        case "edit-table":
        case "format-table": {
          const cell = findCell(staged, range, operation.input.cellId);
          const target = commands.anchorWordRange(staged, { start: cell.start, end: cell.start });
          const common = { target, tableId: cell.structure.id, cellId: cell.structure.cell };
          staged.applyDelta(
            commands.wordTransaction(staged, [
              operation.name === "edit-table"
                ? { kind: "table-edit", ...common, action: operation.input.action }
                : { kind: "table-format", ...common, patch: defined(operation.input.patch) },
            ]),
          );
          const end = Math.min(range.start, commands.bodyLength(staged));
          return { start: end, end };
        }
        case "replace-all": {
          const { query, value, ...options } = operation.input;
          const matches = findWordMatches(
            staged.toString().slice(range.start, range.end),
            query,
            defined(options),
          );
          staged.applyDelta(
            commands.wordTransaction(
              staged,
              matches.map((match) => ({
                kind: "replace",
                target: commands.anchorWordRange(staged, {
                  start: range.start + match.start,
                  end: range.start + match.end,
                }),
                value,
              })),
            ),
          );
          return { start: range.start, end: range.start };
        }
        case "insert-ink":
        case "insert-shape":
        case "insert-image": {
          const attributes =
            operation.name === "insert-ink"
              ? { ink: operation.input.ink }
              : operation.name === "insert-shape"
                ? { shape: operation.input.shape }
                : { image: normalizeImage(operation.input.image) };
          staged.applyDelta(
            commands
              .replaceWordDelta(staged, range, "\uFFFC", {})
              .map((part) =>
                part.insert ? { ...part, attributes: { ...part.attributes, ...attributes } } : part,
              ),
          );
          staged.format(range.start, 1, { wordSource: null, wordCopy: null });
          const end = range.start + 1;
          return { start: end, end };
        }
        default: {
          const exhaustive: never = operation;
          throw new Error(`Unknown operation: ${String(exhaustive)}`);
        }
      }
    });
    commands.validateWordDelta(text, edit.delta);
    return edit;
  };
}
export const prepareWordOperation = createWordOperations();

function findCell(text: Y.Text, range: WordRange, cellId: string) {
  for (const p of tableParagraphs(text)) {
    if (!p.table || p.start < range.start || p.start >= range.end) continue;
    const structure = [...(p.table.parents ?? []), p.table].find((cell) => cell.cell === cellId);
    if (structure) return { start: p.start, structure };
  }
  throw new Error("The target does not contain this cell.");
}

export function wordObjectAttributes(
  text: Y.Text,
  at: number,
): import("../collaboration/formatting.ts").TextAttributes {
  let offset = 0;
  for (const part of text.toDelta()) {
    const end = offset + part.insert.length;
    if (at >= offset && at < end) return part.attributes ?? {};
    offset = end;
  }
  throw new Error("Object unavailable.");
}
