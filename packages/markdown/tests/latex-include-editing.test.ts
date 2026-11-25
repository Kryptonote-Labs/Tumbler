import { expect, test } from 'bun:test';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from '../src/editor';
import { latexFlow, paginateLatex, parseLatexProject, serializeLatexProject } from '../src/latex';
import { withLatexEditor } from './latex-editor-fixture';

function key(view: EditorView, name: string) {
  const event = new window.KeyboardEvent('keydown', { key: name });
  return view.someProp('handleKeyDown', (handle) => handle(view, event));
}

const entry = 'main.tex';
const first = 'abstract.tex';
const second = 'chapter.tex';
const main = String.raw`\begin{document}
\input{abstract}
\input{chapter}
\end{document}`;
const files = new Map([[entry, main], [first, 'Abstract text.\n'], [second, 'Chapter text.\n']]);

test.each(['before', 'between', 'after'])('writing %s components edits only the including file', async (where) => {
  await withLatexEditor(parseLatexProject(entry, files), (view) => {
    const index = ['before', 'between', 'after'].indexOf(where);
    const target = view.dom.querySelectorAll('.latex-include-boundary > span')[index]!;
    target.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, cancelable: true }));
    expect(serializeLatexProject(view.state.doc)?.files).toEqual(files);

    const at = view.state.selection.head;
    const text = 'Parent paragraph.';
    expect(view.someProp('handleTextInput', (handle) =>
      handle(view, at, at, text, () => view.state.tr.insertText(text)))).toBe(true);

    const revised = serializeLatexProject(view.state.doc)!.files;
    expect(revised.get(first)).toBe(files.get(first)!);
    expect(revised.get(second)).toBe(files.get(second)!);
    const lines = revised.get(entry)!.split('\n').filter(Boolean);
    expect(lines).toEqual([
      String.raw`\begin{document}`,
      ...(index === 0 ? [text] : []),
      String.raw`\input{abstract}`,
      ...(index === 1 ? [text] : []),
      String.raw`\input{chapter}`,
      ...(index === 2 ? [text] : []),
      String.raw`\end{document}`,
    ]);
    const reparsed = parseLatexProject(entry, revised);
    expect(serializeLatexProject(reparsed)?.files).toEqual(revised);
    expect(reparsed.child(index).textContent).toBe(text);
    expect(key(view, 'Ctrl-z')).toBe(true);
    expect(serializeLatexProject(view.state.doc)?.files).toEqual(files);
  });
});

test('arrow out across a terminal page break and paste onto the next page', async () => {
  const withBreak = new Map(files);
  withBreak.set(first, 'Abstract text.\n\\newpage\n');
  await withLatexEditor(parseLatexProject(entry, withBreak), (view) => {
    const component = view.state.doc.firstChild!;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2 + 'Abstract text.'.length)));
    // DOM geometry is unavailable in the test browser. The text caret is already at the line end.
    view.endOfTextblock = () => true;
    expect(key(view, 'ArrowRight')).toBe(true);
    expect(view.state.selection.head).toBe(component.nodeSize);
    expect(serializeLatexProject(view.state.doc)?.files).toEqual(withBreak);
    expect(view.pasteText('Parent paragraph.')).toBe(true);
    const snapshot = serializeLatexProject(view.state.doc)!.files;
    expect(snapshot.get(entry)).toContain('\\input{abstract}\n\nParent paragraph.\n\n\\input{chapter}');
    expect(snapshot.get(first)).toBe(withBreak.get(first)!);

    const document = parseLatexProject(entry, snapshot);
    const flow = latexFlow(document);
    const after = document.firstChild!.nodeSize;
    const starts = [{ position: 1, top: 0, bottom: 12 }, {
      position: after - 2, top: 12, bottom: 12,
    }, { position: after, top: 12, bottom: 24 }];
    const pages = paginateLatex(starts.map((block) => ({ ...block, flow: flow.get(block.position) })), 100, 20, 12);
    expect(pages.breaks.map((item) => item.position)).toEqual([after]);
  });
});
