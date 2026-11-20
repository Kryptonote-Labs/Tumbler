import { latexFieldSource, latexFieldText } from './latex-metadata';
import { findLatexCommand, splice } from './latex-scan';

/** A caption's editable text, or its TeX when text would not keep it. */
export function readLatexCaption(source: string) {
  const caption = findLatexCommand(source, 'caption');
  if (!caption) return;
  const text = latexFieldText(caption.body.text);
  return { ...caption, text, tex: text === undefined };
}

/** Write a caption, adding one after `after` (an index in `source`) when there is none. */
export function setLatexCaption(source: string, value: string, tex: boolean, after: number) {
  const body = tex ? value : latexFieldSource(value);
  const caption = findLatexCommand(source, 'caption');
  if (caption) {
    if (!value.trim()) {
      // An empty caption is removed, with the label that depends on it kept in place.
      return splice(source, caption.start, caption.end, '').replace(/\n[ \t]*\n/, '\n');
    }
    return splice(source, caption.body.start, caption.body.end, body);
  }
  if (!value.trim()) return source;
  const line = source.indexOf('\n', after);
  const at = line < 0 ? after : line;
  return splice(source, at, at, '\n\\caption{' + body + '}');
}

/** The picture in a figure: its file and its width as a share of the text width. */
export function readLatexFigure(source: string) {
  if (!/^\s*\\begin\s*\{figure\*?\}/.test(source)) return;
  const graphic = findLatexCommand(source, 'includegraphics');
  const width = graphic?.option
    ? /(?:^|,)\s*width\s*=\s*([\d.]*)\s*\\(?:linewidth|textwidth|columnwidth)\s*(?:,|$)/.exec(
        graphic.option.text,
      )
    : undefined;
  return {
    graphic,
    path: graphic?.body.text.trim(),
    /** Undefined when the width is not a share of the line, such as `5cm`. */
    width: width ? Number(width[1] || 1) : graphic?.option ? undefined : 1,
    caption: readLatexCaption(source),
  };
}

/** Set a figure's width as a share of the line, keeping any other graphic options. */
export function setLatexFigureWidth(source: string, share: number) {
  const graphic = findLatexCommand(source, 'includegraphics');
  if (!graphic) return source;
  const width =
    'width=' +
    (share >= 1 ? '' : String(Math.round(share * 100) / 100).replace(/^0/, '')) +
    '\\linewidth';
  if (!graphic.option)
    return splice(source, graphic.body.start - 1, graphic.body.start - 1, '[' + width + ']');
  const options = graphic.option.text
    .split(',')
    .filter((option) => !/^\s*(?:width|height|scale)\s*=/.test(option) && option.trim());
  return splice(
    source,
    graphic.option.start,
    graphic.option.end,
    [width, ...options.map((option) => option.trim())].join(','),
  );
}

/** Point a figure at another file. */
export function setLatexFigureImage(source: string, path: string) {
  const graphic = findLatexCommand(source, 'includegraphics');
  if (!graphic) return source;
  return splice(source, graphic.body.start, graphic.body.end, path);
}

/** A new figure showing `path`. Its caption is written on the page. */
export function latexFigureSource(path: string) {
  return (
    '\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=.8\\linewidth]{' +
    path +
    '}\n\\end{figure}'
  );
}
