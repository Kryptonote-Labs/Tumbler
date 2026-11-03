import {
  array,
  integer,
  invalid,
  unsupported,
  name,
  number,
  PdfString,
  type PdfValue,
  type PdfDictionary,
  PdfReference,
} from "./objects.ts";
import { identity, matrix, multiply } from "./matrix.ts";
import { execution, type Execution } from "./graphics-state.ts";
import type { PdfFont } from "./fonts.ts";
import type { PdfSource } from "./source.ts";
import type { PdfSceneElement, PdfSceneSource } from "./scene.ts";
export function createTextOperators(
  context: Execution,
  source: PdfSource,
  resources: PdfDictionary,
  elements: PdfSceneElement[],
  base: () => { id: string; source: PdfSceneSource },
  resolveFont: (key: string) => PdfFont,
  run: (
    bytes: Uint8Array,
    resources: PdfDictionary,
    context: Execution,
    elements: PdfSceneElement[],
    object: PdfReference,
    instance: string,
  ) => void,
  instance: string,
  step: () => void,
) {
  const moveText = (x: number, y: number, line = false) => {
    if (line) context.lineMatrix = multiply(context.lineMatrix, [1, 0, 0, 1, x, y]);
    context.textMatrix = line
      ? context.lineMatrix
      : multiply(context.textMatrix, [1, 0, 0, 1, x, y]);
  };
  const show = (value: PdfValue | undefined) => {
    if (!(value instanceof PdfString) || !context.inText || !context.state.font)
      return invalid("Text-showing operator requires an active font and text object.");
    const state = context.state,
      font = state.font!;
    if (state.mode >= 4)
      unsupported("Text clipping requires a glyph clipping path implementation.");
    for (const glyph of font.glyphs(value.bytes, step)) {
      const tx = font.vertical ? (-(glyph.vertical?.[1] ?? 0) / 1000) * state.fontSize : 0;
      const ty = font.vertical ? (-(glyph.vertical?.[2] ?? 0) / 1000) * state.fontSize : 0;
      const fontScale =
        font.kind === "Type3"
          ? multiply(
              [state.fontSize * state.horizontalScale, 0, 0, state.fontSize, tx, state.rise + ty],
              font.fontMatrix,
            )
          : ([
              (state.fontSize * state.horizontalScale) / font.unitsPerEm,
              0,
              0,
              state.fontSize / font.unitsPerEm,
              tx,
              state.rise + ty,
            ] as const);
      const transform = multiply(multiply(state.transform, context.textMatrix), fontScale);
      const wordSpace = glyph.codeLength === 1 && glyph.code === 32 ? state.wordSpace : 0;
      const dx = font.vertical
        ? 0
        : ((font.kind === "Type3" ? glyph.width * font.fontMatrix[0] : glyph.width / 1000) *
            state.fontSize +
            state.charSpace +
            wordSpace) *
          state.horizontalScale;
      const dy = font.vertical
        ? (glyph.vertical![0] / 1000) * state.fontSize + state.charSpace + wordSpace
        : 0;
      const textToUser = multiply(state.transform, context.textMatrix);
      elements.push({
        ...base(),
        kind: "glyph",
        state: { ...state, transform },
        font,
        glyph,
        textMatrix: context.textMatrix,
        fontSize: state.fontSize,
        mode: state.mode,
        advance: [dx, dy],
        textDisplacement: font.vertical ? -dy / state.fontSize * 1000 : -dx / (state.fontSize * state.horizontalScale) * 1000,
        advanceVector: [
          textToUser[0] * dx + textToUser[2] * dy,
          textToUser[1] * dx + textToUser[3] * dy,
        ],
      });
      if (glyph.procedure && state.mode !== 3 && state.mode !== 7) {
        const nested = execution({ ...state, transform });
        run(
          source.stream(glyph.procedure),
          font.resources.size ? font.resources : resources,
          nested,
          elements,
          glyph.procedure.object,
          `${instance}:glyph:${glyph.code}:${elements.length}`,
        );
      }
      moveText(dx, dy);
    }
  };
  return (op: string, operands: PdfValue[]) => {
    const state = context.state,
      n = (i: number) => number(operands[i]);
    const count = (expected: number) => {
      if (operands.length !== expected)
        invalid(`PDF operator ${op} requires ${expected} operands.`);
    };
    switch (op) {
      case "BT":
        count(0);
        if (context.inText) invalid("Nested PDF text object.");
        context.inText = true;
        context.textMatrix = identity;
        context.lineMatrix = identity;
        break;
      case "ET":
        count(0);
        if (!context.inText) invalid("Text object end without begin.");
        context.inText = false;
        break;
      case "Tf":
        count(2);
        state.font = resolveFont(name(operands[0]));
        state.fontSize = n(1);
        break;
      case "Tc":
        count(1);
        state.charSpace = n(0);
        break;
      case "Tw":
        count(1);
        state.wordSpace = n(0);
        break;
      case "Tz":
        count(1);
        state.horizontalScale = n(0) / 100;
        break;
      case "TL":
        count(1);
        state.leading = n(0);
        break;
      case "Ts":
        count(1);
        state.rise = n(0);
        break;
      case "Tr":
        count(1);
        state.mode = integer(operands[0]);
        if (state.mode < 0 || state.mode > 7) invalid("Invalid text rendering mode.");
        break;
      case "Tm":
        count(6);
        context.textMatrix = matrix(operands);
        context.lineMatrix = context.textMatrix;
        break;
      case "Td":
      case "TD":
        count(2);
        if (op === "TD") state.leading = -n(1);
        moveText(n(0), n(1), true);
        break;
      case "T*":
        count(0);
        moveText(0, -state.leading, true);
        break;
      case "Tj":
        count(1);
        show(operands[0]);
        break;
      case "TJ":
        count(1);
        for (const value of array(operands[0])) {
          if (typeof value === "number")
            moveText(
              state.font?.vertical ? 0 : (-value / 1000) * state.fontSize * state.horizontalScale,
              state.font?.vertical ? (-value / 1000) * state.fontSize : 0,
            );
          else show(value);
        }
        break;
      case "'":
        count(1);
        moveText(0, -state.leading, true);
        show(operands[0]);
        break;
      case '"':
        count(3);
        state.wordSpace = n(0);
        state.charSpace = n(1);
        moveText(0, -state.leading, true);
        show(operands[2]);
        break;
      default:
        return false;
    }
    return true;
  };
}
