import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordCommands, insertTableDelta, tableParagraphs } from '../src/collaboration/index.ts';
const commands = createWordCommands();

test('people and agents share anchored operations, convergence and local undo', () => {
  const first = new Y.Doc();
  const body = first.getText('body');
  body.insert(0, 'Hello world\n');
  const second = new Y.Doc(); Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
  const peer = second.getText('body');
  const target = commands.anchorWordRange(peer, {start:6,end:11});
  const origin = {};
  const undo = new Y.UndoManager(body, {trackedOrigins:new Set([origin])});
  first.transact(() => body.applyDelta(commands.replaceWordDelta(body,{start:0,end:0},'Dear ')), origin);
  peer.applyDelta(commands.wordTransaction(peer,[{kind:'replace',target,expected:'world',value:'team'}]));
  Y.applyUpdate(first,Y.encodeStateAsUpdate(second));
  Y.applyUpdate(second,Y.encodeStateAsUpdate(first));
  expect(body.toString()).toBe('Dear Hello team\n');
  expect(peer.toDelta()).toEqual(body.toDelta());
  undo.undo();
  Y.applyUpdate(second,Y.encodeStateAsUpdate(first));
  expect(peer.toString()).toBe('Hello team\n');
  expect(() => commands.wordTransaction(body,[{kind:'replace',target,expected:'world',value:'stale'}])).toThrow('changed');
  expect(body.toString()).toBe('Hello team\n');
});

test('headless structural edits retain concurrent cell content and validate batches atomically', () => {
  const doc = new Y.Doc(); const body = doc.getText('body'); body.insert(0,'\n');
  body.applyDelta(insertTableDelta(body,0,[['one','two'],['three','four']]).delta);
  const paragraph = tableParagraphs(body).find(p => p.table)!;
  const cell = paragraph.table!;
  const target = commands.anchorWordRange(body,{start:paragraph.start,end:paragraph.start});
  const before = body.toDelta();
  expect(() => commands.wordTransaction(body,[{kind:'table-edit',target,tableId:cell.id,cellId:cell.cell,action:'row-after'}, {kind:'replace',target,expected:'stale',value:'bad'}])).toThrow();
  expect(body.toDelta()).toEqual(before);
  body.applyDelta(commands.wordTransaction(body,[{kind:'table-edit',target,tableId:cell.id,cellId:cell.cell,action:'row-after'}]));
  expect(body.toString()).toContain('three\nfour');
  expect(new Set(tableParagraphs(body).flatMap(p => p.table ? [p.table.row] : [])).size).toBe(3);
});

test('range checks reject the middle of graphemes and accept their boundaries', () => {
  const doc=new Y.Doc();const body=doc.getText('body');body.insert(0,'A👩🏽‍💻e\u0301Z\n');
  for(const index of [2,3,4,5,6,7,9]) expect(()=>commands.replaceWordDelta(body,{start:index,end:index},'x')).toThrow('split');
  for(const index of [0,1,8,10,11]) expect(()=>commands.replaceWordDelta(body,{start:index,end:index},'x')).not.toThrow();
  doc.destroy();
});

test('paragraph identities follow retained terminators across inserts, deletes and formatting', async () => {
  const {wordParagraphIdentity}=await import('../src/collaboration/index.ts');
  const doc=new Y.Doc();const body=doc.getText('body');body.insert(0,'One\nTwo\nThree\n');
  const ids=[3,7,13].map(at=>wordParagraphIdentity(body,at));
  body.applyDelta([{retain:2},{insert:'new\n'},{retain:2},{delete:4}]);
  expect(body.toString()).toBe('Onnew\ne\nThree\n');
  expect(wordParagraphIdentity(body,7)).toBe(ids[0]!);
  expect(wordParagraphIdentity(body,13)).toBe(ids[2]!);
  expect(wordParagraphIdentity(body,5)).not.toBe(ids[0]!);
  body.format(0,body.length,{bold:true});
  expect(wordParagraphIdentity(body,13)).toBe(ids[2]!);
  doc.destroy();
});
