import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartMark, SceneContext } from './scene-marks.ts';
import { chartMarksBounds } from './shape-scene.ts';

/** DrawingML rotations use 60,000 units per clockwise degree. */
export function parseChartTextRotation(owner: LosslessXmlElement | undefined, chartNamespace: string, drawingNamespace: string): number | undefined {
  const child = (node: LosslessXmlElement | undefined, namespace: string, name: string) => node?.children.find((item): item is LosslessXmlElement => item.kind === 'element' && item.namespaceUri === namespace && item.localName === name);
  const rich = child(child(owner, chartNamespace, 'tx'), chartNamespace, 'rich');
  const properties = child(owner, chartNamespace, 'txPr');
  const attribute = (node: LosslessXmlElement | undefined, name: string) => child(node, drawingNamespace, 'bodyPr')?.attributes.find(attribute => !attribute.namespaceUri && attribute.localName === name)?.value;
  const raw = attribute(properties, 'rot') ?? attribute(rich, 'rot');
  const vertical = attribute(properties, 'vert') ?? attribute(rich, 'vert');
  // Stacked and East Asian writing modes need glyph layout, not a rotated horizontal line.
  if (vertical !== undefined && vertical !== 'horz' && vertical !== 'vert270') return undefined;
  if (raw !== undefined && (!raw.trim() || !Number.isSafeInteger(Number(raw)))) return undefined;
  return raw === undefined && vertical !== 'vert270' ? undefined : (raw === undefined ? 0 : Number(raw) / 60000) + (vertical === 'vert270' ? -90 : 0);
}

/** Rotate rich runs and their decorations together about the fitted text centre. */
export function rotateChartText(context: Pick<SceneContext, 'measure'>, marks: ChartMark[], rotation: number | undefined): ChartMark[] {
  if (!rotation || !marks.length) return marks;
  const bounds = chartMarksBounds(context, marks);
  if (!bounds) return marks;
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const point = (x: number, y: number) => ({ x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos });
  return marks.map(mark => {
    if (mark.kind === 'text') return { ...mark, ...point(mark.x, mark.y), rotate: (mark.rotate ?? 0) + rotation };
    if (mark.kind === 'line') {
      const first = point(mark.x1, mark.y1), last = point(mark.x2, mark.y2);
      return { ...mark, x1: first.x, y1: first.y, x2: last.x, y2: last.y };
    }
    if (mark.kind === 'rect') {
      const corners = [point(mark.x, mark.y), point(mark.x + mark.width, mark.y), point(mark.x + mark.width, mark.y + mark.height), point(mark.x, mark.y + mark.height)];
      return { kind: 'path', d: corners.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ') + ' Z', fill: mark.fill };
    }
    return mark;
  });
}
