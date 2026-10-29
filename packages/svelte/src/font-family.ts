/** Missing Office fonts should keep their font class instead of falling back to the browser's serif default. */
export function cssFontFamily(name: string): string {
  const generic = /mono|consolas|courier|menlo|terminal/i.test(name)
    ? "monospace"
    : /comic|cursive|script|handwriting/i.test(name)
      ? "cursive"
      : /times|cambria|georgia|garamond|palatino|baskerville|(?:^|\s)serif(?:$|\s)/i.test(name)
        ? "serif"
        : "sans-serif";
  return `${JSON.stringify(name)}, ${generic}`;
}
