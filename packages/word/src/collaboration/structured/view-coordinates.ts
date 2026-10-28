import type { WordViewSpan } from './view-projection.ts';

export function sourceSpanEnd(span: WordViewSpan) {
  return span.virtual ? span.offset : (span.sourceEnd ?? span.offset + span.end - span.start);
}

/** A normalized CRLF is one display character with a two-character source range. */
export function sourcePosition(span: WordViewSpan, at: number) {
  if (span.virtual || at <= span.start) return span.offset;
  if (at >= span.end) return sourceSpanEnd(span);
  return span.offset + at - span.start;
}

export function viewPosition(span: WordViewSpan, at: number) {
  if (span.virtual || at <= span.offset) return span.start;
  if (span.sourceEnd !== undefined || at >= sourceSpanEnd(span)) return span.end;
  return span.start + at - span.offset;
}
