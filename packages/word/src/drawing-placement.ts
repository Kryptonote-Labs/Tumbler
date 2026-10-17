import type { WordDrawing } from './drawings.ts';

/** Explicit DrawingML coordinate bases, shared by pictures and retained graphics. */
export interface WordDrawingPosition {
  readonly wrap?: 'none';
  readonly layout?: 'inline' | 'front' | 'behind';
  readonly horizontalRelativeTo?: 'page' | 'column';
  readonly verticalRelativeTo?: 'page' | 'line' | 'paragraph';
  readonly x?: number;
  readonly y?: number;
}

export function isWordDrawingPosition(value: WordDrawingPosition): boolean {
  return (value.wrap === undefined || value.wrap === 'none') && (value.horizontalRelativeTo === undefined || ['page', 'column'].includes(value.horizontalRelativeTo)) &&
    (value.verticalRelativeTo === undefined || ['page', 'line', 'paragraph'].includes(value.verticalRelativeTo));
}

/** Convert painted coordinates to an explicit placement without a visual jump.
 * ECMA-376 Part 1 §20.4.2.11; MS-OI29500 §2.1.1355: use line, not paragraph, for new text-relative placements.
 */
export function wordDrawingPlacement(
  drawing: WordDrawing,
  box: { x: number; y: number },
  lineY: number,
  choice: { layout?: WordDrawingPosition['layout']; moveWithText?: boolean } = {},
): WordDrawingPosition {
  const layout = choice.layout ?? (drawing.placement === 'inline' ? 'inline' : drawing.anchor?.behindDocument ? 'behind' : 'front');
  if (layout === 'inline') return { layout };
  const move = choice.moveWithText ?? (drawing.placement === 'inline' || ['line', 'paragraph'].includes(drawing.anchor?.verticalRelativeTo ?? ''));
  return { layout, ...(choice.layout ? { wrap: 'none' as const } : {}), horizontalRelativeTo: 'page', verticalRelativeTo: move ? 'line' : 'page', x: box.x, y: box.y - (move ? lineY : 0) };
}
