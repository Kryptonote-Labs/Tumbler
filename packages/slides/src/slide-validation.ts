import { drawingGradientOffset } from '@tumblerjs/ooxml';
import { layoutSlideText, type SlideTextMeasurer } from './canvas-text.ts';
import type { SlideCanvasOptions } from './canvas-types.ts';
import type { Matrix, PresentationDocument, PresentationSlide, SlideObject } from './model.ts';

export type SlideWarningCode =
  | 'overflow'
  | 'off-slide'
  | 'margin'
  | 'small-text'
  | 'dense'
  | 'empty-band'
  | 'overlap'
  | 'underfilled'
  | 'collision'
  | 'inconsistent'
  | 'alignment'
  | 'empty-panel'
  | 'title-drift'
  | 'repetition'
  | 'visuals'
  | 'icon'
  | 'cut'
  | 'contrast'
  | 'empty-placeholder'
  | 'manual-break'
  | 'mixed-size';
export interface SlideWarning {
  readonly code: SlideWarningCode;
  readonly objectKey?: string;
  readonly message: string;
}
export interface SlideValidationOptions
  extends Pick<SlideCanvasOptions<unknown, unknown>, 'prepareFont' | 'fallbackFonts'> {
  /** A text measurer using the alphabetic baseline and the fonts the renderer paints with. */
  readonly measurer: SlideTextMeasurer;
  /** A deck read without a presenter, such as a pre-read or handout, carries more words per slide. */
  readonly reading?: boolean;
}
type Rect = { x: number; y: number; width: number; height: number };
type LaidOut = {
  object: SlideObject;
  bounds: Rect;
  content: Rect;
  words: number;
  /** The share of the text area's height the laid-out text occupies. */
  fill: number;
  /** The text area's height in slide pixels. */
  space: number;
  /** Laid-out lines that carry text. */
  lines: number;
};

const pointsPerPixel = 0.75;
const words = (text: string) => text.match(/\S+/gu)?.length ?? 0;
const monospace = (family: string) => /mono|consol|courier|code/iu.test(family);
const objectText = (object: SlideObject) =>
  object.text?.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n') ?? '';

function mapRect(matrix: Matrix, rect: Rect): Rect {
  const [a, b, c, d, e, f] = matrix;
  const xs: number[] = [], ys: number[] = [];
  for (const [x, y] of [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]] as const) {
    xs.push(a * x + c * y + e);
    ys.push(b * x + d * y + f);
  }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 &&
  inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;
function intersection(a: Rect, b: Rect) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? { width, height } : undefined;
}
/** Parses an opaque `#rrggbb` or `rgb()`/`rgba()` colour into 0-1 channels; translucent colours are skipped. */
function opaqueColor(value: string | undefined) {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/iu.exec(value ?? '');
  if (hex) {
    if (hex[2] && hex[2].toLowerCase() !== 'ff') return undefined;
    return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16) / 255);
  }
  const rgb = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/u.exec(value ?? '');
  if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) < 1)) return undefined;
  return rgb.slice(1, 4).map((n) => Number(n) / 255);
}
function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: number[], b: number[]) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Lays out each text object as the renderer would and reports the text's painted bounds. */
function layOut(object: SlideObject, options: SlideValidationOptions) {
  const { width, height } = object.transform;
  const bounds = mapRect(object.matrix, { x: 0, y: 0, width, height });
  // A shape's empty text body, such as a bar or tile, has nothing to lay out.
  if (!object.text || !objectText(object).trim())
    return { overflow: undefined, laidOut: { object, bounds, content: bounds, words: 0, fill: 1, space: 0, lines: 0 } };
  const [x0, y0, x1, y1] = object.drawingGeometry?.textRect ?? [0, 0, width, height];
  const layout = layoutSlideText(options.measurer, object.text, x1 - x0, y1 - y0, options);
  let left = Infinity, right = -Infinity;
  for (const line of layout.lines) {
    if (!line.fragments.some((fragment) => fragment.text.trim())) continue;
    const remaining = line.limit - line.width;
    const start = layout.left + line.x + (line.align === 'center' ? remaining / 2 : line.align === 'right' ? remaining : 0);
    left = Math.min(left, start);
    right = Math.max(right, start + line.width);
  }
  const content = Number.isFinite(left)
    ? mapRect(object.matrix, { x: x0 + left, y: y0 + layout.offset, width: right - left, height: layout.total })
    : bounds;
  const wide = layout.lines.some((line) => line.width > line.limit + 2);
  // Insets are padding: text may run into them, but not past the shape's own edge.
  const space = y1 - y0;
  const spills = layout.offset < -4 || layout.offset + layout.total > space + 4;
  const overflow = spills || wide
    ? { needed: Math.ceil(layout.total + object.text.inset[0] + object.text.inset[2]), available: Math.floor(space), wide }
    : undefined;
  return {
    overflow,
    laidOut: { object, bounds, content, words: words(objectText(object)), fill: layout.total / Math.max(1, layout.innerHeight), space, lines: layout.lines.filter((line) => line.fragments.some((fragment) => fragment.text.trim())).length },
  };
}

