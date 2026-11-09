import type { FormattingPatch } from '@tumblerjs/core';
import type { SlideObject } from './model.ts';
import type { PresentationCommand } from './commands.ts';
import { presentationTextTarget, slideColorHex, slideTextValue } from './editing.ts';
export interface PresentationFormatPainterSample {
  text?: FormattingPatch | undefined;
  shape?: Pick<Extract<PresentationCommand, { name: 'style-shape' }>, 'fill' | 'stroke' | 'strokeWidth'>;
}
/** Sample resolved text and shape appearance without content, identity or geometry. */
export function presentationFormatPainterSample(object: SlideObject, offset = 0, cell?: { row: number; column: number }): PresentationFormatPainterSample {
  const target = presentationTextTarget(object, cell);
  let at = 0;
  let chosen = target.text?.paragraphs[0]?.runs[0];
  let paragraph = target.text?.paragraphs[0];
  for (const p of target.text?.paragraphs ?? []) {
    for (const run of p.runs) {
      if (at <= offset && offset <= at + run.text.length) { chosen = run; paragraph = p; }
      at += run.text.length;
    }
    at++;
  }
  const text: FormattingPatch | undefined = chosen ? { text: {
    fontFamily: { set: chosen.fontFamily }, fontSize: { set: chosen.fontSize * 0.75 },
    bold: { set: chosen.bold }, italic: { set: chosen.italic },
    underline: { set: chosen.underline ? 'single' : 'none' },
    color: { set: { type: 'rgb', value: slideColorHex(chosen.color) } },
  }, block: { horizontalAlignment: { set: paragraph?.align === 'left' ? 'start' : paragraph?.align === 'right' ? 'end' : paragraph?.align ?? 'start' } } } : undefined;
  return { text, ...(!cell && object.kind === 'shape' && !object.pattern && !object.pictureFill ? {
    shape: { fill: object.gradient ? { kind: 'gradient', type: object.gradient.kind, angle: object.gradient.angle, scaled: object.gradient.scaled, center: [...object.gradient.center], stops: object.gradient.stops.map(stop => ({ offset: stop.offset, color: slideColorHex(stop.color), opacity: Number(/,([\d.]+)\)$/.exec(stop.color)?.[1] ?? 1) })) } : object.fill === 'none' ? 'none' : slideColorHex(object.fill), stroke: object.stroke === 'none' ? 'none' : slideColorHex(object.stroke), strokeWidth: object.strokeWidth },
  } : {}) };
}
export function presentationFormatPainterCommands(sample: PresentationFormatPainterSample, slideId: string, object: SlideObject,
  range?: { start: number; end: number }, cell?: { row: number; column: number }): Exclude<PresentationCommand, { name: 'batch' }>[] {
  const target = presentationTextTarget(object, cell);
  if (range && range.start === range.end) {
    const word = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(slideTextValue(target)).containing(range.start);
    range = word?.isWordLike ? { start: word.index, end: word.index + word.segment.length } : { start: 0, end: slideTextValue(target).length };
  }
  const commands: Exclude<PresentationCommand, { name: 'batch' }>[] = [];
  if (sample.text && target.textEditable) commands.push({ name: 'format-text', slideId, objectKey: object.key, cell,
    start: range?.start ?? 0, end: range && range.end > range.start ? range.end : slideTextValue(target).length, patch: sample.text });
  if (sample.shape && !cell && object.kind === 'shape') commands.push({ name: 'style-shape', slideId, objectKey: object.key, ...sample.shape });
  return commands;
}
