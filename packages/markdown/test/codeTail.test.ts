import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { EditorView, continueAfterNoteCode, noteState, undo } from '@tumblerjs/markdown/editor';

test('clicking blank space below final code starts a paragraph, preserves source, and is undoable', async () => {
  const window = new Window();
  const keys = [
    'window',
    'document',
    'Node',
    'HTMLElement',
    'MutationObserver',
    'getComputedStyle',
  ] as const;
  const previous = keys.map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? window : window[key],
    });
  const area = window.document.createElement('div');
  window.document.body.append(area);
  const view = new EditorView(area as unknown as HTMLElement, {
    state: noteState('Prose.\n\n```bash\nbun run dev\n```'),
    dispatchTransaction: (tr) => view.updateState(view.state.apply(tr)),
  });
  view.dom.getBoundingClientRect = () => new window.DOMRect(20, 0, 500, 400) as unknown as DOMRect;
  const code = view.dom.querySelector<HTMLElement>('.note-code-block')!;
  code.getBoundingClientRect = () => new window.DOMRect(20, 50, 500, 100) as unknown as DOMRect;
  // The writing area's padding is outside the editable root, but should behave the same as its blank tail.
  area.addEventListener(
    'mousedown',
    (event) => {
      continueAfterNoteCode(view, event as unknown as MouseEvent);
      event.stopPropagation();
    },
    true,
  );
  const click = (target: EventTarget, x: number, y: number, shiftKey = false) =>
    target.dispatchEvent(
      new window.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
        shiftKey,
      }) as unknown as Event,
    );
  try {
    const before = view.state.doc;
    click(code, 50, 100);
    click(area as unknown as EventTarget, 10, 200);
    click(area as unknown as EventTarget, 50, 200, true);
    view.setProps({ editable: () => false });
    click(area as unknown as EventTarget, 50, 200);
    expect(view.state.doc.eq(before)).toBe(true);
    view.setProps({ editable: () => true });
    click(area as unknown as EventTarget, 50, 200);
    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.doc.child(1).eq(before.child(1))).toBe(true);
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(view.state.selection.from).toBe(before.content.size + 1);
    click(area as unknown as EventTarget, 50, 220);
    expect(view.state.doc.childCount).toBe(3);
    undo(view.state, view.dispatch);
    expect(view.state.doc.eq(before)).toBe(true);
    // The editor's own blank area also works when no outer padding is involved.
    click(view.dom, 50, 200);
    expect(view.state.doc.lastChild?.type.name).toBe('paragraph');
  } finally {
    view.destroy();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await window.happyDOM.close();
  }
});
