import { expect, test } from 'bun:test';
import { Window, type HTMLElement as HappyHTMLElement } from 'happy-dom';
import { noteHeadings, parseNote, serializeNote } from '@tumblerjs/markdown';
import { EditorView, noteState } from '@tumblerjs/markdown/editor';

test('heading fragments cover Unicode, formatting and duplicate titles without collisions', () => {
  const doc = parseNote(
    '# **Hello**, `world`!\n\n## Café 中文\n\n### Hello, world!\n\n#### Hello, world!-1\n\n##### Hello, world!\n\n###### 🌷',
  );
  expect(noteHeadings(doc).map(({ slug }) => slug)).toEqual([
    'hello-world',
    'café-中文',
    'hello-world-1',
    'hello-world-1-1',
    'hello-world-2',
    'section',
  ]);
});

test('heading links navigate only their editor, update after edits, and preserve Markdown and selection', async () => {
  const window = new Window({ url: 'https://local/app' });
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
  const source =
    '[Python](#python) [Next](#python-1) [Space](#hello%20world) [[#Hello World]] [Missing](#missing)\n\n## Python\n\n## Python\n\n## Hello World';
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const view = new EditorView(host as unknown as HTMLElement, {
    state: noteState(source),
    dispatchTransaction: (tr) => view.updateState(view.state.apply(tr)),
  });
  const other = new EditorView(host as unknown as HTMLElement, { state: noteState(source) });
  const scrolls: string[] = [];
  const headings = host.querySelectorAll<HappyHTMLElement>('[data-note-heading]');
  headings.forEach((node, index) => {
    node.scrollIntoView = () => scrolls.push(`${index}:${node.getAttribute('data-note-heading')}`);
  });
  const click = (index: number, ctrlKey = false, detail = 1) => {
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ctrlKey,
      detail,
    });
    host.querySelectorAll('a')[index]!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  };
  try {
    const before = serializeNote(view.state.doc);
    const selection = view.state.selection;
    click(0);
    expect(scrolls).toEqual(['0:python']);
    view.dom.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }) as unknown as KeyboardEvent,
    );
    expect(scrolls).toEqual(['0:python', '0:python']);
    scrolls.length = 0;
    click(0, true);
    click(1, true);
    click(2, true);
    click(3, true);
    expect(scrolls).toEqual(['0:python', '1:python-1', '2:hello-world', '2:hello-world']);
    click(4, true);
    expect(scrolls).toHaveLength(4);
    view.setProps({ editable: () => false });
    click(0);
    click(0, false, 0);
    expect(scrolls).toHaveLength(6);
    expect(serializeNote(view.state.doc)).toBe(before);
    expect(view.state.selection.eq(selection)).toBe(true);
    expect(window.location.hash).toBe('');
    const first = noteHeadings(view.state.doc)[0]!;
    view.dispatch(view.state.tr.insertText('New ', first.pos + 1));
    expect(host.querySelector('[data-note-heading]')?.getAttribute('data-note-heading')).toBe(
      'new-python',
    );
    expect(noteHeadings(other.state.doc)[0]?.slug).toBe('python');
    expect([...host.querySelectorAll('[data-note-heading]')].every((node) => !node.id)).toBe(true);
  } finally {
    view.destroy();
    other.destroy();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await window.happyDOM.close();
  }
});
