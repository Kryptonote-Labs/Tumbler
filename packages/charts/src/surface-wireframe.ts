export interface SurfaceVertex { readonly x: number; readonly z: number; readonly value: number }
const interpolate = (a: SurfaceVertex, b: SurfaceVertex, fraction: number): SurfaceVertex => ({ x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction, value: a.value + (b.value - a.value) * fraction });
function atLevel(a: SurfaceVertex, b: SurfaceVertex, level: number) {
  const [first, last] = a.x < b.x || a.x === b.x && a.z < b.z ? [a, b] : [b, a];
  return interpolate(first, last, (level - first.value) / (last.value - first.value));
}
const bandIndex = (bands: readonly number[], value: number) => {
  const upper = bands.findIndex(upper => upper > value);
  return upper < 0 ? bands.length - 2 : Math.max(0, upper - 1);
};

/** A 3D wireframe follows source grid edges; a 2D wireframe follows height contours. */
export function surfaceWireframe(quad: readonly SurfaceVertex[], bands: readonly number[], threeD: boolean, seen: Set<string>, emit: (a: SurfaceVertex, b: SurfaceVertex, band: number) => void, spend: () => void): void {
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0]] as const;
  if (threeD) {
    for (const [first, last] of edges) {
      const a = quad[first]!, b = quad[last]!;
      const ends = [`${a.x},${a.z}`, `${b.x},${b.z}`].sort(), key = ends.join('/');
      if (seen.has(key)) continue;
      seen.add(key);
      const cuts = [0, 1, ...bands.flatMap(level => {
        spend();
        const fraction = (level - a.value) / (b.value - a.value);
        return fraction > 0 && fraction < 1 ? [fraction] : [];
      })].sort((a, b) => a - b);
      for (let index = 0; index < cuts.length - 1; index++) {
        const start = cuts[index]!, end = cuts[index + 1]!;
        const middle = a.value + (b.value - a.value) * (start + end) / 2;
        if (middle < bands[0]! || middle > bands.at(-1)!) continue;
        emit(interpolate(a, b, start), interpolate(a, b, end), bandIndex(bands, middle));
      }
    }
    return;
  }
  for (const triangle of [[quad[0]!, quad[1]!, quad[2]!], [quad[0]!, quad[2]!, quad[3]!]]) {
    for (const [band, level] of bands.entries()) {
      spend();
      if (triangle.every(vertex => vertex.value === level)) continue;
      const points: SurfaceVertex[] = [];
      for (const [index, a] of triangle.entries()) {
        const b = triangle[(index + 1) % 3]!;
        if (a.value === level) points.push(a);
        if ((a.value < level && b.value > level) || (a.value > level && b.value < level)) points.push(atLevel(a, b, level));
      }
      const unique = points.filter((point, index) => points.findIndex(other => point.x === other.x && point.z === other.z) === index);
      if (unique.length === 2) {
        const ends = unique.map(point => `${point.x},${point.z}`).sort(), key = `${level}/${ends.join('/')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        emit(unique[0]!, unique[1]!, Math.min(bands.length - 2, Math.max(0, band - 1)));
      }
    }
  }
}
