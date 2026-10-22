import type { WordRunContent } from './document.ts';

/** Track cached results across runs, hiding instructions at every nesting level. */
export function createFieldVisibility(): (content: WordRunContent) => boolean {
  const results: boolean[] = [];
  let instructionDepth = 0;
  return content => {
    if (content.kind === 'field-character') {
      if (content.fieldType === 'begin') {
        results.push(false);
        instructionDepth += 1;
      } else if (content.fieldType === 'separate' && results.at(-1) === false) {
        results[results.length - 1] = true;
        instructionDepth -= 1;
      } else if (content.fieldType === 'end' && results.pop() === false) {
        instructionDepth -= 1;
      }
      return false;
    }
    return content.kind !== 'field-instruction' && content.kind !== 'deleted-text' && instructionDepth === 0;
  };
}
