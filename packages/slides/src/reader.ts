import { embeddedFontBytes } from "./embedded-fonts.ts";
import { scriptSegments } from "./text-fonts.ts";
import { isModificationIdList } from "./modification-id.ts";
import { formatAutoNumber } from "./text-numbering.ts";
import { builtinTableStyles } from "./builtin-table-styles.ts";
import type {
  DrawingGradient,
  DrawingShadow,
  DrawingLineEnd,
} from "./appearance.ts";
import { resolveDrawingColor } from "./drawing-color.ts";
import { resolveDrawingGeometry } from "./drawing-geometry.ts";
import { parseOoxmlChart } from "@tumblerjs/charts";
import {
  createMarkupCompatibilityView,
  OOXML_NAMESPACES,
  parseLosslessXml,
  parseThemeColorScheme,
  parseThemeFontScheme,
  THEME_COLOR_SLOTS,
  type LosslessXmlDocument,
  type LosslessXmlElement as Element,
  type MarkupCompatibilityView,
  type ThemeColorScheme,
  type ThemeFontScheme,
} from "@tumblerjs/ooxml";
import { openOpcPackage, type OpcPackage, type OpcPart } from "@tumblerjs/opc";
import { EMUS_PER_PIXEL, IDENTITY, multiply, shapeMatrix } from "./geometry.ts";
import {
  PresentationError,
  type Matrix,
  type OpenPresentationOptions,
  type PresentationDiagnostic,
  type PresentationDocument,
  type PresentationSlide,
  type SlideObject,
  type SlideParagraph,
  type SlideText,
  type SlideTextRun,
  type SlideTransform,
} from "./model.ts";

const TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const attr = (element: Element | undefined, name: string) =>
  element?.attributes.find(
    (item) => item.localName === name && item.namespaceUri === "",
  )?.value;
function number(
  element: Element | undefined,
  name: string,
  fallback = 0,
): number {
  const value = attr(element, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER)
    throw new PresentationError("invalid_document", `Invalid ${name} value.`);
  return parsed;
}
const px = (element: Element | undefined, name: string, fallback = 0) =>
  number(element, name, fallback * EMUS_PER_PIXEL) / EMUS_PER_PIXEL;
function numeric(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER)
    throw new PresentationError(
      "invalid_document",
      "Invalid numeric text property.",
    );
  return parsed;
}
const truth = (element: Element | undefined, name: string) =>
  ["1", "true"].includes(attr(element, name) ?? "");
const text = (element: Element | undefined): string =>
  element?.children
    .map((child) =>
      child.kind === "text" || child.kind === "cdata" ? child.value : "",
    )
    .join("") ?? "";
interface PartSource {
  part: OpcPart;
  xml: LosslessXmlDocument;
}
interface Context {
  slideNumber: number;
  slide: PartSource;
  layout: PartSource | undefined;
  master: PartSource | undefined;
  theme: PartSource | undefined;
  themeOverrides: readonly PartSource[];
  colors: ThemeColorScheme | undefined;
  fonts: ThemeFontScheme | undefined;
  colorMap: Map<string, string>;
  diagnostics: PresentationDiagnostic[];
  timed: boolean;
}

