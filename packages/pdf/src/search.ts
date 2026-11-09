import type { PdfDocument } from "./document.ts";
import { PdfInterpreter } from "./interpreter.ts";
import { pdfTextContent, type PdfTextItem } from "./text-content.ts";
import { placePdfScene } from "./editing/placement.ts";
import { pdfSourceKey, type PdfTextModel } from "./editing/model.ts";
import { layoutPdfTextFlow } from "./editing/layout.ts";
import type { PdfEditingFonts } from "./editing/fonts.ts";

export interface PdfSearchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PdfSearchMatch {
  /** One-based page number. Rectangles are viewport points with a top-left origin. */
  page: number;
  text: string;
  context: string;
  rects: PdfSearchRect[];
  /** Present only when the complete match maps to editable model text. */
  range?: { region: string; start: number; end: number };
}
export interface PdfSearchOptions {
  matchCase?: boolean;
  wholeWord?: boolean;
  pages?: readonly number[];
}
export interface PdfSearchResult {
  matches: PdfSearchMatch[];
  total: number;
}
type Unit = { text: string; rect?: PdfSearchRect; line: string; range?: { region: string; start: number; end: number } };
const ligatures: Record<string, string> = {
  ﬀ: "ff",
  ﬁ: "fi",
  ﬂ: "fl",
  ﬃ: "ffi",
  ﬄ: "ffl",
  ﬅ: "st",
  ﬆ: "st",
};
const normalize = (text: string, matchCase: boolean) => {
  const expanded = text.replace(/[ﬀ-ﬆ]/gu, (c) => ligatures[c]!);
  // Fold code points identically in queries and glyph text. Lowercasing an
  // entire string applies contextual final-sigma rules that individual glyphs lack.
  return matchCase
    ? expanded
    : Array.from(expanded, (char) =>
        char.toLowerCase().replace(/ς/gu, "σ"),
      ).join("");
};
function bounds(item: PdfTextItem): PdfSearchRect {
  const [a, b, c, d, e, f] = item.transform;
  const points = [0, item.width].flatMap((x) =>
    [-item.ascent, item.height - item.ascent].map((y) => [
      a * x + c * y + e,
      b * x + d * y + f,
    ]),
  );
  const x = Math.min(...points.map((p) => p[0]!)),
    y = Math.min(...points.map((p) => p[1]!));
  return {
    x,
    y,
    width: Math.max(...points.map((p) => p[0]!)) - x,
    height: Math.max(...points.map((p) => p[1]!)) - y,
  };
}
function units(items: readonly PdfTextItem[]): Unit[] {
  let line = 0;
  return items.map((item) => {
    if (item.kind === "separator" && item.text === "\n") line++;
    return {
      text: item.text,
      line: String(line),
      ...(item.kind === "glyph" ? { rect: bounds(item) } : {}),
    };
  });
}
/** A read-only snapshot shared by the viewer and CLI. Rebuild after collaborative edits.
 * Extraction includes invisible OCR glyphs; only the current PDF object graph is interpreted. */
