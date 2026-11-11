import { chartFaceVisible, chartMeshNormal, type ChartMeshFace } from './bar-mesh.ts';
import { clipChartFace } from './three-d-geometry.ts';
import type { ChartPoint3D } from './projection.ts';

/** Draw silhouette, cap and sharp crease edges once; smooth cylinder facets have no seams. */
export function chartMeshOutline(mesh: readonly ChartMeshFace[], project: (point: ChartPoint3D) => { readonly x: number; readonly y: number; readonly depth: number }) {
  const edges = new Map<string, { a: ChartPoint3D; b: ChartPoint3D; normals: ChartPoint3D[]; roles: Set<ChartMeshFace['role']> }>();
  const key = (point: ChartPoint3D) => [point.x, point.y, point.z].map(value => value.toPrecision(13)).join(',');
  for (const face of mesh) {
    const normal = chartMeshNormal(face.vertices), vertices = clipChartFace(face.vertices);
    if (!normal || vertices.length < 3 || !chartFaceVisible(vertices.map(project))) continue;
    for (const [index, a] of vertices.entries()) {
      const b = vertices[(index + 1) % vertices.length]!, ends = [key(a), key(b)].sort();
      if (ends[0] === ends[1]) continue;
      const id = ends.join('/'), edge = edges.get(id);
      if (edge) { edge.normals.push(normal); edge.roles.add(face.role); }
      else edges.set(id, { a, b, normals: [normal], roles: new Set([face.role]) });
    }
  }
  return [...edges.values()].flatMap(edge => {
    const first = edge.normals[0]!, sharp = edge.normals.some(normal => normal.x * first.x + normal.y * first.y + normal.z * first.z < .85);
    if (edge.normals.length > 1 && edge.roles.size < 2 && !sharp) return [];
    const a = project(edge.a), b = project(edge.b);
    return [{ d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, depth: (a.depth + b.depth) / 2 }];
  });
}
