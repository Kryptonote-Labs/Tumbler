import { PdfExecutionBudget, type PdfExecutionLimits } from "./execution-budget.ts";
import { createTextOperators } from "./text-operators.ts";
import { createGraphicsOperators } from "./graphics-operators.ts";
import { initialState, execution, rectangle, type Execution } from "./graphics-state.ts";
import { interpretAnnotations } from "./annotations.ts";
import { applyExtendedState } from "./extended-state.ts";
import { PdfDocument, type PdfPage } from "./document.ts";
import { PdfFont } from "./fonts.ts";
import {
  colourCss,
  colourSpace,
  deviceCMYK,
  deviceGray,
  deviceRGB,
  type PdfColourSpace,
} from "./colour.ts";
import { readContentToken, isOperator, inlineImageEnd } from "./content-syntax.ts";
import { canonicalInlineDictionary, decodePdfImage } from "./images.ts";
import { identity, matrix, multiply, type PdfMatrix } from "./matrix.ts";
import {
  array,
  dictionary,
  integer,
  invalid,
  name,
  number,
  PdfName,
  PdfReference,
  PdfStream,
  PdfString,
  type PdfDictionary,
  type PdfValue,
  unsupported,
} from "./objects.ts";
import {
  pageViewport,
  type PdfPageScene,
  type PdfPaintState,
  type PdfPathCommand,
  type PdfSceneElement,
  type PdfSceneSource,
  type PdfPaint,
} from "./scene.ts";
import { PdfSyntax } from "./syntax.ts";

