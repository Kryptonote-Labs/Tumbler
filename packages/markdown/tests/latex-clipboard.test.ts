import { expect, test } from 'bun:test';
import { AllSelection, TextSelection } from 'prosemirror-state';
import { parseLatexProject, serializeLatex, serializeLatexProject } from '../src/latex';

import { withLatexEditor } from './latex-editor-fixture';

test('copy and paste preserves equations, delimiters and opaque LaTeX', async () => {
  const source = String.raw`\chapter{Introduction}

\section*[Short]{Long \textnormal{title} with $x^2$ and \%}

\textit{Italic with \textbf{nested bold}}. Energy $x^2$ and \alpha.

\[
  \sqrt{x}
\]

\begin{verbatim}
raw & <value>
\end{verbatim}`;
  await withLatexEditor(source, (view) => {
    view.state.doc.check();
    expect(view.dom.querySelector('[data-latex-heading] [data-latex-font="normal"]')?.textContent).toBe('title');
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    const clipboard = view.serializeForClipboard(view.state.selection.content());
    expect(clipboard.text).toBe(source);
    expect(view.pasteHTML(clipboard.dom.innerHTML)).toBe(true);
    view.state.doc.check();
    expect(serializeLatex(view.state.doc)).toBe(source);
  });
});

test('replacing a project selection with its clipboard keeps the included file separate', async () => {
  const source = new Map([
    ['main.tex', '\\begin{document}\nBefore.\n\n\\input{chapter}\n\nAfter.\n\\end{document}'],
    ['chapter.tex', 'Chapter text.\n'],
  ]);
  await withLatexEditor(parseLatexProject('main.tex', source), (view) => {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    const clipboard = view.serializeForClipboard(view.state.selection.content());
    expect(view.pasteHTML(clipboard.dom.innerHTML)).toBe(true);
    expect(serializeLatexProject(view.state.doc)?.files).toEqual(source);
  });
});

test('pasting an include into a new entry directory keeps its text readable', async () => {
  const source = parseLatexProject('paper/main.tex', new Map([
    ['paper/main.tex', String.raw`\begin{document}\input{../shared/intro}\end{document}`],
    ['shared/intro.tex', 'Shared introduction.\n'],
  ]));
  let clipboard = '';
  await withLatexEditor(source, (view) => {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    clipboard = view.serializeForClipboard(view.state.selection.content()).dom.innerHTML;
  });
  const target = parseLatexProject('main.tex', new Map([
    ['main.tex', String.raw`\begin{document}Target.\end{document}`],
  ]));
  await withLatexEditor(target, (view) => {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    expect(view.pasteHTML(clipboard)).toBe(true);
    const main = serializeLatexProject(view.state.doc)?.files.get('main.tex');
    expect(main).toContain('Shared introduction.');
    expect(main).not.toContain('\\input');
  });
});

test.each(['LF', 'CRLF'])(
  'editing rendered text preserves an existing %s source line break',
  async (ending) => {
    const source = ['The meeting begins shortly.', 'Bring a copy of the agenda.'].join(
      ending === 'LF' ? '\n' : '\r\n',
    );
    await withLatexEditor(source, async (view) => {
      const text = view.dom.querySelector('p')!.lastChild!;
      text.nodeValue += ' Please arrive early.';
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(serializeLatex(view.state.doc)).toBe(source + ' Please arrive early.');
    });
  },
);

test('Enter continues the current paragraph alignment', async () => {
  await withLatexEditor(String.raw`{\centering OneTwo\par}`, (view) => {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));
    const event = new window.KeyboardEvent('keydown', { key: 'Enter' });
    expect(view.someProp('handleKeyDown', (handle) => handle(view, event))).toBe(true);
    expect(serializeLatex(view.state.doc)).toBe('{\\centering One\\par}\n\n{\\centering Two\\par}');
  });
});
