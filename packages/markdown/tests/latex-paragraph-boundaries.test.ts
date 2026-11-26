import { expect, test } from 'bun:test';
import { liftListItem } from 'prosemirror-schema-list';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { noteSchema } from '../src';
import { joinBackward } from 'prosemirror-commands';
import { toggleMark, undo } from '../src/editor';
import { latexHeading } from '../src/latex-editor';
import { parseLatex, serializeLatex } from '../src/latex';
import { withLatexEditor } from './latex-editor-fixture';
import type { EditorView } from '../src/editor';

/** The paragraphs the editor shows, and those the saved source reopens with. */
function paragraphs(view: EditorView) {
  const texts = (doc: typeof view.state.doc) => {
    const found: string[] = [];
    doc.descendants((node) => {
      if (node.type.name === 'paragraph') found.push(node.textContent);
    });
    return found;
  };
  return { shown: texts(view.state.doc), saved: texts(parseLatex(serializeLatex(view.state.doc))) };
}

function caretIn(view: EditorView, text: string) {
  let at = 0;
  view.state.doc.descendants((node, position) => {
    if (node.isTextblock && node.textContent === text) at = position + 1;
  });
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
}

test('pasted paragraphs stay apart from the paragraph after them', async () => {
  await withLatexEditor('\\section{Intro}\nTail.', (view) => {
    const pasted = parseLatex('One.\n\nTwo.').content;
    const after = view.state.doc.firstChild!.nodeSize;
    view.dispatch(view.state.tr.insert(after, pasted));
    const { shown, saved } = paragraphs(view);
    expect(saved).toEqual(shown);
    expect(serializeLatex(view.state.doc)).toEndWith('Two.\n\nTail.');
  });
});

test('a heading turned into body text stays apart from the next paragraph', async () => {
  await withLatexEditor('\\section{Intro}\nTail.', (view) => {
    caretIn(view, 'Intro');
    latexHeading(0)(view.state, view.dispatch);
    expect(view.state.doc.firstChild!.type).toBe(noteSchema.nodes.paragraph!);
    const { shown, saved } = paragraphs(view);
    expect(saved).toEqual(shown);
  });
});

test('a list item lifted out of its list stays apart from the next paragraph', async () => {
  await withLatexEditor('\\begin{itemize}\n\\item First\n\\end{itemize}\nTail.', (view) => {
    caretIn(view, 'First');
    liftListItem(noteSchema.nodes.list_item!)(view.state, view.dispatch);
    const { shown, saved } = paragraphs(view);
    expect(shown).toEqual(['First', 'Tail.']);
    expect(saved).toEqual(shown);
  });
});

test('editing inside a paragraph leaves authored spacing alone', async () => {
  const source = '{\\raggedleft First.\\par}\nSecond.\n\\begin{center}\nBox\n\\end{center}\nTail.';
  await withLatexEditor(source, (view) => {
    caretIn(view, 'Second.');
    view.dispatch(view.state.tr.insertText('Very '));
    expect(serializeLatex(view.state.doc)).toBe(source.replace('Second.', 'Very Second.'));
  });
});

test('formatting across display math keeps its spacing, and undo restores it', async () => {
  const source = 'First.\n\\[x\\]\nSecond.';
  await withLatexEditor(source, (view) => {
    const { doc } = view.state;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, 1, doc.content.size - 1)));
    toggleMark(noteSchema.marks.strong!)(view.state, view.dispatch);
    expect(serializeLatex(view.state.doc)).toBe('\\textbf{First.}\n\\[x\\]\n\\textbf{Second.}');
    undo(view.state, view.dispatch);
    expect(serializeLatex(view.state.doc)).toBe(source);
  });
});

test('deleting a block between paragraphs keeps them apart', async () => {
  for (const block of ['\\[x\\]', '\\newpage', '{\\raggedleft Aside.\\par}'])
    await withLatexEditor(`First.\n${block}\nSecond.`, (view) => {
      const at = view.state.doc.firstChild!.nodeSize;
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
      view.dispatch(view.state.tr.deleteSelection());
      const { shown, saved } = paragraphs(view);
      expect(shown).toEqual(['First.', 'Second.']);
      expect(saved).toEqual(shown);
    });
});

test('undoing a deletion restores authored spacing exactly', async () => {
  const source = 'First.\n\\newpage\nSecond.';
  await withLatexEditor(source, (view) => {
    const { doc } = view.state;
    view.dispatch(view.state.tr.delete(0, doc.content.size));
    undo(view.state, view.dispatch);
    expect(serializeLatex(view.state.doc)).toBe(source);
  });
});

test('deleting a raw line before a comment keeps the paragraphs around them apart', async () => {
  await withLatexEditor('First.\n\\newpage\n% Note\nSecond.', (view) => {
    const at = view.state.doc.firstChild!.nodeSize;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
    view.dispatch(view.state.tr.deleteSelection());
    const { shown, saved } = paragraphs(view);
    expect(saved).toEqual(shown);
  });
});

test('joining a wrapped paragraph into the one before keeps the next paragraph apart', async () => {
  await withLatexEditor('First.\n{\\raggedleft Second.\\par}\nTail.', (view) => {
    caretIn(view, 'Second.');
    joinBackward(view.state, view.dispatch);
    const { shown, saved } = paragraphs(view);
    expect(shown).toEqual(['First.Second.', 'Tail.']);
    expect(saved).toEqual(shown);
  });
});

test('deleting an equation after a spacing line keeps the paragraphs around it apart', async () => {
  await withLatexEditor('First.\n\\vspace{1em}\n\n\\[x\\]\nTail.', (view) => {
    const at = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
    view.dispatch(view.state.tr.deleteSelection());
    expect(serializeLatex(view.state.doc)).toBe('First.\n\\vspace{1em}\n\nTail.');
  });
});
