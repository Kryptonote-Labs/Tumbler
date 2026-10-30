import type { SlideText, SlideTextRun } from './model.ts';
import type { SlideCanvasContext, SlideCanvasOptions } from './canvas-types.ts';

type Fragment = { text: string; run: SlideTextRun; width: number };
type Line = {
  fragments: Fragment[];
  width: number;
  height: number;
  x: number;
  before: number;
  after: number;
  align: string;
  bullet?: string;
};

function font(run: SlideTextRun, prepare?: (family: string) => string) {
  return `${run.italic ? 'italic ' : ''}${run.bold ? 'bold ' : ''}${run.fontSize}px ${JSON.stringify(prepare?.(run.fontFamily) ?? run.fontFamily)}`;
}

/** Wraps styled runs and respects paragraph spacing, insets, bullets and vertical anchoring. */
export function paintSlideText<Path, Image>(
  ctx: SlideCanvasContext<Path, Image>,
  text: SlideText,
  width: number,
  height: number,
  options: SlideCanvasOptions<Path, Image>,
) {
  const [top, right, bottom, left] = text.inset;
  const available = Math.max(1, width - left - right);
  const lines: Line[] = [];
  for (const paragraph of text.paragraphs) {
    const base = paragraph.runs[0] ?? paragraph.endRun;
    const size = paragraph.fontSize ?? base?.fontSize ?? 24;
    const lineHeight =
      typeof paragraph.lineHeight === 'number'
        ? paragraph.lineHeight * size
        : parseFloat(paragraph.lineHeight) || size * 1.2;
    let first = true;
    const makeLine = (): Line => ({
      fragments: [],
      width: 0,
      height: lineHeight,
      x: paragraph.marginLeft + (first ? paragraph.indent : 0),
      before: 0,
      after: 0,
      align: paragraph.align,
    });
    let line = makeLine();
    line.before = paragraph.before;
    if (paragraph.bullet && base) {
      const bulletRun = {
        ...base,
        fontFamily: paragraph.bulletFont ?? base.fontFamily,
        fontSize: paragraph.bulletSize ?? base.fontSize,
        color: paragraph.bulletColor ?? base.color,
      };
      ctx.font = font(bulletRun, options.prepareFont);
      const marker = paragraph.bullet;
      const markerWidth = Math.max(ctx.measureText(marker).width + size * 0.2, -paragraph.indent);
      line.fragments.push({ text: marker, run: bulletRun, width: markerWidth });
      line.width += markerWidth;
    }
    const flush = () => {
      lines.push(line);
      first = false;
      line = makeLine();
    };
    for (const run of paragraph.runs) {
      ctx.font = font(run, options.prepareFont);
      for (const token of run.text.split(/(\n|[^\S\n]+|[^\s]+)/u).filter(Boolean)) {
        if (token === '\n') {
          flush();
          continue;
        }
        let measured = ctx.measureText(token).width;
        const limit = Math.max(1, available - paragraph.marginLeft - (paragraph.marginRight ?? 0));
        if (text.wrap && line.width + measured > limit && line.fragments.length) flush();
        if (text.wrap && measured > limit) {
          for (const character of token) {
            measured = ctx.measureText(character).width;
            if (line.width + measured > limit && line.fragments.length) flush();
            line.fragments.push({ text: character, run, width: measured });
            line.width += measured;
          }
        } else {
          line.fragments.push({ text: token, run, width: measured });
          line.width += measured;
        }
        line.height = Math.max(
          line.height,
          run.fontSize * (typeof paragraph.lineHeight === 'number' ? paragraph.lineHeight : 1.2),
        );
      }
    }
    line.after += paragraph.after;
    lines.push(line);
  }
  const total = lines.reduce((sum, line) => sum + line.before + line.height + line.after, 0);
  const innerHeight = Math.max(1, height - top - bottom);
  const fit = text.autoFit === 'normal' ? Math.min(1, innerHeight / Math.max(1, total)) : 1;
  ctx.save();
  ctx.translate(
    left,
    top +
      (text.anchor === 'center'
        ? Math.max(0, (innerHeight - total * fit) / 2)
        : text.anchor === 'bottom'
          ? Math.max(0, innerHeight - total * fit)
          : 0),
  );
  ctx.scale(fit, fit);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = 0;
  for (const line of lines) {
    let x =
      line.x +
      (line.align === 'center'
        ? (available / fit - line.width) / 2
        : line.align === 'right'
          ? available / fit - line.width
          : 0);
    y += line.before + line.height;
    for (const fragment of line.fragments) {
      const { run } = fragment;
      ctx.font = font(run, options.prepareFont);
      ctx.fillStyle = run.color;
      const baseline = y - line.height * 0.2 - ((run.baseline ?? 0) * run.fontSize) / 100000;
      ctx.fillText(fragment.text, x, baseline);
      if (run.underline || run.strike) {
        ctx.beginPath();
        ctx.lineWidth = Math.max(0.7, run.fontSize / 16);
        ctx.strokeStyle = run.color;
        const offset = run.strike ? -run.fontSize * 0.3 : run.fontSize * 0.1;
        ctx.moveTo(x, baseline + offset);
        ctx.lineTo(x + fragment.width, baseline + offset);
        ctx.stroke();
      }
      x += fragment.width;
    }
    y += line.after;
  }
  ctx.restore();
}
