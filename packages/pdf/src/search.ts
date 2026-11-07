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
}
export interface PdfSearchOptions {
  matchCase?: boolean;
  pages?: readonly number[];
}
export interface PdfSearchResult {
  matches: PdfSearchMatch[];
  total: number;
}
type Unit = { text: string; rect?: PdfSearchRect; line: string };
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
  return matchCase ? expanded : expanded.toLowerCase();
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
  constructor(
    document: PdfDocument,
    editing?: {
      model: PdfTextModel;
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
      const scene = placePdfScene(interpreter.page(page.source.index), model);
      const source = page.continuation
        ? []
        : units(
            pdfTextContent({
              ...scene,
              elements: scene.elements.filter(
                (e) => !replaced.has(pdfSourceKey(e.source)),
              ),
            }).items,
          );
      for (const region of regions) {
        if (region.preserveSource || model.placement(region.id)?.hidden)
          continue;
        if (source.length) source.push({ text: " ", line: region.id });
        for (const g of region.glyphs)
          source.push({
            text: g.text,
            line: `${region.id}:${g.y}`,
            rect: {
              x: g.x,
              y: g.y - g.style.size,
              width: g.width,
              height: g.style.size * 1.25,
            },
          });
      }
      return source;
    });
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
      const mapping: { unit: Unit; start: number; end: number }[] = [];
      for (const unit of page) {
        for (const char of unit.text) {
          const value = /\s/u.test(char) ? " " : char;
          if (value === " " && text.endsWith(" ")) continue;
          const start = display.length;
          display += value;
          const folded = normalize(value, matchCase);
          text += folded;
          for (let i = 0; i < folded.length; i++)
            mapping.push({ unit, start, end: display.length });
        }
      }
      let offset = 0;
      while ((offset = text.indexOf(needle, offset)) !== -1) {
        const selected = mapping.slice(offset, offset + needle.length),
          first = selected[0]!,
          last = selected.at(-1)!;
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
        });
        offset += needle.length;
      }
    });
    return { matches, total: matches.length };
  }
}
