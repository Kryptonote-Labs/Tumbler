import type { WordInline, WordPageFieldContent, WordRun, WordRunContent } from './document.ts';
import { pageFieldInstruction } from './page-fields.ts';

/** Project complete complex page fields without changing their lossless source XML. */
export function resolveComplexPageFields(inlines: readonly WordInline[]): readonly WordInline[] {
  const runs = inlines.flatMap(inline => inline.kind === 'run' ? [inline]
    : inline.kind === 'hyperlink' || inline.kind === 'insertion' ? inline.runs : []);
  const contents = runs.flatMap(run => run.contents);
  const stack: { start: number; instruction: string; result?: number; nested: boolean }[] = [];
  const replacements = new Map<number, WordPageFieldContent>();
  const removed = new Set<number>();
  for (const [index, content] of contents.entries()) {
    if (content.kind === 'field-character' && content.fieldType === 'begin') {
      const parent = stack.at(-1);
      if (parent) parent.nested = true;
      stack.push({ start: index, instruction: '', nested: false });
      continue;
    }
    const current = stack.at(-1);
    if (!current) continue;
    if (content.kind === 'field-instruction' && current.result === undefined) current.instruction += content.value;
    if (content.kind !== 'field-character') continue;
    if (content.fieldType === 'separate') current.result = index + 1;
    if (content.fieldType !== 'end') continue;
    stack.pop();
    const field = !current.nested && pageFieldInstruction(current.instruction);
    if (!field) continue;
    const source = contents.slice(current.start, index + 1);
    const result = current.result === undefined ? undefined
      : contents.slice(current.result, index).find(item => item.kind === 'text');
    const elementId = (result ?? source[0]!).elementId;
    const replacedElementIds = source.map(item => item.elementId).filter(id => id !== elementId);
    for (const id of replacedElementIds) removed.add(id);
    replacements.set(elementId, Object.freeze({ kind: 'page-field', elementId, field,
      replacedElementIds: Object.freeze(replacedElementIds) }));
  }
  if (!replacements.size) return inlines;
  const project = (run: WordRun): WordRun => Object.freeze({ ...run,
    contents: Object.freeze(run.contents.flatMap((content): WordRunContent[] =>
      removed.has(content.elementId) ? [] : [replacements.get(content.elementId) ?? content])) });
  return inlines.map(inline => inline.kind === 'run' ? project(inline)
    : inline.kind === 'hyperlink' || inline.kind === 'insertion'
      ? Object.freeze({ ...inline, runs: Object.freeze(inline.runs.map(project)) }) : inline);
}
