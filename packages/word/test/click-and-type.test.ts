import {expect,test} from 'bun:test';
import * as Y from 'yjs';
import {NativeWordDocument,wordClickAndTypeTarget} from '../src/index.ts';
import {clickAndTypeEdit} from '../src/collaboration/click-and-type.ts';
import {createWordCommands} from '../src/collaboration/commands.ts';
const measure={measure:(text:string)=>({width:text.length*6,ascent:8,descent:2})};
test('blank-space targets preserve ordinary text hit testing and use document coordinates',()=>{
 const model=new NativeWordDocument();model.update([{kind:'paragraph',runs:[{text:'Hello'}]}]);
 const page=model.layout(measure).pages[0]!;const lines=page.columns[0]!.lines;
 const bounds={left:72,right:page.width-72,top:72,bottom:page.height-72};
 expect(wordClickAndTypeTarget(lines,{x:80,y:75},bounds)).toBeUndefined();
 const target=wordClickAndTypeTarget(lines,{x:page.width/2,y:lines[0]!.y+lines[0]!.height*3+1},bounds)!;
 expect(target).toMatchObject({alignment:'center',paragraphs:3,offset:5});
});
test('positioning and subsequent typing survive undo and redo',()=>{
 const doc=new Y.Doc();const text=doc.getText('body');text.insert(0,'Hello\n');
 const undo=new Y.UndoManager(text);
 const edit=clickAndTypeEdit(text,5,{paragraphs:2,positionTwips:2000,alignment:'left'});
 text.applyDelta(edit.delta);expect(text.toString()).toBe('Hello\n\n\t\n');
 expect(edit.selection).toEqual({start:8,end:8});undo.stopCapturing();
 text.applyDelta(createWordCommands().replaceWordDelta(text,edit.selection,'There'));
 expect(text.toString()).toBe('Hello\n\n\tThere\n');
 undo.undo();undo.undo();expect(text.toString()).toBe('Hello\n');
 undo.redo();undo.redo();expect(text.toString()).toBe('Hello\n\n\tThere\n');
 undo.destroy();doc.destroy();
});


test('placement and first content compose without publishing empty paragraphs', async () => {
 const {positionedWordEdit} = await import('../src/collaboration/index.ts');
 const doc=new Y.Doc();const text=doc.getText('body');text.insert(0,'Hello\n');
 const undo=new Y.UndoManager(text);let updates=0;doc.on('update',()=>updates++);
 const edit=positionedWordEdit(text,staged=>{
  const placement=clickAndTypeEdit(staged,5,{paragraphs:2,positionTwips:2000,alignment:'left'});
  staged.applyDelta(placement.delta);
  staged.applyDelta(createWordCommands().replaceWordDelta(staged,placement.selection,'There'));
  return {start:placement.selection.start+5,end:placement.selection.start+5};
 });
 expect(text.toString()).toBe('Hello\n');expect(updates).toBe(0);
 text.applyDelta(edit.delta);expect(updates).toBe(1);
 expect(text.toString()).toBe('Hello\n\n\tThere\n');
 undo.undo();expect(text.toString()).toBe('Hello\n');
 undo.redo();expect(text.toString()).toBe('Hello\n\n\tThere\n');
 undo.destroy();doc.destroy();
});

test('blank-space targets snap to rows and forgiving left, centre and right zones', () => {
 const model=new NativeWordDocument();model.update([{kind:'paragraph',runs:[{text:'Hello'}]}]);
 const page=model.layout(measure).pages[0]!;const line=page.columns[0]!.lines[0]!;
 const bounds={left:72,right:page.width-72,top:72,bottom:page.height-72};
 const y=line.y+line.height*3.6;
 const left=wordClickAndTypeTarget([line],{x:bounds.left+18,y},bounds)!;
 const center=wordClickAndTypeTarget([line],{x:page.width/2+18,y:y+line.height*.1},bounds)!;
 const right=wordClickAndTypeTarget([line],{x:bounds.right-18,y},bounds)!;
 expect(left.positionTwips).toBe(0);expect(left.caret.x).toBe(bounds.left);
 expect(center.alignment).toBe('center');expect(center.caret.x).toBe(page.width/2);
 expect(right.alignment).toBe('right');expect(right.caret.x).toBe(bounds.right);
 expect(left.caret.y).toBe(center.caret.y);expect(center.caret.y).toBe(right.caret.y);
 const precise=wordClickAndTypeTarget([line],{x:bounds.left+60,y},bounds)!;
 expect(precise.positionTwips).toBe(1200);expect(precise.caret.x).toBe(bounds.left+60);
 const footer=wordClickAndTypeTarget([line],{x:page.width/2,y},{...bounds,verticalAnchor:'bottom'})!;
 expect(footer.paragraphs).toBe(0);expect(footer.caret.y).toBe(line.fragments[0]!.y);
});

test('snapped empty lines use native paragraph alignment without inserting tabs', () => {
 for(const alignment of ['left','center','right'] as const){
  const doc=new Y.Doc();const text=doc.getText('body');text.insert(0,'\n');
  const edit=clickAndTypeEdit(text,0,{paragraphs:0,positionTwips:alignment==='left'?0:2000,alignment});
  text.applyDelta(edit.delta);
  text.applyDelta(createWordCommands().replaceWordDelta(text,edit.selection,'Typed'));
  expect(text.toString()).toBe('Typed\n');
  const paragraph=text.toDelta().at(-1)!;
  expect(paragraph.attributes?.align ?? 'left').toBe(alignment);
  doc.destroy();
 }
});
