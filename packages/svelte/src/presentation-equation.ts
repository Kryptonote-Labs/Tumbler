import type { PresentationTableCellAddress } from "@tumblerjs/slides";
import type { SlideEquationEditing } from "./presentation-text-edit.ts";

/** An equation's object character in slide text: the text object, table cell and offset. */
export interface PresentationEquationTarget {
  slideId: string;
  objectKey: string;
  cell?: PresentationTableCellAddress | undefined;
  start: number;
}

/** The equation a host is editing, located in the slide. */
export type PresentationEquationEditing = SlideEquationEditing & Omit<PresentationEquationTarget, "slideId" | "start">;
