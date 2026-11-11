import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartTextParagraph } from './model.ts';
import { chartParagraphPropertiesXml, chartRunPropertiesXml } from './rich-text-properties.ts';
import { chartElementMarkup } from './xml-markup.ts';
import { chartXmlText } from './source-xml.ts';

function wrap(name: string, source: LosslessXmlElement | undefined, ns: string, content: string): string {
  if (!source || source.localName !== name) return `<a:${name} xmlns:a="${ns}">${content}</a:${name}>`;
  const closing = `</${source.qualified}>`;
  const shell = chartElementMarkup({ ...source, children: [] }, ns);
  return shell.slice(0, -closing.length) + content + closing;
}

function retained(source: LosslessXmlElement | undefined, ns: string) {
  return source ? chartElementMarkup(source, ns).replace(/^<[^>]*>/, '').replace(/<\/[^>]*>$/, '') : '';
}

function runXml(run: ChartTextParagraph['runs'][number], ns: string) {
  const source = run.sourceWrapper;
  const name = source?.localName === 'fld' ? 'fld' : source?.localName === 'br' && run.text === '\n' ? 'br' : 'r';
  const properties = chartRunPropertiesXml(run.style ?? {}, ns);
  const text = name === 'br' ? '' : `<a:t xmlns:a="${ns}" xml:space="preserve">${chartXmlText(run.text)}</a:t>`;
  return wrap(name, source, ns, properties + retained(source, ns) + text);
}

/** Retain native field identity, breaks, paragraph-end formatting and extension metadata. */
export function chartTitleTextXml(paragraphs: readonly ChartTextParagraph[], drawingNamespace = 'http://schemas.openxmlformats.org/drawingml/2006/main'): string {
  return (paragraphs.length ? paragraphs : [{ runs: [{ text: '' }] }]).map(paragraph => wrap('p', paragraph.sourceWrapper, drawingNamespace,
    chartParagraphPropertiesXml(paragraph, drawingNamespace) + paragraph.runs.map(run => runXml(run, drawingNamespace)).join('') + retained(paragraph.sourceWrapper, drawingNamespace))).join('');
}
