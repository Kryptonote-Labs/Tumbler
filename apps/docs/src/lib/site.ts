export const version = __TUMBLER_VERSION__;
export const commit = __TUMBLER_COMMIT__;
export const repository = 'https://github.com/Kryptonote-Labs/Tumbler';
export interface NavigationLink { href: string; label: string; }
interface NavigationGroup {
  title: string;
  overview?: string;
  links: NavigationLink[];
}

export const navigation: NavigationGroup[] = [
  { title: 'Start here', links: [
    { href: '/', label: 'Introduction' },
    { href: '/docs/installation', label: 'Installation' },
    { href: '/docs/architecture', label: 'How it works' },
  ] },
  { title: 'Word', overview: '/docs/word', links: [
    { href: '/docs/word-editing', label: 'Open and edit' },
    { href: '/docs/native-word', label: 'Native content model' },
    { href: '/docs/word-formatting', label: 'Text and styles' },
    { href: '/docs/word-lists', label: 'Lists and links' },
    { href: '/docs/word-tables', label: 'Tables' },
    { href: '/docs/word-drawings', label: 'Images and shapes' },
    { href: '/docs/word-layout', label: 'Page layout and positions' },
    { href: '/docs/word-stories', label: 'Headers and page numbers' },
    { href: '/docs/word-collaboration', label: 'Collaborative editing' },
    { href: '/docs/word-search', label: 'Find and replace' },
    { href: '/docs/word-performance', label: 'Caching and projections' },
    { href: '/docs/word-support', label: 'Compatibility' },
  ] },
  { title: 'Spreadsheets', overview: '/docs/spreadsheets', links: [
    { href: '/docs/spreadsheet-viewer', label: 'Open a workbook' },
    { href: '/docs/spreadsheet-editing', label: 'Cells and formulas' },
    { href: '/docs/spreadsheet-support', label: 'Compatibility' },
  ] },
  { title: 'PowerPoint', overview: '/docs/powerpoint', links: [
    { href: '/docs/powerpoint-viewer', label: 'Render a presentation' },
    { href: '/docs/powerpoint-navigation', label: 'Slide navigation' },
    { href: '/docs/powerpoint-editing', label: 'Edit slides' },
    { href: '/docs/powerpoint-export', label: 'Export' },
    { href: '/docs/powerpoint-support', label: 'Compatibility' },
  ] },
  { title: 'Resources', links: [
    { href: '/docs/compatibility', label: 'Format support' },
    { href: '/docs/compatibility-reports', label: 'Compatibility reports' },
    { href: '/changelog', label: 'Changelog' },
    { href: '/components', label: 'Components' },
    { href: '/playground/word-brief', label: 'Playground' },
    { href: '/docs/development', label: 'Local development' },
  ] },
];
export const samples = [
  { id: 'slides-rendering', label: 'Rendering checks', format: 'slides', file: 'rendering-checks.pptx', description: 'Autofit, decimal tabs, picture and pattern fills, stacked and combination charts, embedded video, and click-by-click playback.' },
  { id: 'slides-brief', label: 'Workspace presentation', format: 'slides', file: 'workspace-brief.pptx', description: 'Three slides with text, shapes, inherited decorations, and a chart. Switch to Edit to move, resize, or rotate objects and format text.' },
  { id: 'slides-visuals', label: 'Shapes and pictures', format: 'slides', file: 'shapes-and-pictures.pptx', description: 'A 4:3 deck with rotation, transparency, mixed text, and an embedded picture.' },
  { id: 'slides-standards', label: 'Everyday PowerPoint features', format: 'slides', file: 'standards-features.pptx', description: 'Preset shapes, gradients, formatted text, hyperlinks, speaker notes, and theme-styled tables.' },
  { id: 'slides-compatibility', label: 'Compatibility checks', format: 'slides', file: 'compatibility-deck.pptx', description: 'Groups, tables, and notes. Unsupported objects remain in exported files.' },
  { id: 'word-brief', label: 'Project brief', format: 'word', file: 'project-brief.docx', description: 'Paragraphs, headings, a table, and an embedded image.' },
  { id: 'word-pages', label: 'Mixed page sizes', format: 'word', file: 'mixed-pages.docx', description: 'Portrait and landscape sections. Try a narrow viewport and scroll to both page edges.' },
  { id: 'sheet-budget', label: 'Project budget', format: 'sheets', file: 'project-budget.xlsx', description: 'Two worksheets, editable values, formatting, and calculated totals.' }
] as const;
export type Sample = (typeof samples)[number];
