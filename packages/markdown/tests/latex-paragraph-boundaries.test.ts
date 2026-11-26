import { expect, test } from 'bun:test';
import { liftListItem } from 'prosemirror-schema-list';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { noteSchema } from '../src';
import { joinBackward } from 'prosemirror-commands';
import { toggleMark, undo } from '../src/editor';
import { latexHeading } from '../src/latex-editor';
import { parseLatex, parseLatexProject, serializeLatex, serializeLatexProject } from '../src/latex';
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

test('paragraphs pasted after a scoped paragraph start on their own line', async () => {
  await withLatexEditor('{\\sffamily First.\\par}\nTail.', (view) => {
    const pasted = parseLatex('One.\n\nTwo.').content;
    view.dispatch(view.state.tr.insert(view.state.doc.firstChild!.nodeSize, pasted));
    const { shown, saved } = paragraphs(view);
    expect(shown).toEqual(['First.', 'One.', 'Two.', 'Tail.']);
    expect(saved).toEqual(shown);
  });
});

test('a scoped paragraph pasted after body text stays apart from it', async () => {
  await withLatexEditor('Before.\n\nTail.', (view) => {
    const pasted = parseLatex('{\\sffamily Scoped.\\par}').content;
    view.dispatch(view.state.tr.insert(view.state.doc.firstChild!.nodeSize, pasted));
    const { shown, saved } = paragraphs(view);
    expect(shown).toEqual(['Before.', 'Scoped.', 'Tail.']);
    expect(saved).toEqual(shown);
  });
});

test('a pasted comment inside a scope leaves the scope closed', async () => {
  await withLatexEditor('{\\sffamily First.\\par}\nTail.', (view) => {
    const pasted = parseLatex('Pasted. % note').content;
    view.dispatch(view.state.tr.insert(view.state.doc.firstChild!.nodeSize - 1, pasted));
    const { shown, saved } = paragraphs(view);
    expect(shown).toEqual(['First.', 'Pasted. % note', 'Tail.']);
    expect(saved).toEqual(shown);
  });
});

test('deleting an equation keeps blocks around it apart', async () => {
  for (const source of [
    '{\\sffamily A note.}\n\n\\[x\\]\nMain text.',
    '\\begin{itemize}\n\\item A note. % aside\n\\[x\\]\\item Main text.\n\\end{itemize}',
    '{\\sffamily A note.}\n\n\\[x\\]\n\\section{Main text.}',
    '\\begin{quote}\nFirst.\n\\[x\\]\nSecond. % note\n\nThird.\\end{quote}',
    'First.\n\\[x\\]\n\\vspace{1em}\nTail.',
  ])
    await withLatexEditor(source, (view) => {
      let at = 0;
      view.state.doc.descendants((node, position) => {
        if (node.type.name === 'latex_display_math') at = position;
      });
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
      view.dispatch(view.state.tr.deleteSelection());
      const reopened = parseLatex(serializeLatex(view.state.doc));
      expect(blocks(reopened)).toEqual(blocks(view.state.doc));
    });
});

/** The block types and text of a document, outermost first. */
function blocks(doc: EditorView['state']['doc']) {
  const found: string[] = [];
  doc.descendants((node) => {
    if (node.isBlock) found.push(`${node.type.name}: ${node.textContent}`);
  });
  return found;
}

/** Selects the first display equation. */
function selectEquation(view: EditorView) {
  let at = 0;
  view.state.doc.descendants((node, position) => {
    if (node.type.name === 'latex_display_math') at = position;
  });
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
}

test('text pasted over an equation stays apart from the blocks on both sides', async () => {
  await withLatexEditor('Copied.\n\nBefore.\n\\[x\\]\nTail.', (view) => {
    selectEquation(view);
    view.dispatch(view.state.tr.replaceSelectionWith(parseLatex('Copied.').firstChild!));
    const { shown, saved } = paragraphs(view);
    expect(shown).toEqual(['Copied.', 'Before.', 'Copied.', 'Tail.']);
    expect(saved).toEqual(shown);
  });
});

test('deleting an equation in an included file keeps its paragraphs apart', async () => {
  const files = new Map([['main.tex', '\\input{intro}\n'], ['intro.tex', 'First.\n\\[x\\]\nTail.\n']]);
  await withLatexEditor(parseLatexProject('main.tex', files), (view) => {
    selectEquation(view);
    view.dispatch(view.state.tr.deleteSelection());
    expect(serializeLatexProject(view.state.doc)?.files.get('intro.tex')).toBe('First.\n\nTail.\n');
  });
});

test('deleting an equation after an include keeps the paragraphs around it apart', async () => {
  const files = new Map([['main.tex', '\\input{intro}\nFirst.\n\\[x\\]\nTail.'], ['intro.tex', 'Introduction.']]);
  await withLatexEditor(parseLatexProject('main.tex', files), (view) => {
    selectEquation(view);
    view.dispatch(view.state.tr.deleteSelection());
    expect(serializeLatexProject(view.state.doc)?.files.get('main.tex')).toBe('\\input{intro}\nFirst.\n\nTail.');
  });
});

test('deleting an equation after a font scope ends the paragraph before the next one', async () => {
  await withLatexEditor('{\\sffamily First.}\n\\[x\\]\nTail.', (view) => {
    selectEquation(view);
    view.dispatch(view.state.tr.deleteSelection());
    expect(serializeLatex(view.state.doc)).toBe('{\\sffamily First.}\n\nTail.');
  });
});

test('blocks beside an include stay apart after an equation is replaced or deleted', async () => {
  const project = (main: string) => parseLatexProject('main.tex', new Map([['main.tex', main], ['intro.tex', 'Intro.']]));
  await withLatexEditor(project('\\input{intro}\n\\[x\\]\nTail.'), (view) => {
    selectEquation(view);
    view.dispatch(view.state.tr.replaceSelectionWith(parseLatex('{\\sffamily Aside.\\par}').firstChild!));
    const reopened = parseLatexProject('main.tex', serializeLatexProject(view.state.doc)!.files);
    expect(blocks(reopened)).toEqual(blocks(view.state.doc));
  });
  await withLatexEditor(project('First.\n\\[x\\]\n\\vspace{1em}\n\\input{intro}'), (view) => {
    selectEquation(view);
    view.dispatch(view.state.tr.deleteSelection());
    expect(serializeLatexProject(view.state.doc)!.files.get('main.tex')).toBe('First.\n\n\\vspace{1em}\n\\input{intro}');
  });
});
