import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { createWordArtifact, importWordContent, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { createWordCommands } from '../src/collaboration/commands.ts';
import { validateWordText } from '../src/collaboration/validation.ts';
const measure = { measure: (text: string) => ({ width: text.length * 6, ascent: 8, descent: 2 }) };
const positioning = { tabs: [{ positionTwips: 2000, alignment: 'end' as const, leader: 'none' as const }], indentStartTwips: 100 };

test('authored positioning agrees in native layout and edited DOCX round trips', () => {
  const blocks = [{ kind: 'paragraph' as const, positioning, runs: [{ text: 'Left' }, { text: '\t' }, { text: 'Right' }, { text: '\t', tab: { alignment: 'right' as const, relativeTo: 'margin' as const, leader: 'none' as const } }, { text: 'End' }] }];
  const artifact = createWordArtifact({ blocks });
  const content = importWordContent(artifact);
  expect(content[0]).toMatchObject({ positioning });
  expect(content[0]?.kind === 'paragraph' && content[0].runs.find(run => run.tab)?.tab?.alignment).toBe('right');
  const model = new NativeWordDocument({ source: artifact });
  model.update(content);
  const lines = model.layout(measure).pages[0]!.columns[0]!.lines;
  expect(lines[0]!.fragments.find(f => f.text === 'Right')!.x).toBeCloseTo(142);
  const exported = openWordArtifact(model.artifact().bytes());
  expect(importWordContent(exported)[0]).toMatchObject({ positioning });
});

test('paragraph positioning survives split, undo and concurrent edits', () => {
  const doc = new Y.Doc(); const text = doc.getText('body'); text.insert(0, 'Hello\n');
  const commands = createWordCommands();
  const undo = new Y.UndoManager(text);
  text.applyDelta(commands.formatWordDelta(text, {start:0,end:0}, {positioning}));
  undo.stopCapturing();
  text.applyDelta(commands.replaceWordDelta(text, {start:2,end:2}, '\n'));
  validateWordText(text);
  expect(text.toDelta().filter((p: {attributes?:{positioning?:unknown}}) => p.attributes?.positioning)).toHaveLength(2);
  undo.undo(); expect(text.toString()).toBe('Hello\n');
  const peer = new Y.Doc(); Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  peer.getText('body').insert(0,'Peer '); text.insert(0,'Local ');
  Y.applyUpdate(doc,Y.encodeStateAsUpdate(peer)); Y.applyUpdate(peer,Y.encodeStateAsUpdate(doc));
  expect(text.toDelta()).toEqual(peer.getText('body').toDelta());
  validateWordText(text); undo.destroy(); doc.destroy(); peer.destroy();
});

test('ordinary typing does not inherit positional tab metadata', () => {
  const doc = new Y.Doc();const text=doc.getText('body');
  text.insert(0,'\t',{tab:{alignment:'right',relativeTo:'margin',leader:'none'}});text.insert(1,'\n',{});
  text.applyDelta(createWordCommands().replaceWordDelta(text,{start:1,end:1},'Text'));
  expect(()=>validateWordText(text)).not.toThrow();
  expect(text.toString()).toBe('\tText\n');doc.destroy();
});
