import type { GeometryDefinition } from "./drawing-geometry.ts";

type Point = { x: number; y: number };
type Command = GeometryDefinition["paths"][number]["commands"][number];

/** Path units per viewBox unit; DrawingML path coordinates are integers. */
const UNITS = 100;
const token = /[MmZzLlHhVvCcSsQqTtAa]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const counts: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Splits an SVG elliptical arc into cubic Béziers of at most a quarter turn (SVG 1.1 F.6.5). */
function arcToCubics(from: Point, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, to: Point): Point[][] {
  if (from.x === to.x && from.y === to.y) return [];
  if (!rx || !ry) return [[from, to, to]];
  const phi = (angle * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2, dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (factor * rx * y1) / ry, cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2, cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const vector = (ux: number, uy: number, vx: number, vy: number) => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return sign * Math.acos(Math.min(1, Math.max(-1, dot)));
  };
  const start = vector(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = vector((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segments, k = (4 / 3) * Math.tan(step / 4);
  // Each segment's control points lie along the ellipse tangents at its ends.
  const map = (ex: number, ey: number): Point => ({ x: cx + cos * ex - sin * ey, y: cy + sin * ex + cos * ey });
  const curves: Point[][] = [];
  for (let i = 0; i < segments; i++) {
    const a = start + i * step, b = a + step;
    curves.push([
      map(rx * (Math.cos(a) - k * Math.sin(a)), ry * (Math.sin(a) + k * Math.cos(a))),
      map(rx * (Math.cos(b) + k * Math.sin(b)), ry * (Math.sin(b) - k * Math.cos(b))),
      i === segments - 1 ? to : map(rx * Math.cos(b), ry * Math.sin(b)),
    ]);
  }
  return curves;
}

/** Converts SVG path data drawn in a width × height viewBox into a DrawingML custom geometry. */
export function svgPathGeometry(d: string, width: number, height: number): GeometryDefinition {
  if (!(width > 0 && height > 0)) throw new RangeError("Path viewBox size must be positive.");
  const tokens = d.match(token) ?? [];
  if (!tokens.length || !/^[Mm]$/.test(tokens[0]!) || d.replace(token, "").replace(/[\s,]/g, ""))
    throw new TypeError("Invalid SVG path data.");
  const commands: Command[] = [];
  const pt = (p: Point) => ({ x: String(Math.round(p.x * UNITS)), y: String(Math.round(p.y * UNITS)) });
  const emit = (name: string, points: Point[]) => commands.push([name, {}, points.map(pt)] as const);
  let current: Point = { x: 0, y: 0 }, start = current, control: Point | undefined, previous = "";
  let i = 0, command = "";
  const number = () => {
    const value = Number(tokens[i++]);
    if (!Number.isFinite(value)) throw new TypeError("Invalid SVG path data.");
    return value;
  };
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i]!)) command = tokens[i++]!;
    else if (!command || command === "Z" || command === "z") throw new TypeError("Invalid SVG path data.");
    const upper = command.toUpperCase(), relative = command !== upper;
    const base = relative ? current : { x: 0, y: 0 };
    const at = (x: number, y: number): Point => ({ x: base.x + x, y: base.y + y });
    if (i + counts[upper]! > tokens.length) throw new TypeError("Invalid SVG path data.");
    switch (upper) {
      case "M":
        current = start = at(number(), number());
        emit("moveTo", [current]);
        command = relative ? "l" : "L"; // Further coordinate pairs are implicit line-tos.
        break;
      case "L":
        current = at(number(), number());
        emit("lnTo", [current]);
        break;
      case "H":
        current = { x: (relative ? current.x : 0) + number(), y: current.y };
        emit("lnTo", [current]);
        break;
      case "V":
        current = { x: current.x, y: (relative ? current.y : 0) + number() };
        emit("lnTo", [current]);
        break;
      case "C": {
        const c1 = at(number(), number()), c2 = at(number(), number());
        current = at(number(), number());
        emit("cubicBezTo", [c1, c2, current]);
        control = c2;
        break;
      }
      case "S": {
        const c1 = /[CS]/.test(previous) && control ? { x: 2 * current.x - control.x, y: 2 * current.y - control.y } : current;
        const c2 = at(number(), number());
        current = at(number(), number());
        emit("cubicBezTo", [c1, c2, current]);
        control = c2;
        break;
      }
      case "Q": {
        const c = at(number(), number());
        current = at(number(), number());
        emit("quadBezTo", [c, current]);
        control = c;
        break;
      }
      case "T": {
        const c = /[QT]/.test(previous) && control ? { x: 2 * current.x - control.x, y: 2 * current.y - control.y } : current;
        current = at(number(), number());
        emit("quadBezTo", [c, current]);
        control = c;
        break;
      }
      case "A": {
        const rx = number(), ry = number(), angle = number(), large = number() !== 0, sweep = number() !== 0;
        const to = at(number(), number());
        for (const curve of arcToCubics(current, rx, ry, angle, large, sweep, to)) emit("cubicBezTo", curve);
        current = to;
        break;
      }
      case "Z":
        commands.push(["close", {}, []] as const);
        current = start;
        break;
    }
    previous = upper;
  }
  return {
    adjustments: [],
    guides: [],
    rect: ["l", "t", "r", "b"],
    paths: [{ attrs: { w: String(Math.round(width * UNITS)), h: String(Math.round(height * UNITS)), stroke: "0" }, commands }],
  };
}

/** Serializes a custom geometry definition as `a:custGeom`; attribute values are numeric or guide names. */
export function customGeometryXml(definition: GeometryDefinition): string {
  const attributes = (values: Readonly<Record<string, string>>) =>
    Object.entries(values).map(([name, value]) => ` ${name}="${value.replace(/[^\w.-]/g, "")}"`).join("");
  const [l, t, r, b] = definition.rect;
  const paths = definition.paths
    .map((path) => `<a:path${attributes(path.attrs)}>${path.commands
      .map(([name, attrs, points]) => `<a:${name}${attributes(attrs)}${points.length ? `>${points.map((p) => `<a:pt${attributes(p)}/>`).join("")}</a:${name}>` : "/>"}`)
      .join("")}</a:path>`)
    .join("");
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="${l}" t="${t}" r="${r}" b="${b}"/><a:pathLst>${paths}</a:pathLst></a:custGeom>`;
}
