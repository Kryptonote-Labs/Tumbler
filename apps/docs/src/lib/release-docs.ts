import type { Doc } from './docs';
import { repository, version } from './site';

export const releaseDoc: Doc = {
  title: `Release ${version}`,
  description: 'The current alpha release, its Word authoring additions, and the checks behind it.',
  sections: [
    { id: 'install', title: 'Install this release', blocks: [
      { kind: 'text', text: `All nine public @tumblerjs packages share version ${version} and publish under latest. Keep packages on the same version. The sidebar also identifies the source commit used by this site; playground examples run that source.` },
      { kind: 'code', language: 'Terminal', code: `bun add @tumblerjs/svelte@${version} @tumblerjs/word@${version} @tumblerjs/sheets@${version} @tumblerjs/slides@${version} @tumblerjs/core@${version}` },
    ] },
    { id: 'word', title: 'New Word capabilities', blocks: [
      { kind: 'list', items: [
        'Character formatting adds strike, Word highlight colours, superscript/subscript, and character spacing.',
        'Paragraph formatting adds spacing, pagination rules, shading, and basic borders.',
        'Authoring supports letter/Roman and multilevel lists, hyperlinks, named paragraph styles, and explicit line/page/column breaks.',
        'Seven editable shape types support fills, outlines, placement, and plain text. WordDrawingView can report in-place shape text edits to the host.',
        'The collaboration adapter adds literal find/replace and atomic text replacement with formatting.',
        'Style reapplication resets omitted direct overrides while retaining inherited character styles. Table grid and geometry handling have also improved.',
      ] },
      { kind: 'link', href: '/docs/word-authoring', label: 'Authoring examples and limitations' },
      { kind: 'link', href: '/docs/word-collaboration#search', label: 'Find and replace with anchored transactions' },
      { kind: 'note', text: 'These APIs need host integration. The Word playground demonstrates package-backed text editing, basic formatting, and drawing movement/resizing. It does not currently provide native list/style/table insertion controls, rich clipboard paste, find/replace, heading navigation, or shape text editing.' },
    ] },
    { id: 'evidence', title: 'Compatibility evidence', blocks: [
      { kind: 'text', text: 'Word CI now produces standards coverage, preservation, reference-geometry, authoring, and everyday-task reports. Some checks use Open XML SDK and LibreOffice. A green workflow means its configured gates passed; individual everyday tasks can still report failed or blocked. Passing headless operations does not establish browser support or complete Office compatibility.' },
      { kind: 'link', href: `${repository}/actions/workflows/word-compatibility.yml`, label: 'Word compatibility runs and downloadable reports' },
      { kind: 'link', href: `${repository}/blob/main/tools/word-compatibility/README.md`, label: 'How standards coverage and everyday tasks are scored' },
      { kind: 'link', href: '/docs/compatibility', label: 'Current format support and remaining gaps' },
    ] },
  ],
  next: { href: '/docs/word-authoring', label: 'Word authoring' },
};
