import { NativeWordEditor } from '@tumblerjs/word';
import { WordBrowserInput } from '@tumblerjs/word/browser';

const root = document.createElement('div');
root.contentEditable = 'true';
root.setAttribute('role', 'textbox');
root.setAttribute('aria-label', 'Formatted grapheme document');
root.style.cssText = 'margin:100px;font:20px Arial;white-space:pre';
document.body.append(root);
const editor = new NativeWordEditor({ content: [{ kind: 'paragraph', id: 'a', runs: [
  { text: 'e', format: { bold: true } }, { text: '\u0301x' },
] }] });
const input = new WordBrowserInput(root, editor, { caret: false });
const render = () => {
  const paragraph = document.createElement('p');
  let start = 0;
  const block = editor.blocks[0]!;
  if (block.kind !== 'paragraph') throw new Error('Expected paragraph');
  for (const run of block.runs) {
    const span = document.createElement('span');
    span.dataset.wordParagraph = block.id;
    span.dataset.wordStart = String(start);
    start += run.text.length;
    span.dataset.wordEnd = String(start);
    span.style.fontWeight = run.format?.bold ? 'bold' : 'normal';
    span.textContent = run.text;
    paragraph.append(span);
  }
  root.replaceChildren(paragraph);
  input.restoreSelection();
};
editor.subscribe(render);
render();
