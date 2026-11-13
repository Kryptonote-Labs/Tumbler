import type { WordDrawingPosition } from './drawing-placement.ts';

export type DocumentImage = WordDrawingPosition & {
  id: string;
  type: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  alt: string;
  alignment?: 'left' | 'center' | 'right';
  moveWithText?: boolean;
};
