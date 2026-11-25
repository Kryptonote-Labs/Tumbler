import { latexDeclarations } from './latex-presentation';
import { readLatexTextMacros } from './latex-macros';
import { environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

type Boundary = 'page' | 'recto';
type TitledEnvironment = {
  heading: string;
  bodySetup: string;
  before?: Boundary | undefined;
  after?: Boundary | undefined;
};

function boundary(source: string): Boundary | undefined {
  if (/\\cleardoublepage\b/.test(source)) return 'recto';
  if (/\\(?:clearpage|newpage)\b/.test(source)) return 'page';
}

/** Recognize environments that add a centered heading and retain the regular editable body. */
export function readLatexTitledEnvironments(
  preamble: string,
  macros = readLatexTextMacros(preamble),
) {
  const environments = new Map<string, TitledEnvironment>();
  function add(name: string, opening: string, closing: string) {
    const source = opening.replace(/(?<!\\)%[^\r\n]*/g, '');
    const ahead = /^\s*(?:\\(?:cleardoublepage|clearpage|newpage)\b\s*)*/.exec(source)?.[0] ?? '';
    const center = environmentAt(source, ahead.length);
    if (center?.name !== 'center') return;
    // Skip declarations that only change the typography of the environment's body.
    const afterHeading = source.slice(center.end);
    const afterStyle = afterHeading.slice(latexDeclarations(afterHeading).end);
    if (!/^\s*(?:(?:\\linespread\s*\{\d*\.?\d+\}|\\(?:normalsize|small)\b)\s*)*$/.test(afterStyle))
      return;
    const close = closing.replace(/(?<!\\)%[^\r\n]*/g, '');
    if (!/^\s*(?:\\(?:par|clearpage|cleardoublepage|newpage)\b\s*)*$/.test(close)) return;
    let heading = source.slice(center.from, center.to).trim();
    const scope = groupAt(heading, 0);
    if (scope?.end === heading.length) heading = heading.slice(scope.from, scope.to).trim();
    if (heading && !heading.includes('#'))
      environments.set(name, {
        heading,
        bodySetup: afterHeading,
        before: boundary(ahead),
        after: boundary(close),
      });
  }
  for (const [name, macro] of macros) {
    const close = macros.get('end' + name);
    if (macro.count === 0 && close?.count === 0) add(name, macro.replacement, close.replacement);
  }
  for (const { name, end } of latexCommands(preamble)) {
    if (name !== 'newenvironment' && name !== 'renewenvironment') continue;
    const target = groupAt(preamble, whitespaceEnd(preamble, end + Number(preamble[end] === '*')));
    const open = target && groupAt(preamble, whitespaceEnd(preamble, target.end));
    const close = open && groupAt(preamble, whitespaceEnd(preamble, open.end));
    if (!target || !open || !close) continue;
    const environment = preamble.slice(target.from, target.to);
    const endMacro = macros.get('end' + environment);
    add(
      environment,
      preamble.slice(open.from, open.to),
      endMacro?.count === 0 ? endMacro.replacement : preamble.slice(close.from, close.to),
    );
  }
  return environments;
}
