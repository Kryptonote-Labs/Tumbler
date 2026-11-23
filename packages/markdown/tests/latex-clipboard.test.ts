import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Node } from 'prosemirror-model';
import { AllSelection } from 'prosemirror-state';
import { EditorView, noteState } from '../src/editor';
import { parseLatex, parseLatexProject, serializeLatex, serializeLatexProject } from '../src/latex';

async function withLatexEditor(source: string | Node, run: (view: EditorView) => void | Promise<void>) {
  const browser = new Window();
  const keys = [
    'window',
    'document',
    'Node',
    'HTMLElement',
    'ClipboardEvent',
    'MutationObserver',
    'getComputedStyle',
  ] as const;
  const previous = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? browser : browser[key],
    });
  const view = new EditorView(document.body, {
    state: noteState('', 0, 'copy', typeof source === 'string' ? parseLatex(source) : source),
  });
  try {
    await run(view);
  } finally {
    view.destroy();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browser.happyDOM.close();
  }
}

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
