import { expect, test } from 'bun:test';
import { receiveTransaction, sendableSteps } from 'prosemirror-collab';
import { redo, undo } from 'prosemirror-history';
import { latexState } from '../src/latex-editor';
import {
  detachLatexInclude, latexProjectFileUsage, materializeLatexStructures,
  parseLatexProject, serializeLatexProject,
} from '../src/latex';

const entry = 'main.tex';
const component = 'components/intro.tex';
const source = String.raw`\begin{document}
\input{components/intro}

Between.

\input{components/intro}
\end{document}`;
const files = new Map([[entry, source], [component, 'Original text.\n']]);
const includes = (state: ReturnType<typeof latexState>) =>
  state.doc.children.filter(node => node.type.name === 'latex_include');

test('editing the second include updates both instances and undoes in one step', () => {
  let state = latexState(parseLatexProject(entry, files), 0, 'writer');
  expect(includes(state).map(node => node.textContent)).toEqual(['Original text.', 'Original text.']);
  const second = state.doc.content.size - state.doc.lastChild!.nodeSize;
  state = state.apply(state.tr.insertText('Revised', second + 2, second + 10));
  expect(includes(state).map(node => node.textContent)).toEqual(['Revised text.', 'Revised text.']);
  const updated = serializeLatexProject(state.doc)!;
  expect(updated.files).toEqual(new Map([[entry, source], [component, 'Revised text.\n']]));
  expect(serializeLatexProject(parseLatexProject(entry, updated.files))?.files).toEqual(updated.files);
  expect(undo(state, tr => { state = state.apply(tr); })).toBe(true);
  expect(includes(state).map(node => node.textContent)).toEqual(['Original text.', 'Original text.']);
  expect(serializeLatexProject(state.doc)?.files).toEqual(files);
  expect(redo(state, tr => { state = state.apply(tr); })).toBe(true);
  expect(serializeLatexProject(state.doc)?.files).toEqual(updated.files);
});

test('detaching one occurrence leaves an independent copy and preserves the project file', () => {
  let state = latexState(parseLatexProject(entry, files), 0, 'writer');
  const tr = state.tr;
  detachLatexInclude(tr, 0);
  state = state.apply(tr);
  expect(latexProjectFileUsage(state.doc).get(component)).toBe(1);
  expect(state.doc.firstChild?.textContent).toBe('Original text.');
  const remaining = state.doc.content.size - state.doc.lastChild!.nodeSize;
  state = state.apply(state.tr.insertText('New', remaining + 2, remaining + 10));
  expect(state.doc.firstChild?.textContent).toBe('Original text.');
  expect(serializeLatexProject(state.doc)?.files.get(component)).toBe('New text.\n');
});

test('concurrent edits in distinct occurrences keep both changes', () => {
  const document = parseLatexProject(entry, files);
  const left = latexState(document, 0, 'left');
  const right = latexState(document, 0, 'right');
  const editedLeft = left.apply(left.tr.insertText('Revised', 2, 10));
  const second = document.content.size - document.lastChild!.nodeSize;
  const editedRight = right.apply(right.tr.insertText('intro', second + 11, second + 15));
  const changes = sendableSteps(editedLeft)!.steps;
  const rebased = editedRight.apply(receiveTransaction(editedRight, changes, changes.map(() => 'left')));
  const merged = sendableSteps(rebased)!.steps;
  const confirmedLeft = editedLeft.apply(receiveTransaction(editedLeft, changes, changes.map(() => 'left')));
  const syncedLeft = confirmedLeft.apply(receiveTransaction(confirmedLeft, merged, merged.map(() => 'right')));
  expect(includes(rebased).map(node => node.textContent)).toEqual(['Revised intro.', 'Revised intro.']);
  expect(syncedLeft.doc.eq(rebased.doc)).toBe(true);
});

test('older raw references regain an editable instance without changing the source', () => {
  const state = latexState(parseLatexProject(entry, files), 0, 'writer');
  const last = state.doc.lastChild!;
  const raw = state.schema.nodes.latex_raw!.create({ source: last.attrs.open, before: last.attrs.before });
  const previous = state.tr.replaceWith(state.doc.content.size - last.nodeSize, state.doc.content.size, raw).doc;
  const upgraded = materializeLatexStructures(previous).doc;
  expect(upgraded.lastChild?.type.name).toBe('latex_include');
  expect(serializeLatexProject(upgraded)?.files).toEqual(files);
});

test('repeated parent files mirror nested edits and keep the nested file separate', () => {
  const intro = String.raw`Title.

\input{components/detail}`;
  const detail = 'components/detail.tex';
  const state = latexState(parseLatexProject(entry, new Map([
    [entry, source], [component, intro], [detail, 'Old.'],
  ])), 0, 'writer');
  const locations: number[] = [];
  state.doc.descendants((node, position) => {
    if (node.type.name === 'latex_include' && node.attrs.path === detail) locations.push(position);
  });
  expect(locations).toHaveLength(2);
  const start = locations[1]! + 2;
  const edited = state.apply(state.tr.insertText('New', start, start + 3));
  expect(includes(edited).map(node => node.textContent)).toEqual(['Title.New.', 'Title.New.']);
  expect(serializeLatexProject(edited.doc)?.files.get(component)).toBe(intro);
  expect(serializeLatexProject(edited.doc)?.files.get(detail)).toBe('New.');
});

test('usage includes literal references in TeX groups outside the editor body', () => {
  const document = parseLatexProject(entry, new Map([
    [entry, String.raw`\newcommand{\summary}{\input{components/intro}}
% \input{components/intro}
\begin{document}
\summary
\end{document}`],
    [component, 'Original text.\n'],
  ]));
  expect(document.firstChild?.type.name).not.toBe('latex_include');
  expect(latexProjectFileUsage(document).get(component)).toBe(1);
});
