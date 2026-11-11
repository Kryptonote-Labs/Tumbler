import type { ChartMark } from './scene-marks.ts';
import { chartPolygon, type ChartPoint3D } from './projection.ts';
import { chartFaceVisible } from './bar-mesh.ts';
import { clipChartFace } from './three-d-geometry.ts';

type FacePaint = Pick<Extract<ChartMark, { kind: 'path' }>, 'fill' | 'stroke' | 'strokeWidth' | 'fillGradient' | 'fillPicture' | 'fillPattern' | 'strokeDash' | 'strokeCap' | 'strokeJoin' | 'miterLimit'>;
export function chartProjectedBounds(points: readonly { readonly x: number; readonly y: number }[]) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
  return { x, y, width: Math.max(...points.map(point => point.x)) - x, height: Math.max(...points.map(point => point.y)) - y };
}

/** Faces share clipping and ordering, keeping SVG and canvas camera/occlusion behavior identical. */
export function chartFaceCollector(project: (point: ChartPoint3D) => { readonly x: number; readonly y: number; readonly depth: number }) {
  const faces: { depth: number; mark: ChartMark }[] = [];
  let work = 0;
  return {
    add(vertices: readonly ChartPoint3D[], paint: FacePaint, clip = true, twoSided = false) {
      if (++work > 200_000) throw new RangeError('Chart preview geometry budget exceeded.');
      const polygon = clip ? clipChartFace(vertices) : vertices;
      if (polygon.length < 3) return;
      const points = polygon.map(project);
      if (!twoSided && !chartFaceVisible(points)) return;
      const opaque = paint.fill && !paint.fillGradient && !paint.fillPicture && !paint.fillPattern && (/^#[a-f0-9]{6}$/i.test(paint.fill) || /^rgba\(.*,[ ]*1(?:\.0+)?\)$/.test(paint.fill));
      faces.push({ depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length, mark: { kind: 'path', d: chartPolygon(points), ...(opaque && !paint.stroke ? { stroke: paint.fill, strokeWidth: .75, strokeJoin: 'round' as const } : {}), ...paint } });
    },
    addMarks(marks: readonly ChartMark[], depth: number) {
      if ((work += marks.length) > 200_000) throw new RangeError('Chart preview geometry budget exceeded.');
      faces.push(...marks.map(mark => ({ depth, mark })));
    },
    marks: () => faces.sort((a, b) => b.depth - a.depth).map(face => face.mark),
  };
}
