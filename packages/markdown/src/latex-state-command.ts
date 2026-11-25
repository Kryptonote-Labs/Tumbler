import { readLatexTextMacros } from './latex-macros';
import { commandEnd, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

type Macros = ReturnType<typeof readLatexTextMacros>;

function argumentsAt(source: string, end: number, count: number) {
  const args = [];
  for (let index = 0; index < count; index++) {
    const arg = groupAt(source, whitespaceEnd(source, end));
    if (!arg) return;
    args.push(source.slice(arg.from, arg.to));
    end = arg.end;
  }
  return { end, args };
}

/** Read a literal entry written into an auxiliary list. */
export function readLatexContentsEntry(source: string, start = 0) {
  const end = commandEnd(source, start);
  if (source.slice(start, end) !== '\\addcontentsline') return;
  const args = argumentsAt(source, end, 3);
  if (args)
    return { end: args.end, list: args.args[0]!, level: args.args[1]!, title: args.args[2]! };
}

const spacingPresets = new Set(['normalsize', 'singlespacing', 'onehalfspacing', 'doublespacing']);
const singleArgument = new Set(['pagestyle', 'pagenumbering', 'linespread', 'setstretch']);

function stateCommand(source: string, start: number) {
  const end = commandEnd(source, start);
  const name = source.slice(start + 1, end);
  if (spacingPresets.has(name)) return { end };
  if (singleArgument.has(name)) return argumentsAt(source, end, 1);
  if (name === 'renewcommand') {
    const targets = argumentsAt(source, end, 2);
    if (targets?.args[0] === '\\baselinestretch' && /^\s*\d*\.?\d+\s*$/.test(targets.args[1]!))
      return targets;
  }
  if (name === 'gdef') {
    const start = whitespaceEnd(source, end);
    const next = commandEnd(source, start);
    if (source.slice(start, next).startsWith('\\@')) return argumentsAt(source, next, 1);
  }
}

/** Classify a call only when every token in its literal expansion changes state without printing. */
export function readLatexStateMacro(source: string, macros: Macros, start = 0) {
  const end = commandEnd(source, start);
  const macro = macros.get(source.slice(start + 1, end));
  if (!macro || macro.optional !== undefined) return;
  const call = argumentsAt(source, end, macro.count);
  if (!call) return;
  const expansion = macro.replacement.replace(/(?<!\\)%[^\r\n]*/g, '');
  let cursor = whitespaceEnd(expansion, 0);
  while (cursor < expansion.length) {
    const state = stateCommand(expansion, cursor);
    if (!state) return;
    cursor = whitespaceEnd(expansion, state.end);
  }
  // Keep TeX argument tokens opaque. Only accept substitution in the assignment's value.
  if (/#\d/.test(expansion) && !/^\s*\\gdef\s*\\@[A-Za-z@]+\s*\{#1\}\s*$/.test(expansion)) return;
  return { end: call.end, expansion };
}

export type LatexGeneratedList = 'tableofcontents' | 'listoftables' | 'listoffigures';
type Boundary = 'page' | 'recto';

function listKind(name: string): LatexGeneratedList | undefined {
  if (name === 'tableofcontents' || name === 'listoftables' || name === 'listoffigures')
    return name;
}

/** Project a literal macro that emits generated lists with page and state commands between them. */
export function readLatexListSequence(source: string, macros: Macros, start = 0) {
  const end = commandEnd(source, start);
  const macro = macros.get(source.slice(start + 1, end));
  if (macro?.count !== 0) return;
  const expansion = macro.replacement.replace(/(?<!\\)%[^\r\n]*/g, '');
  const lists: { kind: LatexGeneratedList; before?: Boundary | undefined }[] = [];
  let before: Boundary | undefined;
  let afterLists = '';
  for (let cursor = whitespaceEnd(expansion, 0); cursor < expansion.length;) {
    const command = commandEnd(expansion, cursor);
    const name = expansion.slice(cursor + 1, command);
    const kind = listKind(name);
    if (kind) {
      lists.push({ kind, before });
      before = undefined;
      afterLists = '';
      cursor = whitespaceEnd(expansion, command);
    } else if (name === 'clearpage' || name === 'cleardoublepage' || name === 'newpage') {
      if (before !== 'recto') before = name === 'cleardoublepage' ? 'recto' : 'page';
      cursor = whitespaceEnd(expansion, command);
    } else {
      const state = stateCommand(expansion, cursor);
      if (!state) return;
      afterLists += expansion.slice(cursor, state.end) + '\n';
      cursor = whitespaceEnd(expansion, state.end);
    }
  }
  if (lists.length) return { end, lists, after: before, afterLists };
}

/** A custom title page uses the compiler to execute the template's title definition. */
export function latexCustomTitlePage(prefix: string, macros = readLatexTextMacros(prefix)) {
  const title = macros.get('maketitle');
  if (title?.count !== 0) return;
  for (const { name, end } of latexCommands(title.replacement)) {
    if (name !== 'begin') continue;
    if (argumentsAt(title.replacement, end, 1)?.args[0] !== 'titlepage') continue;
    const close = macros.get('endtitlepage')?.replacement;
    return {
      boundary:
        close && [...latexCommands(close)].some(({ name }) => name === 'cleardoublepage')
          ? ('recto' as const)
          : ('page' as const),
    };
  }
}
