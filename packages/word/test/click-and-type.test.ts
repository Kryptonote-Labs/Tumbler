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
