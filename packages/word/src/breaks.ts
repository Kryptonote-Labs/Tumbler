export type WordBreakType = 'line' | 'page' | 'column';
export function wordBreakXml(kind: WordBreakType, text: string): string {
  if (text !== '\u2028' || !['line', 'page', 'column'].includes(kind)) throw new TypeError('A break occupies one line-separator character.');
  return `<w:br w:type="${kind === 'line' ? 'textWrapping' : kind}"/>`;
}
