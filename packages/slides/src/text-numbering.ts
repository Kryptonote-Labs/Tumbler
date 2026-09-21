/** Common DrawingML automatic numbering schemes. Values are bounded by the reader. */
export function formatAutoNumber(value: number, scheme: string): string {
  let label = String(value);
  if (scheme.startsWith("alpha")) {
    let n = value;
    label = "";
    while (n > 0) {
      n--;
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26);
    }
    if (scheme.startsWith("alphaLc")) label = label.toLowerCase();
  } else if (scheme.startsWith("roman") && value < 4000) {
    let n = value;
    label = "";
    for (const [number, token] of [
      [1000, "M"],
      [900, "CM"],
      [500, "D"],
      [400, "CD"],
      [100, "C"],
      [90, "XC"],
      [50, "L"],
      [40, "XL"],
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ] as const) {
      while (n >= number) {
        label += token;
        n -= number;
      }
    }
    if (scheme.startsWith("romanLc")) label = label.toLowerCase();
  }
  if (scheme.endsWith("ParenBoth")) return `(${label})`;
  if (scheme.endsWith("ParenR")) return `${label})`;
  if (scheme.endsWith("Plain")) return label;
  return `${label}.`;
}
