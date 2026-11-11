import type { ChartMeshFace } from './bar-mesh.ts';
import type { ChartPoint3D } from './projection.ts';

export interface ChartAreaVertex { readonly category: number; readonly start: number; readonly end: number }

/** Separate gaps and sign crossings before forming closed, consistently wound area volumes. */
export function chartAreaMesh(points: readonly (ChartAreaVertex | undefined)[], depthStart: number, depthEnd: number): readonly ChartMeshFace[] {
  const regions: ChartAreaVertex[][] = [];
  let current: ChartAreaVertex[] = [], direction = 0;
  const flush = () => { if (current.length > 1) regions.push(current); current = []; direction = 0; };
  for (const point of points) {
    if (!point) { flush(); continue; }
    const sign = Math.sign(point.end - point.start), previous = current.at(-1);
    if (previous && direction && sign && direction !== sign) {
      const a = previous.end - previous.start, b = point.end - point.start, fraction = a / (a - b);
      const start = previous.start + (point.start - previous.start) * fraction;
      const crossing = { category: previous.category + (point.category - previous.category) * fraction, start, end: start };
      if (a !== 0) current.push(crossing);
      flush();
      current.push(crossing);
    }
    current.push(point);
    direction ||= sign;
  }
  flush();
  const z0 = Math.min(depthStart, depthEnd), z1 = Math.max(depthStart, depthEnd);
  const vertex = (point: ChartAreaVertex, end: boolean, z: number): ChartPoint3D => ({ x: point.category, y: end ? point.end : point.start, z });
  return regions.flatMap(region => {
    const points = region[0]!.category > region.at(-1)!.category ? [...region].reverse() : region;
    const negative = points.some(point => point.end < point.start);
    const front = [...points.map(point => vertex(point, true, z0)), ...[...points].reverse().map(point => vertex(point, false, z0))];
    const back = [...points.map(point => vertex(point, false, z1)), ...[...points].reverse().map(point => vertex(point, true, z1))];
    const first = points[0]!, last = points.at(-1)!;
    const faces: ChartMeshFace[] = [
      { role: 'side', vertices: front }, { role: 'side', vertices: back },
      { role: 'cap', vertices: [vertex(first, false, z0), vertex(first, false, z1), vertex(first, true, z1), vertex(first, true, z0)] },
      { role: 'cap', vertices: [vertex(last, true, z0), vertex(last, true, z1), vertex(last, false, z1), vertex(last, false, z0)] },
      ...points.slice(0, -1).flatMap((a, index): ChartMeshFace[] => {
        const b = points[index + 1]!;
        return [
          { role: 'side', vertices: [vertex(a, true, z0), vertex(a, true, z1), vertex(b, true, z1), vertex(b, true, z0)] },
          { role: 'side', vertices: [vertex(a, false, z1), vertex(a, false, z0), vertex(b, false, z0), vertex(b, false, z1)] },
        ];
      }),
    ];
    return negative ? faces.map(face => ({ ...face, vertices: [...face.vertices].reverse() })) : faces;
  });
}
