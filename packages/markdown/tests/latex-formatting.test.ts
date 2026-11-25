import { expect, test } from 'bun:test';
import { TextSelection } from 'prosemirror-state';
import {
  latexLinkSelection,
  latexSelectionAlignment,
  latexStyleActive,
  noteState,
  setLatexAlignment,
  setLatexLink,
  setLatexStyle,
  toggleLatexStyle,
  undo,
} from '../src/editor';
import { latexSourceMap, parseLatex, serializeLatex } from '../src/latex';

const wrap = (body: string, preamble = '') =>
  '\\documentclass{article}\n' + preamble + '\\begin{document}\n' + body + '\n\\end{document}\n';

test.each([
  ['underline', String.raw`\underline{text}`],
  ['underline', String.raw`\uline{text}`],
  ['strike', String.raw`\sout{text}`],
  ['mono', String.raw`\texttt{text}`],
  ['smallCaps', String.raw`\textsc{text}`],
  ['superscript', String.raw`\textsuperscript{text}`],
  ['subscript', String.raw`\textsubscript{text}`],
  ['colour', String.raw`\textcolor[HTML]{254EAD}{text}`],
  ['highlight', String.raw`\colorbox[HTML]{FFF29D}{text}`],
  ['highlight', String.raw`\bgroup\markoverwith{\textcolor[HTML]{FFF29D}{\rule[-0.5ex]{2pt}{2.5ex}}}\ULon{text}`],
  ['size', String.raw`{\large text}`],
  ['link', String.raw`\href{https://example.com/foo%20bar#anchor}{text}`],
  ['link', String.raw`\url{https://example.com/foo%20bar#anchor}`],
])('opens %s as an editable mark and preserves source %s', (style, inline) => {
  const source = wrap(inline);
  const document = parseLatex(source);
  expect(document.firstChild?.firstChild?.marks[0]?.attrs.style).toBe(style);
  expect(serializeLatex(document)).toBe(source);
});

test('adds packages after text takes a mark and undoes the formatting and its preamble together', () => {
  let state = noteState('', 0, 'test', parseLatex(wrap('text')));
  const dispatch = (tr: typeof state.tr) => { state = state.apply(tr); };
  toggleLatexStyle('underline')(state, dispatch);
  expect(serializeLatex(state.doc)).toBe(wrap('text'));
  dispatch(state.tr.insertText('under '));
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`\uline{under }text`, '\\usepackage[normalem]{ulem}\n'));
  undo(state, dispatch);
  expect(serializeLatex(state.doc)).toBe(wrap('text'));
});

test('switches colours and reuses imported package declarations', () => {
  const preamble = '\\RequirePackage[table]{xcolor,graphicx}\n';
  let state = noteState('', 0, 'test', parseLatex(wrap('Text', preamble)));
  const dispatch = (tr: typeof state.tr) => { state = state.apply(tr); };
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)));
  setLatexStyle({ style: 'colour', colour: '#a32128' })(state, dispatch);
  setLatexStyle({ style: 'colour', colour: '#254ead' })(state, dispatch);
  setLatexStyle({ style: 'highlight', colour: '#fff29d' })(state, dispatch);
  expect(latexStyleActive(state, 'colour', '#a32128')).toBe(false);
  expect(latexStyleActive(state, 'colour', '#254ead')).toBe(true);
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`\textcolor[HTML]{254EAD}{\bgroup\markoverwith{\textcolor[HTML]{FFF29D}{\rule[-0.5ex]{2pt}{2.5ex}}}\ULon{Text}}`, preamble + '\\usepackage[normalem]{ulem}\n'));
});

test('preserves a generated alignment when editing, then reparsing the paragraph', () => {
  let state = noteState('', 0, 'test', parseLatex(wrap('One\n\nTwo')));
  const dispatch = (tr: typeof state.tr) => { state = state.apply(tr); };
  setLatexAlignment('right')(state, dispatch);
  expect(latexSelectionAlignment(state)).toBe('right');
  expect(serializeLatex(state.doc)).toBe(wrap('{\\raggedleft One\\par}\n\nTwo'));
  state = noteState('', 0, 'test', parseLatex(serializeLatex(state.doc)));
  setLatexAlignment('justify')(state, dispatch);
  expect(latexSelectionAlignment(state)).toBe('justify');
  expect(serializeLatex(parseLatex(serializeLatex(state.doc)))).toBe(serializeLatex(state.doc));
});

