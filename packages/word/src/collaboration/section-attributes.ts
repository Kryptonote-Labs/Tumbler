import { wordSectionBoundarySchema, wordSectionFormatSchema, type WordSectionBoundary, type WordSectionFormat } from '../section-format.ts';

const prefix = 'wordSectionFormat:';
export function isSectionPropertyAttribute(key: string) { return key.startsWith(prefix); }
export function isSectionPropertyValue(key: string, value: unknown) {
  return isSectionPropertyAttribute(key) && !!value && typeof value === 'object' && 'value' in value && Object.keys(value).length === 1 && wordSectionFormatSchema.safeParse({ [key.slice(prefix.length)]: value.value }).success;
}
export function sectionPropertyPatch(format: WordSectionFormat) {
  wordSectionFormatSchema.parse(format);
  return Object.fromEntries(Object.entries(format).map(([key, value]) => [prefix + key, { value }]));
}
export function readWordSectionBoundary(attributes: Readonly<Record<string, unknown>>): WordSectionBoundary | null | undefined {
  if (attributes.wordSection === undefined) return undefined;
  if (attributes.wordSection && typeof attributes.wordSection === 'object' && 'remove' in attributes.wordSection && attributes.wordSection.remove === true) return null;
  const boundary = wordSectionBoundarySchema.parse(attributes.wordSection);
  const format = { ...boundary.format };
  for (const [key, value] of Object.entries(attributes)) {
    if (!isSectionPropertyAttribute(key)) continue;
    if (!isSectionPropertyValue(key, value)) throw new Error('Invalid section formatting.');
    Object.assign(format, { [key.slice(prefix.length)]: (value as { value: unknown }).value });
  }
  return { ...boundary, format };
}