/** Read a bounded PresentationML view while retaining all source parts and unknown markup. */
export function openPresentationDocument(
  bytes: Uint8Array,
  options: OpenPresentationOptions = {},
): PresentationDocument {
  return new Reader(openOpcPackage(bytes), options).open();
}
class Reader {
  readonly sources = new Map<string, LosslessXmlDocument>();
  readonly owners = new WeakMap<Element, PartSource>();
  readonly views = new WeakMap<Element, MarkupCompatibilityView>();
  readonly parts = new Map<string, PartSource>();
  readonly themes = new Map<
    string,
    { colors: ThemeColorScheme; fonts: ThemeFontScheme }
  >();
  readonly conformance: "strict" | "transitional";
  readonly ns:
    | typeof OOXML_NAMESPACES.strict
    | typeof OOXML_NAMESPACES.transitional;
  readonly rel: string;
  readonly main: PartSource;
  readonly signed: boolean;
  readonly limits: Required<OpenPresentationOptions>;
  readonly builtinStyles = new Map<string, Element>();
  objects = 0;
  characters = 0;
  constructor(
    readonly pkg: OpcPackage,
    options: OpenPresentationOptions,
  ) {
    this.limits = {
      maxSlides: options.maxSlides ?? 2000,
      maxObjects: options.maxObjects ?? 50000,
      maxGroupDepth: options.maxGroupDepth ?? 32,
      maxTextCharacters: options.maxTextCharacters ?? 8_000_000,
    };
    for (const [name, value] of Object.entries(this.limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new RangeError(`${name} must be a positive integer.`);
    const part = pkg.mainOfficeDocumentPart();
    if (part.contentType !== TYPE)
      throw new PresentationError(
        "unsupported_document",
        "Open an unencrypted PPTX presentation. Other presentation file types are not editable yet.",
      );
    const xml = parseLosslessXml(pkg.readPart(part));
    if (
      xml.root.localName !== "presentation" ||
      ![
        OOXML_NAMESPACES.strict.presentation,
        OOXML_NAMESPACES.transitional.presentation,
      ].some((namespace) => namespace === xml.root.namespaceUri)
    )
      throw new PresentationError(
        "invalid_document",
        "Missing PresentationML root.",
      );
    this.conformance =
      xml.root.namespaceUri === OOXML_NAMESPACES.strict.presentation
        ? "strict"
        : "transitional";
    this.ns = OOXML_NAMESPACES[this.conformance];
    this.rel =
      this.conformance === "strict"
        ? "http://purl.oclc.org/ooxml/officeDocument/relationships"
        : "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    this.main = this.register(part, xml);
    this.signed = pkg.parts.some((item) =>
      item.contentType.includes("digital-signature"),
    );
  }
  register(part: OpcPart, xml: LosslessXmlDocument) {
    const view = createMarkupCompatibilityView(xml, {
      understoodNamespaces: new Set([
        this.ns.presentation,
        this.ns.drawing,
        this.ns.chart,
        this.rel,
      ]),
    });
    for (const element of xml.elements()) this.views.set(element, view);
    const shapeIds = new Set<string>();
    for (const metadata of this.descendants(xml.root).filter(
      (item) =>
        item.namespaceUri === this.ns.presentation &&
        item.localName === "cNvPr",
    )) {
      const id = attr(metadata, "id");
      if (!id || shapeIds.has(id))
        throw new PresentationError(
          "invalid_document",
          "Invalid or duplicate shape identity.",
        );
      shapeIds.add(id);
    }
    const source = { part, xml };
    for (const element of xml.elements()) this.owners.set(element, source);
    this.sources.set(part.name.value, xml);
    this.parts.set(part.name.value, source);
    return source;
  }
  load(part: OpcPart): PartSource {
    return (
      this.parts.get(part.name.value) ??
      this.register(part, parseLosslessXml(this.pkg.readPart(part)))
    );
  }
  children(element: Element | undefined): readonly Element[] {
    return element === undefined
      ? []
      : this.views.get(element)!.children(element);
  }
  child(
    element: Element | undefined,
    name: string,
    namespace: string = this.ns.drawing,
  ): Element | undefined {
    return this.children(element).find(
      (item) => item.namespaceUri === namespace && item.localName === name,
    );
  }
  p(element: Element | undefined, name: string) {
    return this.child(element, name, this.ns.presentation);
  }
  descendants(element: Element | undefined): Element[] {
    return this.children(element).flatMap((child) => [
      child,
      ...this.descendants(child),
    ]);
  }
  related(source: PartSource, type: string, id?: string): OpcPart | undefined {
    const relationships = this.pkg.relationships(source.part.name);
    const matches =
      id === undefined
        ? relationships.byType(`${this.rel}/${type}`)
        : [relationships.get(id)].filter((item) => item !== undefined);
    if (id === undefined && matches.length > 1)
      throw new PresentationError(
        "invalid_document",
        `Multiple ${type} relationships.`,
      );
    const relation = matches[0];
    if (relation === undefined) return;
    if (relation.type !== `${this.rel}/${type}`)
      throw new PresentationError(
        "invalid_document",
        `Wrong relationship type for ${type}.`,
      );
    return relation.targetMode === "Internal"
      ? this.pkg.getPart(relation.targetPartName)
      : undefined;
  }
  relatedXml(source: PartSource, type: string): PartSource | undefined {
    const part = this.related(source, type);
    return part === undefined ? undefined : this.load(part);
  }
  rid(element: Element | undefined, local = "id") {
    return element?.attributes.find(
      (item) => item.namespaceUri === this.rel && item.localName === local,
    )?.value;
  }
  open(): PresentationDocument {
    const size = this.p(this.main.xml.root, "sldSz");
    const width = px(size, "cx"),
      height = px(size, "cy");
    if (width <= 0 || height <= 0 || width > 100_000 || height > 100_000)
      throw new PresentationError(
        "invalid_document",
        "Invalid slide dimensions.",
      );
    const ids = this.children(this.p(this.main.xml.root, "sldIdLst")).filter(
      (item) =>
        item.namespaceUri === this.ns.presentation &&
        item.localName === "sldId",
    );
    if (ids.length > this.limits.maxSlides)
      throw new PresentationError("limit_exceeded", "Too many slides.");
    const seen = new Set<string>(),
      seenParts = new Set<string>();
    const slides = ids.map((entry, index) => {
      const id = attr(entry, "id"),
        relationship = this.rid(entry);
      if (!id || !relationship || seen.has(id))
        throw new PresentationError(
          "invalid_document",
          "Invalid or duplicate slide identity.",
        );
      seen.add(id);
      const part = this.related(this.main, "slide", relationship);
      if (!part || seenParts.has(part.name.value))
        throw new PresentationError(
          "invalid_document",
          "Missing or duplicate slide part.",
        );
      seenParts.add(part.name.value);
      return this.slide(id, this.load(part), index);
    });
    return {
      embeddedFonts: this.children(this.p(this.main.xml.root, "embeddedFontLst")).flatMap(entry => {
        const family = attr(this.p(entry, "font"), "typeface");
        if (!family) return [];
        return ["regular", "bold", "italic", "boldItalic"].flatMap(style => {
          const id = this.rid(this.p(entry, style));
          const part = id ? this.related(this.main, "font", id) : undefined;
          if (!part) return [];
          const bytes = embeddedFontBytes(this.pkg.readPart(part));
          if (!bytes) { for (const slide of slides) (slide.diagnostics as PresentationDiagnostic[]).push({part:part.name.value,message:`Embedded font ${family} has an unsupported encoding; an installed font is used.`}); return []; }
          return [{family,bytes,bold:style === "bold" || style === "boldItalic",italic:style === "italic" || style === "boldItalic"}];
        });
      }),
      package: this.pkg,
      conformance: this.conformance,
      width,
      height,
      slides,
      sources: this.sources,
      signed: this.signed,
    };
  }
  tree(source: PartSource | undefined) {
    return this.p(this.p(source?.xml.root, "cSld"), "spTree");
  }
  placeholder(element: Element | undefined) {
    const nonVisual = this.children(element).find(
      (item) =>
        item.namespaceUri === this.ns.presentation &&
        item.localName.startsWith("nv"),
    );
    return this.p(this.p(nonVisual, "nvPr"), "ph");
  }
  slide(id: string, slide: PartSource, index: number): PresentationSlide {
    if (
      slide.xml.root.namespaceUri !== this.ns.presentation ||
      slide.xml.root.localName !== "sld"
    )
      throw new PresentationError("invalid_document", "Invalid slide root.");
    const layout = this.relatedXml(slide, "slideLayout");
    const master =
      layout === undefined ? undefined : this.relatedXml(layout, "slideMaster");
    const theme =
      master === undefined ? undefined : this.relatedXml(master, "theme");
    let themeValue =
      theme === undefined ? undefined : this.themes.get(theme.part.name.value);
    if (theme && !themeValue) {
      themeValue = {
        colors: parseThemeColorScheme(this.pkg.readPart(theme.part)),
        fonts: parseThemeFontScheme(this.pkg.readPart(theme.part)),
      };
      this.themes.set(theme.part.name.value, themeValue);
    }
    const themeOverrides = [layout, slide].flatMap(owner => {
      const override = owner && this.relatedXml(owner, "themeOverride");
      if (!override) return [];
      if (override.xml.root.localName !== "themeOverride" || override.xml.root.namespaceUri !== this.ns.drawing)
        throw new PresentationError("invalid_document", "Invalid theme override root.");
      return [override];
    });
    let colors = themeValue?.colors, fonts = themeValue?.fonts;
    for (const override of themeOverrides) {
      if (this.child(override.xml.root, "clrScheme")) colors = parseThemeColorScheme(this.pkg.readPart(override.part));
      if (this.child(override.xml.root, "fontScheme")) fonts = parseThemeFontScheme(this.pkg.readPart(override.part));
    }
    const colorMap = new Map<string, string>([
      ["bg1", "lt1"],
      ["tx1", "dk1"],
      ["bg2", "lt2"],
      ["tx2", "dk2"],
    ]);
    const masterMap = this.p(master?.xml.root, "clrMap");
    const applyMap = (mapping: Element | undefined) => {
      for (const attribute of mapping?.attributes ?? [])
        if (attribute.namespaceUri === "")
          colorMap.set(attribute.localName, attribute.value);
    };
    applyMap(masterMap);
    for (const owner of [layout, slide]) {
      const override = this.p(owner?.xml.root, "clrMapOvr");
      if (this.child(override, "masterClrMapping")) applyMap(masterMap);
      else applyMap(this.child(override, "overrideClrMapping"));
    }
    const context: Context = {
      slideNumber: index + number(this.main.xml.root, "firstSlideNum", 1),
      slide,
      layout,
      master,
      theme,
      themeOverrides,
      colors,
      fonts,
      colorMap,
      diagnostics: [],
      timed: this.p(slide.xml.root, "timing") !== undefined,
    };
    if (!layout || !master || !theme)
      context.diagnostics.push({
        part: slide.part.name.value,
        message:
          "The slide is missing a layout, master, or theme; defaults are used.",
      });
    if (context.timed)
      context.diagnostics.push({
        part: slide.part.name.value,
        message:
          "Animations are preserved but not played. Objects on this slide are read-only.",
      });
    const layers: [PartSource | undefined, SlideObject["layer"]][] = [];
    if (
      attr(slide.xml.root, "showMasterSp") !== "0" &&
      attr(slide.xml.root, "showMasterSp") !== "false"
    ) {
      if (
        attr(layout?.xml.root, "showMasterSp") !== "0" &&
        attr(layout?.xml.root, "showMasterSp") !== "false"
      )
        layers.push([master, "master"]);
      layers.push([layout, "layout"]);
    }
    layers.push([slide, "slide"]);
    const objects = layers.flatMap(([source, layer]) =>
      source === undefined
        ? []
        : this.shapes(this.tree(source), source, layer, context, IDENTITY, 0),
    );
    const background = [slide, layout, master]
      .map((source) => this.p(this.p(source?.xml.root, "cSld"), "bg"))
      .find((item) => item !== undefined);
    const bgProperties = this.p(background, "bgPr");
    if (
      bgProperties &&
      this.children(bgProperties).some((item) =>
        ["blipFill", "pattFill", "effectDag"].includes(item.localName),
      )
    )
      context.diagnostics.push({
        part: slide.part.name.value,
        message:
          "This slide background is approximated; advanced background fills are not rendered.",
      });
    const bgRef = this.p(background, "bgRef");
    const bgStyle =
      bgRef === undefined
        ? undefined
        : this.themeStyle(context, "fillStyleLst", number(bgRef, "idx"));
    const backgroundColor =
      this.fill(bgProperties ?? bgStyle, context, this.color(bgRef, context)) ??
      this.color(bgRef, context) ??
      "#ffffff";
    const title =
      objects
        .find((object) => object.layer === "slide" && object.text)
        ?.text?.paragraphs.map((paragraph) =>
          paragraph.runs.map((run) => run.text).join(""),
        )
        .join(" ") || `Slide ${index + 1}`;
    return {
      id,
      part: slide.part.name.value,
      title,
      hidden: ["0", "false"].includes(attr(slide.xml.root, "show") ?? ""),
      notes: this.slideNotes(slide),
      background: backgroundColor,
      backgroundGradient: this.gradient(
        bgProperties ?? bgStyle,
        context,
        this.color(bgRef, context),
      ),
      objects,
      diagnostics: context.diagnostics,
    };
  }
  slideNotes(slide: PartSource): string {
    const notes = this.relatedXml(slide, "notesSlide");
    if (!notes) return "";
    return this.children(this.tree(notes))
      .filter((shape) => attr(this.placeholder(shape), "type") === "body")
      .map((shape) =>
        this.children(this.p(shape, "txBody"))
          .filter((p) => p.localName === "p")
          .map((p) =>
            this.descendants(p)
              .filter(
                (node) =>
                  node.localName === "t" &&
                  node.namespaceUri === this.ns.drawing,
              )
              .map(text)
              .join(""),
          )
          .join("\n"),
      )
      .join("\n");
  }
  hyperlink(element: Element | undefined): SlideTextRun["hyperlink"] {
    if (!element) return;
    const owner = this.owners.get(element),
      id = this.rid(element);
    if (!owner || !id) return;
    const relation = this.pkg.relationships(owner.part.name).get(id);
    if (!relation) return;
    if (relation.targetMode === "Internal")
      return relation.type === `${this.rel}/slide`
        ? { slidePart: relation.targetPartName.value }
        : undefined;
    if (relation.type !== `${this.rel}/hyperlink`) return;
    try {
      const url = new URL(relation.target);
      return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol)
        ? { href: url.href }
        : undefined;
    } catch {
      return;
    }
  }
  color(
    element: Element | undefined,
    context: Context,
    placeholder?: string,
  ): string | undefined {
    try {
      return resolveDrawingColor(
        element,
        (name) => {
          const slot = context.colorMap.get(name) ?? name;
          const known = THEME_COLOR_SLOTS.find((value) => value === slot);
          return known ? context.colors?.color(known) : undefined;
        },
        placeholder,
      );
    } catch {
      context.diagnostics.push({
        part: context.slide.part.name.value,
        message: "An unsupported colour transform was omitted.",
      });
      return undefined;
    }
  }

  fill(
    element: Element | undefined,
    context: Context,
    placeholder?: string,
  ): string | undefined {
    if (this.child(element, "noFill")) return "none";
    return this.color(
      element?.localName === "solidFill"
        ? element
        : this.child(element, "solidFill"),
      context,
      placeholder,
    );
  }
  gradient(
    element: Element | undefined,
    context: Context,
    placeholder?: string,
  ): DrawingGradient | undefined {
    const gradient =
      element?.localName === "gradFill"
        ? element
        : this.child(element, "gradFill");
    if (!gradient) return;
    const stops = this.children(this.child(gradient, "gsLst"))
      .map((stop) => ({
        offset: Math.max(0, Math.min(1, number(stop, "pos") / 100000)),
        color: this.color(stop, context, placeholder) ?? "transparent",
      }))
      .sort((a, b) => a.offset - b.offset);
    if (stops.length < 2 || stops.length > 256) {
      context.diagnostics.push({
        part: context.slide.part.name.value,
        message: "Unsupported gradient stop count.",
      });
      return;
    }
    const linear = this.child(gradient, "lin"),
      path = this.child(gradient, "path"),
      rect = this.child(path, "fillToRect");
    if (path && attr(path, "path") !== "circle") {
      context.diagnostics.push({
        part: context.slide.part.name.value,
        message: "Only linear and circular gradients are rendered.",
      });
      return;
    }
    return {
      kind: path ? "radial" : "linear",
      angle: number(linear, "ang") / 60000,
      scaled: !["0", "false"].includes(attr(linear, "scaled") ?? "1"),
      center: [
        (number(rect, "l") + 100000 - number(rect, "r")) / 200000,
        (number(rect, "t") + 100000 - number(rect, "b")) / 200000,
      ],
      stops,
    };
  }
  shadow(
    element: Element | undefined,
    context: Context,
  ): DrawingShadow | undefined {
    const shadow = this.child(this.child(element, "effectLst"), "outerShdw");
    if (!shadow) return;
    const angle = ((number(shadow, "dir") / 60000) * Math.PI) / 180,
      distance = px(shadow, "dist");
    return {
      color: this.color(shadow, context) ?? "rgba(0,0,0,0.3)",
      blur: Math.max(0, px(shadow, "blurRad") / 2),
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  }
  lineEnd(element: Element | undefined): DrawingLineEnd | undefined {
    const type = attr(element, "type");
    if (!type || type === "none") return;
    const size = (name: string) =>
      attr(element, name) === "sm" ? 2 : attr(element, name) === "lg" ? 5 : 3;
    return { type, width: size("w"), length: size("len") };
  }
  themeStyle(context: Context, list: string, index: number) {
    const scheme = [...context.themeOverrides].reverse().map(source => this.child(source.xml.root, "fmtScheme")).find(Boolean) ?? this.child(
      this.child(context.theme?.xml.root, "themeElements"), "fmtScheme",
    );
    const target =
      index >= 1001 && list === "fillStyleLst" ? "bgFillStyleLst" : list;
    return this.children(this.child(scheme, target))[
      index >= 1001 ? index - 1001 : index - 1
    ];
  }
  transform(element: Element | undefined): SlideTransform {
    const offset = this.child(element, "off"),
      extent = this.child(element, "ext");
    const result = {
      x: px(offset, "x"),
      y: px(offset, "y"),
      width: px(extent, "cx"),
      height: px(extent, "cy"),
      rotation: number(element, "rot") / 60000,
      flipH: truth(element, "flipH"),
      flipV: truth(element, "flipV"),
    };
    if (
      result.width < 0 ||
      result.height < 0 ||
      Object.values(result).some(
        (value) => typeof value === "number" && Math.abs(value) > 10_000_000,
      )
    )
      throw new PresentationError(
        "invalid_document",
        "Invalid object geometry.",
      );
    return result;
  }
  shapes(
    tree: Element | undefined,
    source: PartSource,
    layer: SlideObject["layer"],
    context: Context,
    parent: Matrix,
    depth: number,
  ): SlideObject[] {
    if (depth > this.limits.maxGroupDepth)
      throw new PresentationError(
        "limit_exceeded",
        "Too many nested shape groups.",
      );
    const result: SlideObject[] = [];
    const ids = new Set<string>();
    for (const element of this.children(tree)) {
      if (["nvGrpSpPr", "grpSpPr", "extLst"].includes(element.localName))
        continue;
      if (++this.objects > this.limits.maxObjects)
        throw new PresentationError(
          "limit_exceeded",
          "Too many presentation objects.",
        );
      if (layer !== "slide" && this.placeholder(element)) continue;
      const metadata = this.descendants(element).find(
        (item) =>
          item.namespaceUri === this.ns.presentation &&
          item.localName === "cNvPr",
      );
      const shapeId = attr(metadata, "id") ?? `unknown-${element.id}`;
      if (ids.has(shapeId))
        throw new PresentationError(
          "invalid_document",
          "Duplicate shape identity.",
        );
      ids.add(shapeId);
      if (truth(metadata, "hidden")) continue;
      const ph = this.placeholder(element);
      const layoutShape =
        layer === "slide" && ph
          ? this.children(this.tree(context.layout)).find((item) => {
              const candidate = this.placeholder(item);
              return (
                candidate !== undefined &&
                (attr(candidate, "idx") ?? "0") === (attr(ph, "idx") ?? "0")
              );
            })
          : undefined;
      const role =
        attr(ph, "type") ??
        attr(this.placeholder(layoutShape), "type") ??
        (ph ? "obj" : "other");
      const masterRole = ["title", "ctrTitle"].includes(role)
        ? "title"
        : ["body", "obj", "subTitle"].includes(role)
          ? "body"
          : role;
      const masterShape = ph
        ? this.children(this.tree(context.master)).find(
            (item) =>
              (attr(this.placeholder(item), "type") ?? "obj") === masterRole,
          )
        : undefined;
      const inherited = [element, layoutShape, masterShape].filter(
        (item) => item !== undefined,
      );
      const properties = inherited.map((item) => this.p(item, "spPr"));
      const xfrm =
        element.localName === "graphicFrame"
          ? this.p(element, "xfrm")
          : properties
              .map((item) => this.child(item, "xfrm"))
              .find((item) => item !== undefined);
      if (element.localName === "grpSp") {
        const groupTransform = this.child(this.p(element, "grpSpPr"), "xfrm");
        const transform = this.transform(groupTransform);
        const childExtent = this.child(groupTransform, "chExt"),
          childOffset = this.child(groupTransform, "chOff");
        const cw = px(childExtent, "cx"),
          ch = px(childExtent, "cy");
        if (cw <= 0 || ch <= 0)
          throw new PresentationError(
            "invalid_document",
            "Invalid group coordinate space.",
          );
        const sx = transform.width / cw,
          sy = transform.height / ch;
        const matrix = multiply(multiply(parent, shapeMatrix(transform)), [
          sx,
          0,
          0,
          sy,
          -px(childOffset, "x") * sx,
          -px(childOffset, "y") * sy,
        ]);
        result.push(
          ...this.shapes(element, source, layer, context, matrix, depth + 1),
        );
        continue;
      }
      const transform = this.transform(xfrm);
      const localTransform =
        xfrm !== undefined &&
        source.xml.element(xfrm.id) === xfrm &&
        xfrm.span.start > element.span.start &&
        xfrm.span.end < element.span.end;
      const diagnostics: string[] = [];
      if (!xfrm) diagnostics.push("Object geometry is unavailable.");
      const geometryElement = properties
        .map(
          (item) =>
            this.child(item, "custGeom") ?? this.child(item, "prstGeom"),
        )
        .find((item) => item !== undefined);
      const preset = attr(geometryElement, "prst") ?? "rect";
      const geometry = preset;
      let drawingGeometry: SlideObject["drawingGeometry"];
      try {
        drawingGeometry = resolveDrawingGeometry(
          preset,
          geometryElement,
          transform.width,
          transform.height,
        );
      } catch {
        diagnostics.push(
          "This shape geometry is invalid or exceeds supported limits.",
        );
      }
      let kind: SlideObject["kind"] =
        element.localName === "pic"
          ? "picture"
          : ["sp", "cxnSp"].includes(element.localName) &&
              element.namespaceUri === this.ns.presentation
            ? "shape"
            : "unsupported";
      if (!drawingGeometry && kind === "shape") {
        kind = "unsupported";
        diagnostics.push(`Geometry ${preset} is not rendered yet.`);
      }
      const style = inherited
        .map((item) => this.p(item, "style"))
        .find((item) => item !== undefined);
      const fillRef = this.child(style, "fillRef"),
        lineRef = this.child(style, "lnRef");
      const fill =
        properties
          .map((item) => this.fill(item, context))
          .find((item) => item !== undefined) ??
        this.fill(
          this.themeStyle(context, "fillStyleLst", number(fillRef, "idx")),
          context,
          this.color(fillRef, context),
        ) ??
        "none";
      const line =
        properties
          .map((item) => this.child(item, "ln"))
          .find((item) => item !== undefined) ??
        this.themeStyle(context, "lnStyleLst", number(lineRef, "idx"));
      const fillSource =
        properties.find((item) =>
          this.children(item).some((child) =>
            [
              "solidFill",
              "gradFill",
              "noFill",
              "blipFill",
              "pattFill",
            ].includes(child.localName),
          ),
        ) ?? this.themeStyle(context, "fillStyleLst", number(fillRef, "idx"));
      const gradient = this.gradient(
        fillSource,
        context,
        this.color(fillRef, context),
      );
      const effects =
        properties.find((item) => this.child(item, "effectLst")) ??
        this.themeStyle(
          context,
          "effectStyleLst",
          number(this.child(style, "effectRef"), "idx"),
        );
      const shadow = this.shadow(effects, context);
      const dash = attr(this.child(line, "prstDash"), "val") ?? "solid";
      const dashPattern: Record<string, string> = {
        solid: "",
        dot: "1 3",
        sysDot: "1 1",
        dash: "4 3",
        sysDash: "3 1",
        lgDash: "8 3",
        dashDot: "4 3 1 3",
        sysDashDot: "3 1 1 1",
        lgDashDot: "8 3 1 3",
        lgDashDotDot: "8 3 1 3 1 3",
        sysDashDotDot: "3 1 1 1 1 1",
      };
      const strokeDash = (dashPattern[dash] ?? "")
        .split(" ")
        .filter(Boolean)
        .map((n) => Number(n) * px(line, "w", 1))
        .join(" ");
      const stroke =
        this.fill(line, context, this.color(lineRef, context)) ?? "none";
      if (
        properties.some(
          (item) =>
            this.child(item, "pattFill") ||
            this.child(item, "blipFill") ||
            this.children(this.child(item, "effectLst")).some(
              (effect) => effect.localName !== "outerShdw",
            ),
        )
      )
        diagnostics.push("Some fills or effects are not rendered.");
      if (
        this.descendants(element).some(
          (item) =>
            item.namespaceUri === this.ns.drawing &&
            ["duotone", "tile", "effectDag", "scene3d", "sp3d"].includes(
              item.localName,
            ),
        )
      )
        diagnostics.push("Some advanced drawing properties are not rendered.");
      let image: SlideObject["image"];
      if (kind === "picture") {
        const blipFill = this.p(element, "blipFill"),
          blip = this.child(blipFill, "blip");
        const id = this.rid(blip, "embed");
        const part =
          id === undefined ? undefined : this.related(source, "image", id);
        if (
          part &&
          ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
            part.contentType,
          )
        ) {
          const crop = this.child(blipFill, "srcRect");
          image = {
            bytes: this.pkg.readPart(part),
            contentType: part.contentType,
            crop: [
              number(crop, "l") / 100000,
              number(crop, "t") / 100000,
              number(crop, "r") / 100000,
              number(crop, "b") / 100000,
            ],
          };
          if (
            image.crop[0] + image.crop[2] >= 1 ||
            image.crop[1] + image.crop[3] >= 1
          ) {
            image = undefined;
            diagnostics.push("Invalid image crop.");
          }
        } else {
          kind = "unsupported";
          diagnostics.push(
            "Linked or unsupported image format is preserved without loading it.",
          );
        }
      }
      let table: SlideObject["table"];
      const tableElement = this.child(
        this.child(this.child(element, "graphic"), "graphicData"),
        "tbl",
      );
      if (tableElement) {
        table = this.parseTable(tableElement, context, diagnostics);
        kind = "table";
      }
      let chart: SlideObject["chart"];
      const chartElement = this.descendants(element).find(
        (item) =>
          item.namespaceUri === this.ns.chart && item.localName === "chart",
      );
      if (chartElement) {
        const id = this.rid(chartElement),
          part =
            id === undefined ? undefined : this.related(source, "chart", id);
        if (part) {
          chart = parseOoxmlChart(this.pkg.readPart(part), this.conformance);
          kind = "chart";
          if (chart.status === "unsupported") diagnostics.push(chart.reason);
        }
      }
      if (kind === "unsupported" && !diagnostics.length)
        diagnostics.push(
          `${element.localName === "graphicFrame" ? "This table or diagram" : "This object"} is preserved but not rendered yet.`,
        );
      const body = this.p(element, "txBody");
      const parsedText =
        body === undefined
          ? undefined
          : this.parseText(body, inherited, role, context, diagnostics);
      const unsafe =
        this.descendants(element).some(
          (item) =>
            item.localName === "extLst" &&
            this.children(item).length > 0 &&
            !isModificationIdList(item),
        ) ||
        source.xml
          .elements(OOXML_NAMESPACES.markupCompatibility, "AlternateContent")
          .some(
            (item) =>
              item.span.start < element.span.start &&
              item.span.end > element.span.end,
          );
      const restriction = this.signed
        ? "Signed presentations are read-only."
        : layer !== "slide"
          ? "Inherited objects are read-only."
          : depth > 0
            ? "Grouped objects are read-only."
            : !localTransform
              ? "Inherited geometry is read-only."
              : context.timed
                ? "Animated slides are read-only."
                : unsafe
                  ? "Objects with extension data are read-only."
                  : diagnostics.length
                    ? diagnostics[0]
                    : undefined;
      for (const message of diagnostics)
        context.diagnostics.push({
          part: source.part.name.value,
          shapeId,
          message,
        });
      result.push({
        key: `${source.part.name.value}#${shapeId}`,
        shapeId,
        elementId: element.id,
        sourcePart: source.part.name.value,
        layer,
        name:
          attr(metadata, "descr") ||
          attr(metadata, "name") ||
          `Object ${shapeId}`,
        kind,
        geometry,
        drawingGeometry,
        transform,
        matrix: multiply(parent, shapeMatrix(transform)),
        fill,
        gradient,
        shadow,
        strokeDash,
        strokeCap:
          attr(line, "cap") === "rnd"
            ? "round"
            : attr(line, "cap") === "sq"
              ? "square"
              : "butt",
        head: this.lineEnd(this.child(line, "headEnd")),
        tail: this.lineEnd(this.child(line, "tailEnd")),
        stroke,
        strokeWidth: px(line, "w", 1),
        cornerRadius:
          preset === "roundRect"
            ? Math.min(transform.width, transform.height) * 0.16667
            : 0,
        text: parsedText,
        image,
        chart,
        table,
        movable:
          restriction === undefined &&
          kind !== "unsupported" &&
          xfrm !== undefined,
        textEditable:
          restriction === undefined && parsedText?.editable === true,
        restriction,
        transformElementId: xfrm?.id,
      });
    }
    return result;
  }
  tableStyle(properties: Element | undefined): Element | undefined {
    const explicit = this.child(properties, "tableStyle");
    if (explicit) return explicit;
    const source = this.relatedXml(this.main, "tableStyles");
    const id = (
      text(this.child(properties, "tableStyleId")) ||
      attr(source?.xml.root, "def") ||
      ""
    )
      .trim()
      .toUpperCase();
    const authored = this.children(source?.xml.root).find(
      (style) => attr(style, "styleId")?.toUpperCase() === id,
    );
    if (authored) return authored;
    if (this.builtinStyles.has(id)) return this.builtinStyles.get(id);
    const markup = builtinTableStyles[id];
    if (!markup) return;
    const xml = parseLosslessXml(
      new TextEncoder().encode(
        markup.replaceAll(
          OOXML_NAMESPACES.transitional.drawing,
          this.ns.drawing,
        ),
      ),
    );
    const view = createMarkupCompatibilityView(xml, {
      understoodNamespaces: new Set([this.ns.drawing]),
    });
    for (const element of xml.elements()) this.views.set(element, view);
    this.builtinStyles.set(id, xml.root);
    return xml.root;
  }
  parseTable(
    element: Element,
    context: Context,
    diagnostics: string[],
  ): NonNullable<SlideObject["table"]> {
    const columns = this.children(this.child(element, "tblGrid")).map(
      (column) => px(column, "w"),
    );
    const rows = this.children(element).filter(
      (row) => row.namespaceUri === this.ns.drawing && row.localName === "tr",
    );
    const heights = rows.map((row) => px(row, "h"));
    if (
      !columns.length ||
      !rows.length ||
      [...columns, ...heights].some((value) => value <= 0)
    )
      throw new PresentationError("invalid_document", "Invalid table grid.");
    if (columns.length * rows.length > 10000)
      throw new PresentationError("limit_exceeded", "Too many table cells.");
    const properties = this.child(element, "tblPr");
    const style = this.tableStyle(properties);
    if (this.child(properties, "tableStyleId") && !style)
      diagnostics.push(
        "The table style could not be resolved; direct cell formatting is shown.",
      );
    const cells: NonNullable<SlideObject["table"]>["cells"][number][] = [];
    const occupied = new Set<string>();
    let y = 0;
    rows.forEach((row, r) => {
      let x = 0;
      const entries = this.children(row).filter(
        (item) =>
          item.namespaceUri === this.ns.drawing && item.localName === "tc",
      );
      if (entries.length !== columns.length)
        throw new PresentationError(
          "invalid_document",
          "Table cells do not match the column grid.",
        );
      entries.forEach((cell, c) => {
        const merged = truth(cell, "hMerge") || truth(cell, "vMerge");
        const columnSpan = number(cell, "gridSpan", 1),
          rowSpan = number(cell, "rowSpan", 1);
        if (
          !Number.isInteger(columnSpan) ||
          !Number.isInteger(rowSpan) ||
          columnSpan < 1 ||
          rowSpan < 1 ||
          c + columnSpan > columns.length ||
          r + rowSpan > rows.length
        )
          throw new PresentationError(
            "invalid_document",
            "Invalid table merge.",
          );
        if (merged) {
          if (!occupied.has(`${r}:${c}`))
            throw new PresentationError(
              "invalid_document",
              "Table merge has no origin cell.",
            );
        } else {
          for (let rr = r; rr < r + rowSpan; rr++)
            for (let cc = c; cc < c + columnSpan; cc++) {
              const key = `${rr}:${cc}`;
              if (occupied.has(key))
                throw new PresentationError(
                  "invalid_document",
                  "Overlapping table cells.",
                );
              occupied.add(key);
            }
          const firstRow = truth(properties, "firstRow"),
            lastRow = truth(properties, "lastRow"),
            firstCol = truth(properties, "firstCol"),
            lastCol = truth(properties, "lastCol");
          const regions = ["wholeTbl"];
          if (
            truth(properties, "bandCol") &&
            !(firstCol && c === 0) &&
            !(lastCol && c === columns.length - 1)
          )
            regions.push(
              (c - (firstCol ? 1 : 0)) % 2 === 0 ? "band1V" : "band2V",
            );
          if (
            truth(properties, "bandRow") &&
            !(firstRow && r === 0) &&
            !(lastRow && r === rows.length - 1)
          )
            regions.push(
              (r - (firstRow ? 1 : 0)) % 2 === 0 ? "band1H" : "band2H",
            );
          if (firstCol && c === 0) regions.push("firstCol");
          if (lastCol && c + columnSpan === columns.length)
            regions.push("lastCol");
          if (firstRow && r === 0) regions.push("firstRow");
          if (lastRow && r + rowSpan === rows.length) regions.push("lastRow");
          if (firstRow && r === 0 && firstCol && c === 0)
            regions.push("nwCell");
          if (
            firstRow &&
            r === 0 &&
            lastCol &&
            c + columnSpan === columns.length
          )
            regions.push("neCell");
          if (lastRow && r + rowSpan === rows.length && firstCol && c === 0)
            regions.push("swCell");
          if (
            lastRow &&
            r + rowSpan === rows.length &&
            lastCol &&
            c + columnSpan === columns.length
          )
            regions.push("seCell");
          const cascade = regions
            .map((name) => this.child(style, name))
            .filter((item) => item !== undefined)
            .reverse();
          const cellStyles = cascade
            .map((region) => this.child(region, "tcStyle"))
            .filter((item) => item !== undefined);
          const textStyles = cascade
            .map((region) => this.child(region, "tcTxStyle"))
            .filter((item) => item !== undefined);
          const styleFill = cellStyles
            .map((item) => {
              const fill = this.child(item, "fill"),
                ref = this.child(item, "fillRef");
              return (
                this.fill(fill, context) ??
                this.fill(
                  this.themeStyle(context, "fillStyleLst", number(ref, "idx")),
                  context,
                  this.color(ref, context),
                )
              );
            })
            .find((value) => value !== undefined);
          const props = this.child(cell, "tcPr"),
            body = this.child(cell, "txBody");
          const parsed = body
            ? this.parseText(
                body,
                [],
                "other",
                context,
                diagnostics,
                textStyles,
              )
            : undefined;
          const text: SlideText | undefined = parsed
            ? {
                ...parsed,
                inset: [
                  px(props, "marT", 4.8),
                  px(props, "marR", 9.6),
                  px(props, "marB", 4.8),
                  px(props, "marL", 9.6),
                ],
                anchor:
                  attr(props, "anchor") === "ctr"
                    ? "center"
                    : attr(props, "anchor") === "b"
                      ? "bottom"
                      : "top",
                textElementId: undefined,
              }
            : undefined;
          if (
            this.child(props, "gradFill") ||
            this.child(props, "blipFill") ||
            this.child(props, "pattFill") ||
            (attr(props, "vert") && attr(props, "vert") !== "horz")
          )
            diagnostics.push(
              "Some table fills or vertical text are not rendered.",
            );
          const borders = ["lnT", "lnR", "lnB", "lnL"].map((name, edge) => {
            const direct = this.child(props, name);
            const outer = [
              r === 0,
              c + columnSpan === columns.length,
              r + rowSpan === rows.length,
              c === 0,
            ][edge];
            const position = ["top", "right", "bottom", "left"][edge]!;
            const edgeStyles = cascade
              .map((region) => {
                const borders = this.child(
                  this.child(region, "tcStyle"),
                  "tcBdr",
                );
                const regionEdge =
                  region.localName === "wholeTbl"
                    ? outer
                    : region.localName === "firstRow" ||
                        region.localName === "lastRow" ||
                        region.localName.startsWith("band")
                      ? edge % 2 === 0
                      : region.localName === "firstCol" ||
                          region.localName === "lastCol"
                        ? edge % 2 === 1
                        : true;
                return this.child(
                  borders,
                  regionEdge
                    ? position
                    : edge % 2 === 0
                      ? "insideH"
                      : "insideV",
                );
              })
              .filter((item) => item !== undefined);
            const styleBorder = edgeStyles[0],
              ref = this.child(styleBorder, "lnRef");
            const line =
              direct ??
              this.child(styleBorder, "ln") ??
              this.themeStyle(context, "lnStyleLst", number(ref, "idx"));
            const dash = attr(this.child(line, "prstDash"), "val");
            return {
              color:
                this.fill(line, context, this.color(ref, context)) ?? "none",
              width: px(line, "w", 1),
              dash: dash && dash !== "solid" ? "4 3" : "",
            };
          });
          cells.push({
            elementId: cell.id,
            x,
            y,
            width: columns.slice(c, c + columnSpan).reduce((a, b) => a + b, 0),
            height: heights.slice(r, r + rowSpan).reduce((a, b) => a + b, 0),
            row: r,
            column: c,
            rowSpan,
            columnSpan,
            text,
            fill:
              this.fill(props, context) ??
              styleFill ??
              this.fill(properties, context) ??
              "none",
            borders,
          });
        }
        x += columns[c]!;
      });
      y += heights[r]!;
    });
    return {
      elementId: element.id,
      width: columns.reduce((a, b) => a + b, 0),
      height: y,
      cells,
    };
  }
  parseText(
    body: Element,
    inherited: Element[],
    role: string,
    context: Context,
    diagnostics: string[],
    tableTextStyles: Element[] = [],
  ): SlideText {
    const bodies = [
      body,
      ...inherited
        .map((item) => this.p(item, "txBody"))
        .filter((item) => item !== undefined && item !== body),
    ];
    const bodyProperties = bodies.map((item) => this.child(item, "bodyPr"));
    const bodyAttr = (name: string) =>
      bodyProperties
        .map((item) => attr(item, name))
        .find((value) => value !== undefined);
    const own = this.child(body, "bodyPr");
    const fitting = bodyProperties.flatMap(properties => this.children(properties).filter(child => ["normAutofit", "spAutoFit", "noAutofit"].includes(child.localName)))[0];
    const auto = fitting?.localName === "normAutofit" ? fitting : undefined;
    const reduction = Math.max(0, Math.min(1, number(auto, "lnSpcReduction") / 100000));
    const fontScale = number(auto, "fontScale", 100000) / 100000;
    if (fitting?.localName === "spAutoFit")
      diagnostics.push(
        "Shape autofit is read-only.",
      );
    if (
      bodyAttr("vert") &&
      !["horz", "vert", "vert270", "eaVert"].includes(bodyAttr("vert")!)
    )
      diagnostics.push("Vertical text is not rendered yet.");

    const masterStyles = this.p(context.master?.xml.root, "txStyles");
    const masterStyle = this.p(
      masterStyles,
      ["title", "ctrTitle"].includes(role)
        ? "titleStyle"
        : role === "body" || role === "subTitle" || role === "obj"
          ? "bodyStyle"
          : "otherStyle",
    );
    const paragraphs: SlideParagraph[] = [];
    const numbering = new Map<number, { scheme: string; value: number }>();
    for (const paragraph of this.children(body).filter(
      (item) => item.localName === "p" && item.namespaceUri === this.ns.drawing,
    )) {
      const ppr = this.child(paragraph, "pPr");
      const level = Math.min(8, Math.max(0, number(ppr, "lvl")));
      const cascade = [
        ppr,
        ...bodies.flatMap((item, i) => [
          i > 0
            ? this.child(
                this.children(item).find((child) => child.localName === "p"),
                "pPr",
              )
            : undefined,
          this.child(this.child(item, "lstStyle"), `lvl${level + 1}pPr`),
        ]),
        this.child(masterStyle, `lvl${level + 1}pPr`),
        this.child(
          this.p(this.main.xml.root, "defaultTextStyle"),
          `lvl${level + 1}pPr`,
        ),
      ];
      const prop = (name: string) =>
        cascade
          .map((item) => attr(item, name))
          .find((value) => value !== undefined);
      const alignment = prop("algn");
      const runs: SlideTextRun[] = [];
      for (const run of this.children(paragraph)) {
        if (run.localName === "br") {
          runs.push({
            text: "\n",
            fontFamily: "Arial",
            fontSize: 24,
            color: "#222",
            bold: false,
            italic: false,
            underline: false,
          });
          continue;
        }
        if (!["r", "fld"].includes(run.localName)) continue;
        const rpr = this.child(run, "rPr");
        const defaults = [
          rpr,
          ...cascade
            .slice(0, bodies.length * 2 + 1)
            .map((item) => this.child(item, "defRPr")),
          ...tableTextStyles,
          ...cascade
            .slice(bodies.length * 2 + 1)
            .map((item) => this.child(item, "defRPr")),
        ];
        const runAttr = (name: string) =>
          defaults
            .map((item) => attr(item, name))
            .find((value) => value !== undefined);
        const font = (kind: "latin" | "eastAsian" | "complexScript", script: string) => {
          const tag = kind === "eastAsian" ? "ea" : kind === "complexScript" ? "cs" : "latin";
          const authored = defaults.map(item => attr(this.child(item, tag), "typeface")).find(value => !!value);
          const role = authored?.startsWith("+mj") || (!authored && ["title", "ctrTitle"].includes(roleName)) ? "major" : "minor";
          return authored && !authored.startsWith("+") ? authored : context.fonts?.typeface(role, kind, script) ?? context.fonts?.typeface(role, "latin") ?? "Arial";
        };
        const roleName = role;
        const value =
          run.localName === "fld" && attr(run, "type") === "slidenum"
            ? String(context.slideNumber)
            : text(this.child(run, "t"));
        this.characters += value.length;
        if (this.characters > this.limits.maxTextCharacters)
          throw new PresentationError(
            "limit_exceeded",
            "Too much presentation text.",
          );
        for (const segment of scriptSegments(value, runAttr("lang"))) runs.push({
          text: segment.text,
          fontFamily: font(segment.kind, segment.script),
          fontSize:
            (((numeric(runAttr("sz"), 1800) / 100) * 4) / 3) * fontScale,
          color:
            defaults
              .map(
                (item) => this.fill(item, context) ?? this.color(item, context),
              )
              .find((value) => value !== undefined) ?? "#222222",
          bold: ["1", "true", "on"].includes(runAttr("b") ?? ""),
          italic: ["1", "true", "on"].includes(runAttr("i") ?? ""),
          underline: !!runAttr("u") && runAttr("u") !== "none",
          strike: !!runAttr("strike") && runAttr("strike") !== "noStrike",
          baseline: numeric(runAttr("baseline"), 0) / 100000,
          spacing: ((numeric(runAttr("spc"), 0) / 100) * 4) / 3,
          capitals: runAttr("cap") ?? "none",
          ...(this.hyperlink(this.child(rpr, "hlinkClick"))
            ? { hyperlink: this.hyperlink(this.child(rpr, "hlinkClick"))! }
            : {}),
        });
      }
      const bulletOwner = cascade.find(
        (item) =>
          this.child(item, "buNone") ||
          this.child(item, "buChar") ||
          this.child(item, "buAutoNum"),
      );
      const emptySize =
        (((numeric(
          attr(this.child(paragraph, "endParaRPr"), "sz") ??
            cascade
              .map((item) => attr(this.child(item, "defRPr"), "sz"))
              .find((value) => value !== undefined),
          1800,
        ) /
          100) *
          4) /
          3) *
        fontScale;
      const largest = runs.length
        ? Math.max(1, ...runs.map((run) => run.fontSize))
        : emptySize;
      const spacing = (name: string) => {
        const item = cascade
          .map((entry) => this.child(entry, name))
          .find((value) => value !== undefined);
        const points = this.child(item, "spcPts");
        return points
          ? ((number(points, "val") / 100) * 4) / 3
          : (number(this.child(item, "spcPct"), "val") / 100000) * largest;
      };
      const lineSpacing = cascade
        .map((entry) => this.child(entry, "lnSpc"))
        .find((value) => value !== undefined);
      const points = this.child(lineSpacing, "spcPts");
      const lineHeight = points
        ? `${((number(points, "val") / 100) * 4) / 3 * (1 - reduction)}px`
        : number(this.child(lineSpacing, "spcPct"), "val", 100000) / 100000 * (1 - reduction);
      const autoNum = this.child(bulletOwner, "buAutoNum");
      let bullet = this.child(bulletOwner, "buNone")
        ? ""
        : (attr(this.child(bulletOwner, "buChar"), "char") ?? "");
      if (autoNum) {
        const scheme = attr(autoNum, "type") ?? "arabicPeriod";
        const previous = numbering.get(level),
          start = attr(autoNum, "startAt");
        const value =
          start !== undefined
            ? number(autoNum, "startAt", 1)
            : previous?.scheme === scheme
              ? previous.value + 1
              : 1;
        if (value < 1 || value > 32767)
          throw new PresentationError(
            "invalid_document",
            "Invalid bullet numbering.",
          );
        numbering.set(level, { scheme, value });
        for (const key of numbering.keys())
          if (key > level) numbering.delete(key);
        bullet = formatAutoNumber(value, scheme);
        if (
          !/^(arabic|romanUc|romanLc|alphaUc|alphaLc)(Period|ParenR|ParenBoth|Plain)$/.test(
            scheme,
          )
        )
          diagnostics.push(
            "This numbering scheme is approximated with decimal numbers.",
          );
      } else {
        numbering.delete(level);
      }
      const bulletProp = (name: string) =>
        cascade
          .map((item) => this.child(item, name))
          .find((item) => item !== undefined);
      const tabs = cascade.map(entry => this.child(entry, "tabLst")).find(Boolean);
      paragraphs.push({
        tabs: this.children(tabs).filter(tab => tab.localName === "tab").map(tab => ({position:px(tab,"pos"),alignment:attr(tab,"algn") ?? "l"})).sort((a,b)=>a.position-b.position),
        defaultTabSize: Math.max(1,numeric(prop("defTabSz") ?? bodyAttr("defTabSz"),914400)/EMUS_PER_PIXEL),
        distributed: ["dist", "thaiDist", "justLow"].includes(alignment ?? ""),
        marginRight: numeric(prop("marR"),0)/EMUS_PER_PIXEL,
        runs,
        fontSize: largest,
        align:
          alignment === "ctr"
            ? "center"
            : alignment === "r"
              ? "right"
              : ["just", "dist", "thaiDist", "justLow"].includes(alignment ?? "")
                ? "justify"
                : "left",
        bullet,
        rtl: ["1", "true"].includes(prop("rtl") ?? ""),
        bulletFont:
          attr(bulletProp("buFont"), "typeface") ??
          runs[0]?.fontFamily ??
          "Arial",
        bulletColor:
          this.color(bulletProp("buClr"), context) ?? runs[0]?.color ?? "#222",
        bulletSize: bulletProp("buSzPts")
          ? ((number(bulletProp("buSzPts"), "val") / 100) * 4) / 3
          : (largest * number(bulletProp("buSzPct"), "val", 100000)) / 100000,
        marginLeft: numeric(prop("marL"), 0) / EMUS_PER_PIXEL,
        indent: numeric(prop("indent"), 0) / EMUS_PER_PIXEL,
        before: spacing("spcBef"),
        after: spacing("spcAft"),
        lineHeight,
      });
    }
    const texts = this.descendants(body).filter(
      (item) => item.namespaceUri === this.ns.drawing && item.localName === "t",
    );
    const safe =
      paragraphs.length > 0 &&
      this.children(body)
        .filter((item) => item.localName === "p")
        .every((paragraph) =>
          this.children(paragraph).every(
            (item) =>
              ["pPr", "endParaRPr"].includes(item.localName) ||
              (item.localName === "r" &&
                this.children(item).every((runChild) =>
                  ["rPr", "t"].includes(runChild.localName),
                )),
          ),
        ) &&
      !this.descendants(body).some((item) =>
        ["fld", "br", "hlinkClick", "hlinkMouseOver"].includes(item.localName),
      ) &&
      !auto &&
      numeric(bodyAttr("numCol"), 1) === 1 &&
      [undefined, "horz"].includes(bodyAttr("vert")) &&
      numeric(bodyAttr("rot"), 0) === 0;
    return {
      paragraphs,
      autoFit: fitting?.localName === "normAutofit" ? "normal" : fitting?.localName === "spAutoFit" ? "shape" : "none",
      horizontalOverflow: bodyAttr("horzOverflow") === "clip" ? "clip" : "overflow",
      verticalOverflow: bodyAttr("vertOverflow") === "clip" ? "clip" : bodyAttr("vertOverflow") === "ellipsis" ? "ellipsis" : "overflow",
      editable: safe,
      inset: [
        numeric(bodyAttr("tIns"), 45720) / EMUS_PER_PIXEL,
        numeric(bodyAttr("rIns"), 91440) / EMUS_PER_PIXEL,
        numeric(bodyAttr("bIns"), 45720) / EMUS_PER_PIXEL,
        numeric(bodyAttr("lIns"), 91440) / EMUS_PER_PIXEL,
      ],
      anchor:
        bodyAttr("anchor") === "ctr"
          ? "center"
          : bodyAttr("anchor") === "b"
            ? "bottom"
            : "top",
      wrap: bodyAttr("wrap") !== "none",
      direction: bodyAttr("vert") ?? "horz",
      rotation: numeric(bodyAttr("rot"), 0) / 60000,
      columns: Math.max(1, Math.min(16, numeric(bodyAttr("numCol"), 1))),
      columnGap: numeric(bodyAttr("spcCol"), 0) / EMUS_PER_PIXEL,
      tabSize: numeric(bodyAttr("defTabSz"), 914400) / EMUS_PER_PIXEL,
      textElementId:
        safe && texts.length === 1 && paragraphs.length === 1
          ? texts[0]?.id
          : undefined,
    };
  }
}
