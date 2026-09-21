export const version = __TUMBLER_VERSION__;
export const commit = __TUMBLER_COMMIT__;
export const repository = 'https://github.com/Kryptonote-Labs/Tumbler';
export const navigation = [
  { title: 'Start here', links: [{ href: '/', label: 'Introduction' }, { href: '/docs/installation', label: 'Installation' }, { href: '/docs/architecture', label: 'How it works' }] },
  { title: 'Working with documents', links: [{ href: '/docs/word', label: 'Word documents' }, { href: '/docs/spreadsheets', label: 'Spreadsheets' }, { href: '/docs/powerpoint', label: 'PowerPoint' }, { href: '/docs/compatibility', label: 'Compatibility' }] },
  { title: 'Explore', links: [{ href: '/components', label: 'Components' }, { href: '/playground/word-brief', label: 'Playground' }, { href: '/docs/development', label: 'Local development' }] }
];
export const samples = [
  { id: 'slides-rendering', label: 'Rendering checks', format: 'slides', file: 'rendering-checks.pptx', description: 'Autofit, decimal tabs, picture and pattern fills, stacked and combination charts, embedded video, and click-by-click playback.' },
  { id: 'slides-brief', label: 'Workspace presentation', format: 'slides', file: 'workspace-brief.pptx', description: 'Three slides with text, shapes, inherited decorations, and a chart. Switch to Edit to move objects or change simple text.' },
  { id: 'slides-visuals', label: 'Shapes and pictures', format: 'slides', file: 'shapes-and-pictures.pptx', description: 'A 4:3 deck with rotation, transparency, mixed text, and an embedded picture.' },
  { id: 'slides-standards', label: 'Everyday PowerPoint features', format: 'slides', file: 'standards-features.pptx', description: 'Preset shapes, gradients, formatted text, hyperlinks, speaker notes, and theme-styled tables.' },
  { id: 'slides-compatibility', label: 'Compatibility checks', format: 'slides', file: 'compatibility-deck.pptx', description: 'Groups, tables, and notes. Unsupported objects remain in exported files.' },
  { id: 'word-brief', label: 'Project brief', format: 'word', file: 'project-brief.docx', description: 'Paragraphs, headings, a table, and an embedded image.' },
  { id: 'word-pages', label: 'Mixed page sizes', format: 'word', file: 'mixed-pages.docx', description: 'Portrait and landscape sections. Try a narrow viewport and scroll to both page edges.' },
  { id: 'sheet-budget', label: 'Project budget', format: 'sheets', file: 'project-budget.xlsx', description: 'Two worksheets, editable values, formatting, and calculated totals.' }
] as const;
export type Sample = (typeof samples)[number];
