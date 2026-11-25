import { readLatexColours, resolveLatexColour } from './latex-colour';
import { groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

type ContentsLink = 'section' | 'page' | 'all' | 'none';

const contentsLinks: ReadonlySet<string> = new Set(['section', 'page', 'all', 'none']);

function isContentsLink(value: string): value is ContentsLink {
  return contentsLinks.has(value);
}

/** Read comma-separated package options without splitting braced PDF metadata. */
function readOptions(source: string, options: Map<string, string>) {
  let start = 0;
  for (let index = 0; index <= source.length; index++) {
    if (source[index] === '{') {
      const group = groupAt(source, index);
      if (group) index = group.end - 1;
    } else if (index === source.length || source[index] === ',') {
      const entry = source.slice(start, index).trim();
      const equals = entry.indexOf('=');
      const key = equals < 0 ? entry : entry.slice(0, equals).trim();
      const value = equals < 0 ? 'true' : entry.slice(equals + 1).trim();
      if (key) options.set(key, value.replace(/^\{([\s\S]*)\}$/, '$1').trim());
      start = index + 1;
    }
  }
}

/** The colours and linked parts that hyperref applies to generated document text. */
export function readLatexHyperref(prefix: string) {
  let loaded = false;
  const options = new Map<string, string>();
  for (const command of latexCommands(prefix)) {
    const at = whitespaceEnd(prefix, command.end);
    if (command.name === 'usepackage' || command.name === 'RequirePackage') {
      const optional = groupAt(prefix, at, '[', ']');
      const group = groupAt(prefix, whitespaceEnd(prefix, optional?.end ?? at));
      if (!group || !prefix.slice(group.from, group.to).split(',').some(name => name.trim() === 'hyperref'))
        continue;
      loaded = true;
      if (optional) readOptions(prefix.slice(optional.from, optional.to), options);
    } else if (loaded && command.name === 'hypersetup') {
      const group = groupAt(prefix, at);
      if (group) readOptions(prefix.slice(group.from, group.to), options);
    }
  }
  if (!loaded) return;
  const colour = options.get('colorlinks') === 'true' && options.get('hidelinks') !== 'true';
  const palette = colour ? readLatexColours(prefix) : undefined;
  const resolve = (key: string, fallback: string) =>
    palette && resolveLatexColour(options.get(key) ?? options.get('allcolors') ?? fallback, palette);
  const contents = options.get('linktoc') ?? '';
  return {
    contents: isContentsLink(contents) ? contents : options.get('linktocpage') === 'true' ? 'page' : 'section',
    internal: resolve('linkcolor', 'red'),
    citation: resolve('citecolor', 'green'),
    url: resolve('urlcolor', 'cyan'),
  };
}
