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
import { parseLatex, serializeLatex } from '../src/latex';

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
  expect(serializeLatex(state.doc)).toBe(wrap(String.raw`\textcolor[HTML]{254EAD}{\colorbox[HTML]{FFF29D}{Text}}`, preamble));
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
