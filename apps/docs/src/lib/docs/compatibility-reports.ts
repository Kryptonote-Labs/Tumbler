import type { Doc } from './types';

export const compatibilityReportsDoc: Doc = {
  title: 'Compatibility reports',
  description: 'Read standards coverage, executable requirements, and everyday task results.',
  sections: [
    { id: 'evidence', title: 'Read the compatibility reports', blocks: [
        { kind: 'text', text: 'Word reports distinguish full standards topic coverage from narrow executable requirements and everyday tasks. Each standards topic has read, preserve, write, edit, render, and interoperability targets; untested obligations remain in the denominator.' },
        { kind: 'text', text: 'Everyday tasks measure specific headless and browser behavior, with failed and blocked results visible even when the workflow passes its configured gates.' },
        { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/actions/workflows/word-compatibility.yml', label: 'Download report.md, report.json, and evidence from a Word compatibility run' },
        { kind: 'link', href: 'https://github.com/Kryptonote-Labs/Tumbler/blob/main/tools/word-compatibility/README.md', label: 'Coverage definitions and report interpretation' },
        { kind: 'text', text: 'Open XML SDK and LibreOffice checks qualify the exercised cases. Full Microsoft Office visual fidelity, general floating wrap, note repagination, comments, tracked-change review, and general field recalculation remain incomplete.' },
    ] },
  ],
  source: 'apps/docs/src/lib/docs/compatibility-reports.ts',
};
