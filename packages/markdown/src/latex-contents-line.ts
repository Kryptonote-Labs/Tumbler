import { latexLength } from './latex-lengths';
import { readLatexTextMacros } from './latex-macros';
import { commandEnd, groupAt, whitespaceEnd } from './latex-syntax';

type TextMacros = ReturnType<typeof readLatexTextMacros>;

/** Recognize a two-argument wrapper around LaTeX's dotted contents entry. */
function contentsStyle(source: string, macros: TextMacros, position: number) {
  const command = commandEnd(source, position);
  const macro = macros.get(source.slice(position + 1, command));
  if (macro?.count !== 2 || macro.optional !== undefined) return;
  const match = /^\\@dottedtocline\s*\{\s*(\d+)\s*\}\s*\{([^{}]+)\}\s*\{([^{}]+)\}\s*\{#1\}\s*\{#2\}$/.exec(macro.replacement.trim());
  if (!match || latexLength(match[2], 1) === undefined || latexLength(match[3], 1) === undefined) return;
  return { command, depth: Number(match[1]), indent: match[2]!, numberWidth: match[3]! };
}

export function latexContentsLineAt(source: string, macros: TextMacros, start = 0) {
  const style = contentsStyle(source, macros, start);
  if (!style) return;
  const title = groupAt(source, whitespaceEnd(source, style.command));
  const folio = title && groupAt(source, whitespaceEnd(source, title.end));
  if (title && folio) return { title, folio };
}

export function latexContentsLineStyle(open: string, macros: TextMacros, em: number) {
  if (!/^\\[a-zA-Z@]+\s*\{$/.test(open)) return;
  const style = contentsStyle(open, macros, 0);
  if (style) return {
    depth: style.depth,
    indent: latexLength(style.indent, em)!,
    numberWidth: latexLength(style.numberWidth, em)!,
  };
}
