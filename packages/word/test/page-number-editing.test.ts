import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { pageNumberEdit, alignWordItem, wordPageNumberRange, wordItemAlignment } from '../src/collaboration/page-number.ts';
import { validateWordText } from '../src/collaboration/validation.ts';

test('preset replacement and realignment preserve neighboring text and fields', () => {
  const doc=new Y.Doc();const text=doc.getText('body');text.insert(0,'Author\n');
  const undo=new Y.UndoManager(text);
  let edit=pageNumberEdit(text,{start:6,end:6},'x-of-y','center');text.applyDelta(edit.delta);
  expect(text.toString()).toBe('Author\t\uFFFC of \uFFFC\n');
  expect(wordItemAlignment(text,edit.selection)).toBe('center');
  expect(wordPageNumberRange(text,edit.selection)).toEqual(edit.selection);
  edit=pageNumberEdit(text,edit.selection,'page-x-of-y');text.applyDelta(edit.delta);
  expect(text.toString()).toBe('Author\tPage \uFFFC of \uFFFC\n');
  undo.stopCapturing();
  edit=alignWordItem(text,edit.selection,'right');text.applyDelta(edit.delta);
  expect(text.toString()).toBe('Author\tPage \uFFFC of \uFFFC\n');
  expect(wordItemAlignment(text,edit.selection)).toBe('right');
  validateWordText(text);
  undo.undo();expect(wordItemAlignment(text,edit.selection)).toBe('center');
  doc.destroy();undo.destroy();
});

test('explicit insertion creates another independently positioned page number', () => {
 const doc=new Y.Doc();const text=doc.getText('body');text.insert(0,'\n');
 let edit=pageNumberEdit(text,{start:0,end:0},'plain','right');text.applyDelta(edit.delta);
 edit=pageNumberEdit(text,{start:0,end:0},'x-of-y','center');text.applyDelta(edit.delta);
 expect(text.toString()).toBe('\t\uFFFC of \uFFFC\t\uFFFC\n');
 const positions=text.toDelta().filter((part:{attributes?:{tab?:unknown}})=>part.attributes?.tab);
 expect(positions.map((part:{attributes:{tab:{alignment:string}}})=>part.attributes.tab.alignment)).toEqual(['center','right']);
 validateWordText(text);doc.destroy();
});

test('a failed placement does not partially mutate the document',()=>{
 const doc=new Y.Doc();const text=doc.getText('body');text.insert(0,'First\nSecond\n');
 const before=text.toDelta();expect(()=>alignWordItem(text,{start:0,end:8},'right')).toThrow();
 expect(text.toDelta()).toEqual(before);doc.destroy();
});
