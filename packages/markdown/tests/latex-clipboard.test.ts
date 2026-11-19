import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { AllSelection } from 'prosemirror-state';
import { EditorView, noteState } from '../src/editor';
import { parseLatex, serializeLatex } from '../src/latex';

test('copy and paste preserves equations, delimiters and opaque LaTeX', async () => {
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
  const source = String.raw`\chapter{Introduction}

\section*[Short]{Long title}

\textit{Italic with \textbf{nested bold}}. Energy $x^2$ and \alpha.

\[
  \sqrt{x}
\]

\begin{verbatim}
raw & <value>
\end{verbatim}`;
  const view = new EditorView(document.body, {
    state: noteState('', 0, 'copy', parseLatex(source)),
  });
  try {
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
    const clipboard = view.serializeForClipboard(view.state.selection.content());
    expect(clipboard.text).toBe(source);
    expect(view.pasteHTML(clipboard.dom.innerHTML)).toBe(true);
    expect(serializeLatex(view.state.doc)).toBe(source);
  } finally {
    view.destroy();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browser.happyDOM.close();
  }
});
