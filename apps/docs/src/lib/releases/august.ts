import type { Release } from './types';

export const augustReleases: readonly Release[] = [
  {
    version: '0.1.0-alpha.14',
    date: '2026-08-11',
    summary: 'Improve Word typing and caret behavior',
    changes: [
      'Fix selection feedback loops, empty-line carets, trailing-space positions, and edits at the live caret.',
      'Split mixed-format paragraphs while retaining typing formats, and keep the editor focused during toolbar actions.',
      'Align rendered Word text to font baselines. Includes the fixes prepared in alpha.6–13, which are not listed in the registry.',
    ],
    registryPackage: 'opc',
    commit: '6207a433df476fa036a083108a4ad76ca67a19d6',
    previousCommit: '99b610ef82153068c697032a3c5300fd796d9cf3',
  },
  {
    version: '0.1.0-alpha.5',
    date: '2026-08-09',
    summary: 'Word documents join the public packages',
    changes: [
      'Add @tumblerjs/word with paginated rendering, logical text editing, formatting, and bounded undo/redo.',
      'Read tables, numbering, headers, footers, images, charts, footnotes, and endnotes in the supported Word subset.',
      'Expand spreadsheet calculation, cross-sheet reference picking, conditional formatting, and scatter and bubble chart rendering.',
    ],
    registryPackage: 'opc',
    commit: '99b610ef82153068c697032a3c5300fd796d9cf3',
    previousCommit: '99bc1b4b24d6c73e6cd772f2a21b48ffcf03148f',
  },
  {
    version: '0.1.0-alpha.4',
    date: '2026-08-08',
    summary: 'Write ordinary spreadsheet formulas',
    changes: [
      'Write supported ordinary cell formulas through the headless spreadsheet API.',
      'Add an explicit Svelte formula bar so formula input is separate from literal grid edits.',
    ],
    registryPackage: 'opc',
    commit: '99bc1b4b24d6c73e6cd772f2a21b48ffcf03148f',
    previousCommit: '36291c114eb3593c83f871648eae0a4cf321bfa9',
  },
  {
    version: '0.1.0-alpha.3',
    date: '2026-08-08',
    summary: 'Align the seven public packages',
    changes: [
      'Align all seven public packages on one alpha.3 dependency graph.',
      'Add public package documentation, licenses, and qualification against packed packages in Kryptonote.',
    ],
    registryPackage: 'opc',
    commit: '36291c114eb3593c83f871648eae0a4cf321bfa9',
    previousCommit: '12170a6',
  },
  {
    version: '0.1.0-alpha.2',
    date: '2026-08-03',
    summary: 'Repair spreadsheet dependency versions',
    changes: [
      'Republish only @tumblerjs/sheets with dependencies pinned to the available alpha.0 and alpha.1 packages.',
    ],
    registryPackage: 'sheets',
    partial: true,
  },
  {
    version: '0.1.0-alpha.1',
    date: '2026-08-03',
    summary: 'Partial dependency-graph repair',
    changes: [
      'Republish selected shared packages, sheets, and Svelte during the initial dependency-graph repair.',
      'The OOXML package now depends on OPC alpha.0. OPC and formulas have no matching alpha.1 publication.',
    ],
    registryPackage: 'sheets',
    partial: true,
  },
  {
    version: '0.1.0-alpha.0',
    date: '2026-08-03',
    summary: 'First public spreadsheet packages',
    changes: [
      'Publish the OPC, OOXML, formulas, charts, core, sheets, and Svelte packages.',
      'Read and edit spreadsheet values, calculate a bounded formula subset, and render worksheets and supported embedded charts.',
      'The first dependency graph needed follow-up package corrections in alpha.1 and alpha.2.',
    ],
    registryPackage: 'opc',
    commit: '12170a6',
  },
];
