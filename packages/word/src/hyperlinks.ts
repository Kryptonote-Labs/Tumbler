/** Empty string explicitly removes a source hyperlink. Targets are OOXML URI references, including relative files. Hosts must choose which schemes they open. */
export function isWordHyperlink(value: unknown): value is string {
  return typeof value === 'string' && value.isWellFormed() && !/[\x00-\x1f\x7f\ufffe\uffff]/.test(value);
}
