/** Convert only newly generated numbering markup, never imported source fragments. */
export function strictNumberingMarkup(markup: string): string {
  return markup
    .replace(/<w:ind\b[^>]*>/g, tag => tag.replace(/\bw:(left|right)(Chars)?=/g,
      (_, side: string, chars: string | undefined) => `w:${side === 'left' ? 'start' : 'end'}${chars ?? ''}=`))
    .replace(/<w:lvlJc w:val="(left|right)"/g,
      (_, side: string) => `<w:lvlJc w:val="${side === 'left' ? 'start' : 'end'}"`);
}

/** CT_TblWidth uses unit-qualified measurements in Strict, and twips in Transitional. */
export function tableWidthValue(twips: number, strict: boolean): string {
  return strict ? `${twips / 20}pt` : String(twips);
}

export function tableBorderName(side: string, strict: boolean): string {
  return strict && side === 'left' ? 'start' : strict && side === 'right' ? 'end' : side;
}

/** Normalize Strict physical table measurements to the model's integer twips. */
export function tableMeasurementTwips(value: string, namespace: string): string {
  if (namespace !== 'http://purl.oclc.org/ooxml/wordprocessingml/main') return value;
  const match = /^(-?[0-9]+(?:\.[0-9]+)?)(mm|cm|in|pt|pc|pi)$/.exec(value);
  if (!match) return value;
  const factors: Record<string, number> = { mm: 1440 / 25.4, cm: 1440 / 2.54, in: 1440, pt: 20, pc: 240, pi: 240 };
  return String(Math.round(Number(match[1]) * factors[match[2]!]!));
}

/** Generated theme line limits use 1/1000 percent in Transitional and percent in Strict. */
export function strictThemeMarkup(markup: string): string {
  return markup.replace(/<a:miter lim="([0-9]+)"/g,
    (_, value: string) => `<a:miter lim="${Number(value) / 1000}%"`);
}
