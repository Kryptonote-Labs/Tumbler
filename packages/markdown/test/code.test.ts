import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { serializeNote } from '@tumblerjs/markdown';
import { noteCodeHighlighting } from '../src/code-highlighting';
import {
  EditorView,
  noteState,
  noteCodeBlock,
  setNoteCodeLanguage,
  selectNoteCode,
  leaveNoteCode,
  indentNoteCode,
  TextSelection,
  undo,
  receiveTransaction,
} from '@tumblerjs/markdown/editor';

test('TypeScript aliases highlight equally and unchanged blocks keep colours after a document replacement', () => {
  const code =
    'console.log("This is a really REALLY long line of code that should wrap without changing its source")';
  const source = `\`\`\`typescript\n${code}\n\`\`\`\n\n\`\`\`ts\n${code}\n\`\`\``;
  const highlighting = noteCodeHighlighting();
  let local = noteState(source, 0, 'local');
  local = local.reconfigure({ plugins: [...local.plugins, highlighting] });
  const initial = highlighting.getState(local)!.find();
  const secondPos = local.doc.firstChild!.nodeSize;
  expect(initial.filter((span) => span.from < secondPos).map(({ from, to }) => [from, to])).toEqual(
    initial
      .filter((span) => span.from > secondPos)
      .map(({ from, to }) => [from - secondPos, to - secondPos]),
  );
  expect(initial.length).toBeGreaterThan(2);

  // Agent updates replace document content, including blocks whose text did not change.
  const remote = noteState(source, 0, 'remote');
  const updated = remote.tr.insertText('!', remote.doc.content.size - 2).doc;
  const edit = remote.tr.replaceWith(0, remote.doc.content.size, updated.content);
  local = local.apply(receiveTransaction(local, edit.steps, ['remote']));

  const fresh = noteState(serializeNote(local.doc)).reconfigure({ plugins: [highlighting] });
  expect(
    highlighting
      .getState(local)!
      .find()
      .map(({ from, to }) => [from, to]),
  ).toEqual(
    highlighting
      .getState(fresh)!
      .find()
      .map(({ from, to }) => [from, to]),
  );
  expect(local.doc.firstChild!.textContent).toBe(code);
});

test('code commands preserve code through language changes, indentation, undo, and leaving the block', () => {
  let state = noteState('```java\npublic class Example {\n  int count = 42;\n}\n```');
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
  expect(noteCodeBlock(state)?.node.attrs.params).toBe('java');
  const dispatch = (transaction: typeof state.tr) => {
    state = state.apply(transaction);
  };
  setNoteCodeLanguage('typescript')(state, dispatch);
  expect(serializeNote(state.doc)).toStartWith('```typescript\n');
  expect(state.doc.textContent).toContain('public class Example');
  selectNoteCode(state, dispatch);
  indentNoteCode()(state, dispatch);
  expect(state.doc.textContent).toBe('  public class Example {\n    int count = 42;\n  }');
  indentNoteCode(true)(state, dispatch);
  expect(state.doc.textContent).toBe('public class Example {\n  int count = 42;\n}');
  leaveNoteCode(state, dispatch);
  expect(state.doc.lastChild?.type.name).toBe('paragraph');
  expect(noteCodeBlock(state)).toBeUndefined();
  expect(state.doc.firstChild?.attrs.params).toBe('typescript');
  expect(undo(state)).toBe(true);
});

