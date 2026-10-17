import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartTextParagraph, ChartTextStyle } from './model.ts';
import { parseChartFill } from './formatting-parser.ts';

const children = (node: LosslessXmlElement | undefined, ns: string, name: string) => node?.children.filter((c): c is LosslessXmlElement => c.kind === 'element' && c.namespaceUri === ns && c.localName === name) ?? [];
const attr = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(a => a.localName === name && !a.namespaceUri)?.value;
function style(node: LosslessXmlElement | undefined, ns: string): ChartTextStyle {
  const size = attr(node, 'sz'), family = attr(children(node, ns, 'latin')[0], 'typeface');
  const bold = attr(node, 'b'), italic = attr(node, 'i'), underline = attr(node, 'u'), strike = attr(node, 'strike');
  const color = parseChartFill(node, ns);
  const highlight = attr(children(children(node, ns, 'highlight')[0], ns, 'srgbClr')[0], 'val');
  const baseline = attr(node, 'baseline'), spacing = attr(node, 'spc');
  return {
    ...(highlight && /^[0-9a-f]{6}$/i.test(highlight) ? { highlight: `#${highlight.toUpperCase()}` } : {}),
    ...(baseline === undefined ? {} : { verticalAlign: Number(baseline) > 0 ? 'superscript' : Number(baseline) < 0 ? 'subscript' : 'baseline' }),
    ...(spacing === undefined || !Number.isFinite(Number(spacing)) ? {} : { characterSpacingPoints: Number(spacing) / 100 }),
    ...(size && Number.isFinite(Number(size)) ? { fontSize: Number(size) / 100 } : {}),
    ...(family ? { fontFamily: family } : {}),
    ...(bold === undefined ? {} : { bold: bold === '1' || bold === 'true' }),
    ...(italic === undefined ? {} : { italic: italic === '1' || italic === 'true' }),
    ...(underline === undefined ? {} : { underline: underline === 'none' ? 'none' : underline === 'dbl' ? 'double' : 'single' }),
    ...(strike === undefined ? {} : { strike: strike !== 'noStrike' }),
    ...(color ? { color } : {}),
  };
}
/** Keep individual title runs instead of applying the first run's style to the whole title. */
export function readChartTitleText(title: LosslessXmlElement | undefined, c: string, a: string): readonly ChartTextParagraph[] | undefined {
  const rich = children(children(title, c, 'tx')[0], c, 'rich')[0];
  if (!rich) return undefined;
  return children(rich, a, 'p').map(p => {
    const props = children(p, a, 'pPr')[0];
    const align = attr(props, 'algn');
    const defaults = style(children(props, a, 'defRPr')[0], a);
    return { alignment: align === 'l' ? 'start' : align === 'r' ? 'end' : align === 'just' ? 'justify' : 'center', runs: p.children.flatMap(node => {
      if (node.kind !== 'element' || node.namespaceUri !== a) return [];
      if (node.localName === 'br') return [{ text: '\n', style: defaults }];
      if (node.localName !== 'r' && node.localName !== 'fld') return [];
      const text = children(node, a, 't').map(t => t.children.map(x => x.kind === 'text' ? x.value : '').join('')).join('');
      return [{ text, style: { ...defaults, ...style(children(node, a, 'rPr')[0], a) } }];
    }) };
  });
}
const escape = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function chartTitleTextXml(paragraphs: readonly ChartTextParagraph[]): string {
  return paragraphs.map(p => `<a:p><a:pPr algn="${p.alignment === 'start' ? 'l' : p.alignment === 'end' ? 'r' : p.alignment === 'justify' ? 'just' : 'ctr'}"/>${p.runs.map(run => {
    const f = run.style ?? {};
    const properties = [f.verticalAlign === undefined ? '' : `baseline="${f.verticalAlign === 'superscript' ? 30000 : f.verticalAlign === 'subscript' ? -25000 : 0}"`, f.characterSpacingPoints === undefined ? '' : `spc="${Math.round(f.characterSpacingPoints * 100)}"`, f.bold === undefined ? '' : `b="${+f.bold}"`, f.italic === undefined ? '' : `i="${+f.italic}"`, f.fontSize === undefined ? '' : `sz="${Math.round(f.fontSize * 100)}"`, f.underline === undefined ? '' : `u="${f.underline === 'single' ? 'sng' : f.underline === 'double' ? 'dbl' : 'none'}"`, f.strike === undefined ? '' : `strike="${f.strike ? 'sngStrike' : 'noStrike'}"`].filter(Boolean).join(' ');
    const color = f.color;
    const fill = color ? `<a:solidFill><a:${color.kind === 'rgb' ? 'srgbClr' : 'schemeClr'} val="${escape(color.value.replace(/^#/,''))}">${color.transforms?.map(t => `<a:${t.kind} val="${Math.round(t.value * 100000)}"/>`).join('') ?? ''}</a:${color.kind === 'rgb' ? 'srgbClr' : 'schemeClr'}></a:solidFill>` : '';
    return `<a:r><a:rPr ${properties}>${fill}${f.highlight ? `<a:highlight><a:srgbClr val="${escape(f.highlight.replace(/^#/,''))}"/></a:highlight>` : ''}${f.fontFamily ? `<a:latin typeface="${escape(f.fontFamily)}"/>` : ''}</a:rPr><a:t xml:space="preserve">${escape(run.text)}</a:t></a:r>`;
  }).join('')}</a:p>`).join('');
}
