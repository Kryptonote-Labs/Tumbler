import {
  normalizeFormattingPatch,
  type FormattingPatch,
  type FormattingState,
  type FormattingValue,
  type FormattingCapabilities,
} from "@tumblerjs/core";
import {
  beginLosslessXmlEdit,
  type LosslessXmlDocument,
  type LosslessXmlElement,
} from "@tumblerjs/ooxml";
import { PresentationError, type SlideObject } from "./model.ts";
export interface PresentationTableCellAddress {
  readonly row: number;
  readonly column: number;
}
export interface PresentationTextRange {
  readonly start: number;
  readonly end: number;
}
export interface PresentationTextEdit extends PresentationTextRange {
  readonly cell?: PresentationTableCellAddress;
  readonly slideId: string;
  readonly objectKey: string;
  readonly value: string;
  readonly formatting?: FormattingPatch;
}
export interface PresentationFormatChange extends PresentationTextRange {
  readonly cell?: PresentationTableCellAddress;
  readonly slideId: string;
  readonly objectKey: string;
  readonly patch: FormattingPatch;
}
export interface PresentationShapeStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
}
export interface PresentationShapeChange extends PresentationShapeStyle {
  readonly slideId: string;
  readonly objectKey: string;
}
/** Resolve the owning table cell without allowing callers to bypass object restrictions. */
export function presentationTextTarget(
  object: SlideObject,
  address?: PresentationTableCellAddress,
): SlideObject {
  if (!address) return object;
  const cell = object.table?.cells.find(
    (cell) => cell.row === address.row && cell.column === address.column,
  );
  if (!cell)
    throw new PresentationError(
      "invalid_document",
      "The table cell does not exist or is covered by a merged cell.",
    );
  return {
    ...object,
    elementId: cell.elementId,
    text: cell.text,
    textEditable:
      object.restriction === undefined && cell.text?.editable === true,
  };
}
export const presentationFormattingCapabilities: FormattingCapabilities = {
  text: {
    fontFamily: true,
    fontSize: { minimum: 1, maximum: 409 },
    bold: true,
    italic: true,
    underline: ["none", "single"],
    color: true,
  },
  block: {
    horizontalAlignment: ["start", "center", "end"],
    verticalAlignment: false,
  },
};
export const slideTextValue = (object: SlideObject) =>
  object.text?.paragraphs
    .map((p) => p.runs.map((r) => r.text).join(""))
    .join("\n") ?? "";
export function presentationFormattingState(
  object: SlideObject | undefined,
  range?: PresentationTextRange,
): FormattingState {
  const selected: NonNullable<
    SlideObject["text"]
  >["paragraphs"][number]["runs"][number][] = [];
  const aligns: ("start" | "center" | "end" | "justify")[] = [];
  let position = 0;
  for (const p of object?.text?.paragraphs ?? []) {
    const begin = position;
    for (const r of p.runs) {
      const end = position + r.text.length;
      if (
        !range ||
        (range.start === range.end
          ? range.start >= position && range.start <= end
          : range.start < end && range.end > position)
      )
        selected.push(r);
      position = end;
    }
    if (!range || (range.start <= position && range.end >= begin))
      aligns.push(
        p.align === "left" ? "start" : p.align === "right" ? "end" : p.align,
      );
    position++;
  }
  function mixed<T>(values: T[]): FormattingValue<T> {
    return !values.length
      ? { state: "unavailable" }
      : values.every((v) => JSON.stringify(v) === JSON.stringify(values[0]))
        ? { state: "value", value: values[0]! }
        : { state: "mixed" };
  }
  return {
    text: {
      fontFamily: mixed(selected.map((r) => r.fontFamily)),
      fontSize: mixed(selected.map((r) => (r.fontSize * 3) / 4)),
      bold: mixed(selected.map((r) => r.bold)),
      italic: mixed(selected.map((r) => r.italic)),
      underline: mixed(
        selected.map((r) =>
          r.underline ? ("single" as const) : ("none" as const),
        ),
      ),
      color: mixed(
        selected.map((r) => ({
          type: "rgb" as const,
          value: slideColorHex(r.color),
        })),
      ),
    },
    block: {
      horizontalAlignment: mixed(aligns),
      verticalAlignment: { state: "unavailable" },
    },
  };
}
export function slideColorHex(value: string) {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  return rgb
    ? "#" +
        rgb
          .slice(1, 4)
          .map((n) => Number(n).toString(16).padStart(2, "0"))
          .join("")
    : "#000000";
}
const elements = (e: LosslessXmlElement) =>
  e.children.filter((n): n is LosslessXmlElement => n.kind === "element");
