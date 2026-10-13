/** Empty string explicitly removes a source hyperlink. Hosts decide how to open targets. */
export function isWordHyperlink(value: unknown): value is string {
  return typeof value === 'string' && value.isWellFormed() && !/[\x00-\x20\x7f<>"\ufffe\uffff]/.test(value) &&
    (value === '' || /^#[^#]+$/.test(value) || /^(https?:|mailto:|tel:)/i.test(value));
}
