import type { Doc } from './types';

export const wordSearchDoc: Doc = {
  title: 'Find and replace',
  description: 'Find text in a collaborative document and replace one match or all of them in one step.',
  sections: [
    { id: 'search', title: 'Find text', blocks: [
      { kind: 'text', text: '`findWordMatches(text, query, options)` returns the start and end offset of every match. It searches for the literal text, so characters such as `*` have no special meaning.' },
      { kind: 'table', headers: ['Option', 'Does'], rows: [
        ['`matchCase`', 'Matches upper and lower case exactly.'],
        ['`wholeWord`', 'Matches only whole words.'],
        ['`locale`', 'The language used to decide where words begin and end.'],
      ] },
      { kind: 'list', items: [
        'Offsets are in UTF-16 units and never split a character such as an emoji.',
        'A match cannot cross from one paragraph into the next, or across an image or shape.',
      ] },
    ] },
    { id: 'replace', title: 'Replace', blocks: [
      { kind: 'text', text: '`replaceWordMatches` finds every match in a Yjs text and returns a list of changes, anchored before anything is edited. Pass the list to `wordTransaction` to replace them all in one step. The new text keeps the formatting of the text it replaced.' },
      { kind: 'code', code: `import * as Y from 'yjs';
import { createWordCommands, findWordMatches, replaceWordMatches } from '@tumblerjs/word/collaboration';

const shared = new Y.Doc();
const body = shared.getText('body');
body.insert(0, 'Review the draft.');
const commands = createWordCommands();

const options = { matchCase: false, wholeWord: true };
const matches = findWordMatches(body.toString(), 'draft', options);
const replacements = replaceWordMatches(body, 'draft', 'final', options);
const replacementDelta = commands.wordTransaction(body, replacements);
shared.transact(() => body.applyDelta(replacementDelta), 'replace-all');` },
      { kind: 'text', text: 'To replace a single match, pass just that one change to `wordTransaction`.' },
      { kind: 'note', text: 'Undo is up to your app. To undo a replace-all in one step, group the transaction in your Yjs undo manager.' },
      { kind: 'text', text: 'These are functions only. Tumbler does not include a find and replace panel.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-search.ts',
  next: { href: '/docs/word-performance', label: 'Layout caching and projections' },
};
