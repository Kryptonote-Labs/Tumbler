import { chartTitleTextXml, readChartTitleText } from './rich-text.ts';
import { replacePlainChartTitle } from './plain-title-text.ts';
import { registerChartNamespaces } from './xml-namespaces.ts';
import type { ChartTextParagraph } from './model.ts';
import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';

/** Replace a chart title's text while retaining layout, style, series, and cached data. */
export function updateChartTitle(bytes: Uint8Array, title: string | readonly ChartTextParagraph[]): Uint8Array {
  const plain = typeof title === 'string' ? title : title.map(p => p.runs.map(r => r.text).join('')).join('\n');
  if (!plain.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(plain)) throw new TypeError('Invalid chart title.');
  const xml = parseLosslessXml(bytes);
  registerChartNamespaces(xml.root);
  const ns = xml.root.namespaceUri;
  const children = (element: LosslessXmlElement, name: string) => element.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === name);
  const chart = children(xml.root, 'chart')[0];
  if (!chart) throw new Error('Chart element is missing.');
  const existing = children(chart, 'title')[0];
  const a = ns.includes('purl.oclc.org') ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const paragraphs = typeof title === 'string' ? title.split('\n').map(text => ({ runs: [{ text }] })) : title;
  const tx = `<c:tx xmlns:c="${ns}" xmlns:a="${a}"><c:rich><a:bodyPr/><a:lstStyle/>${chartTitleTextXml(paragraphs, a)}</c:rich></c:tx>`;
  const edit = beginLosslessXmlEdit(xml);
  if (existing) {
    const text = children(existing, 'tx')[0];
    const rich = text?.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === 'rich');
    const body = rich?.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === a && child.localName === 'p') ?? [];
    if (rich && body.length) {
      // Keep text-box and list properties when rich title editing replaces paragraphs.
      const original = readChartTitleText(existing, ns, a) ?? [];
      const content = typeof title === 'string' ? replacePlainChartTitle(original, title) : paragraphs;
      if (content !== original) {
        edit.replaceElementMarkup(body[0]!, chartTitleTextXml(content, a));
        for (const paragraph of body.slice(1)) edit.removeElement(paragraph);
      }
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
  const autoDeletedValue = autoDeleted?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'val')?.value;
  if (autoDeleted && autoDeletedValue !== '0' && autoDeletedValue !== 'false') edit.replaceElementMarkup(autoDeleted, `<c:autoTitleDeleted xmlns:c="${ns}" val="0"/>`);
  return edit.commit().bytes;
}
