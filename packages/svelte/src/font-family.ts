/** Give common Office fonts an appropriate generic fallback without replacing embedded aliases. */
export function cssFontFamily(name: string): string {
  const generic = /(?:^|[ -])mono(?:$|[ -])|monospace|consolas|courier|menlo|terminal/i.test(name)
    ? "monospace"
    : /comic|cursive|corsiva|script|handwriting/i.test(name)
      ? "cursive"
      : /sans|arial|aptos|calibri|candara|corbel|helvetica|verdana|tahoma|segoe|trebuchet|franklin gothic|century gothic|gill|roboto|(?:^|\s)inter(?:$|\s)/i.test(
            name,
          )
        ? "sans-serif"
        : "serif";
  return `${JSON.stringify(name)}, ${generic}`;
}
