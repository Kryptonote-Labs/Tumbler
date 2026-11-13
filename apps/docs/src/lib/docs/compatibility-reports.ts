import type { Doc } from './types';

export const compatibilityReportsDoc: Doc = {
  title: 'Compatibility reports',
  description: 'How Word compatibility is measured, and where to download the latest results.',
  sections: [
    { id: 'evidence', title: 'What the reports measure', blocks: [
      { kind: 'text', text: 'Each Word compatibility run produces three kinds of result:' },
      { kind: 'table', headers: ['Result', 'Measures'], rows: [
        ['Standards coverage', 'Every topic in the Word file standard, each checked for reading, preserving, writing, editing, rendering and working with other apps. Topics without a test still count against the total.'],
        ['Requirements', 'Narrow, specific behaviours, each with an automated test.'],
        ['Everyday tasks', 'Common jobs done headless and in a browser. Failed and blocked tasks are shown even when the run as a whole passes.'],
      ] },
      { kind: 'text', text: 'Download `report.md`, `report.json` and the supporting files from any run of the Word compatibility workflow.' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/actions/workflows/word-compatibility.yml', label: 'Word compatibility runs' },
      { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/tools/word-compatibility/README.md', label: 'How to read a report' },
    ] },
    { id: 'limits', title: 'What they do not show', blocks: [
      { kind: 'text', text: 'The Open XML SDK and LibreOffice checks only cover the cases they test.' },
      { kind: 'note', text: 'Still incomplete: matching Word\'s look exactly, text wrapping around floating objects, repaginating for footnotes, comments, reviewing tracked changes, and recalculating fields.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/compatibility-reports.ts',
};
