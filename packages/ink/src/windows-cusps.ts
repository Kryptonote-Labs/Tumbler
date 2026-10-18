// Adapted from dotnet/wpf CuspData.cs, licensed by the .NET Foundation under MIT.
// See ../third-party/dotnet-wpf-LICENSE.txt. Coordinates here are HIMETRIC.
export interface CurvePoint { x: number; y: number }
export const add = (a: CurvePoint, b: CurvePoint): CurvePoint => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: CurvePoint, b: CurvePoint): CurvePoint => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: CurvePoint, n: number): CurvePoint => ({ x: a.x * n, y: a.y * n });
export const dot = (a: CurvePoint, b: CurvePoint) => a.x * b.x + a.y * b.y;
export const length = (a: CurvePoint) => Math.hypot(a.x, a.y);
const zero = (value: number) => Math.abs(value) < 10 * Number.EPSILON;
const close = (a: number, b: number) => Math.abs(a - b) < (Math.abs(a) + Math.abs(b) + 10) * Number.EPSILON;

export class WindowsInkCusps {
  readonly points: CurvePoint[] = [];
  readonly nodes: number[] = [0];
  readonly previous: number[];
  readonly next: number[];
  readonly cusps: number[] = [0];
  readonly distance: number;
  readonly span: number;
  constructor(input: readonly CurvePoint[]) {
    input.forEach((point, i) => {
      if (i && close(point.x, input[i - 1]!.x) && close(point.y, input[i - 1]!.y)) return;
      if (this.points.length) this.nodes.push(this.nodes.at(-1)! + length(sub(point, this.points.at(-1)!)));
      this.points.push(point);
    });
    this.previous = this.points.map(() => 0); this.next = this.points.map(() => 0);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of this.points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
    this.distance = this.points.length ? maxX - minX + maxY - minY : 0;
    this.span = Math.max(1, this.distance > 0 ? .75 * this.nodes.at(-1)! ** 2 / (this.points.length * this.distance) : 3);
    this.findCusps();
  }
  neighbours(at: number, previousCusp: number) {
    let more = at < this.points.length;
    at = Math.min(at, this.points.length - 1);
    let next = at + 1, previous = at - 1;
    while (next < this.points.length && this.nodes[next]! - this.nodes[at]! < this.span) next++;
    if (next >= this.points.length) { more = false; next = this.points.length - 1; }
    while (previous >= previousCusp && this.nodes[at]! - this.nodes[previous]! < this.span) previous--;
    return { more, next, previous: Math.max(0, previous) };
  }
  curvature(previous: number, at: number, next: number) {
    const v = sub(this.points[at]!, this.points[previous]!), w = sub(this.points[next]!, this.points[at]!);
    const size = length(v) * length(w);
    return zero(size) ? 0 : 1 - dot(v, w) / size;
  }
  private findCusps() {
    if (this.points.length < 2) return;
    const first = this.neighbours(0, 0);
    let at = first.next, previousCusp = 0;
    while (first.more) {
      const probe = this.neighbours(at, previousCusp);
      if (!probe.more) break;
      const curvature = this.curvature(probe.previous, at, probe.next);
      if (curvature > .8) {
        const far = this.neighbours(probe.next, previousCusp);
        if (!far.more) break;
        let max = curvature, cusp = at;
        for (let i = probe.previous + 1; i <= far.next; i++) {
          const near = this.neighbours(i, previousCusp);
          if (!near.more) break;
          const value = this.curvature(near.previous, i, near.next);
          if (value > max) { max = value; cusp = i; }
        }
        this.cusps.push(cusp); at = far.next + 1; previousCusp = cusp;
      } else if (curvature < .035) at = probe.next;
      else at++;
    }
    this.cusps.push(this.points.length - 1);
  }
  setTangentLinks(error: number) {
    error = Math.max(1, error);
    for (let i = 0; i < this.points.length; i++) {
      for (let j = i + 1; j < this.points.length; j++) if (this.nodes[j]! - this.nodes[i]! >= error) { this.next[i] = j; this.previous[j] = i; break; }
      if (this.previous[i]! < 0) for (let j = i - 1; j >= 0; j--) if (this.nodes[i]! - this.nodes[j]! >= error) { this.previous[i] = j; break; }
      if (this.next[i]! < 0) this.next[i] = this.points.length - 1;
      if (this.previous[i]! < 0) this.previous[i] = 0;
    }
  }
  tangent(at: number, previousCusp: number, nextCusp: number, reverse: boolean, cusp: boolean) {
    let v: CurvePoint;
    if (cusp) {
      let one = (reverse ? this.previous : this.next)[at]!, two: number;
      if (one < 0 || (reverse ? one < previousCusp : one > nextCusp)) { two = reverse ? previousCusp : nextCusp; one = Math.floor((two + at) / 2); }
      else { two = (reverse ? this.previous : this.next)[one]!; two = reverse ? Math.max(two, previousCusp) : Math.min(two, nextCusp); }
      v = sub(add(this.points[one]!, mul(this.points[two]!, .5)), mul(this.points[at]!, 1.5));
    } else {
      let two = this.previous[at]!, three: number;
      if (two < previousCusp) { three = previousCusp; two = Math.floor((three + at) / 2); }
      else three = Math.max(this.previous[two]!, previousCusp);
      v = sub(add(add(this.points[at]!, this.points[two]!), mul(this.points[three]!, .5)), mul(this.points[Math.min(this.next[at]!, nextCusp)]!, 2.5));
    }
    if (zero(dot(v, v))) return undefined;
    return mul(v, 1 / length(v));
  }
}
