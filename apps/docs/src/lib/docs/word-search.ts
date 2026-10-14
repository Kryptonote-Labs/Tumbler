import type { Doc } from './types';

export const wordSearchDoc: Doc = {
  title: 'Find and replace',
  description: 'Search literal text and apply one or all replacements in an anchored transaction.',
  sections: [
    { id: 'search', title: 'Find and replace', blocks: [
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
        { kind: 'text', text: 'Search is literal, Unicode-aware, and returns UTF-16 ranges at grapheme boundaries. Options include matchCase, wholeWord, and locale for word segmentation.' },
        { kind: 'text', text: 'Queries cannot span paragraph separators or embedded object placeholders. replaceWordMatches anchors all matches before mutation; pass the full change list to one wordTransaction for an atomic replace-all that preserves inherited formatting. The host owns undo grouping.' },
        { kind: 'text', text: 'For one replacement, select one returned change before creating the transaction. These are headless operations; the docs playground does not currently provide a find/replace interface.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/word-search.ts',
  next: { href: '/docs/word-performance', label: 'Layout caching and projections' },
};