export class PdfSearchIndex {
  private readonly pages: Unit[][];
  private readonly model?: PdfTextModel;
  private readonly revision?: number;
  constructor(
    document: PdfDocument,
    editing?: {
      model: PdfTextModel;
      editable?: boolean;
      fonts: PdfEditingFonts;
      flow?: ReturnType<typeof layoutPdfTextFlow>;
    },
    interpreter = new PdfInterpreter(document),
  ) {
    if (!editing) {
      this.pages = document.pages.map((_, i) =>
        units(pdfTextContent(interpreter.page(i)).items),
      );
      return;
    }
    const { model, fonts } = editing;
    if (editing.editable !== false && !document.source.encrypted) { this.model = model; this.revision = model.revision; }
    if (!editing.flow) fonts.importDocument(document);
    const flow =
      editing.flow ?? layoutPdfTextFlow(model, fonts, document.pages);
    this.pages = flow.pages.map((page) => {
      const regions = flow.regions.filter((r) => r.page === page.index);
      const preserved = new Set(
        regions
          .filter((r) => r.preserveSource && !model.placement(r.id)?.hidden)
          .map((r) => r.id),
      );
      const replaced = new Set(
        model
          .ids(page.source.index)
          .filter((id) => !preserved.has(id))
          .flatMap((id) =>
            model
              .seed(id)
              .sources.map((s) => `${s.instance}/${s.object}/${s.start}`),
          ),
      );
      // Merge source runs and laid-out edits before matching. Appending edits to
      // the page would change phrase adjacency after a formatting-only change.
      const blocks: {
        x: number;
        y: number;
        units: Unit[];
        range?: { region: string; start: number; end: number };
      }[] = [];
      if (page.source.index >= 0 && !page.continuation) {
        const scene = placePdfScene(interpreter.page(page.source.index), model);
        const items = pdfTextContent({
          ...scene,
          elements: scene.elements.filter(
            (e) => !replaced.has(pdfSourceKey(e.source)),
          ),
        }).items;
        const owners = new Map<string, string>(
          model
            .ids(page.source.index)
            .flatMap((id) =>
              model
                .seed(id)
                .sources.map(
                  (s) => [`${s.instance}/${s.object}/${s.start}`, id] as const,
                ),
            ),
        );
        const runs = new Map<string, (typeof blocks)[number]>();
        const sourceUnits = units(items);
        const offsets = new Map<string, number>();
        let line = 0;
        items.forEach((item, i) => {
          if (item.kind === "separator" && item.text === "\n") {
            line++;
            return;
          }
          const source = pdfSourceKey(item.source);
          const key = `${line}:${owners.get(source) ?? "unowned"}`;
          let run = runs.get(key);
          if (!run) {
            run = { x: item.transform[4], y: item.transform[5], units: [] };
            runs.set(key, run);
            blocks.push(run);
          }
          const unit = sourceUnits[i]!;
          const owner = owners.get(source);
          if (owner) {
            const content = model.text(owner).toString();
            const start = content.indexOf(item.text, offsets.get(owner) ?? 0);
            if (start >= 0) {
              unit.range = { region: owner, start, end: start + item.text.length };
              offsets.set(owner, start + item.text.length);
            }
          }
          run.units.push(unit);
        });
      }
      for (const region of regions) {
        if (region.preserveSource || model.placement(region.id)?.hidden)
          continue;
        const lines = new Map<number, (typeof blocks)[number]>();
        for (const g of region.glyphs) {
          let line = lines.get(g.y);
          if (!line) {
            line = {
              x: g.x,
              y: g.y,
              units: [],
              range: { region: region.id, start: g.start, end: g.end },
            };
            lines.set(g.y, line);
            blocks.push(line);
          }
          line.range!.end = g.end;
          line.units.push({
            text: g.text,
            range: { region: region.id, start: g.start, end: g.end },
            line: `${region.id}:${g.y}`,
            rect: {
              x: g.x,
              y: g.y - g.style.size,
              width: g.width,
              height: g.style.size * 1.25,
            },
          });
        }
      }
      // Use the same top-to-bottom, left-to-right block order as text import;
      // keep each source run's extraction order and exact glyph rectangles.
      return blocks
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .flatMap((block, i) => {
          const previous = blocks[i - 1]?.range;
          // A visual wrap does not insert characters into the region's text.
          // Retain explicit whitespace glyphs, and separate distinct paragraphs.
          const adjacent =
            block.range &&
            previous &&
            block.range.region === previous.region &&
            block.range.start === previous.end;
          return i && !adjacent
            ? [{ text: " ", line: "separator" }, ...block.units]
            : block.units;
        });
    });
  }
  /** Replace a snapshot's model-backed matches as one collaborative undo step.
   * A changed model invalidates the snapshot rather than applying stale offsets. */
  replace(matches: readonly PdfSearchMatch[], value: string): number {
    const model = this.model;
    if (!model || model.revision !== this.revision) return 0;
    const ranges = matches.flatMap(match => match.range ? [match.range] : [])
      .sort((a, b) => a.region.localeCompare(b.region) || b.start - a.start);
    if (!ranges.length) return 0;
    model.undo.stopCapturing();
    model.doc.transact(() => {
      for (const range of ranges) model.replace(range.region, range.start, range.end, value);
    }, model.origin);
    model.undo.stopCapturing();
    return ranges.length;
  }
  find(query: string, options: PdfSearchOptions = {}): PdfSearchResult {
    const matchCase = options.matchCase ?? false;
    const needle = normalize(query, matchCase).replace(/\s+/gu, " ");
    const matches: PdfSearchMatch[] = [];
    if (!needle.trim()) return { matches, total: 0 };
    if (
      options.pages?.some(
        (p) => !Number.isSafeInteger(p) || p < 1 || p > this.pages.length,
      )
    )
      throw new Error("Search page is outside this document.");
    this.pages.forEach((page, index) => {
      if (options.pages && !options.pages.includes(index + 1)) return;
      let text = "",
        display = "";
      const mapping: { unit: Unit; start: number; end: number; range?: PdfSearchMatch["range"] }[] = [];
      for (const unit of page) {
        let unitOffset = 0;
        for (const char of unit.text) {
          const range = unit.range && { region: unit.range.region, start: unit.range.start + unitOffset, end: unit.range.start + unitOffset + char.length };
          unitOffset += char.length;
          const value = /\s/u.test(char) ? " " : char;
          if (value === " " && text.endsWith(" ")) continue;
          const start = display.length;
          display += value;
          const folded = normalize(value, matchCase);
          text += folded;
          for (let i = 0; i < folded.length; i++)
            mapping.push({ unit, start, end: display.length, range });
        }
      }
      let offset = 0;
      while ((offset = text.indexOf(needle, offset)) !== -1) {
        const selected = mapping.slice(offset, offset + needle.length),
          first = selected[0]!,
          last = selected.at(-1)!;
        if (options.wholeWord && (/[\p{L}\p{N}_]/u.test(text[offset - 1] ?? '') || /[\p{L}\p{N}_]/u.test(text[offset + needle.length] ?? ''))) {
          offset += needle.length;
          continue;
        }
        const range = first.range && last.range && selected.every((entry, i) =>
          entry.range?.region === first.range!.region && (!i || entry.range.start <= selected[i - 1]!.range!.end)
        ) ? { region: first.range.region, start: first.range.start, end: last.range.end } : undefined;
        // A match inside an expanded ligature must never delete the whole glyph.
        const complete = mapping[offset - 1]?.start !== first.start && mapping[offset + needle.length]?.end !== last.end;
        const lines = new Map<string, PdfSearchRect>();
        for (const { unit } of selected) {
          if (!unit.rect) continue;
          const r = unit.rect,
            previous = lines.get(unit.line);
          if (!previous) lines.set(unit.line, { ...r });
          else {
            const x = Math.min(previous.x, r.x),
              y = Math.min(previous.y, r.y);
            previous.width =
              Math.max(previous.x + previous.width, r.x + r.width) - x;
            previous.height =
              Math.max(previous.y + previous.height, r.y + r.height) - y;
            previous.x = x;
            previous.y = y;
          }
        }
        matches.push({
          page: index + 1,
          text: display.slice(first.start, last.end),
          context: display.slice(Math.max(0, first.start - 40), last.end + 40),
          rects: [...lines.values()],
          ...(this.model && range && complete ? { range } : {}),
        });
        offset += needle.length;
      }
    });
    return { matches, total: matches.length };
  }
}
