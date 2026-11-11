import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartShapeStyle, SupportedChartModel } from './model.ts';
import { CHART_BAR_SHAPES, type ChartBarShape } from './bar-shapes.ts';
import { parseChartShapeStyle } from './formatting-parser.ts';
import { ChartParseError } from './parser-errors.ts';

export interface ChartView3D {
  readonly rotationX: number;
  readonly rotationY: number;
  readonly perspective: number;
  readonly rightAngleAxes: boolean;
  readonly depthPercent?: number;
  readonly heightPercent?: number;
}
export interface ChartWall extends ChartShapeStyle { readonly thickness?: number }
export interface ChartWalls {
  readonly floor?: ChartWall;
  readonly back?: ChartWall;
  readonly side?: ChartWall;
}
const child = (parent: LosslessXmlElement | undefined, ns: string, name: string) => parent?.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === ns && node.localName === name);
const value = (node: LosslessXmlElement | undefined) => node?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === 'val')?.value;
function number(node: LosslessXmlElement | undefined, fallback: number) {
  const raw = value(node), parsed = raw === undefined ? fallback : Number(raw.replace(/%$/, ''));
  if (!Number.isFinite(parsed)) throw new ChartParseError('Invalid 3D chart view.');
  return parsed;
}
export function parseBarShape(node: LosslessXmlElement | undefined): ChartBarShape | undefined {
  if (!node) return undefined;
  const shape = value(node) ?? 'box';
  const parsed = CHART_BAR_SHAPES.find(candidate => candidate === shape);
  if (!parsed) throw new ChartParseError('Invalid 3D bar shape.');
  return parsed;
}

export function parseChart3DProperties(chart: LosslessXmlElement, plot: LosslessXmlElement, c: string, a: string): Pick<SupportedChartModel, 'threeD' | 'walls' | 'gapDepth' | 'barShape'> {
  if (!plot.localName.includes('3D')) return {};
  const view = child(chart, c, 'view3D'), height = child(view, c, 'hPercent');
  const rightAngle = value(child(view, c, 'rAngAx')) ?? '1';
  if (!['0', '1', 'true', 'false'].includes(rightAngle)) throw new ChartParseError('Invalid 3D right-angle setting.');
  const wall = (name: string): ChartWall | undefined => {
    const source = child(chart, c, name);
    if (!source) return undefined;
    return { ...parseChartShapeStyle(child(source, c, 'spPr'), a), ...(child(source, c, 'thickness') ? { thickness: number(child(source, c, 'thickness'), 0) } : {}) };
  };
  const floor = wall('floor'), back = wall('backWall'), side = wall('sideWall'), shape = parseBarShape(child(plot, c, 'shape'));
  return { threeD: { rotationX: number(child(view, c, 'rotX'), child(view, c, 'rotX') ? 0 : 15), rotationY: number(child(view, c, 'rotY'), child(view, c, 'rotY') ? 0 : 20), perspective: number(child(view, c, 'perspective'), 30), rightAngleAxes: rightAngle === '1' || rightAngle === 'true', ...(child(view, c, 'depthPercent') ? { depthPercent: number(child(view, c, 'depthPercent'), 100) } : {}), ...(height ? { heightPercent: number(height, 100) } : {}) },
    ...(floor || back || side ? { walls: { ...(floor ? { floor } : {}), ...(back ? { back } : {}), ...(side ? { side } : {}) } } : {}),
    gapDepth: number(child(plot, c, 'gapDepth'), 150), ...(shape ? { barShape: shape } : {}) };
}
