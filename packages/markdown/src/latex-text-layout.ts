import type { Node } from 'prosemirror-model';
import { latexLength } from './latex-lengths';
import { commandEnd, groupAt, whitespaceEnd } from './latex-syntax';

export const latexTextEnvironments = new Set(['titlepage', 'center', 'flushleft', 'flushright', 'minipage']);

export function latexBlockDeclaration(source: string, position = 0) {
  if (source[position] !== '\\') return;
  const end = commandEnd(source, position);
  const command = source.slice(position + 1, end);
  switch (command) {
    case 'centering':
    case 'raggedright':
    case 'raggedleft':
    case 'vfill':
      return { command, end };
  }
}

export function isLatexTitlePage(node: Node | null | undefined) {
  const source = node?.type.name === 'latex_container' ? node.attrs.open :
    node?.type.name === 'latex_raw' ? node.attrs.source : '';
  return typeof source === 'string' && /^\s*\\begin\s*\{titlepage\}/.test(source);
}

/** A coefficient of the surrounding horizontal measure. */
export function latexMeasureFraction(source: string) {
  const fraction = /^(\d*(?:\.\d+)?)[ \t]*\\(?:textwidth|linewidth|columnwidth)$/.exec(source.trim());
  if (fraction) return Number(fraction[1] || 1);
}

export function latexMinipageArgument(open: string) {
  const environment = /^\\begin\s*\{minipage\}/.exec(open);
  if (environment) return groupAt(open, whitespaceEnd(open, environment[0].length));
}

/** Resolve a minipage's mandatory width against the surrounding measure. */
export function latexMinipageWidth(open: string, measure: number, em: number) {
  const group = latexMinipageArgument(open);
  if (!group) return;
  const width = open.slice(group.from, group.to);
  const fraction = latexMeasureFraction(width);
  const value = fraction !== undefined ? fraction * measure : latexLength(width, em);
  if (value !== undefined && value > 0) return value;
}
