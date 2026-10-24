import { wordInkSvg, type WordDrawing } from '@tumblerjs/word';
import { wordDisplayColour } from './word-display-colour.ts';

/** Map only engine-generated vector ink; imported pictures and raster composites retain their pixels. */
export function wordDisplayInkSvg(drawing: WordDrawing, background = '#ffffff'): string | undefined {
  return wordInkSvg(drawing)?.replace(/fill="(#[\da-f]{6})"/gi, (_, colour: string) => `style="fill:${wordDisplayColour(colour, background)}"`);
}
