import { latexRomanFamily } from './latex-format';
import { readLatexPackages, withLatexPackage, withoutLatexPackage } from './latex-preamble';
import { argument, latexCommands } from './latex-syntax';

type Glue = readonly [space: number, stretch: number, shrink: number, extra: number];

/**
 * A body font pdfLaTeX can set from TeX Live. `glue` is the interword space, stretch, shrink and
 * extra space of the regular T1 face (font dimensions 2, 3, 4 and 7) in ems, as TeX reports them.
 * `family` names the browser faces in latex-fonts.css. `sans` fonts need `\familydefault`.
 */
type DocumentFont = Readonly<{
  id: string;
  name: string;
  category: 'serif' | 'sans';
  package?: string;
  options?: readonly string[];
  sans?: true;
  family?: string;
  glue?: Glue;
}>;

export const latexDocumentFonts = [
  { id: 'cmr', name: 'Computer Modern', category: 'serif' },
  { id: 'lmr', name: 'Latin Modern', category: 'serif', package: 'lmodern' },
  { id: 'termes', name: 'Times', category: 'serif', package: 'tgtermes', family: 'Tumbler Termes', glue: [0.25, 0.125, 0.083, 0.083] },
  { id: 'pagella', name: 'Palatino', category: 'serif', package: 'tgpagella', family: 'Tumbler Pagella', glue: [0.25, 0.125, 0.083, 0.083] },
  { id: 'libertine', name: 'Libertine', category: 'serif', package: 'libertine', family: 'Tumbler Libertine', glue: [0.25, 0.125, 0.0833, 0.0417] },
  { id: 'xcharter', name: 'Charter', category: 'serif', package: 'XCharter', family: 'Tumbler Charter', glue: [0.278, 0.139, 0.0927, 0.0463] },
  { id: 'ebgaramond', name: 'EB Garamond', category: 'serif', package: 'ebgaramond', family: 'Tumbler Garamond', glue: [0.2, 0.1, 0.0667, 0.0333] },
  { id: 'baskerville', name: 'Baskerville', category: 'serif', package: 'librebaskerville', family: 'Tumbler Baskerville', glue: [0.287, 0.1435, 0.0957, 0.0478] },
  { id: 'crimson', name: 'Crimson', category: 'serif', package: 'crimson', family: 'Tumbler Crimson', glue: [0.217, 0.1085, 0.0723, 0.0362] },
  { id: 'cochineal', name: 'Cochineal', category: 'serif', package: 'cochineal', family: 'Tumbler Cochineal', glue: [0.225, 0.1125, 0.075, 0.0375] },
  { id: 'stix', name: 'STIX Two', category: 'serif', package: 'stix2', family: 'Tumbler STIX', glue: [0.235, 0.117, 0.078, 0.078] },
  { id: 'schola', name: 'Century Schoolbook', category: 'serif', package: 'tgschola', family: 'Tumbler Schola', glue: [0.278, 0.139, 0.093, 0.093] },
  { id: 'bonum', name: 'Bookman', category: 'serif', package: 'tgbonum', family: 'Tumbler Bonum', glue: [0.32, 0.16, 0.107, 0.107] },
  { id: 'alegreya', name: 'Alegreya', category: 'serif', package: 'Alegreya', family: 'Tumbler Alegreya', glue: [0.198, 0.099, 0.066, 0.033] },
  { id: 'merriweather', name: 'Merriweather', category: 'serif', package: 'merriweather', family: 'Tumbler Merriweather', glue: [0.235, 0.1175, 0.0783, 0.0392] },
  { id: 'heros', name: 'Helvetica', category: 'sans', package: 'tgheros', sans: true, family: 'Tumbler Heros', glue: [0.278, 0.139, 0.093, 0.093] },
  { id: 'lato', name: 'Lato', category: 'sans', package: 'lato', options: ['default'], family: 'Tumbler Lato', glue: [0.256, 0.128, 0.0853, 0.0427] },
  { id: 'opensans', name: 'Open Sans', category: 'sans', package: 'opensans', options: ['default'], family: 'Tumbler Open Sans', glue: [0.2598, 0.1299, 0.0866, 0.0433] },
  { id: 'roboto', name: 'Roboto', category: 'sans', package: 'roboto', options: ['sfdefault'], family: 'Tumbler Roboto', glue: [0.247, 0.1235, 0.0823, 0.0412] },
  { id: 'fira', name: 'Fira Sans', category: 'sans', package: 'FiraSans', options: ['sfdefault'], family: 'Tumbler Fira Sans', glue: [0.265, 0.1325, 0.0883, 0.0442] },
] as const satisfies readonly DocumentFont[];

export type LatexDocumentFont = (typeof latexDocumentFonts)[number];
export type LatexDocumentFontId = LatexDocumentFont['id'];

const sansDefault = /\\renewcommand\s*\{\\familydefault\}\s*\{\\sfdefault\}[^\S\r\n]*(?:\r?\n)?/;

function sansBody(prefix: string) {
  let sans = false;
  for (const { name, end } of latexCommands(prefix)) {
    if (name !== 'renewcommand') continue;
    const target = argument(prefix, end);
    if (target?.value === '\\familydefault') sans = argument(prefix, target.end)?.value === '\\sfdefault';
  }
  return sans;
}

/** The catalogue font that sets the body text, or undefined when the preamble chooses another. */
export function latexDocumentFont(prefix: string): LatexDocumentFont | undefined {
  const packages = readLatexPackages(prefix);
  const sans = sansBody(prefix);
  const declared = latexDocumentFonts.findLast((font) => {
    if (!('package' in font) || font.id === 'lmr') return false;
    const declaration = packages.find((item) => item.name === font.package);
    if (!declaration) return false;
    if ('options' in font) return font.options.every((option) => declaration.options.includes(option));
    return 'sans' in font ? sans : !sans;
  });
  if (declared) return declared;
  if (sans) return;
  const roman = latexRomanFamily(prefix);
  if (roman === 'lmr') return latexDocumentFonts[1];
  if (roman === 'cmr' || roman === undefined) return latexDocumentFonts[0];
}

/** Replace the catalogue font declarations with `id`, keeping every unrelated preamble line. */
export function setLatexDocumentFont(prefix: string, id: LatexDocumentFontId, effectivePrefix = prefix) {
  const font = latexDocumentFonts.find((item) => item.id === id);
  if (!font) throw new RangeError('Unknown LaTeX document font.');
  let next = prefix;
  for (const item of latexDocumentFonts)
    if ('package' in item) next = withoutLatexPackage(next, item.package, effectivePrefix);
  next = next
    .replace(/(?:^|(?<=\n))\\renewcommand\{\\rmdefault\}\{(?:cmr|lmr)\}\r?\n/g, '')
    .replace(sansDefault, '');
  if (!('package' in font)) return next;
  if (font.id !== 'lmr') next = withLatexPackage(next, 'fontenc', effectivePrefix, ['T1']);
  next = withLatexPackage(next, font.package, effectivePrefix, 'options' in font ? font.options : undefined);
  if (!('sans' in font)) return next;
  const declaration = readLatexPackages(next).find((item) => item.name === font.package)!;
  const lineEnd = next.indexOf('\n', declaration.offset);
  const newline = next[lineEnd - 1] === '\r' ? '\r\n' : '\n';
  return next.slice(0, lineEnd + 1) + '\\renewcommand{\\familydefault}{\\sfdefault}' + newline + next.slice(lineEnd + 1);
}
