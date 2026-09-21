import type { LosslessXmlElement } from "@tumblerjs/ooxml";
import { presetGeometries } from "./preset-geometries.ts";
import { EMUS_PER_PIXEL } from "./geometry.ts";

export interface GeometryDefinition {
  readonly adjustments: readonly (readonly [string, string])[];
  readonly guides: readonly (readonly [string, string])[];
  readonly rect: readonly string[];
  readonly paths: readonly {
    readonly attrs: Readonly<Record<string, string>>;
    readonly commands: readonly (readonly [
      string,
      Readonly<Record<string, string>>,
      readonly Readonly<Record<string, string>>[],
    ])[];
  }[];
}
export interface DrawingGeometry {
  readonly paths: readonly {
    readonly d: string;
    readonly fill: string;
    readonly stroke: boolean;
  }[];
  readonly textRect: readonly [number, number, number, number];
}
const turn = Math.PI / 10800000;
function children(element: LosslessXmlElement | undefined) {
  return (
    element?.children.filter(
      (child): child is LosslessXmlElement =>
        child.kind === "element" && child.namespaceUri === element.namespaceUri,
    ) ?? []
  );
}
function child(element: LosslessXmlElement | undefined, name: string) {
  return children(element).find((item) => item.localName === name);
}
function attrs(element: LosslessXmlElement) {
  return Object.fromEntries(
    element.attributes
      .filter((a) => a.namespaceUri === "")
      .map((a) => [a.localName, a.value]),
  );
}
function guides(element: LosslessXmlElement | undefined): [string, string][] {
  return children(element).map((item) => {
    const a = attrs(item);
    return [a.name ?? "", a.fmla ?? ""];
  });
}
export function customGeometry(
  element: LosslessXmlElement,
): GeometryDefinition {
  const rect = child(element, "rect");
  return {
    adjustments: guides(child(element, "avLst")),
    guides: guides(child(element, "gdLst")),
    rect: rect
      ? ["l", "t", "r", "b"].map((key) => attrs(rect)[key] ?? key)
      : ["l", "t", "r", "b"],
    paths: children(child(element, "pathLst")).map((path) => ({
      attrs: attrs(path),
      commands: children(path).map(
        (command) =>
          [
            command.localName,
            attrs(command),
            children(command).map(attrs),
          ] as const,
      ),
    })),
  };
}
/** DrawingML guide formulas are evaluated as data, never as JavaScript. */
export function evaluateGeometry(
  definition: GeometryDefinition,
  width: number,
  height: number,
  overrides: readonly (readonly [string, string])[] = [],
): DrawingGeometry {
  const w = width * EMUS_PER_PIXEL,
    h = height * EMUS_PER_PIXEL,
    ss = Math.min(w, h);
  const values = new Map<string, number>(
    Object.entries({
      w,
      h,
      l: 0,
      t: 0,
      r: w,
      b: h,
      hc: w / 2,
      vc: h / 2,
      ss,
      ls: Math.max(w, h),
      cd2: 10800000,
      cd4: 5400000,
      cd8: 2700000,
      "3cd4": 16200000,
      "3cd8": 8100000,
      "5cd8": 13500000,
      "7cd8": 18900000,
    }),
  );
  for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 32]) {
    values.set(`wd${n}`, w / n);
    values.set(`hd${n}`, h / n);
    values.set(`ssd${n}`, ss / n);
  }
  const checked = (value: number) => {
    if (!Number.isFinite(value))
      throw new Error("Invalid geometry coordinate.");
    return value;
  };
  const read = (token: string | undefined): number => {
    if (token === undefined) throw new Error("Missing geometry argument.");
    const value =
      values.get(token) ??
      (/^-?\d+(?:\.\d+)?$/.test(token) ? Number(token) : NaN);
    return checked(value);
  };
  function formula(expression: string) {
    const [op, ...args] = expression.trim().split(/\s+/);
    const a = args.map(read),
      x = a[0]!,
      y = a[1]!,
      z = a[2]!;
    const arity: Record<string, number> = {
      "*/": 3,
      "+-": 3,
      "+/": 3,
      "?:": 3,
      abs: 1,
      at2: 2,
      cat2: 3,
      cos: 2,
      max: 2,
      min: 2,
      mod: 3,
      pin: 3,
      sat2: 3,
      sin: 2,
      sqrt: 1,
      tan: 2,
      val: 1,
    };
    if (!op || arity[op] !== a.length)
      throw new Error("Unsupported geometry guide.");
    switch (op) {
      case "*/":
        return z === 0 ? 0 : (x * y) / z;
      case "+-":
        return x + y - z;
      case "+/":
        return z === 0 ? 0 : (x + y) / z;
      case "?:":
        return x > 0 ? y : z;
      case "abs":
        return Math.abs(x);
      case "at2":
        return Math.atan2(y, x) / turn;
      case "cat2":
        return x * Math.cos(Math.atan2(z, y));
      case "sat2":
        return x * Math.sin(Math.atan2(z, y));
      case "cos":
        return x * Math.cos(y * turn);
      case "sin":
        return x * Math.sin(y * turn);
      case "tan":
        return x * Math.tan(y * turn);
      case "max":
        return Math.max(x, y);
      case "min":
        return Math.min(x, y);
      case "mod":
        return Math.hypot(x, y, z);
      case "pin":
        return Math.max(x, Math.min(y, z));
      case "sqrt":
        return Math.sqrt(Math.max(0, x));
      case "val":
        return x;
      default:
        throw new Error("Unsupported geometry formula.");
    }
  }
  if (
    definition.adjustments.length +
      definition.guides.length +
      overrides.length >
      4096 ||
    definition.paths.reduce((n, path) => n + path.commands.length, 0) > 20000
  )
    throw new Error("Geometry exceeds the complexity limit.");
  for (const [name, expression] of [
    ...definition.adjustments,
    ...overrides,
    ...definition.guides,
  ])
    values.set(name, checked(formula(expression)));
  const paths = definition.paths.map((path) => {
    const pw = path.attrs.w === undefined ? w : read(path.attrs.w),
      ph = path.attrs.h === undefined ? h : read(path.attrs.h);
    const sx = pw === 0 ? 0 : width / pw,
      sy = ph === 0 ? 0 : height / ph;
    let x = 0,
      y = 0,
      startX = 0,
      startY = 0;
    const commands: string[] = [];
    const n = (value: number) => {
      checked(value);
      if (Math.abs(value) > 1e9)
        throw new Error("Geometry path exceeds coordinate limit.");
      return String(Math.round(value * 100000) / 100000);
    };
    const point = (p: Readonly<Record<string, string>>) => {
      x = read(p.x);
      y = read(p.y);
      return `${n(x * sx)} ${n(y * sy)}`;
    };
    for (const [kind, a, points] of path.commands) {
      if (kind === "moveTo" || kind === "lnTo") {
        if (points.length !== 1) throw new Error("Invalid geometry point.");
        commands.push(`${kind === "moveTo" ? "M" : "L"} ${point(points[0]!)}`);
        if (kind === "moveTo") {
          startX = x;
          startY = y;
        }
      } else if (kind === "cubicBezTo" || kind === "quadBezTo") {
        if (points.length !== (kind === "cubicBezTo" ? 3 : 2))
          throw new Error("Invalid curve.");
        commands.push(
          `${kind === "cubicBezTo" ? "C" : "Q"} ${points.map(point).join(" ")}`,
        );
      } else if (kind === "close") {
        commands.push("Z");
        x = startX;
        y = startY;
      } else if (kind === "arcTo") {
        const rx = Math.abs(read(a.wR)),
          ry = Math.abs(read(a.hR)),
          start = read(a.stAng) * turn,
          sweep = read(a.swAng) * turn;
        if (Math.abs(sweep) > Math.PI * 2 + 0.00001)
          throw new Error("Invalid arc sweep.");
        const polar = (angle: number) => {
          const cos = Math.cos(angle),
            sin = Math.sin(angle),
            length = Math.hypot(ry * cos, rx * sin);
          return length === 0
            ? ([0, 0] as const)
            : ([(rx * ry * cos) / length, (rx * ry * sin) / length] as const);
        };
        const initial = polar(start),
          cx = x - initial[0],
          cy = y - initial[1],
          segments = Math.max(1, Math.ceil(Math.abs(sweep) / Math.PI));
        for (let i = 1; i <= segments; i++) {
          const end = polar(start + (sweep * i) / segments);
          x = cx + end[0];
          y = cy + end[1];
          commands.push(
            `A ${n(rx * sx)} ${n(ry * sy)} 0 0 ${sweep >= 0 ? 1 : 0} ${n(x * sx)} ${n(y * sy)}`,
          );
        }
      } else throw new Error(`Unsupported geometry command ${kind}.`);
    }
    return {
      d: commands.join(" "),
      fill: path.attrs.fill ?? "norm",
      stroke: !["0", "false"].includes(path.attrs.stroke ?? "true"),
    };
  });
  const [l, t, r, b] = definition.rect.map(
    (value) => read(value) / EMUS_PER_PIXEL,
  );
  return { paths, textRect: [l ?? 0, t ?? 0, r ?? width, b ?? height] };
}
export function resolveDrawingGeometry(
  preset: string,
  element: LosslessXmlElement | undefined,
  width: number,
  height: number,
): DrawingGeometry | undefined {
  const definition =
    element?.localName === "custGeom"
      ? customGeometry(element)
      : presetGeometries[preset];
  return definition
    ? evaluateGeometry(
        definition,
        width,
        height,
        element?.localName === "prstGeom"
          ? guides(child(element, "avLst"))
          : [],
      )
    : undefined;
}