/** Flags measurable layout and readability problems on one slide, using the renderer's text layout. */
export function validatePresentationSlide(
  document: PresentationDocument,
  slide: PresentationSlide,
  options: SlideValidationOptions,
): SlideWarning[] {
  return checkSlide(document, slide, options).warnings;
}
type SlideTitle = { key: string; size: number; bold: boolean; x: number; y: number };

function checkSlide(document: PresentationDocument, slide: PresentationSlide, options: SlideValidationOptions) {
  const warnings: SlideWarning[] = [];
  const scale = 1280 / document.width;
  const points = (pixels: number) => Math.round(pixels * pointsPerPixel * scale * 10) / 10;
  const margin = 32 / scale;
  const slideRect = { x: 0, y: 0, width: document.width, height: document.height };
  const own = slide.objects.filter((object) => object.layer === 'slide');
  const laid = new Map<SlideObject, LaidOut>();
  for (const object of own) {
    const { overflow, laidOut } = layOut(object, options);
    laid.set(object, laidOut);
    if (overflow)
      warnings.push({
        code: 'overflow',
        objectKey: object.key,
        message: overflow.wide
          ? 'Text is wider than its box. Enable wrapping, widen the box, or shorten the line.'
          : `Text needs ${overflow.needed}px including padding but its box is ${overflow.available}px tall. Enlarge the box into free space, cut words, or split the slide. Do not shrink the type below the scale table.`,
      });
  }
  const texts = [...laid.values()].filter((item) => item.words > 0);
  const sizes = new Map<SlideObject, { size: number; bold: boolean; color: string; family: string; code: boolean }>();
  for (const { object, words: count } of texts) {
    const runs = object.text!.paragraphs.flatMap((p) => p.runs).filter((run) => run.text.trim());
    sizes.set(object, {
      size: points(runs.reduce((sum, run) => sum + run.fontSize * words(run.text), 0) / Math.max(1, count)),
      bold: runs.every((run) => run.bold),
      color: runs[0]?.color ?? '',
      family: runs[0]?.fontFamily ?? '',
      code: runs.every((run) => monospace(run.fontFamily)),
    });
  }
  const page = opaqueColor(slide.background)?.join();
  // A fill matching the slide background is invisible, so the box is plain text.
  const visible = (object: SlideObject) =>
    object.kind !== 'shape' || (object.fill !== 'none' && opaqueColor(object.fill)?.join() !== page);
  const captions = texts.filter(({ object }) => !sizes.get(object)!.code && sizes.get(object)!.size < 18);
  for (const { object, content, words: count, fill, space } of texts) {
    const key = object.key;
    const outside = content.x < -1 || content.y < -1 || content.x + content.width > document.width + 1 || content.y + content.height > document.height + 1;
    if (outside)
      warnings.push({ code: 'off-slide', objectKey: key, message: 'Text extends past the slide edge.' });
    else {
      const gaps = { left: content.x, top: content.y, right: document.width - content.x - content.width, bottom: document.height - content.y - content.height };
      const tight = Object.entries(gaps).filter(([, gap]) => gap < margin);
      if (tight.length)
        warnings.push({
          code: 'margin',
          objectKey: key,
          message: `Text sits ${tight.map(([side, gap]) => `${Math.max(0, Math.round(gap * scale))}px from the ${side} edge`).join(' and ')}. Keep text inside 64px side and 56px top and bottom margins.`,
        });
    }
    const runs = object.text!.paragraphs.flatMap((p) => p.runs).filter((run) => run.text.trim());
    const code = runs.every((run) => monospace(run.fontFamily));
    const smallest = Math.min(...runs.map((run) => run.fontSize));
    const weighted = runs.reduce((sum, run) => sum + run.fontSize * words(run.text), 0) / Math.max(1, count);
    if (points(smallest) < 12)
      warnings.push({ code: 'small-text', objectKey: key, message: `Text at ${points(smallest)}pt is below the 12pt minimum.` });
    else if (count >= 4 && points(weighted) < (code ? 16 : 18))
      warnings.push({ code: 'small-text', objectKey: key, message: `${count} words at ${points(weighted)}pt. Body text is 24-32pt with an 18pt minimum. Enlarge the type and box together; if it no longer fits, split the slide or move detail to speaker notes.` });
    else if (points(smallest) < 14)
      warnings.push({ code: 'small-text', objectKey: key, message: `A ${points(smallest)}pt label is hard to read. Use 14pt or larger, or remove the label.` });
    const underfilled = !code && fill < 0.45 && space * scale >= 160 && points(weighted) < 24;
    if (underfilled) {
      const suggested = Math.min(40, Math.max(24, Math.round((points(weighted) * Math.sqrt(0.7 / Math.max(fill, 0.05))) / 2) * 2));
      warnings.push({ code: 'underfilled', objectKey: key, message: `Text at ${points(weighted)}pt fills ${Math.round(fill * 100)}% of its box. Try about ${suggested}pt, or shrink the box and give the space to the focal element.` });
    }
    if (!code && object.text!.paragraphs.some((p) => /[\n\v\r]| {2,}/u.test(p.runs.map((r) => r.text).join('').trim()) || /^ {2,}/u.test(p.runs[0]?.text ?? '')))
      warnings.push({ code: 'manual-break', objectKey: key, message: 'Line breaks or runs of spaces shape this text. Let text wrap and use separate paragraphs, indents or text boxes. Code in a monospace font may keep its lines.' });
    // A size change inside a sentence is almost always a partial format left by an edit.
    const mixed = object.text!.paragraphs.find((p) => {
      const sized = p.runs.filter((run) => /\p{L}/u.test(run.text));
      return words(sized.map((run) => run.text).join('')) >= 4 && sized.some((run) => Math.abs(run.fontSize - sized[0]!.fontSize) > 1);
    });
    if (mixed) {
      const sizes = [...new Set(mixed.runs.filter((run) => /\p{L}/u.test(run.text)).map((run) => points(run.fontSize)))];
      warnings.push({ code: 'mixed-size', objectKey: key, message: `One paragraph mixes ${sizes.join('pt and ')}pt text. Format the whole paragraph at one size.` });
    }
    if (crossesHardStop(document, slide, content))
      warnings.push({ code: 'cut', objectKey: key, message: 'Text crosses the hard edge of a two-tone background. Keep it wholly on one tone and align it away from the cut.' });
    const backdrops = backdropColors(document, slide, object, content);
    const ink = opaqueColor(runs[0]?.color);
    if (backdrops && ink) {
      const ratio = Math.min(...backdrops.map((backdrop) => contrast(ink, backdrop)));
      const large = points(smallest) >= 24 || (points(smallest) >= 18.5 && runs.every((run) => run.bold));
      if (ratio < (large ? 3 : 4.5))
        warnings.push({ code: 'contrast', objectKey: key, message: `Text contrast is ${ratio.toFixed(1)}:1 against its background. Use at least ${large ? 3 : 4.5}:1.` });
    }
  }
  for (const [i, a] of texts.entries())
    for (const b of texts.slice(i + 1)) {
      const overlap = intersection(a.content, b.content);
      if (overlap && overlap.width > 4 && overlap.height > 4)
        warnings.push({ code: 'overlap', objectKey: b.object.key, message: `Text overlaps the text of ${a.object.key}.` });
    }
  for (const object of own)
    if (object.placeholder && object.kind === 'shape' && !objectText(object).trim())
      warnings.push({ code: 'empty-placeholder', objectKey: object.key, message: 'Empty placeholder. Fill it or delete it.' });
  if (captions.length > 2)
    warnings.push({
      code: 'small-text',
      message: `${captions.length} text boxes are under 18pt (${captions.map(({ object }) => object.key).join(', ')}). A slide may have at most two small captions or labels. Set descriptions at 18pt or larger, merge them, or move them to speaker notes.`,
    });
  for (const { object, content } of texts)
    for (const other of laid.values()) {
      if (other.object === object || (!visible(other.object) && other.object.stroke === 'none')) continue;
      if (contains(other.bounds, content)) continue;
      // Text needs clear space around neighbouring shapes, not just no overlap.
      const pad = 8 / scale;
      const near = { x: other.bounds.x - pad, y: other.bounds.y - pad, width: other.bounds.width + pad * 2, height: other.bounds.height + pad * 2 };
      const hit = intersection(content, near);
      if (!hit || hit.width <= 2 || hit.height <= 2) continue;
      warnings.push({ code: 'collision', objectKey: object.key, message: `Text touches or runs into ${other.object.key}. Leave at least 16px between them, or put the text fully inside the shape.` });
      break;
    }
  const rows = new Map<number, LaidOut[]>();
  for (const item of texts) {
    if (item.words > 8) continue;
    const row = [...rows.keys()].find((top) => Math.abs(top - item.content.y) <= 6) ?? item.content.y;
    rows.set(row, [...(rows.get(row) ?? []), item]);
  }
  for (const row of rows.values()) {
    const groups = new Map<string, LaidOut[]>();
    for (const item of row) {
      const style = sizes.get(item.object)!;
      const id = `${style.bold}:${style.color}:${style.family}`;
      groups.set(id, [...(groups.get(id) ?? []), item]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const counts = new Map<number, number>();
      for (const item of group) counts.set(sizes.get(item.object)!.size, (counts.get(sizes.get(item.object)!.size) ?? 0) + 1);
      const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      for (const item of group) {
        const size = sizes.get(item.object)!.size;
        if (Math.abs(size - common) > 1)
          warnings.push({ code: 'inconsistent', objectKey: item.object.key, message: `Set at ${size}pt while matching items in the same row use ${common}pt. Give parallel items identical styling.` });
      }
    }
  }
  // Free-standing text shares left edges; centring belongs inside pills, buttons and panels.
  const filled = [...laid.values()].filter(({ object }) => visible(object));
  const loose = texts.filter(({ object, content, words: count }) =>
    count >= 3 && !visible(object) && !filled.some((item) => item.object !== object && contains(item.bounds, content)));
  const align = (item: LaidOut) => item.object.text!.paragraphs.find((p) => p.runs.some((run) => run.text.trim()))?.align;
  if (loose.some((item) => align(item) === 'left'))
    for (const item of loose.filter((item) => align(item) === 'center'))
      warnings.push({ code: 'alignment', objectKey: item.object.key, message: 'Centered text on a slide of left-aligned text. Left-align it to a shared edge, or remove it if it only restates the slide.' });
  for (const panel of filled) {
    if (panel.words || panel.bounds.width * panel.bounds.height < document.width * document.height * 0.05) continue;
    const inside = [...laid.values()].filter((item) => item !== panel && contains(panel.bounds, item.content));
    if (!inside.some((item) => item.words)) continue;
    const left = Math.min(...inside.map((item) => item.content.x)), top = Math.min(...inside.map((item) => item.content.y));
    const right = Math.max(...inside.map((item) => item.content.x + item.content.width));
    const bottom = Math.max(...inside.map((item) => item.content.y + item.content.height));
    const share = ((right - left) * (bottom - top)) / (panel.bounds.width * panel.bounds.height);
    if (share < 0.4)
      warnings.push({ code: 'empty-panel', objectKey: panel.object.key, message: `This panel's content covers ${Math.round(share * 100)}% of it. Shrink the panel to its content plus about 32px of padding, or enlarge the content.` });
  }
  // Icons are roughly square custom shapes. A unit is the icon, or the tile it sits in.
  const icons = [...laid.values()].filter(({ object, bounds, words: count }) =>
    object.geometry === 'custom' && !count && bounds.width > 0 &&
    Math.abs(bounds.width / bounds.height - 1) < 0.25 && bounds.width * scale <= 480);
  const units = icons.map((icon) => {
    const tile = filled.find((item) => item.object !== icon.object && !item.words &&
      contains(item.bounds, icon.bounds) && item.bounds.width <= icon.bounds.width * 3);
    return { icon, unit: tile ?? icon, tiled: !!tile, size: Math.round((tile ?? icon).bounds.width * scale) };
  });
  const small = units.filter((unit) => unit.size < 160);
  for (const { icon, unit, tiled, size } of small) {
    if (!tiled && size < 56) {
      warnings.push({ code: 'icon', objectKey: icon.object.key, message: `A ${size}px icon reads as a stray mark. Put it in a tile (a tinted circle or rounded square about twice its size) or make it a hero icon of 160px or more.` });
      continue;
    }
    // The text an icon leads sits just below or beside it and shares an edge or a centre line.
    const below = texts.find(({ content }) =>
      content.y >= unit.bounds.y + unit.bounds.height - 4 && content.y - (unit.bounds.y + unit.bounds.height) < 120 / scale &&
      content.x < unit.bounds.x + unit.bounds.width && content.x + content.width > unit.bounds.x);
    const beside = texts.find(({ content }) =>
      content.x >= unit.bounds.x + unit.bounds.width - 4 && content.x - (unit.bounds.x + unit.bounds.width) < 64 / scale &&
      content.y < unit.bounds.y + unit.bounds.height && content.y + content.height > unit.bounds.y);
    const centre = (rect: Rect, axis: 'x' | 'y') => axis === 'x' ? rect.x + rect.width / 2 : rect.y + rect.height / 2;
    const aligned = below
      ? Math.abs(below.content.x - unit.bounds.x) <= 6 / scale || Math.abs(centre(below.content, 'x') - centre(unit.bounds, 'x')) <= 6 / scale
      : beside
        ? Math.abs(beside.content.y - unit.bounds.y) <= 6 / scale || Math.abs(centre(beside.content, 'y') - centre(unit.bounds, 'y')) <= 8 / scale
        : false;
    if (!aligned)
      warnings.push({ code: 'icon', objectKey: icon.object.key, message: below || beside
        ? `This icon does not line up with ${(below ?? beside)!.object.key}. Align its ${below ? 'left edge or centre' : 'top or centre'} with the text it leads.`
        : 'This icon does not lead any text. Place it directly above or beside the idea it stands for, or remove it.' });
  }
  if (small.length === 1 && texts.length > 2)
    warnings.push({ code: 'icon', objectKey: small[0]!.icon.object.key, message: 'A single small icon reads as decoration. Use a matching set for parallel ideas, or one hero icon of 160px or more.' });
  const total = texts.reduce((sum, item) => sum + item.words, 0);
  if (total > (options.reading ? 90 : 45))
    warnings.push({ code: 'dense', message: options.reading
      ? `${total} words on the slide. A reading deck carries about 60 words per slide; split the slide or move detail to speaker notes.`
      : `${total} words on the slide. Aim for about 25 words of body text; split the slide or move detail to speaker notes. Keep each slide readable on its own, then enlarge the type into the space you freed.` });
  const area = document.width * document.height;
  const content = [...laid.values()]
    // Captions may sit apart from the content, such as a byline or source.
    .filter(({ object }) => !captions.some((caption) => caption.object === object))
    .filter(({ object, bounds, words: count }) =>
      count > 0 || (object.kind !== 'shape' || object.fill !== 'none' || object.stroke !== 'none') &&
        intersection(bounds, slideRect) !== undefined &&
        bounds.width * bounds.height < area * 0.5 && bounds.height < document.height * 0.9)
    .map((item) => item.content);
  if (content.length) {
    const top = Math.min(...content.map((rect) => rect.y));
    const bottom = document.height - Math.max(...content.map((rect) => rect.y + rect.height));
    if (bottom > document.height * 0.22 && bottom > top * 2)
      warnings.push({ code: 'empty-band', message: `The bottom ${Math.round((bottom / document.height) * 100)}% of the slide is empty. Enlarge the focal element or center the content vertically.` });
    const spans = content.map((rect) => [rect.y, rect.y + rect.height] as const).sort((a, b) => a[0] - b[0]);
    let reach = spans[0]![1];
    for (const [start, end] of spans.slice(1)) {
      if (start - reach > document.height * 0.15) {
        warnings.push({ code: 'empty-band', message: `Nothing sits between y=${Math.round(reach * scale)} and y=${Math.round(start * scale)}. Close the gap: enlarge the content above it or move the content below it up.` });
        break;
      }
      reach = Math.max(reach, end);
    }
  }
  // A content slide's title is its largest text near the top, set like a heading rather than a statement.
  const heading = texts
    .filter(({ object, content }) => content.y < document.height * 0.22 && sizes.get(object)!.size >= 28 && sizes.get(object)!.size <= 48)
    .sort((a, b) => sizes.get(b.object)!.size - sizes.get(a.object)!.size)[0];
  if (heading && heading.lines > 1)
    warnings.push({ code: 'title-drift', objectKey: heading.object.key, message: `The title wraps to ${heading.lines} lines, which moves it and the content below compared with other slides. Shorten it to one line.` });
  const title: SlideTitle | undefined = heading && {
    key: heading.object.key,
    size: sizes.get(heading.object)!.size,
    bold: sizes.get(heading.object)!.bold,
    x: Math.round(heading.content.x * scale),
    y: Math.round(heading.content.y * scale),
  };
  // A coarse layout fingerprint: the focal scale, how many text columns, and the kind of visual.
  const largest = Math.max(0, ...[...sizes.values()].map((style) => style.size));
  const edges: number[] = [];
  for (const { content, words: count } of texts)
    if (count >= 2 && !edges.some((edge) => Math.abs(edge - content.x) < 24 / scale)) edges.push(content.x);
  const visual = own.find((object) => object.kind !== 'shape' && object.kind !== 'unsupported')?.kind ??
    (own.some((object) => object.geometry === 'custom') ? 'icon' : 'text');
  const layout = `${largest >= 60 ? 'hero' : 'plain'}:${Math.min(edges.length, 4)}:${visual}`;
  return { warnings, title, layout, hero: largest >= 60, visual: visual !== 'text', icons: small.map(({ icon, size }) => ({ key: icon.object.key, size })) };
}

/** Whether a rectangle spans a hard stop of the slide's linear gradient background. */
function crossesHardStop(document: PresentationDocument, slide: PresentationSlide, rect: Rect) {
  const gradient = slide.backgroundGradient;
  if (!gradient || gradient.kind !== 'linear' || slide.backgroundPicture || slide.backgroundPattern) return false;
  const edges = gradient.stops
    .slice(1)
    .filter((stop, index) => stop.offset === gradient.stops[index]!.offset && stop.color !== gradient.stops[index]!.color)
    .map((stop) => stop.offset);
  if (!edges.length) return false;
  const offset = drawingGradientOffset(gradient, document.width, document.height);
  const at = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]].map(([x, y]) => offset(x!, y!));
  return edges.some((edge) => Math.min(...at) < edge - 0.002 && Math.max(...at) > edge + 0.002);
}

