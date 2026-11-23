import { readLatexTextMacros } from './latex-macros';
import { commandEnd, environmentAt, groupAt, whitespaceEnd } from './latex-syntax';

type TextMacros = ReturnType<typeof readLatexTextMacros>;

/** Read a run of custom contents lines without assuming the author's macro names. */
export function latexContentsRunEnd(source: string, macros: TextMacros, start = 0) {
  let end = start;
  let position = start;
  while (position < source.length) {
    const command = commandEnd(source, position);
    const macro = macros.get(source.slice(position + 1, command));
    if (macro?.count !== 2 || macro.optional !== undefined ||
      !/^\\@dottedtocline\s*\{[^{}]*\}\s*\{[^{}]*\}\s*\{[^{}]*\}\s*\{#1\}\s*\{#2\}$/.test(macro.replacement.trim()))
      break;
    const title = groupAt(source, whitespaceEnd(source, command));
    const folio = title && groupAt(source, whitespaceEnd(source, title.end));
    if (!folio) break;
    end = folio.end;
    position = whitespaceEnd(source, end);
  }
  return end === start ? undefined : end;
}

/** Blocks whose printed layout can be delegated to a TeX engine as one fragment. */
export function readLatexTypesetBlock(prefix: string, source: string) {
  const value = source.trim();
  if (value.startsWith('\\begin')) {
    const environment = environmentAt(value, 0);
    if (environment?.end !== value.length) return;
    if (environment.name === 'titlepage') return 'titlepage';
    if (['center', 'flushleft', 'flushright'].includes(environment.name)) return 'alignment';
  }
  if (latexContentsRunEnd(value, readLatexTextMacros(prefix)) === value.length) return 'contents';
}
