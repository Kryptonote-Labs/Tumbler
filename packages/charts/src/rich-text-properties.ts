import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartTextStyle, ChartTextParagraph } from './model.ts';
import { chartColorFillXml } from './formatting-parser.ts';
import { chartElementMarkup } from './xml-markup.ts';
import { chartXmlText } from './source-xml.ts';
import { readChartTextRunStyle } from './text-run-style.ts';

function fragment(source: LosslessXmlElement | undefined, name: string, ns: string) {
  return parseLosslessXml(new TextEncoder().encode(source ? chartElementMarkup({ ...source, qualified: source.prefix ? `${source.prefix}:${name}` : name, prefix: source.prefix, localName: name, namespaceUri: ns }, ns) : `<a:${name} xmlns:a="${ns}"></a:${name}>`));
}

/** Patch modeled formatting while retaining unmodeled run attributes, font scripts and effects. */
export function chartRunPropertiesXml(style: ChartTextStyle, ns: string): string {
  const previous = readChartTextRunStyle(style.sourceProperties, style.sourceProperties?.namespaceUri ?? ns);
  const document = fragment(style.sourceProperties, 'rPr', ns), edit = beginLosslessXmlEdit(document);
  const attributes: readonly [keyof ChartTextStyle, string, (value: ChartTextStyle[keyof ChartTextStyle]) => string][] = [
    ['verticalAlign', 'baseline', value => value === 'superscript' ? '30000' : value === 'subscript' ? '-25000' : '0'],
    ['characterSpacingPoints', 'spc', value => String(Math.round(Number(value) * 100))],
    ['fontSize', 'sz', value => String(Math.round(Number(value) * 100))],
    ['bold', 'b', value => value ? '1' : '0'], ['italic', 'i', value => value ? '1' : '0'],
    ['underline', 'u', value => value === 'single' ? 'sng' : value === 'double' ? 'dbl' : 'none'],
    ['strike', 'strike', value => value ? 'sngStrike' : 'noStrike'],
  ];
  for (const [key, name, lexical] of attributes) {
    if (style[key] === previous[key]) continue;
    const attribute = document.root.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === name);
    const value = style[key];
    if (value === undefined) { if (attribute) edit.removeAttribute(attribute); }
    else if (attribute) edit.setAttribute(attribute, lexical(value));
    else edit.insertAttribute(document.root, name, lexical(value));
  }
  let appended = '';
  const replace = (names: readonly string[], markup: string) => {
    for (const child of document.root.children) if (child.kind === 'element' && child.namespaceUri === ns && names.includes(child.localName)) edit.removeElement(child);
    appended += markup;
  };
  if (JSON.stringify(style.color) !== JSON.stringify(previous.color)) replace(['noFill', 'solidFill', 'gradFill', 'pattFill', 'blipFill', 'grpFill'], style.color ? chartColorFillXml(style.color, ns) : '');
  if (style.fontFamily !== previous.fontFamily) replace(['latin'], style.fontFamily ? `<a:latin xmlns:a="${ns}" typeface="${chartXmlText(style.fontFamily)}"/>` : '');
  if (style.highlight !== previous.highlight) replace(['highlight'], style.highlight ? `<a:highlight xmlns:a="${ns}"><a:srgbClr val="${chartXmlText(style.highlight.replace(/^#/, ''))}"/></a:highlight>` : '');
  if (appended) {
    edit.appendMarkup(document.root, appended);
  }
  const value = edit.commit().bytes;
  // Appended modeled properties must precede font/script/effect descendants in their schema sequence.
  const ordered = parseLosslessXml(value), orderedEdit = beginLosslessXmlEdit(ordered);
  const order = ['ln', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'];
  const children = ordered.root.children.filter((child): child is LosslessXmlElement => child.kind === 'element');
  const sorted = [...children].sort((a, b) => (order.indexOf(a.localName) < 0 ? order.length : order.indexOf(a.localName)) - (order.indexOf(b.localName) < 0 ? order.length : order.indexOf(b.localName)));
  if (sorted.some((child, index) => child !== children[index])) {
    const attributes = ordered.source.slice(ordered.root.startTagSpan.start, ordered.root.startTagSpan.end);
    orderedEdit.replaceElementMarkup(ordered.root, attributes + sorted.map(child => chartElementMarkup(child, ns)).join('') + `</${ordered.root.qualified}>`);
    return new TextDecoder().decode(orderedEdit.commit().bytes);
  }
  return new TextDecoder().decode(value);
}

export function chartParagraphPropertiesXml(paragraph: ChartTextParagraph, ns: string): string {
  const document = fragment(paragraph.sourceProperties, 'pPr', ns), edit = beginLosslessXmlEdit(document);
  const attribute = document.root.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'algn');
  const previous = attribute?.value === 'l' ? 'start' : attribute?.value === 'r' ? 'end' : attribute?.value === 'just' ? 'justify' : 'center';
  const next = paragraph.alignment ?? 'center';
  if (next !== previous || !paragraph.sourceProperties) {
    const value = next === 'start' ? 'l' : next === 'end' ? 'r' : next === 'justify' ? 'just' : 'ctr';
    if (attribute) edit.setAttribute(attribute, value); else edit.insertAttribute(document.root, 'algn', value);
  }
  return new TextDecoder().decode(edit.commit().bytes);
}
