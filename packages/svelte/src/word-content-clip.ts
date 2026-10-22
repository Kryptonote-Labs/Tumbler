import { wordPointsToCssPixels as pixels, type WordContentBounds } from '@tumblerjs/word';

/** Clip page-point bounds relative to a positioned content element's origin. */
export function wordContentClipCss(clip: WordContentBounds | undefined, originX = 0, originY = 0): string {
  if (!clip) return '';
  const x = pixels(clip.x - originX), y = pixels(clip.y - originY);
  const right = x + pixels(clip.width), bottom = y + pixels(clip.height);
  return `clip-path:polygon(${x}px ${y}px,${right}px ${y}px,${right}px ${bottom}px,${x}px ${bottom}px)`;
}
