export const version = __TUMBLER_VERSION__;
export const commit = __TUMBLER_COMMIT__;
export const repository = 'https://github.com/Kryptonote-Labs/Tumbler';
export const navigation = [
  { title: 'Start here', links: [{ href: '/', label: 'Introduction' }, { href: '/docs/installation', label: 'Installation' }, { href: '/docs/architecture', label: 'How it works' }] },
  { title: 'Working with documents', links: [{ href: '/docs/word', label: 'Word documents' }, { href: '/docs/spreadsheets', label: 'Spreadsheets' }, { href: '/docs/compatibility', label: 'Compatibility' }] },
  { title: 'Explore', links: [{ href: '/playground/word-brief', label: 'Playground' }, { href: '/docs/development', label: 'Local development' }] }
];
export const samples = [
  { id: 'word-brief', label: 'Project brief', format: 'word', file: 'project-brief.docx', description: 'Paragraphs, headings, a table, and an embedded image.' },
  { id: 'word-pages', label: 'Mixed page sizes', format: 'word', file: 'mixed-pages.docx', description: 'Portrait and landscape sections. Try a narrow viewport and scroll to both page edges.' },
  { id: 'sheet-budget', label: 'Project budget', format: 'sheets', file: 'project-budget.xlsx', description: 'Two worksheets, editable values, formatting, and calculated totals.' }
] as const;
export type Sample = (typeof samples)[number];
