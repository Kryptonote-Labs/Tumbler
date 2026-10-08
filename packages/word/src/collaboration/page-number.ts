import * as Y from 'yjs';
import { wordPageNumberRuns, type WordPageNumberPreset } from '../page-fields.ts';
import type { WordPositionalTab } from '../document.ts';
import type { WordRange, WordDelta } from './commands.ts';
import { validateWordText } from './validation.ts';
import type { TextAttributes } from './formatting.ts';

export interface WordPositionedEdit { readonly delta: WordDelta; readonly selection: WordRange; }
export type WordItemAlignment = WordPositionalTab['alignment'];

/** Find a page-number recipe at the caret, without absorbing neighboring ordinary text. */
export function wordPageNumberRange(text: Y.Text, range: WordRange): WordRange | undefined {
  const value = text.toString();
  const fields = new Map<number, string>();
  let offset = 0;
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') continue;
    if (part.attributes?.field) for (let i = 0; i < part.insert.length; i++) fields.set(offset + i, part.attributes.field);
    offset += part.insert.length;
  }
  const matches: WordRange[] = [];
  for (const [start, field] of fields) {
    if (field !== 'PAGE') continue;
    const from = value.slice(Math.max(0, start - 5), start) === 'Page ' ? start - 5 : start;
    const end = value.slice(start + 1, start + 5) === ' of ' && fields.get(start + 5) === 'NUMPAGES' ? start + 6 : start + 1;
    if (range.start >= from && range.end <= end) matches.push({ start: from, end });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

/** Stage a structural edit, then emit one validated delta. Existing character identities survive. */
export function positionedWordEdit(text: Y.Text, edit: (staged: Y.Text) => WordRange): WordPositionedEdit {
  if (!text.doc) throw new Error('The document is not attached.');
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(text.doc));
    const name = [...text.doc.share].find(([, value]) => Object.is(value, text))?.[0];
    if (!name) throw new Error('Missing document region.');
    const staged = doc.getText(name);
    let delta: WordDelta = [];
    staged.observe(event => { delta = event.delta; });
    let selection: WordRange = {start:0,end:0};
    doc.transact(() => { selection = edit(staged); });
    validateWordText(staged);
    return { delta, selection };
  } finally { doc.destroy(); }
}

function runsIn(text: Y.Text, range: WordRange): {text:string;attributes:TextAttributes}[] {
  let offset = 0;
  return text.toDelta().flatMap((part: {insert: string; attributes?: TextAttributes}) => {
    const from = Math.max(range.start - offset, 0), to = Math.min(range.end - offset, part.insert.length);
    offset += part.insert.length;
    return to > from ? [{ text: part.insert.slice(from, to), attributes: part.attributes ?? {} }] : [];
  });
}

export function wordItemAlignment(text: Y.Text, range: WordRange): WordItemAlignment {
  const value = text.toString();
  const start = value.lastIndexOf('\n', Math.max(0, range.start - 1)) + 1;
  const tab = value.lastIndexOf('\t', range.start - 1);
  if (tab >= start) {
    const position = runsIn(text, {start:tab,end:tab+1})[0]?.attributes.tab;
    if (position) return position.alignment;
  }
  const end = value.indexOf('\n', range.start);
  const align = runsIn(text, {start:end,end:end+1})[0]?.attributes.align;
  return align === 'center' || align === 'right' ? align : 'left';
}

/** Place one inline range in its paragraph, retaining other segments and their CRDT identities. */
export function placeWordRange(text: Y.Text, range: WordRange, alignment: WordItemAlignment): WordRange {
  const value = text.toString();
  if (range.start < 0 || range.end < range.start || range.end > value.length || /[\n\u2028\t]/.test(value.slice(range.start,range.end))) throw new Error('Select one inline item to position.');
  const start = range.start === 0 ? 0 : value.lastIndexOf('\n', range.start-1)+1;
  const end = value.indexOf('\n',range.end);
  if (end < 0) throw new Error('Missing paragraph boundary.');
  const runs = runsIn(text,range);
  const preceding = range.start > start ? runsIn(text,{start:range.start-1,end:range.start})[0] : undefined;
  const removeTab = preceding?.text === '\t' && !!preceding.attributes.tab && (range.end === end || value[range.end] === '\t');
  const removeStart = range.start - (removeTab ? 1 : 0);
  text.delete(removeStart,range.end-removeStart);
  // Preserve the old paragraph's positioning for its remaining content before resetting alignment.
  const remainingEnd = text.toString().indexOf('\n',start);
  const oldAlignment = runsIn(text,{start:remainingEnd,end:remainingEnd+1})[0]?.attributes.align;
  if (remainingEnd > start && (oldAlignment === 'center' || oldAlignment === 'right') && !runsIn(text,{start,end:start+1})[0]?.attributes.tab)
    text.insert(start,'\t',{tab:{alignment:oldAlignment,relativeTo:'margin',leader:'none'}});
  const paragraphEnd = text.toString().indexOf('\n',start);
  text.format(paragraphEnd,1,{align:null});
  const rank = {left:0,center:1,right:2};
  let at = alignment === 'left' ? start : paragraphEnd;
  let offset = start;
  for (const run of runsIn(text,{start,end:paragraphEnd})) {
    if (run.attributes.tab && rank[run.attributes.tab.alignment] > rank[alignment]) { at=offset; break; }
    offset += run.text.length;
  }
  // A positional tab keeps the segment independent when adjacent content is edited.
  text.insert(at,'\t',{tab:{alignment,relativeTo:'margin',leader:'none'}});
  const contentStart = ++at;
  for (const run of runs) { text.insert(at,run.text,run.attributes); at += run.text.length; }
  return {start:contentStart,end:at};
}

/** Update an explicitly selected recipe, or insert a new one at the supplied cursor range. */
export function pageNumberEdit(text: Y.Text, range: WordRange, preset: WordPageNumberPreset, alignment?: WordItemAlignment): WordPositionedEdit {
  return positionedWordEdit(text, staged => {
    if (range.start < 0 || range.end < range.start || range.end >= staged.length) throw new Error('Page number range is outside the document.');
    if (/[\n\t\u2028]/.test(staged.toString().slice(range.start,range.end))) throw new Error('Page numbers replace inline content only.');
    const inherited = runsIn(staged,range.start === range.end ? {start:Math.max(0,range.start-1),end:range.start} : range)[0]?.attributes ?? {};
    const {field:_field,tab:_tab,align:_align,positioning:_positioning,wordSource:_source,...format} = inherited;
    staged.delete(range.start, range.end-range.start);
    let end = range.start;
    for (const run of wordPageNumberRuns(preset)) {
      staged.insert(end,run.text,{...format,bold:run.format?.bold??false,...(run.field?{field:run.field}:{})});
      end += run.text.length;
    }
    const inserted = {start:range.start,end};
    return alignment ? placeWordRange(staged,inserted,alignment) : inserted;
  });
}

export function alignWordItem(text:Y.Text,range:WordRange,alignment:WordItemAlignment) {
  return positionedWordEdit(text, staged => placeWordRange(staged,range,alignment));
}
