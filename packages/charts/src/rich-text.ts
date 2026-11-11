import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartTextParagraph } from './model.ts';
import { readChartTextRunStyle } from './text-run-style.ts';
import { chartRunPropertiesXml, chartParagraphPropertiesXml } from './rich-text-properties.ts';

const children = (node: LosslessXmlElement | undefined, ns: string, name: string) => node?.children.filter((c): c is LosslessXmlElement => c.kind === 'element' && c.namespaceUri === ns && c.localName === name) ?? [];
const attr = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(a => a.localName === name && !a.namespaceUri)?.value;
/** Keep individual title runs instead of applying the first run's style to the whole title. */
export function readChartTitleText(title: LosslessXmlElement | undefined, c: string, a: string): readonly ChartTextParagraph[] | undefined {
  const rich = children(children(title, c, 'tx')[0], c, 'rich')[0];
  if (!rich) return undefined;
  return children(rich, a, 'p').map(p => {
    const props = children(p, a, 'pPr')[0];
    const align = attr(props, 'algn');
    const defaults = readChartTextRunStyle(children(props, a, 'defRPr')[0], a);
    return { ...(props ? { sourceProperties: props } : {}), alignment: align === 'l' ? 'start' : align === 'r' ? 'end' : align === 'just' ? 'justify' : 'center', runs: p.children.flatMap(node => {
      if (node.kind !== 'element' || node.namespaceUri !== a) return [];
      if (node.localName === 'br') return [{ text: '\n', style: defaults }];
      if (node.localName !== 'r' && node.localName !== 'fld') return [];
      const text = children(node, a, 't').map(t => t.children.map(x => x.kind === 'text' ? x.value : '').join('')).join('');
      return [{ text, style: { ...defaults, ...readChartTextRunStyle(children(node, a, 'rPr')[0], a) } }];
    }) };
  });
}

/** Custom chart labels can use rich text or the cached value of a worksheet reference. */
export function readChartLabelText(owner: LosslessXmlElement | undefined, c: string, a: string): readonly ChartTextParagraph[] | undefined {
  const rich = readChartTitleText(owner, c, a);
  if (rich) return rich;
  const reference = children(children(owner, c, 'tx')[0], c, 'strRef')[0];
  const cache = children(reference, c, 'strCache')[0];
  const point = children(cache, c, 'pt').find(point => {
    const index = attr(point, 'idx');
    return index !== undefined && index.trim() !== '' && Number(index) === 0;
  });
  const value = children(point, c, 'v')[0];
  return value ? [{ runs: [{ text: value.children.map(node => node.kind === 'text' || node.kind === 'cdata' ? node.value : '').join('') }] }] : undefined;
}
const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function chartTitleTextXml(paragraphs: readonly ChartTextParagraph[], drawingNamespace = 'http://schemas.openxmlformats.org/drawingml/2006/main'): string {
  return (paragraphs.length ? paragraphs : [{ runs: [{ text: '' }] }]).map(p => `<a:p xmlns:a="${drawingNamespace}">${chartParagraphPropertiesXml(p, drawingNamespace)}${p.runs.map(run => `<a:r>${chartRunPropertiesXml(run.style ?? {}, drawingNamespace)}<a:t xml:space="preserve">${escape(run.text)}</a:t></a:r>`).join('')}</a:p>`).join('');
}
