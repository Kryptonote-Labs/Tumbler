import {
  array,
  integer,
  invalid,
  unsupported,
  name,
  number,
  dictionary,
  type PdfValue,
  type PdfDictionary,
} from "./objects.ts";
import { matrix, multiply } from "./matrix.ts";
import { rectangle, type Execution } from "./graphics-state.ts";
import type { PdfSource } from "./source.ts";
import type {
  PdfSceneElement,
  PdfSceneSource,
  PdfPathCommand,
  PdfPaintState,
  PdfPaint,
} from "./scene.ts";
import {
  colourCss,
  colourSpace,
  deviceGray,
  deviceRGB,
  deviceCMYK,
  type PdfColourSpace,
} from "./colour.ts";
export function createGraphicsOperators(
  context: Execution,
  source: PdfSource,
  resources: PdfDictionary,
  elements: PdfSceneElement[],
  base: () => { id: string; source: PdfSceneSource; state: PdfPaintState },
  resource: (category: string, key: string) => PdfValue,
) {
  const pathPoint = (command: PdfPathCommand) =>
    context.path.push({ ...command, transform: context.state.transform });
  const paint = (space: PdfColourSpace, operands: PdfValue[]): PdfPaint => {
    if (!space.pattern)
      return colourCss(
        space,
        operands.map((value) => number(value)),
      );
    if (operands.length !== 1)
      return unsupported("Uncoloured tiling patterns need their base colour components.");
    const pattern = dictionary(resource("Pattern", name(operands[0])));
    if (integer(pattern.get("PatternType")) !== 2)
      return unsupported("Tiling PDF patterns need a repeating pattern scene.");
    return {
      kind: "shading-pattern",
      shading: dictionary(source.resolve(pattern.get("Shading"))),
      transform: matrix(source.resolve(pattern.get("Matrix"))),
      resources,
    };
  };
  const finishPath = (operator: string) => {
    const close = ["s", "b", "b*"].includes(operator);
    if (close) pathPoint({ kind: "close" });
    const fill = ["f", "F", "f*", "B", "B*", "b", "b*"].includes(operator),
      stroke = ["S", "s", "B", "B*", "b", "b*"].includes(operator);
    if (fill || stroke)
      elements.push({
        ...base(),
        kind: "path",
        path: context.path.slice(),
        fillRule: operator.endsWith("*") ? "evenodd" : "nonzero",
        fill,
        stroke,
      });
    if (context.pendingClip)
      context.state.clips = [
        ...context.state.clips,
        {
          path: context.path.slice(),
          transform: context.state.transform,
          rule: context.pendingClip,
        },
      ];
    context.path = [];
    context.pendingClip = undefined;
  };
  return (op: string, operands: PdfValue[]) => {
    const state = context.state,
      n = (i: number) => number(operands[i]);
    const count = (expected: number) => {
      if (operands.length !== expected)
        invalid(`PDF operator ${op} requires ${expected} operands.`);
    };
    switch (op) {
      case "q":
        count(0);
        context.stack.push({ ...state });
        break;
      case "Q":
        count(0);
        {
          const previous = context.stack.pop();
          if (!previous) invalid("Unbalanced graphics-state restore.");
          context.state = previous;
        }
        break;
      case "cm":
        count(6);
        state.transform = multiply(state.transform, matrix(operands));
        break;
      case "w":
        count(1);
        if (n(0) < 0) invalid("Negative PDF line width.");
        state.lineWidth = n(0);
        break;
      case "J":
        count(1);
        {
          const cap = ["butt", "round", "square"][integer(operands[0])];
          if (!cap) invalid("Invalid line cap.");
          state.lineCap = cap as CanvasLineCap;
        }
        break;
      case "j":
        count(1);
        {
          const join = ["miter", "round", "bevel"][integer(operands[0])];
          if (!join) invalid("Invalid line join.");
          state.lineJoin = join as CanvasLineJoin;
        }
        break;
      case "M":
        count(1);
        state.miterLimit = n(0);
        break;
      case "d":
        count(2);
        state.dash = array(operands[0]).map((item) => number(item));
        state.dashPhase = n(1);
        if (
          state.dash.some((value) => value < 0) ||
          (state.dash.length && state.dash.every((value) => value === 0))
        )
          invalid("Invalid PDF dash pattern.");
        break;
      case "m":
        count(2);
        pathPoint({ kind: "move", x: n(0), y: n(1) });
        break;
      case "l":
        count(2);
        pathPoint({ kind: "line", x: n(0), y: n(1) });
        break;
      case "c":
        count(6);
        pathPoint({ kind: "curve", x1: n(0), y1: n(1), x2: n(2), y2: n(3), x: n(4), y: n(5) });
        break;
      case "v":
        count(4);
        {
          const current = [...context.path].reverse().find((item) => item.kind !== "close");
          if (!current) invalid("Curve has no current point.");
          pathPoint({
            kind: "curve",
            x1: current.x,
            y1: current.y,
            x2: n(0),
            y2: n(1),
            x: n(2),
            y: n(3),
          });
        }
        break;
      case "y":
        count(4);
        pathPoint({ kind: "curve", x1: n(0), y1: n(1), x2: n(2), y2: n(3), x: n(2), y: n(3) });
        break;
      case "h":
        count(0);
        pathPoint({ kind: "close" });
        break;
      case "re":
        count(4);
        context.path.push(...rectangle(n(0), n(1), n(2), n(3), state.transform));
        break;
      case "W":
      case "W*":
        count(0);
        context.pendingClip = op === "W" ? "nonzero" : "evenodd";
        break;
      case "S":
      case "s":
      case "f":
      case "F":
      case "f*":
      case "B":
      case "B*":
      case "b":
      case "b*":
      case "n":
        count(0);
        finishPath(op);
        break;
      case "g":
      case "G":
        count(1);
        if (op === "g") {
          state.fillSpace = deviceGray;
          state.fill = colourCss(deviceGray, [n(0)]);
        } else {
          state.strokeSpace = deviceGray;
          state.stroke = colourCss(deviceGray, [n(0)]);
        }
        break;
      case "rg":
      case "RG":
        count(3);
        if (op === "rg") {
          state.fillSpace = deviceRGB;
          state.fill = colourCss(
            deviceRGB,
            operands.map((value) => number(value)),
          );
        } else {
          state.strokeSpace = deviceRGB;
          state.stroke = colourCss(
            deviceRGB,
            operands.map((value) => number(value)),
          );
        }
        break;
      case "k":
      case "K":
        count(4);
        if (op === "k") {
          state.fillSpace = deviceCMYK;
          state.fill = colourCss(
            deviceCMYK,
            operands.map((value) => number(value)),
          );
        } else {
          state.strokeSpace = deviceCMYK;
          state.stroke = colourCss(
            deviceCMYK,
            operands.map((value) => number(value)),
          );
        }
        break;
      case "cs":
      case "CS":
        count(1);
        {
          const space = colourSpace(source, operands[0], resources);
          if (op === "cs") {
            state.fillSpace = space;
            if (!space.pattern) state.fill = colourCss(space, Array(space.components).fill(0));
          } else {
            state.strokeSpace = space;
            if (!space.pattern) state.stroke = colourCss(space, Array(space.components).fill(0));
          }
        }
        break;
      case "sc":
      case "scn":
        state.fill = paint(state.fillSpace, operands);
        break;
      case "SC":
      case "SCN":
        state.stroke = paint(state.strokeSpace, operands);
        break;
      default:
        return false;
    }
    return true;
  };
}