/** Colour of a gradient at a slide point, interpolating between its stops. Hard stops share an offset. */
function gradientColor(gradient: NonNullable<PresentationSlide['backgroundGradient']>, at: number) {
  const stops = gradient.stops.map((stop) => ({ offset: stop.offset, color: opaqueColor(stop.color) }));
  if (stops.some((stop) => !stop.color)) return undefined;
  const after = stops.findIndex((stop) => stop.offset > at);
  if (after <= 0) return (after === 0 ? stops[0] : stops.at(-1))!.color;
  const a = stops[after - 1]!, b = stops[after]!, t = (at - a.offset) / (b.offset - a.offset || 1);
  return a.color!.map((channel, i) => channel + (b.color![i]! - channel) * t);
}

/**
 * Finds the opaque colours painted directly behind the text, if they can be determined. A gradient
 * background is sampled at the text's corners and centre, so text straddling a hard edge is caught.
 */
function backdropColors(document: PresentationDocument, slide: PresentationSlide, object: SlideObject, content: Rect) {
  const center = { x: content.x + content.width / 2, y: content.y + content.height / 2, width: 0.5, height: 0.5 };
  const index = slide.objects.indexOf(object);
  const area = (item: SlideObject) => mapRect(item.matrix, { x: 0, y: 0, width: item.transform.width, height: item.transform.height });
  for (const behind of slide.objects.slice(0, index + 1).reverse()) {
    if (behind.kind !== 'shape' && behind.kind !== 'table') {
      if (behind.kind === 'picture' && intersection(area(behind), center)) return undefined;
      continue;
    }
    if (behind.fill === 'none' || behind.gradient || behind.pattern || behind.pictureFill) {
      if ((behind.gradient || behind.pattern || behind.pictureFill) && intersection(area(behind), center)) return undefined;
      continue;
    }
    if (!intersection(area(behind), center)) continue;
    const color = opaqueColor(behind.fill);
    return color && [color];
  }
  if (slide.backgroundPicture || slide.backgroundPattern) return undefined;
  const gradient = slide.backgroundGradient;
  if (!gradient) {
    const color = opaqueColor(slide.background);
    return color && [color];
  }
  if (gradient.kind !== 'linear') return undefined;
  const offset = drawingGradientOffset(gradient, document.width, document.height);
  const points = [[content.x, content.y], [content.x + content.width, content.y], [content.x, content.y + content.height], [content.x + content.width, content.y + content.height], [center.x, center.y]];
  const colors = points.map(([x, y]) => gradientColor(gradient, offset(x!, y!)));
  return colors.every(Boolean) ? (colors as number[][]) : undefined;
}

