import { isWordParagraphFormat, type WordParagraphFormat } from '../paragraph-format.ts';

const prefix = 'wordParagraphFormat:';
const properties = [
  'spacingBeforeTwips', 'spacingAfterTwips', 'lineSpacing', 'keepNext', 'keepLines',
  'pageBreakBefore', 'widowControl', 'contextualSpacing', 'shading', 'borders',
] as const satisfies readonly (keyof WordParagraphFormat)[];

export function isParagraphPropertyAttribute(key: string): boolean {
  return key.startsWith(prefix);
}

/** Wrapped null is a durable removal that masks a legacy paragraph object's property. */
export function isParagraphPropertyValue(key: string, value: unknown): value is { value: unknown } {
  const property = key.slice(prefix.length);
  if (!isParagraphPropertyAttribute(key) || !properties.some(name => name === property)) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length !== 1 || entries[0]![0] !== 'value') return false;
  const item: unknown = entries[0]![1];
  return item === null || isWordParagraphFormat({ [property]: item });
}

/** Decode property registers over the legacy object without rewriting shared CRDT history. */
export function readWordParagraphFormat(attributes?: Readonly<Record<string, unknown>>): WordParagraphFormat | undefined {
  const legacy = attributes?.paragraph;
  const result: Record<string, unknown> = isWordParagraphFormat(legacy) ? { ...legacy } : {};
  let present = isWordParagraphFormat(legacy);
  for (const [key, wrapped] of Object.entries(attributes ?? {})) {
    if (!isParagraphPropertyAttribute(key)) continue;
    if (!isParagraphPropertyValue(key, wrapped)) throw new Error(`Unsupported document formatting: ${key}.`);
    const value = wrapped.value;
    const property = key.slice(prefix.length);
    if (value === null) delete result[property];
    else { result[property] = value; present = true; }
  }
  if (!Object.keys(result).length && !present) return undefined;
  // Validation narrows the assembled object, including structured spacing and border values.
  if (!isWordParagraphFormat(result)) throw new Error('Invalid paragraph formatting.');
  return result;
}

/** Patch only supplied properties; a whole-format reset removes every supported property. */
export function paragraphPropertyPatch(patch: WordParagraphFormat | null): Record<string, unknown> {
  return Object.fromEntries((patch === null ? properties.map(key => [key, null] as const) : Object.entries(patch))
    .map(([key, value]) => [prefix + key, { value }]));
}
