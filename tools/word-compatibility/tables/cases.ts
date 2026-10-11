export const topics = {
  span: 'ecma-1:17.4.17', before: 'ecma-1:17.4.15', after: 'ecma-1:17.4.14', merge: 'ecma-1:17.4.84',
} as const;
export type Feature = keyof typeof topics;
export interface Cell { readonly text: string; readonly span?: number; readonly merge?: 'restart' | 'continue' | 'implicit' }
export interface Row { readonly cells: readonly Cell[]; readonly before?: number; readonly after?: number }
/** Expected anchors are authored independently of the resolver: column, column span, row span, text. */
export type Anchor = readonly [number, number, number, string];
export interface TableCase {
  readonly name: string; readonly feature: Feature; readonly columns: number; readonly rows: readonly Row[];
  readonly expectedColumns: number; readonly expected: readonly (readonly Anchor[])[];
}
export const cases: readonly TableCase[] = [
  { name: 'default-and-explicit-one', feature: 'span', columns: 2, rows: [{ cells: [{ text: 'A' }, { text: 'B', span: 1 }] }], expectedColumns: 2, expected: [[[0, 1, 1, 'A'], [1, 1, 1, 'B']]] },
  { name: 'staggered-spans', feature: 'span', columns: 3, rows: [{ cells: [{ text: 'A', span: 2 }, { text: 'B' }] }, { cells: [{ text: 'C' }, { text: 'D', span: 2 }] }], expectedColumns: 3, expected: [[[0, 2, 1, 'A'], [2, 1, 1, 'B']], [[0, 1, 1, 'C'], [1, 2, 1, 'D']]] },
  { name: 'augment-grid', feature: 'span', columns: 1, rows: [{ cells: [{ text: 'A', span: 4 }, { text: 'B', span: 2 }] }], expectedColumns: 6, expected: [[[0, 4, 1, 'A'], [4, 2, 1, 'B']]] },
  { name: 'infer-empty-grid', feature: 'span', columns: 0, rows: [{ cells: [{ text: 'A', span: 2 }, { text: 'B' }] }], expectedColumns: 3, expected: [[[0, 2, 1, 'A'], [2, 1, 1, 'B']]] },
  { name: 'default-zero', feature: 'before', columns: 3, rows: [{ cells: [{ text: 'A' }] }, { before: 0, cells: [{ text: 'B' }] }], expectedColumns: 3, expected: [[[0, 1, 1, 'A']], [[0, 1, 1, 'B']]] },
  { name: 'leading-omission', feature: 'before', columns: 3, rows: [{ before: 1, cells: [{ text: 'A', span: 2 }] }], expectedColumns: 3, expected: [[[1, 2, 1, 'A']]] },
  { name: 'oversized-offset-ignored', feature: 'before', columns: 3, rows: [{ before: 4, cells: [{ text: 'A', span: 3 }] }], expectedColumns: 3, expected: [[[0, 3, 1, 'A']]] },
  { name: 'trailing-omission', feature: 'after', columns: 3, rows: [{ after: 1, cells: [{ text: 'A', span: 2 }] }], expectedColumns: 3, expected: [[[0, 2, 1, 'A']]] },
  { name: 'absent-and-zero-after', feature: 'after', columns: 3, rows: [{ cells: [{ text: 'A' }] }, { after: 0, cells: [{ text: 'B' }] }], expectedColumns: 3, expected: [[[0, 1, 1, 'A']], [[0, 1, 1, 'B']]] },
  { name: 'conflicting-after-ignored', feature: 'after', columns: 3, rows: [{ after: 5, cells: [{ text: 'A' }] }, { after: 1, cells: [{ text: 'B' }] }], expectedColumns: 3, expected: [[[0, 1, 1, 'A']], [[0, 1, 1, 'B']]] },
  { name: 'both-edge-omissions', feature: 'after', columns: 4, rows: [{ before: 1, after: 1, cells: [{ text: 'A', span: 2 }] }], expectedColumns: 4, expected: [[[1, 2, 1, 'A']]] },
  { name: 'implicit-and-explicit-continuations', feature: 'merge', columns: 2, rows: [{ cells: [{ text: 'A', span: 2, merge: 'restart' }] }, { cells: [{ text: '', span: 2, merge: 'implicit' }] }, { cells: [{ text: '', span: 2, merge: 'continue' }] }], expectedColumns: 2, expected: [[[0, 2, 3, 'A']], [], []] },
  { name: 'independent-merges-and-restart', feature: 'merge', columns: 2, rows: [{ cells: [{ text: 'A', merge: 'restart' }, { text: 'B', merge: 'restart' }] }, { cells: [{ text: '', merge: 'continue' }, { text: 'C', merge: 'restart' }] }, { cells: [{ text: 'D' }, { text: '', merge: 'implicit' }] }], expectedColumns: 2, expected: [[[0, 1, 2, 'A'], [1, 1, 1, 'B']], [[1, 1, 2, 'C']], [[0, 1, 1, 'D']]] },
  { name: 'merge-after-leading-omission', feature: 'merge', columns: 3, rows: [{ before: 1, cells: [{ text: 'A', span: 2, merge: 'restart' }] }, { before: 1, cells: [{ text: '', span: 2, merge: 'continue' }] }], expectedColumns: 3, expected: [[[1, 2, 2, 'A']], []] },
];
export const invalidMerges: readonly { readonly name: string; readonly columns: number; readonly rows: readonly Row[] }[] = [
  { name: 'orphan', columns: 1, rows: [{ cells: [{ text: '', merge: 'implicit' }] }] },
  { name: 'different-span', columns: 2, rows: [{ cells: [{ text: 'A', span: 2, merge: 'restart' }] }, { cells: [{ text: '', merge: 'continue' }] }] },
  { name: 'shifted-same-span', columns: 3, rows: [{ cells: [{ text: 'A', span: 2, merge: 'restart' }, { text: 'B' }] }, { before: 1, cells: [{ text: '', span: 2, merge: 'continue' }] }] },
  { name: 'closed-by-unmerged-cell', columns: 1, rows: [{ cells: [{ text: 'A', merge: 'restart' }] }, { cells: [{ text: 'B' }] }, { cells: [{ text: '', merge: 'continue' }] }] },
  { name: 'closed-by-omitted-leading-column', columns: 2, rows: [{ cells: [{ text: 'A', merge: 'restart' }, { text: 'B' }] }, { before: 1, cells: [{ text: 'C' }] }, { cells: [{ text: '', merge: 'continue' }, { text: 'D' }] }] },
  { name: 'closed-by-omitted-trailing-column', columns: 2, rows: [{ cells: [{ text: 'A' }, { text: 'B', merge: 'restart' }] }, { after: 1, cells: [{ text: 'C' }] }, { cells: [{ text: 'D' }, { text: '', merge: 'continue' }] }] },
];
export function tableXml(columns: number, rows: readonly Row[]): string {
  return `<w:tbl><w:tblPr/><w:tblGrid>${Array.from({ length: columns }, () => '<w:gridCol w:w="1000"/>').join('')}</w:tblGrid>${rows.map(row => `<w:tr><w:trPr>${row.before === undefined ? '' : `<w:gridBefore w:val="${row.before}"/>`}${row.after === undefined ? '' : `<w:gridAfter w:val="${row.after}"/>`}</w:trPr>${row.cells.map(cell => `<w:tc><w:tcPr>${cell.span === undefined ? '' : `<w:gridSpan w:val="${cell.span}"/>`}${cell.merge === undefined ? '' : cell.merge === 'implicit' ? '<w:vMerge/>' : `<w:vMerge w:val="${cell.merge}"/>`}</w:tcPr><w:p>${cell.text ? `<w:r><w:t>${cell.text}</w:t></w:r>` : ''}</w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
}
