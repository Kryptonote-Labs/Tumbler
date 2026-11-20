import { mathFromOmml, mathToOmml, mathToText, OMML_NAMESPACE, type MathEquation } from '@tumblerjs/core/math';
import { beginLosslessXmlEdit, OOXML_NAMESPACES, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from '@tumblerjs/ooxml';

/** DrawingML 2010 holds `a14:m`, PowerPoint's wrapper for an Office Math zone inside a paragraph. */
export const DRAWING_2010 = 'http://schemas.microsoft.com/office/drawing/2010/main';
/** The character an equation run occupies in slide text offsets. */
export const EQUATION_CHARACTER = '\uFFFC';
/** Math zones use Cambria Math, as PowerPoint writes them. */
export const EQUATION_FONT = 'Cambria Math';
const MC = OOXML_NAMESPACES.markupCompatibility;

const elements = (element: LosslessXmlElement) =>
  element.children.filter((node): node is LosslessXmlElement => node.kind === 'element');
const raw = (source: LosslessXmlDocument, element: LosslessXmlElement) =>
  source.source.slice(element.span.start, element.span.end);
const descendants = (element: LosslessXmlElement): LosslessXmlElement[] =>
  elements(element).flatMap((child) => [child, ...descendants(child)]);

export const isEquationElement = (element: LosslessXmlElement) =>
  element.namespaceUri === DRAWING_2010 && element.localName === 'm';

/** The equation an `a14:m` element holds. */
export function equationFromElement(element: LosslessXmlElement): MathEquation {
  const zone = elements(element).find(
    (child) => child.namespaceUri === OMML_NAMESPACE && (child.localName === 'oMath' || child.localName === 'oMathPara'),
  );
  return zone ? mathFromOmml(zone) : { body: [] };
}

/** The `a:rPr` typography of an equation's first math run, as PowerPoint writes it. */
export function equationRunProperties(element: LosslessXmlElement) {
  return descendants(element).find((child) => child.localName === 'rPr' && child.namespaceUri !== OMML_NAMESPACE);
}

/**
 * `a14:m` markup for an equation. `runProperties` is the `a:rPr` each math run carries, using
 * the prefixes in scope where the markup is inserted.
 */
export function equationMarkup(equation: MathEquation, runProperties: string) {
  const omml = mathToOmml(equation, runProperties).replace('<m:oMath>', `<m:oMath xmlns:m="${OMML_NAMESPACE}">`);
  return `<a14:m xmlns:a14="${DRAWING_2010}">${omml}</a14:m>`;
}

function shapeIdentity(shape: LosslessXmlElement) {
  const properties = elements(shape).find((child) => child.localName.startsWith('nv'));
  return properties && elements(properties).find((child) => child.localName === 'cNvPr')
    ?.attributes.find((attribute) => attribute.localName === 'id' && attribute.namespaceUri === '')?.value;
}

/** A shape's markup with each equation replaced by a run of its linear format, for readers without a14. */
function fallbackMarkup(source: LosslessXmlDocument, shape: LosslessXmlElement) {
  const start = shape.span.start;
  let markup = raw(source, shape);
  const zones = descendants(shape).filter(isEquationElement).reverse();
  for (const zone of zones) {
    const properties = equationRunProperties(zone);
    const prefix = properties?.qualified.includes(':') ? properties.qualified.split(':')[0]! : 'a';
    const rPr = properties ? raw(source, properties) : '';
    const text = mathToText(equationFromElement(zone)).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    markup =
      markup.slice(0, zone.span.start - start) +
      `<${prefix}:r>${rPr}<${prefix}:t>${text}</${prefix}:t></${prefix}:r>` +
      markup.slice(zone.span.end - start);
  }
  return markup;
}

/**
 * Keeps a slide shape's Office Math interoperable after an edit. A shape with equations sits in
 * `mc:AlternateContent` requiring a14, as PowerPoint writes it, with a fallback that shows each
 * equation's linear format; a shape whose last equation was removed becomes an ordinary shape.
 */
export function reconcileEquationShape(bytes: Uint8Array, shapeId: string): Uint8Array {
  const source = parseLosslessXml(bytes);
  const shape = source
    .elements()
    .find((element) => (element.localName === 'sp' || element.localName === 'graphicFrame') && shapeIdentity(element) === shapeId &&
      !source.elements(MC, 'Fallback').some((fallback) => fallback.span.start < element.span.start && fallback.span.end > element.span.end));
  if (!shape) return bytes;
  const alternate = source
    .elements(MC, 'AlternateContent')
    .filter((item) => item.span.start < shape.span.start && item.span.end > shape.span.end)
    .at(-1);
  const choice = alternate && elements(alternate).find((child) => child.namespaceUri === MC && child.localName === 'Choice');
  const equationAlternate =
    !!choice &&
    choice.attributes.find((attribute) => attribute.localName === 'Requires')?.value.trim() === 'a14' &&
    elements(choice).length === 1 && elements(choice)[0] === shape;
  const hasEquations = descendants(shape).some(isEquationElement);
  if (!hasEquations && !equationAlternate) return bytes;
  const editor = beginLosslessXmlEdit(source);
  if (!hasEquations) editor.replaceElementMarkup(alternate!, raw(source, shape));
  else if (equationAlternate) {
    const fallback = elements(alternate!).find((child) => child.namespaceUri === MC && child.localName === 'Fallback');
    const markup = fallbackMarkup(source, shape);
    if (fallback) editor.replaceElementMarkup(fallback, `<mc:Fallback xmlns:mc="${MC}">${markup}</mc:Fallback>`);
    else editor.appendMarkup(alternate!, `<mc:Fallback xmlns:mc="${MC}">${markup}</mc:Fallback>`);
  } else
    editor.replaceElementMarkup(
      shape,
      `<mc:AlternateContent xmlns:mc="${MC}" xmlns:a14="${DRAWING_2010}"><mc:Choice Requires="a14">${raw(source, shape)}</mc:Choice><mc:Fallback>${fallbackMarkup(source, shape)}</mc:Fallback></mc:AlternateContent>`,
    );
  return editor.commit().bytes;
}
