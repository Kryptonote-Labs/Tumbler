import { Window } from 'happy-dom';
import type { Node } from 'prosemirror-model';
import { EditorView, noteState } from '../src/editor';
import { parseLatex } from '../src/latex';

export async function withLatexEditor(source: string | Node, run: (view: EditorView) => void | Promise<void>) {
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
