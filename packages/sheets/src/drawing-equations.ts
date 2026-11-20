import {
  drawingEquation,
  drawingEquationMarkup,
  drawingEquationParagraph,
  drawingEquationRunProperties,
  EQUATION_FONT,
  isDrawingEquation,
  type MathEquation,
} from '@tumblerjs/core/math';
import { OOXML_NAMESPACES, type LosslessXmlDocument, type LosslessXmlElement } from '@tumblerjs/ooxml';

// Excel stores an equation as a text box whose paragraph holds an `a14:m` math zone, inside
// `mc:AlternateContent` requiring a14 with a fallback showing the equation's linear format.

const MC = OOXML_NAMESPACES.markupCompatibility;
const EMU_PER_PIXEL = 9525;
/** Excel's default math size, in hundredths of a point. */
const DEFAULT_SIZE = 1100;

const elements = (element: LosslessXmlElement) =>
  element.children.filter((node): node is LosslessXmlElement => node.kind === 'element');
const descendants = (element: LosslessXmlElement): LosslessXmlElement[] =>
  elements(element).flatMap((child) => [child, ...descendants(child)]);
const attribute = (element: LosslessXmlElement | undefined, name: string) =>
  element?.attributes.find((a) => a.localName === name && a.namespaceUri === '')?.value;

/**
 * An element's drawing children with `mc:AlternateContent` resolved: the a14 choice, which
 * Tumbler understands, or otherwise the fallback.
 */
export function drawingContent(element: LosslessXmlElement): LosslessXmlElement[] {
  return elements(element).flatMap((child) => {
    if (child.namespaceUri !== MC || child.localName !== 'AlternateContent') return [child];
    const branches = elements(child);
    const choice = branches.find(
      (branch) =>
        branch.namespaceUri === MC && branch.localName === 'Choice' &&
        (attribute(branch, 'Requires') ?? '').trim().split(/\s+/).every((prefix) => prefix === 'a14'),
    );
    const chosen = choice ?? branches.find((branch) => branch.namespaceUri === MC && branch.localName === 'Fallback');
    return chosen ? elements(chosen) : [];
  });
}

/** An equation text box as the grid draws it. Sizes are CSS pixels. */
export interface SpreadsheetDrawingEquation {
  readonly math: MathEquation;
  readonly size: number;
  /** Display equations centre in their box, as Office's default justification does. */
  readonly display: boolean;
  /** The text box's left, top and right insets. */
  readonly inset: { readonly left: number; readonly top: number; readonly right: number };
}

/** The `a14:m` zone a shape's text holds, when its text is exactly one equation. */
export function equationZone(shape: LosslessXmlElement) {
  const body = elements(shape).find((child) => child.localName === 'txBody');
  if (!body) return undefined;
  const zones = descendants(body).filter(isDrawingEquation);
  const text = descendants(body).some(
    (child) => child.localName === 't' &&
      !zones.some((zone) => zone.span.start < child.span.start && zone.span.end > child.span.end) &&
      child.children.some((node) => node.kind === 'text' && node.value.trim()),
  );
  return zones.length === 1 && !text ? zones[0] : undefined;
}

export function readDrawingEquation(shape: LosslessXmlElement): SpreadsheetDrawingEquation | undefined {
  const zone = equationZone(shape);
  if (!zone) return undefined;
  const body = elements(shape).find((child) => child.localName === 'txBody');
  const properties = body && elements(body).find((child) => child.localName === 'bodyPr');
  const inset = (name: string, fallback: number) => {
    const value = Number(attribute(properties, name) ?? fallback);
    return (Number.isFinite(value) ? value : fallback) / EMU_PER_PIXEL;
  };
  const size = Number(attribute(drawingEquationRunProperties(zone), 'sz') ?? DEFAULT_SIZE);
  return {
    math: drawingEquation(zone),
    size: ((Number.isFinite(size) && size > 0 ? size : DEFAULT_SIZE) / 100) * (96 / 72),
    display: elements(zone).some((child) => child.localName === 'oMathPara'),
    inset: { left: inset('lIns', 91440), top: inset('tIns', 45720), right: inset('rIns', 91440) },
  };
}

/** A new equation text box, before `reconcileDrawingEquationShape` adds its fallback. */
export function equationShapeMarkup(objectId: number, transform: string, equation: MathEquation) {
  const runProperties = `<a:rPr lang="en-US" sz="${DEFAULT_SIZE}"><a:latin typeface="${EQUATION_FONT}"/></a:rPr>`;
  return `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${objectId}" name="TextBox ${objectId}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr>${transform}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></xdr:spPr><xdr:txBody><a:bodyPr wrap="none" rtlCol="0" anchor="t"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p>${drawingEquationMarkup(equation, runProperties, '')}<a:endParaRPr lang="en-US" sz="${DEFAULT_SIZE}"/></a:p></xdr:txBody></xdr:sp>`;
}

/**
 * A shape's markup with its equation replaced, keeping the math typography and display layout.
 * Throws when the shape is not an equation.
 */
export function editedEquationShape(document: LosslessXmlDocument, shape: LosslessXmlElement, equation: MathEquation) {
  const zone = equationZone(shape);
  if (!zone) throw new Error('Select an equation to edit it.');
  const properties = drawingEquationRunProperties(zone);
  const runProperties = properties
    ? document.source.slice(properties.span.start, properties.span.end)
    : `<a:rPr lang="en-US" sz="${DEFAULT_SIZE}"><a:latin typeface="${EQUATION_FONT}"/></a:rPr>`;
  const markup = drawingEquationMarkup(equation, runProperties, drawingEquationParagraph(document, zone));
  const source = document.source;
  return source.slice(shape.span.start, zone.span.start) + markup + source.slice(zone.span.end, shape.span.end);
}
