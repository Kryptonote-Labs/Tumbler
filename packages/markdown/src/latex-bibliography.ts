import type { Node } from 'prosemirror-model';
import { commandEnd, environmentAt, groupAt, latexCommands, lineEnd, whitespaceEnd } from './latex-syntax';

/** One BibTeX entry. Field values are kept as written, without their outer braces. */
export type BibEntry = { type: string; key: string; fields: Record<string, string> };

/** A bibliography database written into the preamble with `filecontents*`. */
export type LatexBibliographyDatabase = {
  /** The file name the environment writes, such as `references.bib`. */
  name: string;
  /** The whole environment, and the database text inside it. */
  span: { from: number; to: number };
  content: { from: number; to: number };
  entries: BibEntry[];
};

/** Read BibTeX entries. Comments, `@string` and `@preamble` blocks are skipped. */
export function parseBibtex(text: string): BibEntry[] {
  return bibtexSpans(text).map(({ entry }) => entry);
}

function bibtexSpans(text: string) {
  const entries: { entry: BibEntry; from: number; to: number; values: Record<string, string> }[] = [];
  const start = /@([A-Za-z]+)\s*([{(])/g;
  for (let match = start.exec(text); match; match = start.exec(text)) {
    const type = match[1]!.toLowerCase();
    const open = match.index + match[0].length - 1;
    const close = match[2] === '{' ? '}' : ')';
    const group = groupAt(text, open, match[2], close);
    if (!group) break;
    start.lastIndex = group.end;
    if (type === 'comment' || type === 'string' || type === 'preamble') continue;
    const body = text.slice(group.from, group.to);
    const comma = body.indexOf(',');
    const key = (comma < 0 ? body : body.slice(0, comma)).trim();
    if (!key) continue;
    const values: Record<string, string> = {};
    entries.push({
      entry: { type, key, fields: comma < 0 ? {} : bibFields(body.slice(comma + 1), values) },
      values,
      from: match.index,
      to: group.end,
    });
  }
  return entries;
}

function bibFields(body: string, values: Record<string, string>) {
  const fields: Record<string, string> = {};
  let position = 0;
  while (position < body.length) {
    const name = /\s*,?\s*([A-Za-z][\w-]*)\s*=\s*/y;
    name.lastIndex = position;
    const match = name.exec(body);
    if (!match) break;
    position = name.lastIndex;
    const valueStart = position;
    let value = '';
    // A value is a braced group, a quoted string, or a bare number or macro, joined with #.
    for (;;) {
      position = whitespaceEnd(body, position);
      const character = body[position];
      if (character === '{') {
        const group = groupAt(body, position);
        if (!group) return fields;
        value += body.slice(group.from, group.to);
        position = group.end;
      } else if (character === '"') {
        let end = position + 1;
        let depth = 0;
        for (; end < body.length; end++) {
          if (body[end] === '\\') end++;
          else if (body[end] === '{') depth++;
          else if (body[end] === '}') depth--;
          else if (body[end] === '"' && depth === 0) break;
        }
        value += body.slice(position + 1, end);
        position = end + 1;
      } else {
        const bare = /[^\s,#}]+/y;
        bare.lastIndex = position;
        const word = bare.exec(body);
        if (!word) break;
        value += word[0];
        position = bare.lastIndex;
      }
      position = whitespaceEnd(body, position);
      if (body[position] !== '#') break;
      position++;
    }
    const field = match[1]!.toLowerCase();
    fields[field] = value.replace(/\s+/g, ' ').trim();
    values[field] = body.slice(valueStart, position).trim();
  }
  return fields;
}

/** Write an entry as BibTeX, one field per line. */
export function writeBibEntry(entry: BibEntry) {
  return formatBibEntry(entry);
}

function formatBibEntry(entry: BibEntry, original?: { entry: BibEntry; values: Record<string, string> }) {
  const fields = Object.entries(entry.fields).filter(([, value]) => value.trim());
  const lines = fields.map(([name, value]) => {
    const existing = original?.entry.fields[name] === value ? original.values[name] : undefined;
    return '  ' + name + ' = ' + (existing ?? '{' + value.trim() + '}');
  });
  return '@' + entry.type + '{' + entry.key +
    (lines.length ? ',\n' + lines.join(',\n') + '\n' : '\n') + '}';
}

const databaseStart = /\\begin\s*\{filecontents\*?\}/g;

/** The `filecontents` BibTeX databases in a preamble, in order. */
export function latexBibliographyDatabases(prefix: string): LatexBibliographyDatabase[] {
  const found: LatexBibliographyDatabase[] = [];
  databaseStart.lastIndex = 0;
  for (let match = databaseStart.exec(prefix); match; match = databaseStart.exec(prefix)) {
    if (/(?:^|[^\\])%[^\n]*$/.test(prefix.slice(prefix.lastIndexOf('\n', match.index) + 1, match.index))) continue;
    const environment = environmentAt(prefix, match.index);
    if (!environment) continue;
    let position = whitespaceEnd(prefix, environment.from);
    position = groupAt(prefix, position, '[', ']')?.end ?? environment.from;
    const nameGroup = groupAt(prefix, whitespaceEnd(prefix, position));
    if (!nameGroup) continue;
    const name = prefix.slice(nameGroup.from, nameGroup.to).trim();
    if (!/\.bib$/i.test(name)) continue;
    const from = nameGroup.end + Number(prefix[nameGroup.end] === '\n');
    found.push({
      name,
      span: { from: match.index, to: environment.end },
      content: { from, to: environment.to },
      entries: parseBibtex(prefix.slice(from, environment.to)),
    });
    databaseStart.lastIndex = environment.end;
  }
  return found;
}

/**
 * Replace the entries of the named database, or add one before `\begin{document}`. The
 * environment overwrites the file on every run, so the source stays the only copy.
 */
export function setLatexBibliographyEntries(
  prefix: string,
  name: string,
  entries: BibEntry[],
  rename?: { from: string; to: string },
) {
  const text = entries.map(writeBibEntry).join('\n\n') + '\n';
  const database = latexBibliographyDatabases(prefix).find((entry) => entry.name === name);
  if (database) {
    const original = prefix.slice(database.content.from, database.content.to);
    const pending = new Map(entries.map((entry) => [entry.key, entry]));
    let changed = original;
    for (const current of bibtexSpans(original).reverse()) {
      const { entry, from, to } = current;
      const key = rename?.from === entry.key ? rename.to : entry.key;
      const next = pending.get(key);
      pending.delete(key);
      if (!next) changed = changed.slice(0, from) + changed.slice(to);
      else if (JSON.stringify(entry) !== JSON.stringify(next)) {
        changed = changed.slice(0, from) + formatBibEntry(next, current) + changed.slice(to);
      }
    }
    if (pending.size) changed += '\n' + Array.from(pending.values(), writeBibEntry).join('\n\n') + '\n';
    return prefix.slice(0, database.content.from) + changed + prefix.slice(database.content.to);
  }
  const block = '\\begin{filecontents*}[overwrite]{' + name + '}\n' + text + '\\end{filecontents*}\n';
  const begin = /^[ \t]*\\begin\s*\{document\}/m.exec(prefix);
  if (!begin) throw new RangeError('This file has no preamble.');
  return prefix.slice(0, begin.index) + block + prefix.slice(begin.index);
}

/** The `\bibliography` files and `\bibliographystyle` of a body, as `.bib` names. */
export function latexBibliographyFiles(source: string) {
  const files: string[] = [];
  let style: string | undefined;
  for (let next = 0; next < source.length; next++) {
    if (source[next] === '%') next = lineEnd(source, next);
    else if (source[next] === '\\') {
      const end = commandEnd(source, next);
      const name = source.slice(next + 1, end);
      if (name === 'bibliography' || name === 'bibliographystyle' || name === 'addbibresource') {
        const group = groupAt(source, whitespaceEnd(source, end));
        if (group) {
          const value = source.slice(group.from, group.to);
          if (name === 'bibliographystyle') style = value.trim();
          else
            for (const part of value.split(','))
              if (part.trim()) files.push(part.trim().replace(/(?:\.bib)?$/i, '.bib'));
        }
      }
      next = end - 1;
    }
  }
  return { files, style };
}

export type LatexBibliographyItem = { key: string; label: string; source: string };

/** Read the top-level authored entries in a standard thebibliography environment. */
export function readLatexBibliography(source: string) {
  const start = whitespaceEnd(source, 0);
  if (!/^\\begin\s*\{thebibliography\}/.test(source.slice(start))) return;
  const environment = environmentAt(source, start);
  if (!environment || source.slice(environment.end).trim()) return;
  const widest = groupAt(source, whitespaceEnd(source, environment.from));
  if (!widest || widest.end > environment.to) return;
  const body = source.slice(widest.end, environment.to);
  const entries: LatexBibliographyItem[] = [];
  let previous: { item: LatexBibliographyItem; start: number } | undefined;
  for (const command of latexCommands(body)) {
    if (command.name !== 'bibitem') continue;
    if (previous) previous.item.source = body.slice(previous.start, command.start).trim();
    const argument = whitespaceEnd(body, command.end);
    const label = groupAt(body, argument, '[', ']');
    const key = groupAt(body, whitespaceEnd(body, label?.end ?? argument));
    if (!key) return;
    const item = {
      key: body.slice(key.from, key.to).trim(),
      label: label ? body.slice(label.from, label.to) : String(entries.length + 1),
      source: '',
    };
    entries.push(item);
    previous = { item, start: key.end };
  }
  if (!previous) return;
  previous.item.source = body.slice(previous.start).trim();
  return { widestLabel: source.slice(widest.from, widest.to), entries };
}

const citeCommand = /\\(?:no)?cite[a-zA-Z]*\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}/g;

/** The keys a `\cite` command names, in order. */
export function latexCitationKeys(source: string) {
  const keys: string[] = [];
  citeCommand.lastIndex = 0;
  for (const match of source.matchAll(citeCommand))
    for (const part of match[1]!.split(',')) if (part.trim()) keys.push(part.trim());
  return keys;
}

/**
 * Citation numbers in the order of first citation, as `unsrt` and `ieeetr` print them. Other
 * styles sort their lists, so they get no numbers rather than guessed ones.
 */
export function latexCitationNumbers(document: Node, style: string | undefined) {
  if (style !== 'unsrt' && style !== 'ieeetr' && style !== 'unsrtnat') return;
  const numbers = new Map<string, number>();
  document.descendants((node) => {
    if (node.type.name !== 'latex_inline') return true;
    for (const key of latexCitationKeys(String(node.attrs.source)))
      if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
    return false;
  });
  return numbers;
}

/** A short "Author Year" name for an entry, for lists and unnumbered citations. */
export function bibEntryName(entry: BibEntry) {
  const authors = (entry.fields.author ?? entry.fields.editor ?? '')
    .split(/\s+and\s+/i)
    .map((name) => {
      const value = name.replace(/[{}]/g, '').trim();
      return value.includes(',') ? value.split(',')[0]!.trim() : (value.split(/\s+/).at(-1) ?? '');
    })
    .filter(Boolean);
  const people =
    authors.length > 2 ? authors[0] + ' et al.' : authors.join(' and ');
  const year = entry.fields.year ?? '';
  return [people, year].filter(Boolean).join(' ') || entry.key;
}
