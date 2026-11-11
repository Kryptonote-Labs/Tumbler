import { chartBarMesh } from './bar-mesh.ts';
import { chartFaceCollector, chartProjectedBounds } from './three-d-faces.ts';
import { chart3DSize, chartPolygon, type chartProjection, type ChartPoint3D } from './projection.ts';
import { chartShapeMarks } from './shape-scene.ts';
import type { ChartRect } from './layout.ts';
import type { ChartWall } from './three-d-properties.ts';
import type { ChartMark, SceneContext } from './scene-marks.ts';

/** The camera-facing corner and opposite walls are shared by axes and the plot backdrop. */
export function chart3DCorner(project: ReturnType<typeof chartProjection>) {
  const nearZ = project({ x: .5, y: .5, z: 0 }).depth < project({ x: .5, y: .5, z: 1 }).depth ? 0 : 1;
  const nearX = project({ x: 0, y: .5, z: .5 }).depth < project({ x: 1, y: .5, z: .5 }).depth ? 0 : 1;
  return { nearZ, farZ: 1 - nearZ, nearX, farX: 1 - nearX };
}

/** Walls stay behind data; authored thickness extrudes away from the plot volume. */
export function threeDWallMarks(context: SceneContext, plot: ChartRect, project: ReturnType<typeof chartProjection>): ChartMark[] {
  const size = chart3DSize(context.model, plot), corner = chart3DCorner(project), faces = chartFaceCollector(project);
  const wall = (vertices: readonly ChartPoint3D[], style: ChartWall | undefined, axis: 'x' | 'y' | 'z', direction: number) => {
    if (!style) return;
    const bounds = chartProjectedBounds(vertices.map(project)), mark = chartShapeMarks(context, bounds, style)[0];
    if (!mark || mark.kind !== 'rect') return;
    const { kind, x, y, width, height, ...paint } = mark;
    // MS-OI29500 2.1.1558: thickness is a percentage of the smaller height/width.
    const thickness = (style.thickness ?? 0) / 100 * Math.min(size.width, size.height) / (axis === 'x' ? size.width : axis === 'y' ? size.height : size.depth);
    if (!thickness) {
      const points = vertices.map(project);
      faces.addMarks([{ kind: 'path', d: chartPolygon(points), ...paint }], points.reduce((sum, point) => sum + point.depth, 0) / points.length);
      return;
    }
    const points = [...vertices, ...vertices.map(point => ({ ...point, [axis]: point[axis] + direction * thickness }))];
    const mesh = chartBarMesh({ shape: 'box', horizontal: false, categoryMinimum: Math.min(...points.map(point => point.x)), categoryMaximum: Math.max(...points.map(point => point.x)), valueStart: Math.min(...points.map(point => point.y)), valueEnd: Math.max(...points.map(point => point.y)), depthMinimum: Math.min(...points.map(point => point.z)), depthMaximum: Math.max(...points.map(point => point.z)) });
    for (const face of mesh) faces.add(face.vertices, paint, false);
  };
  wall([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }], context.model.walls?.floor, 'y', -1);
  const z = corner.farZ, x = corner.farX;
  wall([{ x: 0, y: 0, z }, { x: 1, y: 0, z }, { x: 1, y: 1, z }, { x: 0, y: 1, z }], context.model.walls?.back, 'z', z ? 1 : -1);
  wall([{ x, y: 0, z: 0 }, { x, y: 0, z: 1 }, { x, y: 1, z: 1 }, { x, y: 1, z: 0 }], context.model.walls?.side, 'x', x ? 1 : -1);
  return faces.marks();
}
