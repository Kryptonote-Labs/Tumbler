import { latexFieldSource, latexFieldText } from './latex-metadata';
import { findLatexCommand, splice } from './latex-scan';
import { latexLength } from './latex-lengths';
import { environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

function panelRanges(source: string) {
  const panels: { from: number; to: number; width: string; body: string }[] = [];
  let covered = 0;
  for (const { name, start, end } of latexCommands(source)) {
    if (start < covered || name !== 'begin') continue;
    const tag = groupAt(source, whitespaceEnd(source, end));
    if (!tag || !/^sub(?:figure|table)$/.test(source.slice(tag.from, tag.to))) continue;
    const environment = environmentAt(source, start);
    if (!environment) continue;
    let argument = whitespaceEnd(source, environment.from);
    while (source[argument] === '[') {
      const option = groupAt(source, argument, '[', ']');
      if (!option) break;
      argument = whitespaceEnd(source, option.end);
    }
    const width = groupAt(source, argument);
    if (!width) continue;
    covered = environment.end;
    panels.push({
      from: start,
      to: covered,
      width: source.slice(width.from, width.to).trim(),
      body: source.slice(width.end, environment.to),
    });
  }
  return panels;
}

function outsidePanels(source: string, name: string) {
  const panels = panelRanges(source);
  let after = 0;
  let command = findLatexCommand(source, name, after);
  for (const panel of panels) {
    if (!command || command.start < panel.from) return command;
    if (command.start < panel.to) {
      after = panel.to;
      command = findLatexCommand(source, name, after);
    }
  }
  return command;
}

export function readLatexSubfigures(source: string) {
  return panelRanges(source).map(panel => {
    const graphic = findLatexCommand(panel.body, 'includegraphics');
    const rule = findLatexCommand(panel.body, 'rule');
    const height = rule && groupAt(panel.body, whitespaceEnd(panel.body, rule.end));
    return {
      ...panel,
      caption: readLatexCaption(panel.body),
      label: findLatexCommand(panel.body, 'label')?.body.text.trim(),
      graphic: graphic?.body.text.trim(),
      rule: rule && height
        ? { width: latexLength(rule.body.text), height: latexLength(panel.body.slice(height.from, height.to)) }
        : undefined,
    };
  });
}

/** A caption's editable text, or its TeX when text would not keep it. */
export function readLatexCaption(source: string) {
  const caption = outsidePanels(source, 'caption');
  if (!caption) return;
  const text = latexFieldText(caption.body.text);
  return { ...caption, text, tex: text === undefined };
}

/** Write a caption, adding one after `after` (an index in `source`) when there is none. */
export function setLatexCaption(source: string, value: string, tex: boolean, after: number) {
  const body = tex ? value : latexFieldSource(value);
  const caption = outsidePanels(source, 'caption');
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

function figureTikzPicture(source: string, body: number) {
  let covered = 0;
  let tikz: { source: string; end: number } | undefined;
  for (const { name, start } of latexCommands(source.slice(body))) {
    const position = body + start;
    if (position < covered || name !== 'begin') continue;
    const environment = environmentAt(source, position);
    if (!environment) continue;
    covered = environment.end;
    if (environment.name !== 'tikzpicture') continue;
    if (tikz) return;
    tikz = { source: source.slice(position, covered), end: covered };
  }
  return tikz;
}

/** The picture in a figure: its file or TikZ source and its width as a share of the text width. */
export function readLatexFigure(source: string) {
  const environment = /^\s*\\begin\s*\{(figure\*?)\}/.exec(source);
  if (!environment) return;
  const graphic = outsidePanels(source, 'includegraphics');
  const width = graphic?.option
    ? /(?:^|,)\s*width\s*=\s*([\d.]*)\s*\\(?:linewidth|textwidth|columnwidth)\s*(?:,|$)/.exec(
        graphic.option.text,
      )
    : undefined;
  const page = /(?:^|,)\s*page\s*=\s*(\d+)\s*(?:,|$)/.exec(graphic?.option?.text ?? '');
  return {
    graphic,
    wide: environment[1] === 'figure*',
    panels: readLatexSubfigures(source),
    path: graphic?.body.text.trim(),
    page: page ? Number(page[1]) : 1,
    tikz: graphic ? undefined : figureTikzPicture(source, environment[0].length),
    /** Undefined when the width is not a share of the line, such as `5cm`. */
    width: width ? Number(width[1] || 1) : graphic?.option ? undefined : 1,
    caption: readLatexCaption(source),
  };
}

/** Set a figure's width as a share of the line, keeping any other graphic options. */
export function setLatexFigureWidth(source: string, share: number) {
  const graphic = outsidePanels(source, 'includegraphics');
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
  const graphic = outsidePanels(source, 'includegraphics');
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
