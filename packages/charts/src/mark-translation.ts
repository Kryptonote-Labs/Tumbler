import type { ChartMark } from './scene-marks.ts';

/** Move scene geometry and its brushes together; chart paths use absolute M/L/C/A/Z commands. */
export function translateChartMark(original: ChartMark, x: number, y: number): ChartMark {
  let mark = original;
  if (mark.fillGradient) mark = { ...mark, fillGradient: { ...mark.fillGradient, bounds: { ...mark.fillGradient.bounds, x: mark.fillGradient.bounds.x + x, y: mark.fillGradient.bounds.y + y } } };
  if (mark.fillPattern) mark = { ...mark, fillPattern: { ...mark.fillPattern, bounds: { ...mark.fillPattern.bounds, x: mark.fillPattern.bounds.x + x, y: mark.fillPattern.bounds.y + y } } };
  if (mark.fillPicture) mark = { ...mark, fillPicture: { ...mark.fillPicture, bounds: { ...mark.fillPicture.bounds, x: mark.fillPicture.bounds.x + x, y: mark.fillPicture.bounds.y + y } } };
  switch (mark.kind) {
    case 'group': return { ...mark, ...(mark.clip ? { clip: { ...mark.clip, x: mark.clip.x + x, y: mark.clip.y + y } } : {}), marks: mark.marks.map(mark => translateChartMark(mark, x, y)) };
    case 'text': case 'rect': return { ...mark, x: mark.x + x, y: mark.y + y };
    case 'circle': return { ...mark, cx: mark.cx + x, cy: mark.cy + y };
    case 'line': return { ...mark, x1: mark.x1 + x, x2: mark.x2 + x, y1: mark.y1 + y, y2: mark.y2 + y };
    case 'path': return { ...mark, d: mark.d.replace(/([MLCA])\s*([^MLCAZ]+)/g, (_, command: string, values: string) => {
      const numbers = values.trim().split(/[\s,]+/).map(Number);
      for (let index = command === 'A' ? 5 : 0; index < numbers.length; index += command === 'A' ? 7 : 2) {
        numbers[index] = numbers[index]! + x; numbers[index + 1] = numbers[index + 1]! + y;
      }
      return command + ' ' + numbers.join(' ') + ' ';
    }) };
  }
}
