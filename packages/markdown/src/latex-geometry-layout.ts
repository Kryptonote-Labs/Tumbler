import { geometryOption, geometryPair, latexMarginSides, latexPaperSizes, type LatexMargins } from './latex-geometry';
import { latexLength } from './latex-lengths';
import { texPoint } from './latex-typography';

const pairs = new Map([
  ['hmargin', ['left', 'right']], ['vmargin', ['top', 'bottom']],
  ['total', ['width', 'height']], ['text', ['textwidth', 'textheight']],
  ['scale', ['hscale', 'vscale']], ['marginratio', ['hmarginratio', 'vmarginratio']],
  ['papersize', ['paperwidth', 'paperheight']], ['layoutsize', ['layoutwidth', 'layoutheight']],
  ['offset', ['hoffset', 'voffset']], ['layoutoffset', ['layouthoffset', 'layoutvoffset']],
]);

/** Expand geometry shorthands in declaration order, before resolving dependent lengths. */
export function geometryValues(options: string[]) {
  const values = new Map<string, string>();
  for (const option of options) {
    const [key, value] = geometryOption(option);
    const pair = pairs.get(key);
    if (pair) {
      const [first, second] = geometryPair(value);
      values.set(pair[0]!, first);
      values.set(pair[1]!, second);
    } else if ((key === 'paper' && latexPaperSizes.has(value)) || (value === 'true' && latexPaperSizes.has(key))) {
      values.delete('paperwidth');
      values.delete('paperheight');
    } else if (key === 'margin') {
      const [horizontal, vertical] = geometryPair(value);
      for (const side of latexMarginSides)
        values.set(side, side === 'left' || side === 'right' ? horizontal : vertical);
    } else if (key === 'centering' || key === 'hcentering' || key === 'vcentering') {
      if (value === 'true') {
        if (key !== 'vcentering') values.set('hmarginratio', '1:1');
        if (key !== 'hcentering') values.set('vmarginratio', '1:1');
      }
    } else if (key === 'hdivide' || key === 'vdivide' || key === 'divide') {
      const parts = value.split(',').map(part => part.trim());
      for (const axis of ['h', 'v']) {
        if (key !== 'divide' && !key.startsWith(axis)) continue;
        const horizontal = axis === 'h';
        const keys = horizontal ? ['left', 'width', 'right'] : ['top', 'height', 'bottom'];
        if (parts.length > 1) {
          values.delete(horizontal ? 'textwidth' : 'textheight');
          values.delete(horizontal ? 'hscale' : 'vscale');
          if (!horizontal) values.delete('lines');
        }
        keys.forEach((name, index) => {
          const part = parts[index];
          if (part && part !== '*') values.set(name, part);
          else if (part !== undefined) values.delete(name);
        });
      }
    } else if (['includeall', 'ignoreall', 'includeheadfoot', 'ignoreheadfoot'].includes(key)) {
      const include = key.startsWith('include') === (value === 'true');
      for (const part of key.endsWith('all') ? ['head', 'foot', 'mp'] : ['head', 'foot'])
        values.set('include' + part, String(include));
    } else if (key === 'ignorehead' || key === 'ignorefoot' || key === 'ignoremp') {
      values.set('include' + key.slice(6), String(value === 'false'));
    } else if ((key === 'nohead' || key === 'nofoot' || key === 'noheadfoot') && value === 'true') {
      if (key !== 'nofoot') {
        values.set('headheight', '0');
        values.set('headsep', '0');
      }
      if (key !== 'nohead') values.set('footskip', '0');
    } else if (key === 'layout' && latexPaperSizes.has(value)) {
      const [width, height] = latexPaperSizes.get(value)!;
      values.set('layoutwidth', width + 'px');
      values.set('layoutheight', height + 'px');
    } else values.set(key, value);
  }
  return values;
}

function axis(total: number, before: number | undefined, after: number | undefined,
  body: number | undefined, ratio: string | undefined, defaultRatio: number) {
  const match = /^(\d+)\s*:\s*(\d+)$/.exec(ratio ?? '');
  const a = Number(match?.[1]);
  const b = Number(match?.[2]);
  const explicitRatio = a > 0 && b > 0;
  const fraction = explicitRatio ? a / (a + b) : defaultRatio;
  // geometry prefers two explicit margins to a conflicting body size. With one
  // margin and a ratio it uses the ratio, otherwise the default body scale is 0.7.
  if (before !== undefined && after !== undefined) return { before, after };
  if (body === undefined && explicitRatio) {
    if (before !== undefined) return { before, after: before * b / a };
    if (after !== undefined) return { before: after * a / b, after };
  }
  const remaining = total - (body ?? total * 0.7);
  if (body === undefined)
    return { before: before ?? remaining * fraction, after: after ?? remaining * (before === undefined ? 1 - fraction : fraction) };
  const start = before ?? (after === undefined ? remaining * fraction : remaining - after);
  return { before: start, after: after ?? remaining - start };
}

