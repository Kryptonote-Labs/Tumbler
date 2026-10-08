import type * as Y from 'yjs';
import type { WordClickAndTypeTarget } from '../click-and-type.ts';
import { positionedWordEdit } from './page-number.ts';
import { createWordCommands } from './commands.ts';

/** Materialize a blank-space target as ordinary editable paragraphs and tabs, in one undo step. */
export function clickAndTypeEdit(text: Y.Text, at: number, target: Pick<WordClickAndTypeTarget,'paragraphs'|'positionTwips'|'alignment'>) {
  return positionedWordEdit(text, staged => {
    if (!Number.isSafeInteger(at) || at<0 || at>=staged.length || !Number.isSafeInteger(target.paragraphs) || target.paragraphs<0 || !Number.isSafeInteger(target.positionTwips) || target.positionTwips<0 || target.positionTwips>2147483647) throw new Error('Invalid typing position.');
    const commands=createWordCommands();
    const before=commands.wordFormats(staged,{start:at,end:at});
    let cursor=at;
    if (target.paragraphs) {
      staged.applyDelta(commands.replaceWordDelta(staged,{start:at,end:at},'\n'.repeat(target.paragraphs)));
      cursor+=target.paragraphs;
    }
    const start=cursor===0?0:staged.toString().lastIndexOf('\n',cursor-1)+1;
    let end=staged.toString().indexOf('\n',cursor);
    const align=before.align;
    if (!target.paragraphs && start!==end && (align==='center'||align==='right')) {
      staged.insert(start,'\t',{tab:{alignment:align,relativeTo:'margin',leader:'none'}});if(cursor>start)cursor++;end++;
    }
    // A new empty line uses paragraph alignment; occupied lines retain independent tab segments.
    if (start === end && (target.alignment === 'center' || target.alignment === 'right' || target.positionTwips === 0)) {
      staged.format(end,1,{align:target.alignment === 'left' ? null : target.alignment});
      return {start:cursor,end:cursor};
    }
    staged.format(end,1,{align:null});
    if (target.alignment==='center'||target.alignment==='right') {
      staged.insert(cursor,'\t',{tab:{alignment:target.alignment,relativeTo:'margin',leader:'none'}});cursor++;
    } else if (target.positionTwips>0) {
      const tabs=[...(before.positioning?.tabs??[]).filter(stop=>stop.positionTwips!==target.positionTwips),{positionTwips:target.positionTwips,alignment:'start' as const,leader:'none' as const}].sort((a,b)=>a.positionTwips-b.positionTwips);
      staged.format(end,1,{positioning:{...before.positioning,tabs}});
      staged.insert(cursor,'\t',{});cursor++;
    }
    return {start:cursor,end:cursor};
  });
}
