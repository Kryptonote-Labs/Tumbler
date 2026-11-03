import { PdfError } from "./objects.ts";

export interface PdfExecutionLimits {
  readonly maxOperations?: number;
  readonly maxElements?: number;
  readonly maxDepth?: number;
}
/** Host execution policy, shared by nested Forms and Type 3 glyphs for one page. */
export class PdfExecutionBudget {
  private operations = 0;
  private elements = 0;
  private depth = 0;
  constructor(private limits: PdfExecutionLimits = {}) {}
  step() {
    if (++this.operations > (this.limits.maxOperations ?? 200_000)) this.exceeded();
  }
  element() {
    if (++this.elements > (this.limits.maxElements ?? 50_000)) this.exceeded();
  }
  enter() {
    if (++this.depth > (this.limits.maxDepth ?? 128)) this.exceeded();
  }
  leave() {
    this.depth--;
  }
  private exceeded(): never {
    throw new PdfError("resource_limit", "PDF page interpretation exceeded its execution budget.");
  }
}
