import { expect, test } from 'bun:test';
import { blankLatex, latexPaperSettings, setLatexGeometry } from '../src/latex';

test('new files start with an explicit A4 sheet and one-inch margins', () => {
  expect(blankLatex).toContain(String.raw`\usepackage[a4paper,margin=1in]{geometry}`);
  expect(latexPaperSettings(blankLatex)).toMatchObject({ paperSize: 'a4paper', margin: '1in' });
});

test('geometry edits fold legacy overrides into the package and retain unrelated options', () => {
  const source = String.raw`\documentclass{article}
\usepackage{amsmath,geometry}
\geometry{paper=letterpaper, hmargin={20mm,25mm}, includehead}
% \geometry{margin=3in}
\geometry{landscape}
\geometry{margin=1in}
\begin{document}
\geometry{margin=4in}
\end{document}`;
  const updated = setLatexGeometry(source, { paperSize: 'a5paper', margin: '25mm' });
  expect(updated).toBe(String.raw`\documentclass{article}
\usepackage{amsmath}
\usepackage[a5paper,hmargin={20mm,25mm},includehead,landscape,margin=25mm]{geometry}
% \geometry{margin=3in}
\begin{document}
\geometry{margin=4in}
\end{document}`);
  expect(latexPaperSettings(updated)).toEqual({
    paperSize: 'a5paper',
    orientation: 'landscape',
    margin: '25mm',
  });
});

test('effective paper follows the output driver and explicit geometry', () => {
  const options = { defaultPaper: 'a4paper' } as const;
  expect(latexPaperSettings(String.raw`\documentclass{article}`, options).paperSize).toBe('a4paper');
  expect(latexPaperSettings(String.raw`\usepackage[letterpaper,landscape]{geometry}`, options).paperSize).toBe('letterpaper');
  expect(latexPaperSettings(String.raw`\usepackage{graphicx}`, options).paperSize).toBe('letterpaper');
});
