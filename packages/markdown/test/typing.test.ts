import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { EditorView, noteState, undo, TextSelection } from '@tumblerjs/markdown/editor';
import { serializeNote } from '@tumblerjs/markdown';

test('typing shortcuts format in place, keep nested marks, and Backspace restores the syntax', async () => {
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
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const view = new EditorView(host as unknown as HTMLElement, {
    state: noteState(''),
    dispatchTransaction: (transaction) => view.updateState(view.state.apply(transaction)),
  });
  const type = (text: string) => {
    for (const character of text) {
      const { from, to } = view.state.selection;
      const handled = view.someProp('handleTextInput', (handler) =>
        handler(view, from, to, character, () => view.state.tr.insertText(character, from, to)),
      );
      if (!handled) view.dispatch(view.state.tr.insertText(character, from, to));
    }
  };
  try {
    type('# ');
    expect(view.state.doc.firstChild?.type.name).toBe('heading');
    const backspace = new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    view.dom.dispatchEvent(backspace as unknown as KeyboardEvent);
    expect(view.state.doc.textContent).toBe('# ');
    view.updateState(noteState(''));
    type('Before =🟢**bold green**= after');
    expect(view.state.doc.textContent).toBe('Before bold green after');
    const marks: string[] = [];
    view.state.doc.descendants((node) => {
      if (node.text === 'bold green') marks.push(...node.marks.map((mark) => mark.type.name));
    });
    expect(marks).toEqual(['strong', 'colour']);
    expect(serializeNote(view.state.doc)).toContain('**=🟢bold green=**');
    view.updateState(noteState(''));
    type('==🟣purple==');
    expect(view.state.doc.textContent).toBe('purple');
    expect(view.state.doc.firstChild?.firstChild?.marks[0]?.type.name).toBe('highlight');
    expect(undo(view.state)).toBe(true);
    view.updateState(noteState(''));
    type('- [ ] Task');
    const checkbox = view.dom.querySelector<HTMLInputElement>('input[data-note-task]')!;
    expect(checkbox.checked).toBe(false);
    checkbox.checked = true;
    checkbox.dispatchEvent(new window.Event('change') as unknown as Event);
    expect(view.state.doc.firstChild?.firstChild?.attrs.checked).toBe(true);
    view.dom.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }) as unknown as KeyboardEvent,
    );
    expect(view.state.doc.firstChild?.childCount).toBe(2);
    expect(view.state.doc.firstChild?.lastChild?.attrs.checked).toBe(false);
    view.updateState(noteState(''));
    type('```typescript');
    view.dom.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }) as unknown as KeyboardEvent,
    );
    expect(view.state.doc.firstChild?.type.name).toBe('code_block');
    expect(view.state.doc.firstChild?.attrs.params).toBe('typescript');
    for (const source of ['---', '***', '___', '- - -']) {
      // Use model text because imported standalone delimiters are already parsed as rules.
      view.updateState(noteState(''));
      view.dispatch(view.state.tr.insertText(source));
      const before = view.state.doc;
      view.dom.dispatchEvent(
        new window.KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
        }) as unknown as KeyboardEvent,
      );
      expect(view.state.doc.firstChild?.type.name).toBe('horizontal_rule');
      expect(view.state.doc.lastChild?.type.name).toBe('paragraph');
      expect(view.state.doc.childCount).toBe(2);
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
      expect(undo(view.state, view.dispatch)).toBe(true);
      expect(view.state.doc.eq(before)).toBe(true);
    }
    view.updateState(noteState(''));
    view.dispatch(view.state.tr.insertText('---'));
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    view.dom.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }) as unknown as KeyboardEvent,
    );
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph');
    view.updateState(noteState('```text\n---\n```'));
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
    view.dom.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      }) as unknown as KeyboardEvent,
    );
    expect(view.state.doc.firstChild?.type.name).toBe('code_block');
    expect(view.state.doc.firstChild?.textContent).toBe('---\n');
  } finally {
    view.destroy();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await window.happyDOM.close();
  }
});