/** Validates every slide, or one slide, and keeps only slides with warnings. */
export function validatePresentation(document: PresentationDocument, options: SlideValidationOptions, slideId?: string) {
  const slides = slideId === undefined ? document.slides : document.slides.filter((slide) => slide.id === slideId);
  if (!slides.length) throw new Error('Slide not found.');
  const checked = new Map(document.slides.map((slide) => [slide, checkSlide(document, slide, options)]));
  const titles = [...checked.values()].flatMap(({ title }) => (title ? [title] : []));
  const mode = (values: number[]) => {
    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  const usual = {
    size: mode(titles.map((t) => t.size)),
    bold: titles.filter((t) => t.bold).length * 2 >= titles.length,
    x: mode(titles.map((t) => t.x)),
    y: mode(titles.map((t) => t.y)),
  };
  // Three consecutive slides with the same layout read as one slide repeated.
  const run = new Map<PresentationSlide, number>();
  document.slides.forEach((slide, index) => {
    const previous = document.slides[index - 1];
    const same = previous && (checked.get(previous)!.layout === checked.get(slide)!.layout || (checked.get(previous)!.hero && checked.get(slide)!.hero));
    run.set(slide, same ? run.get(previous)! + 1 : 1);
  });
  // Icons, charts, pictures and tables carry meaning; a deck of only text and plain shapes reads as a document.
  const usualIcon = mode([...checked.values()].flatMap((check) => check.icons.map((icon) => icon.size)));
  const illustrated = [...checked.values()].filter((check) => check.visual).length;
  const wanted = Math.ceil(document.slides.length / 3);
  const results = slides.map((slide) => {
    const { warnings, title } = checked.get(slide)!;
    // Matching slides keep the title in one place and size so the deck does not jump between slides.
    if (titles.length >= 3 && title) {
      const drift = [
        title.size !== usual.size && `${title.size}pt instead of ${usual.size}pt`,
        title.bold !== usual.bold && (usual.bold ? 'regular weight instead of bold' : 'bold instead of regular weight'),
        Math.abs(title.x - usual.x!) > 8 && `x=${title.x} instead of ${usual.x}`,
        Math.abs(title.y - usual.y!) > 8 && `y=${title.y} instead of ${usual.y}`,
      ].filter(Boolean);
      if (drift.length)
        warnings.push({ code: 'title-drift', objectKey: title.key, message: `Title is at ${drift.join(', ')} used by most slides. Match the deck's title position and size.` });
    }
    if (slide === document.slides[0] && document.slides.length >= 4 && illustrated < wanted)
      warnings.push({ code: 'visuals', message: `Only ${illustrated} of ${document.slides.length} slides carry a visual. Give at least ${wanted} slides an icon, chart, picture or table that shows the idea.` });
    for (const icon of checked.get(slide)!.icons)
      if (!warnings.some((warning) => warning.objectKey === icon.key) && Math.abs(icon.size - usualIcon!) > usualIcon! * 0.1)
        warnings.push({ code: 'icon', objectKey: icon.key, message: `This icon unit is ${icon.size}px while most in the deck are ${usualIcon}px. Use one size for every icon tile.` });
    if (run.get(slide)! >= 3)
      warnings.push({ code: 'repetition', message: `${run.get(slide)} slides in a row share this layout. Rebuild this one as a different slide shape, such as a chart, statement, comparison or sequence.` });
    return { slideId: slide.id, number: document.slides.indexOf(slide) + 1, warnings };
  });
  return {
    checked: results.length,
    warningCount: results.reduce((sum, slide) => sum + slide.warnings.length, 0),
    slides: results.filter((slide) => slide.warnings.length),
  };
}