test('Java code highlights without changing source, excludes spelling, and handles unknown languages', async () => {
  const window = new Window();
  const keys = [
    'window',
    'document',
    'Node',
    'HTMLElement',
    'MutationObserver',
    'getComputedStyle',
    'navigator',
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
    state: noteState(
      'Prose.\n\n```java\npublic static void main(String[] args) {\n  String text = "<tag> 🟢";\n}\n```',
    ),
    attributes: { spellcheck: 'true' },
    dispatchTransaction: (transaction) => view.updateState(view.state.apply(transaction)),
  });
  const key = (key: string, shiftKey = false) =>
    view.dom.dispatchEvent(
      new window.KeyboardEvent('keydown', {
        key,
        shiftKey,
        bubbles: true,
      }) as unknown as KeyboardEvent,
    );
  try {
    const source = view.state.doc.textContent;
    const copied: string[] = [];
    window.navigator.clipboard.writeText = async (text) => {
      copied.push(text);
    };
    expect(view.dom.querySelector('.note-code-language')?.textContent).toBe('Java');
    const copy = view.dom.querySelector<HTMLButtonElement>('.note-code-copy')!;
    copy.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(copied).toEqual([view.state.doc.lastChild!.textContent]);
    expect(copy.dataset.state).toBe('copied');
    expect(serializeNote(view.state.doc)).not.toContain('Copy code');

    const pre = view.dom.querySelector('pre')!;
    expect(view.dom.getAttribute('spellcheck')).toBe('true');
    expect(pre.getAttribute('spellcheck')).toBe('false');
    expect(pre.querySelector('code')?.getAttribute('spellcheck')).toBe('false');
    expect(pre.querySelector('.hljs-keyword')?.textContent).toBe('public');
    expect(pre.querySelector('.hljs-string')?.textContent).toContain('<tag> 🟢');
    expect(pre.querySelector('tag')).toBeNull();
    expect(view.state.doc.textContent).toBe(source);
    let codePos = 0;
    view.state.doc.forEach((node, offset) => {
      if (node.type.name === 'code_block') codePos = offset;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, codePos + 1)));
    setNoteCodeLanguage('language-not-installed')(view.state, view.dispatch);
    expect(view.dom.querySelectorAll('pre [class*=hljs-]')).toHaveLength(0);
    expect(view.state.doc.textContent).toBe(source);
    expect(view.dom.querySelector('.note-code-language')?.textContent).toBe(
      'language-not-installed',
    );
    setNoteCodeLanguage('java')(view.state, view.dispatch);
    expect(view.dom.querySelector('pre .hljs-keyword')).not.toBeNull();
    view.dispatch(view.state.tr.insertText('// note\n', codePos + 1));
    expect(view.dom.querySelector('pre .hljs-comment')?.textContent).toBe('// note');
    const text = noteCodeBlock(view.state)!.node.textContent;
    const end = codePos + 1 + text.indexOf('  String') + '  String text = "<tag> 🟢";'.length;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
    key('Enter');
    expect(view.state.doc.textContent).toContain('"<tag> 🟢";\n  \n}');
    const from = view.state.selection.from;
    key('Tab');
    expect(view.state.selection.from).toBe(from + 2);
    key('Tab', true);
    expect(view.state.selection.from).toBe(from);
    setNoteCodeLanguage('custom-dialect')(view.state, view.dispatch);
    expect(serializeNote(view.state.doc)).toContain('```custom-dialect');
    view.updateState(noteState('```java\n  return value;\n```'));
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, view.state.doc.content.size - 1),
      ),
    );
    key('Enter');
    expect(view.state.doc.lastChild?.type.name).toBe('code_block');
    expect(view.state.doc.firstChild?.textContent).toBe('  return value;\n  ');
    key('Enter');
    expect(view.state.doc.firstChild?.textContent).toBe('  return value;');
    expect(view.state.doc.lastChild?.type.name).toBe('paragraph');
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
    undo(view.state, view.dispatch);
    expect(view.state.doc.lastChild?.type.name).toBe('code_block');
    expect(view.state.doc.firstChild?.textContent).toBe('  return value;\n  ');
    const shell = [
      'bun run dev --host 1.1.1.1',
      'custom-tool -v | other-tool --output=file',
      'echo "bun --help $USER" # custom-tool --no-colour',
      'if true; then',
      '  bun --version',
      'fi',
      'MODE=development',
    ].join('\n');
    view.updateState(noteState('```bash\n' + shell + '\n```'));
    expect([...view.dom.querySelectorAll('.hljs-title')].map((node) => node.textContent)).toEqual([
      'bun',
      'custom-tool',
      'other-tool',
      'bun',
    ]);
    expect([...view.dom.querySelectorAll('.hljs-attr')].map((node) => node.textContent)).toEqual([
      '--host',
      '-v',
      '--output',
      '--version',
    ]);
    expect(
      [...view.dom.querySelectorAll('.hljs-string')].map((node) => node.textContent).join(''),
    ).toBe('"bun --help $USER"');
    expect(view.dom.querySelector('.hljs-variable')?.textContent).toBe('$USER');
    expect(view.dom.querySelector('.hljs-comment')?.textContent).toBe('# custom-tool --no-colour');
    expect([...view.dom.querySelectorAll('.hljs-keyword')].map((node) => node.textContent)).toEqual(
      ['if', 'then', 'fi'],
    );
    expect(view.state.doc.textContent).toBe(shell);
    expect(view.dom.querySelector('code')?.textContent).toBe(shell);
    const pickers: { change: (language: string) => void; updates: string[]; destroyed: boolean }[] =
      [];
    view.updateState(
      noteState(
        'Prose.\n\n```java\nfirst();\n```\n\n```java\nsecond();\n```',
        0,
        undefined,
        undefined,
        {
          codeLanguagePicker(host, language, change) {
            const picker = { change, updates: [language], destroyed: false };
            pickers.push(picker);
            host.textContent = language;
            return {
              update(value) {
                picker.updates.push(value);
                host.textContent = value;
              },
              destroy() {
                picker.destroyed = true;
              },
            };
          },
        },
      ),
    );
    // Moving the blocks before choosing must not leave the picker targeting an old position.
    view.dispatch(view.state.tr.insertText('More ', 1));
    const beforeLanguageChange = view.state.doc.textContent;
    pickers[1]!.change('javascript');
    expect(view.state.doc.child(1).attrs.params).toBe('java');
    expect(view.state.doc.child(2).attrs.params).toBe('javascript');
    expect(noteCodeBlock(view.state)?.node.textContent).toBe('second();');
    expect(view.state.doc.textContent).toBe(beforeLanguageChange);
    expect(pickers[1]!.updates.at(-1)).toBe('javascript');
    undo(view.state, view.dispatch);
    expect(view.state.doc.child(2).attrs.params).toBe('java');
    view.setProps({ editable: () => false });
    expect(view.dom.querySelector<HTMLElement>('.note-code-language')?.inert).toBe(true);
    pickers[1]!.change('python');
    expect(view.state.doc.child(2).attrs.params).toBe('java');
    view.updateState(noteState('No code.'));
    expect(pickers.every((picker) => picker.destroyed)).toBe(true);
  } finally {
    view.destroy();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await window.happyDOM.close();
  }
});
