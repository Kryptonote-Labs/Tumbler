import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartShapeStyle } from './model.ts';
import type { ChartRect } from './layout.ts';
import { parseChartShapeStyle } from './formatting-parser.ts';
import { chartShapeMarks } from './shape-scene.ts';
import { resolveChartColor } from './colors.ts';
import { chartShade } from './projection.ts';
import type { SceneContext } from './scene-marks.ts';

export interface ChartSurfaceBand {
  readonly index: number;
  readonly style?: ChartShapeStyle;
}
const child = (parent: LosslessXmlElement | undefined, ns: string, name: string) => parent?.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === ns && node.localName === name);

export function parseSurfaceBands(plot: LosslessXmlElement, c: string, a: string): readonly ChartSurfaceBand[] | undefined {
  const container = child(plot, c, 'bandFmts');
  if (!container) return undefined;
  return container.children.flatMap(node => {
    if (node.kind !== 'element' || node.namespaceUri !== c || node.localName !== 'bandFmt') return [];
    const index = Number(child(node, c, 'idx')?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'val')?.value);
    if (!Number.isSafeInteger(index) || index < 0) return [];
    const style = parseChartShapeStyle(child(node, c, 'spPr'), a);
    return [{ index, ...(style ? { style } : {}) }];
  });
}

/** Surface colours belong to height bands, independently of the row-series' paint. */
export function surfaceBandPaint(context: SceneContext, index: number, style: ChartShapeStyle | undefined, bounds: ChartRect) {
  const reference = { kind: 'scheme' as const, value: `accent${index % 6 + 1}` };
  const color = context.options.resolveColor?.(reference) ?? resolveChartColor(reference, context.model) ?? '#4472C4';
  const mark = chartShapeMarks(context, bounds, style, { fill: color, stroke: context.model.wireframe ? color : chartShade(color, .85) })[0];
  if (!mark || mark.kind !== 'rect') return { fill: 'none' };
  const { kind, x, y, width, height, ...paint } = mark;
  const { fillGradient, ...outline } = paint;
  return context.model.wireframe ? { ...outline, fill: 'none', ...(!style?.lineStyle ? { strokeWidth: 1 } : {}) } : { ...paint, ...(!style?.lineStyle ? { strokeWidth: .3 } : {}) };
}