export function physicalGeometry(
  values: Map<string, string>,
  paper: {
    width: number; height: number; twoSided: boolean; mirror: boolean; twoColumns: boolean;
    font: number; xHeight: number; classLeading: number; topSkip: number; letter: boolean;
    marginparWidth: number;
  },
) {
  const length = (key: string) => latexLength(values.get(key), paper.font, paper.xHeight);
  function layoutLength(key: string) {
    const value = values.get(key);
    // Named layout dimensions have already been converted by latexPaperSizes.
    return value?.endsWith('px') ? Number.parseFloat(value) : length(key);
  }
  function scaled(key: string, total: number) {
    const factor = Number(values.get(key));
    return Number.isFinite(factor) && factor > 0 ? factor * total : undefined;
  }
  const binding = length('bindingoffset') ?? 0;
  const width = (layoutLength('layoutwidth') ?? paper.width) - binding;
  const height = layoutLength('layoutheight') ?? paper.height;
  const header = values.get('includehead') === 'true'
    ? (length('headheight') ?? 12 * texPoint) + (length('headsep') ?? 25 * texPoint) : 0;
  const footSkip = length('footskip') ?? (paper.letter ? 25 : 30) * texPoint;
  const footer = values.get('includefoot') === 'true' ? footSkip : 0;
  const columns = paper.twoColumns ? 2 : 1;
  const marginpar = values.get('includemp') === 'true' && values.get('nomarginpar') !== 'true'
    ? (length('marginparwidth') ?? length('marginpar') ?? paper.marginparWidth) +
      (length('marginparsep') ?? (paper.twoColumns ? 10 : 11) * texPoint) : 0;
  const reverse = values.get('reversemp') === 'true' || values.get('reversemarginpar') === 'true';
  const oddInset = paper.twoColumns || reverse ? marginpar : 0;
  const evenInset = paper.twoColumns || reverse !== paper.mirror ? marginpar : 0;
  const lineCount = Number(values.get('lines'));
  const textWidth = length('textwidth');
  const textHeight = lineCount > 0
    ? (lineCount - 1) * paper.classLeading + paper.topSkip : length('textheight');
  const horizontal = axis(width, length('left'), length('right'),
    textWidth === undefined ? length('width') ?? scaled('hscale', width) : textWidth + columns * marginpar,
    values.get('hmarginratio'), paper.twoSided ? 0.4 : 0.5);
  const vertical = axis(height, length('top'), length('bottom'),
    textHeight === undefined ? length('height') ?? scaled('vscale', height) : textHeight + header + footer,
    values.get('vmarginratio'), 0.4);

  const x = (length('layouthoffset') ?? 0) + (length('hoffset') ?? 0);
  const y = (length('layoutvoffset') ?? 0) + (length('voffset') ?? 0);
  const bodyWidth = width - horizontal.before - horizontal.after - columns * marginpar;
  let bodyHeight = height - vertical.before - vertical.after - header - footer;
  if (values.get('heightrounded') === 'true')
    bodyHeight = paper.topSkip + Math.round((bodyHeight - paper.topSkip) / paper.classLeading) * paper.classLeading;
  const left = horizontal.before + x + binding + oddInset;
  const top = vertical.before + y + header;
  const evenLeft = paper.twoSided ? (paper.mirror ? horizontal.after : horizontal.before) + x + evenInset : undefined;
  return {
    left, right: paper.width - bodyWidth - left, evenLeft,
    top, bottom: paper.height - bodyHeight - top, footSkip,
    binding: marginValue(values.get('bindingoffset'), binding),
    margins: {
      left: marginValue(values.get('left'), horizontal.before),
      right: marginValue(values.get('right'), horizontal.after),
      top: marginValue(values.get('top'), vertical.before),
      bottom: marginValue(values.get('bottom'), vertical.after),
    } satisfies LatexMargins,
  };
}

export function marginValue(explicit: string | undefined, pixels: number) {
  return explicit && latexLength(explicit) !== undefined ? explicit :
    Number((pixels * 2.54 / 96).toFixed(5)) + 'cm';
}
