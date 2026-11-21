import { beginLosslessXmlEdit, OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from "@tumblerjs/ooxml";
import type { MathEquation } from "./model.ts";
import { mathFromOmml, OMML_NAMESPACE } from "./omml.ts";
import { mathToOmml, mathToText } from "./serialize.ts";

// Office Math inside DrawingML text, as PowerPoint and Excel write it: an `a14:m` element holds a
// math zone within a paragraph, and the shape sits in `mc:AlternateContent` requiring a14 with a
// fallback that shows each equation's linear format.

/** DrawingML 2010, the namespace of `a14:m`. */
export const DRAWING_2010_NAMESPACE = "http://schemas.microsoft.com/office/drawing/2010/main";
/** Math zones use Cambria Math, as Office writes them. */
export const EQUATION_FONT = "Cambria Math";
const MC = OOXML_NAMESPACES.markupCompatibility;

const elements = (element: LosslessXmlElement) =>
  element.children.filter((node): node is LosslessXmlElement => node.kind === "element");
const raw = (source: LosslessXmlDocument, element: LosslessXmlElement) =>
  source.source.slice(element.span.start, element.span.end);
const descendants = (element: LosslessXmlElement): LosslessXmlElement[] =>
  elements(element).flatMap((child) => [child, ...descendants(child)]);
const zone = (element: LosslessXmlElement) =>
  elements(element).find(
    (child) => child.namespaceUri === OMML_NAMESPACE && (child.localName === "oMath" || child.localName === "oMathPara"),
  );

export const isDrawingEquation = (element: LosslessXmlElement) =>
  element.namespaceUri === DRAWING_2010_NAMESPACE && element.localName === "m";

/** The equation an `a14:m` element holds. */
export function drawingEquation(element: LosslessXmlElement): MathEquation {
  const math = zone(element);
  return math ? mathFromOmml(math) : { body: [] };
}

/** The `a:rPr` typography of an equation's first math run. */
export function drawingEquationRunProperties(element: LosslessXmlElement) {
  return descendants(element).find((child) => child.localName === "rPr" && child.namespaceUri !== OMML_NAMESPACE);
}

/**
 * How an `a14:m` element lays its equation out: `undefined` for an inline zone, otherwise the
 * display paragraph's `m:oMathParaPr` markup (empty without one), so edits keep the layout.
 */
export function drawingEquationParagraph(source: LosslessXmlDocument, element: LosslessXmlElement) {
  const math = zone(element);
  if (math?.localName !== "oMathPara") return undefined;
  const properties = elements(math).find((child) => child.namespaceUri === OMML_NAMESPACE && child.localName === "oMathParaPr");
  return properties ? raw(source, properties) : "";
}

/**
 * `a14:m` markup for an equation. `runProperties` is the `a:rPr` each math run carries, using the
 * prefixes in scope where the markup is inserted; `paragraph` makes it a display equation.
 */
export function drawingEquationMarkup(equation: MathEquation, runProperties: string, paragraph?: string) {
  const math = mathToOmml(equation, runProperties);
  const omml =
    paragraph === undefined
      ? math.replace("<m:oMath>", `<m:oMath xmlns:m="${OMML_NAMESPACE}">`)
      : `<m:oMathPara xmlns:m="${OMML_NAMESPACE}">${paragraph}${math}</m:oMathPara>`;
  return `<a14:m xmlns:a14="${DRAWING_2010_NAMESPACE}">${omml}</a14:m>`;
}

function shapeIdentity(shape: LosslessXmlElement) {
  const properties = elements(shape).find((child) => child.localName.startsWith("nv"));
  return properties && elements(properties).find((child) => child.localName === "cNvPr")
    ?.attributes.find((attribute) => attribute.localName === "id" && attribute.namespaceUri === "")?.value;
}

/** A shape's markup with each equation replaced by a run of its linear format, for readers without a14. */
function fallbackMarkup(source: LosslessXmlDocument, shape: LosslessXmlElement) {
  const start = shape.span.start;
  let markup = raw(source, shape);
  for (const zone of descendants(shape).filter(isDrawingEquation).reverse()) {
    const properties = drawingEquationRunProperties(zone);
    const prefix = properties?.qualified.includes(":") ? properties.qualified.split(":")[0]! : "a";
    const rPr = properties ? raw(source, properties) : "";
    const text = mathToText(drawingEquation(zone)).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    markup =
      markup.slice(0, zone.span.start - start) +
      `<${prefix}:r>${rPr}<${prefix}:t>${text}</${prefix}:t></${prefix}:r>` +
      markup.slice(zone.span.end - start);
  }
  return markup;
}

/**
 * Keeps a shape's Office Math interoperable after an edit. A shape with equations sits in
 * `mc:AlternateContent` requiring a14, as Office writes it, with a fallback showing each
 * equation's linear format; a shape whose last equation was removed becomes an ordinary shape.
 * `shapeId` is the shape's `cNvPr` id.
 */
export function reconcileDrawingEquationShape(bytes: Uint8Array, shapeId: string): Uint8Array {
  const source = parseLosslessXml(bytes);
  const shape = source
    .elements()
    .find((element) => (element.localName === "sp" || element.localName === "graphicFrame") && shapeIdentity(element) === shapeId &&
      !source.elements(MC, "Fallback").some((fallback) => fallback.span.start < element.span.start && fallback.span.end > element.span.end));
  if (!shape) return bytes;
  const alternate = source
    .elements(MC, "AlternateContent")
    .filter((item) => item.span.start < shape.span.start && item.span.end > shape.span.end)
    .at(-1);
  const choice = alternate && elements(alternate).find((child) => child.namespaceUri === MC && child.localName === "Choice");
  const equationAlternate =
    !!choice &&
    choice.attributes.find((attribute) => attribute.localName === "Requires")?.value.trim() === "a14" &&
    elements(choice).length === 1 && elements(choice)[0] === shape;
  const hasEquations = descendants(shape).some(isDrawingEquation);
  if (!hasEquations && !equationAlternate) return bytes;
  const editor = beginLosslessXmlEdit(source);
  if (!hasEquations) editor.replaceElementMarkup(alternate!, raw(source, shape));
  else if (equationAlternate) {
    const fallback = elements(alternate!).find((child) => child.namespaceUri === MC && child.localName === "Fallback");
    const markup = fallbackMarkup(source, shape);
    if (fallback) editor.replaceElementMarkup(fallback, `<mc:Fallback xmlns:mc="${MC}">${markup}</mc:Fallback>`);
    else editor.appendMarkup(alternate!, `<mc:Fallback xmlns:mc="${MC}">${markup}</mc:Fallback>`);
  } else
    editor.replaceElementMarkup(
      shape,
      `<mc:AlternateContent xmlns:mc="${MC}" xmlns:a14="${DRAWING_2010_NAMESPACE}"><mc:Choice Requires="a14">${raw(source, shape)}</mc:Choice><mc:Fallback>${fallbackMarkup(source, shape)}</mc:Fallback></mc:AlternateContent>`,
    );
  return editor.commit().bytes;
}
