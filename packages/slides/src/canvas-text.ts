import type { SlideText, SlideTextRun } from './model.ts';
import { slideLineBox, slideParagraphFontSize } from './text-line-box.ts';
import type { SlideCanvasContext, SlideCanvasOptions } from './canvas-types.ts';

type Fragment = {
  text: string;
  run: SlideTextRun;
  width: number;
  font: string;
  justifyGap?: true;
  box: ReturnType<typeof slideLineBox>;
};
type Token = { kind: 'word' | 'space' | 'break'; fragments: Fragment[] };

// An inline style change within a word or a space sequence isn't a wrap opportunity.
function* textTokens(runs: readonly SlideTextRun[], measure: (text: string, run: SlideTextRun) => Fragment) {
  let pending: Token | undefined;
  for (const run of runs) {
    for (const value of run.text.match(/\r\n?|\n|[ \t]+|[^ \t\r\n]+/gu) ?? []) {
      const kind = value[0] === '\n' || value[0] === '\r' ? 'break' : /^[ \t]/u.test(value) ? 'space' : 'word';
      if (pending && (pending.kind !== kind || kind === 'break')) {
        yield pending;
        pending = undefined;
      }
      pending ??= { kind, fragments: [] };
      if (kind !== 'break') pending.fragments.push(measure(value, run));
    }
  }
  if (pending) yield pending;
}
type Line = {
  fragments: Fragment[];
  width: number;
  ascent: number;
  descent: number;
  x: number;
  before: number;
  after: number;
  align: string;
  limit: number;
  softWrap: boolean;
  gaps: number;
};

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
  const font = (size: number, run?: SlideTextRun) => {
    const family = run?.fontFamily ?? 'Arial';
    const primary = options.prepareFont?.(family) ?? family;
    const stack =
      options.fontFamily?.(family) ??
      [primary, ...(options.fallbackFonts ?? []).filter((name) => name !== primary)]
        .map((name) => JSON.stringify(name))
        .join(', ');
    return `${run?.italic ? 'italic ' : ''}${run?.bold ? 'bold ' : ''}${size}px ${stack}`;
  };
  const lines: Line[] = [];
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  for (const paragraph of text.paragraphs) {
    const base = paragraph.runs[0] ?? paragraph.endRun;
    const size = slideParagraphFontSize(paragraph);
    const boxes = new Map<string, ReturnType<typeof slideLineBox>>();
    const box = (family: string, fontSize: number) => {
      let metrics = boxes.get(family);
      if (!metrics) {
        metrics = slideLineBox(ctx.measureText(' '), fontSize, paragraph.lineHeight);
        boxes.set(family, metrics);
      }
      return metrics;
    };
    ctx.font = font(size, base);
    const strut = box(ctx.font, size);
    let first = true;
    const makeLine = (): Line => {
      const x = paragraph.marginLeft + (first ? paragraph.indent : 0);
      return {
        fragments: [],
        width: 0,
        ...strut,
        x,
        before: 0,
        after: 0,
        align: paragraph.align,
        limit: Math.max(1, available - x - (paragraph.marginRight ?? 0)),
        softWrap: false,
        gaps: 0,
      };
    };
    let line = makeLine();
    line.before = paragraph.before;
    const measure = (value: string, run: SlideTextRun): Fragment => {
      const cssFont = font(run.fontSize, run);
      ctx.font = cssFont;
      return { text: value, run, width: ctx.measureText(value).width, font: cssFont, box: box(cssFont, run.fontSize) };
    };
    const append = (fragment: Fragment) => {
      line.fragments.push(fragment);
      line.width += fragment.width;
      line.ascent = Math.max(line.ascent, fragment.box.ascent);
      line.descent = Math.max(line.descent, fragment.box.descent);
    };
    if (paragraph.bullet && base && paragraph.runs.some((run) => run.text.trim())) {
      const bullet = measure(paragraph.bullet, {
        ...base,
        fontFamily: paragraph.bulletFont ?? base.fontFamily,
        fontSize: paragraph.bulletSize ?? base.fontSize,
        color: paragraph.bulletColor ?? base.color,
      });
      append({ ...bullet, width: Math.max(bullet.width, -paragraph.indent) });
    }
    let hasWord = false;
    const flush = (softWrap: boolean) => {
      line.softWrap = softWrap;
      hasWord = false;
      lines.push(line);
      first = false;
      line = makeLine();
    };
    let spaces: Fragment[] = [];
    for (const token of textTokens(paragraph.runs, measure)) {
      if (token.kind === 'break') {
        if (!text.wrap) spaces.forEach(append);
        flush(false);
        spaces = [];
        continue;
      }
      if (token.kind === 'space') {
        spaces = token.fragments;
        continue;
      }
      const wordWidth = token.fragments.reduce((sum, fragment) => sum + fragment.width, 0);
      const spaceWidth = spaces.reduce((sum, fragment) => sum + fragment.width, 0);
      if (text.wrap && hasWord && line.width + spaceWidth + wordWidth > line.limit) {
        flush(true);
      } else {
        if (hasWord && spaces.length) {
          const last = spaces.at(-1);
          if (last) last.justifyGap = true;
          line.gaps++;
        }
        spaces.forEach(append);
      }
      spaces = [];
      if (text.wrap && wordWidth > line.limit) {
        for (const fragment of token.fragments) {
          for (const character of fragment.text) {
            const glyph = measure(character, fragment.run);
            if (line.width + glyph.width > line.limit && hasWord) flush(true);
            append(glyph);
            hasWord = true;
          }
        }
      } else {
        token.fragments.forEach(append);
        hasWord = true;
      }
    }
    if (!text.wrap) spaces.forEach(append);
    line.after += paragraph.after;
    lines.push(line);
  }
  const total = lines.reduce((sum, line) => sum + line.before + line.ascent + line.descent + line.after, 0);
  const innerHeight = Math.max(1, height - top - bottom);
  // Run sizes already include the saved normAutofit fontScale.
  // Preserve overflow and anchoring instead of applying another display-only fit.
  const clipX = text.horizontalOverflow === 'clip';
  const clipY = text.verticalOverflow === 'clip';
  if (clipX || clipY) {
    // Keep the other axis open beyond the laid-out text, without a fixed coordinate limit.
    const extent = lines.reduce((extent, line) => {
      const glyphExtent = line.fragments.reduce(
        (size, { run }) => Math.max(size, run.fontSize * (1 + Math.abs(run.baseline ?? 0))),
        0,
      );
      return Math.max(extent, Math.abs(line.x) + line.width + width, height + Math.abs(total) + glyphExtent);
    }, width + height + Math.abs(total)) + text.inset.reduce((sum, value) => sum + Math.abs(value), 0);
    ctx.beginPath();
    ctx.rect(clipX ? 0 : -extent, clipY ? 0 : -extent, clipX ? width : extent * 2, clipY ? height : extent * 2);
    ctx.clip();
  }
  ctx.translate(
    left,
    top +
      (text.anchor === 'center'
        ? (innerHeight - total) / 2
        : text.anchor === 'bottom'
          ? innerHeight - total
          : 0),
  );
  ctx.textAlign = 'left';
  let y = 0;
  for (const line of lines) {
    const remaining = line.limit - line.width;
    const justify = line.align === 'justify' && line.softWrap && line.gaps
      ? Math.max(0, remaining) / line.gaps
      : 0;
    let x = line.x +
      (line.align === 'center' ? remaining / 2 : line.align === 'right' ? remaining : 0);
    y += line.before + line.ascent;
    for (const fragment of line.fragments) {
      const { run } = fragment;
      ctx.font = fragment.font;
      ctx.fillStyle = run.color;
      const baseline = y - (run.baseline ?? 0) * run.fontSize;
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
      x += fragment.width + (fragment.justifyGap ? justify : 0);
    }
    y += line.descent + line.after;
  }
  ctx.restore();
}