/** Compile a page to a reusable scene; the browser is a painter, not the canonical PDF document. */
export class PdfInterpreter {
  private readonly fonts = new WeakMap<PdfDictionary, PdfFont>();
  private readonly scenes = new Map<number, PdfPageScene>();
  private readonly activeForms = new Set<PdfStream>();
  private budget = new PdfExecutionBudget();
  constructor(
    readonly document: PdfDocument,
    private limits: PdfExecutionLimits = {},
  ) {}
  page(index: number): PdfPageScene {
    const cached = this.scenes.get(index);
    if (cached) return cached;
    this.budget = new PdfExecutionBudget(this.limits);
    const page = this.document.pages[index];
    if (!page) return invalid("PDF page index is outside this document.");
    const elements: PdfSceneElement[] = [],
      context = execution(),
      source = this.document.source;
    const content = source.resolve(page.dictionary.get("Contents"));
    for (const value of content === null ? [] : Array.isArray(content) ? content : [content]) {
      const stream = source.resolve(value);
      if (!(stream instanceof PdfStream)) return invalid("Page Contents must reference streams.");
      this.execute(
        source.stream(stream),
        page.resources,
        context,
        elements,
        stream.object,
        `page:${page.id}`,
      );
    }
    if (context.stack.length || context.inText || context.compatibility)
      return invalid("Unbalanced PDF content state.");
    const annotations = interpretAnnotations(source, page, elements, (...args) =>
      this.form(...args),
    );
    const text = elements
      .filter((element) => element.kind === "glyph")
      .map((element) => element.glyph.unicode)
      .join("");
    const scene: PdfPageScene = {
      page,
      width: page.width,
      height: page.height,
      viewport: pageViewport(page),
      elements,
      text,
      annotations,
    };
    this.scenes.set(index, scene);
    return scene;
  }
  /** Drop a rebuildable page projection when its viewer leaves the viewport. */
  releasePage(index: number) {
    this.scenes.delete(index);
  }
  private resource(resources: PdfDictionary, category: string, key: string) {
    const source = this.document.source,
      values = dictionary(source.resolve(resources.get(category)));
    if (!values.has(key)) return invalid(`PDF /${category} resource /${key} is missing.`);
    return source.resolve(values.get(key));
  }
  private font(resources: PdfDictionary, key: string) {
    const info = dictionary(this.resource(resources, "Font", key));
    let font = this.fonts.get(info);
    if (!font) {
      font = new PdfFont(this.document.source, info);
      this.fonts.set(info, font);
    }
    return font;
  }
  private execute(...args: Parameters<PdfInterpreter["executeContent"]>) {
    this.budget.enter();
    try {
      return this.executeContent(...args);
    } finally {
      this.budget.leave();
    }
  }
  private executeContent(
    bytes: Uint8Array,
    resources: PdfDictionary,
    context: Execution,
    elements: PdfSceneElement[],
    object: PdfReference,
    instance: string,
  ) {
    const syntax = new PdfSyntax(bytes),
      source = this.document.source;
    let operands: PdfValue[] = [],
      start = 0;
    const emitSource = (): PdfSceneSource => ({ object, instance, start, end: syntax.position });
    const base = () => {
      this.budget.element();
      return {
        id: `${instance}:${object.key}:${start}:${elements.length}`,
        source: emitSource(),
        state: { ...context.state },
      };
    };
    const textOperators = createTextOperators(
      context,
      source,
      resources,
      elements,
      base,
      (key) => this.font(resources, key),
      (...args) => this.execute(...args),
      instance,
      () => this.budget.step(),
    );
    const graphicsOperators = createGraphicsOperators(
      context,
      source,
      resources,
      elements,
      base,
      (category, key) => this.resource(resources, category, key),
    );
    while (syntax.position < bytes.length) {
      this.budget.step();
      syntax.skip();
      if (syntax.position >= bytes.length) break;
      if (!operands.length) start = syntax.position;
      const value = readContentToken(syntax);
      if (!isOperator(value)) {
        operands.push(value);
        continue;
      }
      const op = value.operator,
        state = context.state;
      const n = (i: number) => number(operands[i]);
      const count = (expected: number) => {
        if (operands.length !== expected)
          invalid(`PDF operator ${op} requires ${expected} operands.`);
      };
      if (textOperators(op, operands) || graphicsOperators(op, operands)) {
        operands = [];
        continue;
      }
      switch (op) {
        case "gs":
          count(1);
          applyExtendedState(
            source,
            dictionary(this.resource(resources, "ExtGState", name(operands[0]))),
            state,
            this.fonts,
            (key) => this.font(resources, key),
          );
          break;
        case "Do":
          count(1);
          {
            const resource = this.resource(resources, "XObject", name(operands[0]));
            if (!(resource instanceof PdfStream)) invalid("XObject resource must be a stream.");
            const kind = name(resource.dictionary.get("Subtype"));
            if (kind === "Form")
              this.form(resource, resources, context, elements, `${instance}:form:${start}`);
            else if (kind === "Image")
              elements.push({
                ...base(),
                kind: "image",
                image: decodePdfImage(
                  source,
                  resource.dictionary,
                  source.encodedStream(resource),
                  resources,
                ),
              });
            else unsupported(`PDF XObject /${kind} is not supported.`);
          }
          break;
        case "sh":
          count(1);
          elements.push({
            ...base(),
            kind: "shading",
            shading: dictionary(this.resource(resources, "Shading", name(operands[0]))),
            resources,
          });
          break;
        case "BI": {
          count(0);
          const info = new Map<string, PdfValue>();
          while (!syntax.peek("ID")) {
            const key = syntax.value();
            if (!(key instanceof PdfName)) invalid("Inline image key must be a name.");
            info.set(key.value, syntax.value());
          }
          syntax.expect("ID");
          const canonical = canonicalInlineDictionary(info);
          if (canonical.has("Filter"))
            unsupported("Filtered inline images need their codec end-of-data reader.");
          const space =
            canonical.get("ImageMask") === true
              ? deviceGray
              : colourSpace(source, canonical.get("ColorSpace"), resources);
          const width = integer(canonical.get("Width")),
            height = integer(canonical.get("Height")),
            bits = integer(
              canonical.get("BitsPerComponent"),
              canonical.get("ImageMask") === true ? 1 : 8,
            );
          const bytes = inlineImageEnd(
            syntax,
            Math.ceil((width * space.components * bits) / 8) * height,
          );
          elements.push({
            ...base(),
            kind: "image",
            image: decodePdfImage(source, canonical, bytes, resources),
          });
          break;
        }
        case "d0":
          count(2);
          break;
        case "d1":
          count(6);
          break;
        case "BMC":
          count(1);
          break;
        case "BDC":
          count(2);
          break;
        case "EMC":
        case "MP":
        case "DP":
          break;
        case "BX":
          context.compatibility++;
          break;
        case "EX":
          if (!context.compatibility) invalid("Unbalanced compatibility section.");
          context.compatibility--;
          break;
        case "ri":
        case "i":
          break;
        default:
          if (!context.compatibility)
            unsupported(`PDF content operator ${op} needs an interpreter implementation.`);
      }
      operands = [];
    }
    if (operands.length) invalid("PDF content ends with operands without an operator.");
  }
  private form(
    stream: PdfStream,
    resources: PdfDictionary,
    outer: Execution,
    elements: PdfSceneElement[],
    instance: string,
  ) {
    if (this.activeForms.has(stream)) return invalid("Cyclic Form XObject.");
    const source = this.document.source,
      info = stream.dictionary,
      state = {
        ...outer.state,
        transform: multiply(outer.state.transform, matrix(source.resolve(info.get("Matrix")))),
      };
    const bbox = array(source.resolve(info.get("BBox"))).map((value) => number(value));
    if (bbox.length !== 4) return invalid("Form XObject BBox must have four coordinates.");
    state.clips = [
      ...state.clips,
      {
        path: rectangle(bbox[0]!, bbox[1]!, bbox[2]! - bbox[0]!, bbox[3]! - bbox[1]!),
        transform: state.transform,
        rule: "nonzero",
      },
    ];
    const local = info.has("Resources")
      ? dictionary(source.resolve(info.get("Resources")))
      : resources;
    this.activeForms.add(stream);
    try {
      const context = execution(state);
      this.execute(source.stream(stream), local, context, elements, stream.object, instance);
      if (context.stack.length || context.inText) invalid("Unbalanced Form XObject state.");
    } finally {
      this.activeForms.delete(stream);
    }
  }
}
export function interpretPdfPage(document: PdfDocument, index: number) {
  return new PdfInterpreter(document).page(index);
}
