import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartTextStyle } from './model.ts';
import { parseChartFill } from './formatting-parser.ts';
import { retainedChartElement } from './xml-namespaces.ts';
const children = (node: LosslessXmlElement | undefined, ns: string, name: string) => node?.children.filter((c): c is LosslessXmlElement => c.kind === 'element' && c.namespaceUri === ns && c.localName === name) ?? [];
const attr = (node: LosslessXmlElement | undefined, name: string) => node?.attributes.find(a => a.localName === name && !a.namespaceUri)?.value;
export function readChartTextRunStyle(node: LosslessXmlElement | undefined, ns: string): ChartTextStyle {
  const size = attr(node, 'sz'), family = attr(children(node, ns, 'latin')[0], 'typeface');
  const bold = attr(node, 'b'), italic = attr(node, 'i'), underline = attr(node, 'u'), strike = attr(node, 'strike');
  const color = parseChartFill(node, ns);
  const highlight = attr(children(children(node, ns, 'highlight')[0], ns, 'srgbClr')[0], 'val');
  const baseline = attr(node, 'baseline'), spacing = attr(node, 'spc');
  return {
    ...(node ? { sourceProperties: retainedChartElement(node) } : {}),
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
