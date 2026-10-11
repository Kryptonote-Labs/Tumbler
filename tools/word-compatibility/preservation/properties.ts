/** ECMA-376-1:2016 section IDs, checked against the pinned source in catalog/sources.json. */
const allProperties = [
  { name: 'bidi', topic: 'ecma-1:17.3.1.6', kind: 'paragraph' },
  { name: 'contextualSpacing', topic: 'ecma-1:17.3.1.9', kind: 'paragraph' },
  { name: 'keepLines', topic: 'ecma-1:17.3.1.14', kind: 'paragraph' },
  { name: 'keepNext', topic: 'ecma-1:17.3.1.15', kind: 'paragraph' },
  { name: 'pageBreakBefore', topic: 'ecma-1:17.3.1.23', kind: 'paragraph' },
  { name: 'snapToGrid', topic: 'ecma-1:17.3.1.32', kind: 'paragraph' },
  { name: 'suppressAutoHyphens', topic: 'ecma-1:17.3.1.34', kind: 'paragraph' },
  { name: 'suppressLineNumbers', topic: 'ecma-1:17.3.1.35', kind: 'paragraph' },
  { name: 'widowControl', topic: 'ecma-1:17.3.1.44', kind: 'paragraph' },
  { name: 'b', topic: 'ecma-1:17.3.2.1', kind: 'run' },
  { name: 'bCs', topic: 'ecma-1:17.3.2.2', kind: 'run' },
  { name: 'caps', topic: 'ecma-1:17.3.2.5', kind: 'run' },
  { name: 'cs', topic: 'ecma-1:17.3.2.7', kind: 'run' },
  { name: 'dstrike', topic: 'ecma-1:17.3.2.9', kind: 'run' },
  { name: 'emboss', topic: 'ecma-1:17.3.2.13', kind: 'run' },
  { name: 'i', topic: 'ecma-1:17.3.2.16', kind: 'run' },
  { name: 'iCs', topic: 'ecma-1:17.3.2.17', kind: 'run' },
  { name: 'imprint', topic: 'ecma-1:17.3.2.18', kind: 'run' },
  { name: 'noProof', topic: 'ecma-1:17.3.2.21', kind: 'run' },
  { name: 'oMath', topic: 'ecma-1:17.3.2.22', kind: 'run' },
  { name: 'outline', topic: 'ecma-1:17.3.2.23', kind: 'run' },
  { name: 'rtl', topic: 'ecma-1:17.3.2.30', kind: 'run' },
  { name: 'shadow', topic: 'ecma-1:17.3.2.31', kind: 'run' },
  { name: 'smallCaps', topic: 'ecma-1:17.3.2.33', kind: 'run' },
  { name: 'snapToGrid', topic: 'ecma-1:17.3.2.34', kind: 'run' },
  { name: 'specVanish', topic: 'ecma-1:17.3.2.36', kind: 'run' },
  { name: 'strike', topic: 'ecma-1:17.3.2.37', kind: 'run' },
  { name: 'vanish', topic: 'ecma-1:17.3.2.41', kind: 'run' },
  { name: 'webHidden', topic: 'ecma-1:17.3.2.44', kind: 'run' },
] as const;
export type Property = typeof allProperties[number];
// SDK 3.5.1 rejects the original cs/rtl style and ordinary-run oMath fixtures.
// Keep their requirements untested until the source/validator discrepancy is resolved.
export const deferredProperties = allProperties.filter(property => ['cs', 'rtl', 'oMath'].includes(property.name));
export const properties = allProperties.filter(property => !deferredProperties.includes(property));
export const profiles = ['strict', 'transitional'] as const;
export type Profile = typeof profiles[number];
export const scenarioId = (property: Property, profile: Profile) => `preserve-${property.kind}-${property.name.toLowerCase()}-${profile}`;
export const requirementId = (property: Property) => `preserve.${property.kind}-${property.name.toLowerCase()}-boolean`;
