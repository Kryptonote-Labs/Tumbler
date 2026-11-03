import type { PdfPaintState, PdfPathCommand } from "./scene.ts";
import type { PdfFont } from "./fonts.ts";
import { deviceGray, type PdfColourSpace } from "./colour.ts";
import { identity, type PdfMatrix } from "./matrix.ts";
export type State = { -readonly [K in keyof PdfPaintState]: PdfPaintState[K] } & {
  fillSpace: PdfColourSpace;
  strokeSpace: PdfColourSpace;
  font: PdfFont | undefined;
  fontSize: number;
  charSpace: number;
  wordSpace: number;
  horizontalScale: number;
  leading: number;
  rise: number;
  mode: number;
};
export interface Execution {
  state: State;
  stack: State[];
  path: PdfPathCommand[];
  pendingClip: "nonzero" | "evenodd" | undefined;
  textMatrix: PdfMatrix;
  lineMatrix: PdfMatrix;
  inText: boolean;
  compatibility: number;
}
export function initialState(): State {
  return {
    transform: identity,
    clips: [],
    fill: "rgb(0, 0, 0)",
    stroke: "rgb(0, 0, 0)",
    fillAlpha: 1,
    strokeAlpha: 1,
    blend: "source-over",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    miterLimit: 10,
    dash: [],
    dashPhase: 0,
    fillSpace: deviceGray,
    strokeSpace: deviceGray,
    font: undefined,
    fontSize: 0,
    charSpace: 0,
    wordSpace: 0,
    horizontalScale: 1,
    leading: 0,
    rise: 0,
    mode: 0,
  };
}
export function execution(state = initialState()): Execution {
  return {
    state,
    stack: [],
    path: [],
    pendingClip: undefined,
    textMatrix: identity,
    lineMatrix: identity,
    inText: false,
    compatibility: 0,
  };
}
export function rectangle(
  x: number,
  y: number,
  width: number,
  height: number,
  transform?: PdfMatrix,
): PdfPathCommand[] {
  const commands: PdfPathCommand[] = [
    { kind: "move", x, y },
    { kind: "line", x: x + width, y },
    { kind: "line", x: x + width, y: y + height },
    { kind: "line", x, y: y + height },
    { kind: "close" },
  ];
  return transform ? commands.map((command) => ({ ...command, transform })) : commands;
}
