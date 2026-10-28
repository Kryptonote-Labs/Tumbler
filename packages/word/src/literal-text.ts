/** Writer treats LF in w:t as a space; a referenced CR is an inline line break.
 * Literal CR/CRLF have already become LF through XML end-of-line normalization.
 */
export function wordLiteralText(value: string): string {
  return value.replace(/\n/g, ' ').replace(/\r/g, '\u2028');
}
