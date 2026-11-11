import type { ChartBarShape } from './bar-shapes.ts';
import type { ChartPoint3D } from './projection.ts';

export interface ChartMeshFace { readonly vertices: readonly ChartPoint3D[]; readonly role: 'cap' | 'side' }
export interface ChartBarMeshOptions {
  readonly shape: ChartBarShape;
  readonly horizontal: boolean;
  readonly categoryMinimum: number;
  readonly categoryMaximum: number;
  readonly depthMinimum: number;
  readonly depthMaximum: number;
  readonly valueStart: number;
  readonly valueEnd: number;
  /** Radius fractions allow stacked cones and axis-max frustums to share one taper. */
  readonly baseRadius?: number;
  readonly topRadius?: number;
}

/** Native box, cylinder, cone and pyramid geometry, with outward face winding. */
export function chartBarMesh(options: ChartBarMeshOptions): readonly ChartMeshFace[] {
  const { shape, valueStart, valueEnd, horizontal } = options;
  const curved = shape === 'cylinder' || shape.startsWith('cone');
  const tapered = shape.startsWith('cone') || shape.startsWith('pyramid');
  const cx = (options.categoryMinimum + options.categoryMaximum) / 2, cz = (options.depthMinimum + options.depthMaximum) / 2;
  const rx = Math.abs(options.categoryMaximum - options.categoryMinimum) / 2, rz = Math.abs(options.depthMaximum - options.depthMinimum) / 2;
  const samples = curved ? Array.from({ length: 64 }, (_, index) => [Math.cos(index * Math.PI / 32), Math.sin(index * Math.PI / 32)] as const) : [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
  const point = ([x, z]: readonly [number, number], value: number, radius: number): ChartPoint3D => horizontal ? { x: value, y: cx + x * rx * radius, z: cz + z * rz * radius } : { x: cx + x * rx * radius, y: value, z: cz + z * rz * radius };
  const base = samples.map(sample => point(sample, valueStart, options.baseRadius ?? 1));
  const top = samples.map(sample => point(sample, valueEnd, options.topRadius ?? (tapered ? 0 : 1)));
  const faces = [base, [...top].reverse(), ...base.map((vertex, index) => [base[(index + 1) % base.length]!, vertex, top[index]!, top[(index + 1) % top.length]!])];
  const reverse = (valueEnd < valueStart) !== horizontal;
  return faces.flatMap((vertices, index): ChartMeshFace[] => chartMeshNormal(vertices) ? [{ vertices: reverse ? [...vertices].reverse() : vertices, role: index < 2 ? 'cap' : 'side' }] : []);
}

/** Normalized face normal; degenerate caps and zero-height bars have no surface. */
export function chartMeshNormal(vertices: readonly ChartPoint3D[]): ChartPoint3D | undefined {
  let x = 0, y = 0, z = 0;
  for (const [index, a] of vertices.entries()) {
    const b = vertices[(index + 1) % vertices.length]!;
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  const length = Math.hypot(x, y, z);
  return length > 1e-14 ? { x: x / length, y: y / length, z: z / length } : undefined;
}

/** A camera-facing polygon has positive screen-space area after the Y-axis flip. */
export function chartFaceVisible(points: readonly { readonly x: number; readonly y: number }[]): boolean {
  return points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]!; return sum + point.x * next.y - next.x * point.y; }, 0) > 1e-8;
}
