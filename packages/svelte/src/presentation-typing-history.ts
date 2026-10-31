import type { PresentationTextRange } from "@tumblerjs/slides";

/** Groups adjacent browser typing only; operation identities remain the host's responsibility. */
export class PresentationTypingHistory {
  private previous: { kind: string; caret: number; time: number; id: string } | undefined;
  break() { this.previous = undefined; }
  group(kind: string, range: PresentationTextRange, value: string, time = Date.now()) {
    const previous = this.previous;
    const eligible = ["insertText", "deleteContentBackward", "deleteContentForward"].includes(kind)
      && !value.includes("\n");
    const adjacent = kind === "deleteContentBackward" ? range.end : range.start;
    const id = eligible && previous?.kind === kind && previous.caret === adjacent
      && time >= previous.time && time - previous.time < 1000
      ? previous.id : crypto.randomUUID();
    this.previous = eligible ? { kind, caret: range.start + value.length, time, id } : undefined;
    return id;
  }
}
