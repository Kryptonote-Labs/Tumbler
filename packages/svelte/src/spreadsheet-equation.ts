import type { MathEquation, MathSelection } from "@tumblerjs/core/math";

/** The equation text box a host is editing; `math` shows edits the host has yet to commit. */
export interface SpreadsheetEquationEditing {
  objectId: number;
  math: MathEquation;
  selection: MathSelection;
  focused: boolean;
}
