import { chartXmlText } from './source-xml.ts';
import { chartTitleTextXml } from './rich-text.ts';
import type { ChartTextParagraph } from './model.ts';
import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';

/** Replace a chart title's text while retaining layout, style, series, and cached data. */
export function updateChartTitle(bytes: Uint8Array, title: string | readonly ChartTextParagraph[]): Uint8Array {
  const plain = typeof title === 'string' ? title : title.map(p => p.runs.map(r => r.text).join('')).join('\n');
  if (!plain.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(plain)) throw new TypeError('Invalid chart title.');
  const xml = parseLosslessXml(bytes);
  const ns = xml.root.namespaceUri;
  const children = (element: LosslessXmlElement, name: string) => element.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === name);
  const chart = children(xml.root, 'chart')[0];
  if (!chart) throw new Error('Chart element is missing.');
  const existing = children(chart, 'title')[0];
  const a = ns.includes('purl.oclc.org') ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const paragraphs = typeof title === 'string' ? [{ runs: [{ text: title }] }] : title;
  const tx = `<c:tx xmlns:c="${ns}" xmlns:a="${a}"><c:rich><a:bodyPr/><a:lstStyle/>${chartTitleTextXml(paragraphs, a)}</c:rich></c:tx>`;
  const edit = beginLosslessXmlEdit(xml);
  if (existing) {
    const text = children(existing, 'tx')[0];
    const rich = text?.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === 'rich');
    const body = rich?.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === a && child.localName === 'p') ?? [];
    const descendants = (node: LosslessXmlElement): LosslessXmlElement[] => node.children.flatMap(child => child.kind === 'element' ? [child, ...descendants(child)] : []);
    const nodes = body.length === 1 ? descendants(body[0]!).filter(node => node.namespaceUri === a && node.localName === 't') : [];
    if (typeof title === 'string' && nodes.length && !title.includes('\n') && !descendants(body[0]!).some(node => node.namespaceUri === a && node.localName === 'br')) {
      const values = nodes.map(node => xml.textContent(node));
      const original = values.join('');
      let prefix = 0, suffix = 0;
      while (prefix < original.length && prefix < title.length && original[prefix] === title[prefix]) prefix++;
      while (suffix < original.length - prefix && suffix < title.length - prefix && original.at(-suffix - 1) === title.at(-suffix - 1)) suffix++;
      // A text node must never end with half of a surrogate pair after an edit.
      if (prefix && /[\uD800-\uDBFF]/.test(original[prefix - 1]!) && /[\uDC00-\uDFFF]/.test(original[prefix] ?? '')) prefix--;
      if (suffix && /[\uDC00-\uDFFF]/.test(original[original.length - suffix]!) && /[\uD800-\uDBFF]/.test(original[original.length - suffix - 1] ?? '')) suffix--;
      const end = original.length - suffix;
      let offset = 0, first = nodes.length - 1, last = 0;
      const starts = values.map(value => { const start = offset; offset += value.length; return start; });
      first = values.findIndex((value, index) => starts[index]! + value.length > prefix);
      if (first < 0) first = nodes.length - 1;
      for (let index = 0; index < nodes.length; index++) if (starts[index]! < end) last = index;
      last = Math.max(first, last);
      for (let index = first; index <= last; index++) {
        const value = (index === first ? values[index]!.slice(0, prefix - starts[index]!) + title.slice(prefix, title.length - suffix) : '') + (index === last ? values[index]!.slice(end - starts[index]!) : '');
        const node = nodes[index]!;
        if (node.selfClosing && /^\s|\s$/.test(value)) {
          const attributes = node.attributes.filter(attribute => !(attribute.namespaceUri === 'http://www.w3.org/XML/1998/namespace' && attribute.localName === 'space')).map(attribute => ` ${attribute.qualified}="${chartXmlText(attribute.value)}"`).join('');
          edit.replaceElementMarkup(node, `<${node.qualified}${attributes} xml:space="preserve">${chartXmlText(value)}</${node.qualified}>`);
          continue;
        }
        if (value !== values[index]) edit.setText(node, value);
        if (/^\s|\s$/.test(value)) {
          const space = nodes[index]!.attributes.find(attribute => attribute.namespaceUri === 'http://www.w3.org/XML/1998/namespace' && attribute.localName === 'space');
          if (space && space.value !== 'preserve') edit.setAttribute(space, 'preserve');
          else if (!space) edit.insertAttribute(nodes[index]!, 'xml:space', 'preserve');
        }
      }
    } else if (rich && body.length) {
      // Keep text-box and list properties when rich title editing replaces paragraphs.
      edit.replaceElementMarkup(body[0]!, chartTitleTextXml(paragraphs, a));
      for (const paragraph of body.slice(1)) edit.removeElement(paragraph);
    } else if (text) edit.replaceElementMarkup(text, tx);
    else if (existing.children.find(child => child.kind === 'element')) edit.insertMarkupBefore(existing.children.find((child): child is LosslessXmlElement => child.kind === 'element')!, tx);
    else if (existing.selfClosing) edit.replaceElementMarkup(existing, `<c:title xmlns:c="${ns}">${tx}</c:title>`);
    else edit.appendMarkup(existing, tx);
  } else {
    const markup = `<c:title xmlns:c="${ns}">${tx}<c:overlay val="0"/></c:title>`;
    const first = chart.children.find((child): child is LosslessXmlElement => child.kind === 'element');
    if (first) edit.insertMarkupBefore(first, markup); else edit.appendMarkup(chart, markup);
  }
  const autoDeleted = children(chart, 'autoTitleDeleted')[0];
  if (autoDeleted) edit.replaceElementMarkup(autoDeleted, `<c:autoTitleDeleted xmlns:c="${ns}" val="0"/>`);
  return edit.commit().bytes;
}