const child = (e: LosslessXmlElement, name: string) =>
  elements(e).find(
    (n) => n.localName === name && n.namespaceUri === e.namespaceUri,
  );
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const raw = (source: LosslessXmlDocument, e: LosslessXmlElement | undefined) =>
  e ? source.source.slice(e.span.start, e.span.end) : "";
const tag = (e: LosslessXmlElement, name: string) =>
  e.qualified.includes(":") ? e.qualified.split(":")[0] + ":" + name : name;
function markup(
  source: LosslessXmlDocument,
  e: LosslessXmlElement,
  attributes: Record<string, string | undefined>,
  children: string,
) {
  let open = source.source
    .slice(e.startTagSpan.start, e.startTagSpan.end)
    .replace(/\s*\/?>$/, ">");
  for (const [name, value] of Object.entries(attributes)) {
    const old = e.attributes.find((a) => a.qualified === name);
    if (old) {
      const original = source.source.slice(old.span.start, old.span.end);
      open = open.replace(
        original,
        value === undefined ? "" : `${name}="${escape(value)}"`,
      );
    } else if (value !== undefined)
      open = open.slice(0, -1) + ` ${name}="${escape(value)}">`;
  }
  return open + children + `</${e.qualified}>`;
}
function properties(
  source: LosslessXmlDocument,
  parent: LosslessXmlElement,
  existing: LosslessXmlElement | undefined,
  name: string,
  patch: FormattingPatch,
): string {
  const attrs: Record<string, string | undefined> = {};
  const replacements = new Map<string, string>();
  const t = patch.text;
  for (const [key, xml] of [
    ["bold", "b"],
    ["italic", "i"],
    ["fontSize", "sz"],
    ["underline", "u"],
  ] as const) {
    const change = t?.[key];
    if (change)
      attrs[xml] =
        "set" in change
          ? key === "fontSize"
            ? String(Math.round(Number(change.set) * 100))
            : key === "underline"
              ? change.set === "none"
                ? "none"
                : change.set === "double"
                  ? "dbl"
                  : "sng"
              : change.set
                ? "1"
                : "0"
          : undefined;
  }
  const q = (n: string) => tag(parent, n);
  if (t?.fontFamily)
    replacements.set(
      "latin",
      "set" in t.fontFamily
        ? `<${q("latin")} typeface="${escape(t.fontFamily.set)}"/>`
        : "",
    );
  if (t?.color) {
    for (const n of [
      "noFill",
      "solidFill",
      "gradFill",
      "blipFill",
      "pattFill",
      "grpFill",
    ])
      replacements.set(n, "");
    if ("set" in t.color && t.color.set.type === "rgb")
      replacements.set(
        "solidFill",
        `<${q("solidFill")}><${q("srgbClr")} val="${t.color.set.value.slice(1)}"/></${q("solidFill")}>`,
      );
  }

  // DrawingML CT_TextCharacterProperties order: line, fill, effects, highlight, underline, fonts, links, extensions.
  const order = [
    "ln",
    "noFill",
    "solidFill",
    "gradFill",
    "blipFill",
    "pattFill",
    "grpFill",
    "effectLst",
    "effectDag",
    "highlight",
    "uLnTx",
    "uLn",
    "uFillTx",
    "uFill",
    "latin",
    "ea",
    "cs",
    "sym",
    "hlinkClick",
    "hlinkMouseOver",
    "rtl",
    "extLst",
  ];
  const nodes = existing
    ? elements(existing)
        .filter((e) => !replacements.has(e.localName))
        .map((e) => ({ name: e.localName, xml: raw(source, e) }))
    : [];
  for (const [name, xml] of replacements) if (xml) nodes.push({ name, xml });
  nodes.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const inner = nodes.map((n) => n.xml).join("");
  return existing
    ? markup(source, existing, attrs, inner)
    : `<${q(name)}${Object.entries(attrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => ` ${k}="${escape(v!)}"`)
        .join("")}>${inner}</${q(name)}>`;
}
/** Edits ordinary DrawingML runs while retaining paragraph and run properties. */
export function editPresentationText(
  source: LosslessXmlDocument,
  object: SlideObject,
  range: PresentationTextRange,
  value: string | undefined,
  patch?: FormattingPatch,
): Uint8Array {
  if (!object.textEditable)
    throw new PresentationError(
      "unsupported_edit",
      "This text contains unsupported editing features.",
    );
  const shape = source.element(object.elementId)!;
  const body = elements(shape).find((e) => e.localName === "txBody")!;
  const paragraphs = elements(body).filter((e) => e.localName === "p");
  const plain = slideTextValue(object);
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    range.end > plain.length
  )
    throw new RangeError("Invalid text range.");
  const boundaries = new Set([
    0,
    ...Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(plain),
      (s) => s.index + s.segment.length,
    ),
  ]);
  if (!boundaries.has(range.start) || !boundaries.has(range.end))
    throw new RangeError("Text ranges must follow grapheme boundaries.");
  if (
    value !== undefined &&
    (value.length + plain.length - (range.end - range.start) > 100000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\r]/u.test(value))
  )
    throw new RangeError("Invalid presentation text.");
  const normalized = patch ? normalizeFormattingPatch(patch) : undefined;
  if (normalized?.block?.verticalAlignment)
    throw new RangeError(
      "Vertical alignment is not supported by this text command.",
    );
  let offset = 0;
  const data = paragraphs.map((p) => {
    const start = offset;
    let local = 0;
    const runs = elements(p)
      .filter((e) => e.localName === "r" || e.localName === "br")
      .map((r) => {
        const t = child(r, "t")!;
        const text =
          r.localName === "br"
            ? "\n"
            : t.children
                .map((n) =>
                  n.kind === "text" || n.kind === "cdata" ? n.value : "",
                )
                .join("");
        const run = { element: r, text, start: local };
        local += text.length;
        return run;
      });
    offset += local + 1;
    return { element: p, runs, start, end: start + local };
  });
  const renderRun = (
    r: (typeof data)[number]["runs"][number] | undefined,
    p: LosslessXmlElement,
    text: string,
    format?: FormattingPatch,
  ) => {
    const q = (n: string) => tag(p, n);
    const pr = r ? child(r.element, "rPr") : undefined;
    const props = format
      ? properties(source, p, pr, "rPr", format)
      : raw(source, pr);
    if (r?.element.localName === "br" && text === "\n")
      return markup(source, r.element, {}, props);
    const content = `${props}<${q("t")}>${escape(text)}</${q("t")}>`;
    return r && r.element.localName !== "br"
      ? markup(source, r.element, {}, content)
      : `<${q("r")}>${content}</${q("r")}>`;
  };
  const slice = (
    p: (typeof data)[number],
    from: number,
    to: number,
    format?: FormattingPatch,
  ) =>
    p.runs
      .flatMap((r) => {
        const a = Math.max(from, r.start),
          b = Math.min(to, r.start + r.text.length);
        return b > a
          ? [
              renderRun(
                r,
                p.element,
                r.text.slice(a - r.start, b - r.start),
                format,
              ),
            ]
          : [];
      })
      .join("");
  const renderParagraph = (
    p: (typeof data)[number],
    runs: string,
    format?: FormattingPatch,
  ) => {
    const pr = child(p.element, "pPr");
    let props = raw(source, pr);
    const align = format?.block?.horizontalAlignment;
    if (align) {
      const a =
        "set" in align
          ? ({ start: "l", center: "ctr", end: "r", justify: "just" } as const)[
              align.set
            ]
          : undefined;
      props = pr
        ? markup(
            source,
            pr,
            { algn: a },
            elements(pr)
              .map((e) => raw(source, e))
              .join(""),
          )
        : `<${tag(p.element, "pPr")}${a ? ` algn="${a}"` : ""}/>`;
    }
    return markup(
      source,
      p.element,
      {},
      props + runs + raw(source, child(p.element, "endParaRPr")),
    );
  };
  const editor = beginLosslessXmlEdit(source);
  if (value === undefined) {
    for (const p of data) {
      if (
        range.start > p.end ||
        range.end < p.start ||
        (range.end === p.start && range.start !== range.end)
      )
        continue;
      const a = Math.max(0, range.start - p.start),
        b = Math.min(p.end - p.start, range.end - p.start);
      const runs =
        slice(p, 0, a) +
        slice(p, a, b, normalized) +
        slice(p, b, p.end - p.start);
      editor.replaceElementMarkup(
        p.element,
        renderParagraph(p, runs, normalized),
      );
    }
  } else {
    const first = data.find((p) => range.start <= p.end)!,
      last = data.find((p) => range.end <= p.end)!;
    const donor =
      first.runs.find(
        (r) => range.start - first.start <= r.start + r.text.length,
      ) ?? first.runs.at(-1);
    // Ordinary typing changes one text node instead of creating a run per keystroke.
    if (
      first === last &&
      donor &&
      donor.element.localName === "r" &&
      !normalized &&
      !value.includes("\n") &&
      range.start >= first.start + donor.start &&
      range.end <= first.start + donor.start + donor.text.length
    ) {
      const start = range.start - first.start - donor.start,
        end = range.end - first.start - donor.start;
      editor.setText(
        child(donor.element, "t")!,
        donor.text.slice(0, start) + value + donor.text.slice(end),
      );
      return editor.commit().bytes;
    }
    const pieces = value.split("\n");
    const result = pieces
      .map((piece, i) => {
        const p = i === pieces.length - 1 && i > 0 ? last : first;
        return renderParagraph(
          p,
          (i === 0 ? slice(first, 0, range.start - first.start) : "") +
            (piece ? renderRun(donor, first.element, piece, normalized) : "") +
            (i === pieces.length - 1
              ? slice(last, range.end - last.start, last.end - last.start)
              : ""),
        );
      })
      .join("");
    editor.replaceElementMarkup(first.element, result);
    for (const p of data)
      if (p.start > first.start && p.start <= last.start)
        editor.removeElement(p.element);
  }
  return editor.commit().bytes;
}
export function editPresentationShape(
  source: LosslessXmlDocument,
  object: SlideObject,
  patch: PresentationShapeStyle,
): Uint8Array {
  if (object.kind !== "shape" || object.restriction)
    throw new PresentationError(
      "unsupported_edit",
      "This shape cannot be formatted.",
    );
  for (const color of [patch.fill, patch.stroke])
    if (
      color !== undefined &&
      color !== "none" &&
      !/^#[\da-f]{6}$/i.test(color)
    )
      throw new RangeError("Use a hex colour or none.");
  if (
    patch.strokeWidth !== undefined &&
    (!Number.isFinite(patch.strokeWidth) ||
      patch.strokeWidth < 0 ||
      patch.strokeWidth > 100)
  )
    throw new RangeError("Outline width must be between 0 and 100 points.");
  const shape = source.element(object.elementId)!;
  const props = elements(shape).find((e) => e.localName === "spPr")!;
  const drawing =
    source
      .elements()
      .find(
        (element) =>
          element.namespaceUri.endsWith("/drawingml/main") ||
          element.namespaceUri.endsWith("/drawingml/2006/main"),
      )?.namespaceUri ??
    "http://schemas.openxmlformats.org/drawingml/2006/main";
  const q = (n: string) => `a:${n}`;
  const fillNames = [
    "noFill",
    "solidFill",
    "gradFill",
    "blipFill",
    "pattFill",
    "grpFill",
  ];
  const fill = (color: string) =>
    color === "none"
      ? `<${q("noFill")}/>`
      : `<${q("solidFill")}><${q("srgbClr")} val="${color.slice(1)}"/></${q("solidFill")}>`;
  const nodes = elements(props).map((e) => ({
    name: e.localName,
    xml: raw(source, e),
  }));
  if (patch.fill !== undefined) {
    for (let i = nodes.length - 1; i >= 0; i--)
      if (fillNames.includes(nodes[i]!.name)) nodes.splice(i, 1);
    nodes.push({ name: "solidFill", xml: fill(patch.fill) });
  }
  if (patch.stroke !== undefined || patch.strokeWidth !== undefined) {
    const line =
      child(props, "ln") ?? elements(props).find((e) => e.localName === "ln");
    const inner =
      (patch.stroke === undefined
        ? elements(line ?? props)
            .filter((e) => line && fillNames.includes(e.localName))
            .map((e) => raw(source, e))
            .join("")
        : fill(patch.stroke)) +
      (line
        ? elements(line)
            .filter((e) => !fillNames.includes(e.localName))
            .map((e) => raw(source, e))
            .join("")
        : "");
    const width =
      patch.strokeWidth === undefined
        ? {}
        : { w: String(Math.round(patch.strokeWidth * 12700)) };
    const xml = line
      ? markup(source, line, width, inner)
      : `<${q("ln")}${width.w ? ` w="${width.w}"` : ""}>${inner}</${q("ln")}>`;
    const i = nodes.findIndex((n) => n.name === "ln");
    if (i >= 0) nodes.splice(i, 1);
    nodes.push({ name: "ln", xml });
  }
  const order = [
    "xfrm",
    "prstGeom",
    "custGeom",
    ...fillNames,
    "ln",
    "effectLst",
    "effectDag",
    "scene3d",
    "sp3d",
    "extLst",
  ];
  nodes.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const editor = beginLosslessXmlEdit(source);
  editor.replaceElementMarkup(
    props,
    markup(
      source,
      props,
      { "xmlns:a": drawing },
      nodes.map((n) => n.xml).join(""),
    ),
  );
  return editor.commit().bytes;
}