test('edits the whole link at the caret and leaves its printable text on removal', () => {
  let state = noteState('', 0, 'test', parseLatex(wrap(String.raw`\url{https://example.com/foo%20bar#anchor}`)));
  const dispatch = (tr: typeof state.tr) => { state = state.apply(tr); };
  const initial = latexLinkSelection(state)!;
  expect(initial.href).toMatch(/foo%20bar#anchor$/);
  setLatexLink('https://example.org/?a=1&b=2#test', initial)(state, dispatch);
  expect(latexLinkSelection(state)?.href).toBe('https://example.org/?a=1&b=2#test');
  expect(serializeLatex(state.doc)).toBe(wrap(
    String.raw`\href{https://example.org/?a=1&b=2\#test}{https://example.com/foo\%20bar\#anchor}`,
    '\\usepackage[hidelinks]{hyperref}\n',
  ));
  setLatexLink('', latexLinkSelection(state)!)(state, dispatch);
  expect(serializeLatex(state.doc)).not.toContain('\\href');
});

test('size groups keep a selected leading space and remain valid after formatting is removed', () => {
  let state = noteState('', 0, 'test', parseLatex(wrap('A  B')));
  const dispatch = (tr: typeof state.tr) => { state = state.apply(tr); };
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, 2, 5)));
  setLatexStyle({ style: 'size', size: 'tiny' })(state, dispatch);
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`A{\tiny{}  B}`));
  expect(parseLatex(serializeLatex(state.doc)).textContent).toBe('A  B');

  state = noteState('', 0, 'test', parseLatex(wrap(String.raw`{\tiny\emph{word}}`)));
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, 5)));
  toggleLatexStyle('em')(state, dispatch);
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`{\tiny{}word}`));
});

test('typing around an imported URL keeps its chosen package declarations', () => {
  const preamble = '\\usepackage{url}\n';
  let state = noteState('', 0, 'test', parseLatex(wrap(String.raw`A \url{https://example.com/}`, preamble)));
  state = state.apply(state.tr.insertText('An', 1, 2));
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`An \url{https://example.com/}`, preamble));
});

test('applies text formatting on either side of a verbatim atom', () => {
  let state = noteState('', 0, 'test', parseLatex(wrap(String.raw`A \verb|hi| B`)));
  const dispatch = (tr: typeof state.tr) => { state = state.apply(tr); };
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
  toggleLatexStyle('superscript')(state, dispatch);
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`\textsuperscript{A }\verb|hi|\textsuperscript{ B}`));
});

test('typing after a link stays outside it', () => {
  let state = noteState('', 0, 'test', parseLatex(wrap('Label')));
  const dispatch = (tr: typeof state.tr) => { state = state.apply(tr); };
  setLatexLink('https://example.com/', { from: 1, to: 6 })(state, dispatch);
  dispatch(state.tr.setSelection(TextSelection.create(state.doc, 6)));
  dispatch(state.tr.insertText(' outside'));
  expect(serializeLatex(state.doc)).toBe(wrap(
    String.raw`\href{https://example.com/}{Label} outside`, '\\usepackage[hidelinks]{hyperref}\n',
  ));
});

test('shows and overrides alignment inherited from an imported environment', () => {
  const source = wrap('\\begin{center}\nCentred\n\\end{center}');
  let state = noteState('', 0, 'test', parseLatex(source));
  const dispatch = (tr: typeof state.tr) => { state = state.apply(tr); };
  expect(latexSelectionAlignment(state)).toBe('center');
  setLatexAlignment('justify')(state, dispatch);
  expect(latexSelectionAlignment(state)).toBe('justify');
  expect(serializeLatex(state.doc)).toContain(String.raw`{\leftskip=0pt\rightskip=0pt\parfillskip=0pt plus 1fil\relax Centred\par}`);
});

test('reuses hyperref when bookmark already provides it', () => {
  const preamble = '\\usepackage{bookmark}\n';
  let state = noteState('', 0, 'test', parseLatex(wrap('Label', preamble)));
  setLatexLink('https://example.com/', { from: 1, to: 6 })(state, (tr) => { state = state.apply(tr); });
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`\href{https://example.com/}{Label}`, preamble));
});

test('a paragraph comment ends before the closing alignment declaration', () => {
  let state = noteState('', 0, 'test', parseLatex(wrap('Some text % author note')));
  setLatexAlignment('center')(state, (tr) => { state = state.apply(tr); });
  const source = serializeLatex(state.doc);
  expect(source).toBe(wrap('{\\centering Some text % author note\n\\par}'));
  expect(serializeLatex(parseLatex(source))).toBe(source);
});

test('formats prose around a URL without placing its percent escape in a TeX argument', () => {
  const preamble = '\\usepackage{url}\n';
  let state = noteState('', 0, 'test', parseLatex(wrap(String.raw`A \url{https://example.com/a%20b} C`, preamble)));
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 6)));
  toggleLatexStyle('strong')(state, (tr) => { state = state.apply(tr); });
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`\textbf{A }\url{https://example.com/a%20b}\textbf{ C}`, preamble));
});

test('source carets follow escaped text inside aligned highlights', () => {
  const source = wrap(String.raw`{\centering Hello \bgroup\markoverwith{\textcolor[HTML]{FFF29D}{\rule[-0.5ex]{2pt}{2.5ex}}}\ULon{R\&D}\par}`);
  const doc = parseLatex(source);
  const map = latexSourceMap(doc);
  const offset = source.indexOf('D}\\par');
  const position = map.positionAt({ offset });
  expect(position).toBe(9);
  expect(map.sourceAt(position!)?.offset).toBe(offset);
  expect(serializeLatex(doc)).toBe(source);
});
