import { z } from 'zod';
import type { WordSectionProperties } from './document.ts';
import { PackageXml } from './package-xml.ts';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { wordSections } from './stories.ts';
import { openWordArtifact, type WordArtifact } from './artifact.ts';

const twips = z.number().int().nonnegative();
export const wordSectionFormatSchema = z.object({
  pageWidthTwips: twips.positive().optional(), pageHeightTwips: twips.positive().optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  marginTopTwips: z.number().int().optional(), marginBottomTwips: z.number().int().optional(),
  marginLeftTwips: twips.optional(), marginRightTwips: twips.optional(),
  headerDistanceTwips: twips.optional(), footerDistanceTwips: twips.optional(), gutterTwips: twips.optional(),
  columnCount: twips.positive().optional(), columnSpaceTwips: twips.optional(),
  columns: z.array(z.object({ widthTwips: twips.positive(), spaceTwips: twips }).strict()).min(1).nullable().optional(),
  columnSeparator: z.boolean().optional(),
  breakType: z.enum(['continuous', 'nextPage', 'nextColumn', 'evenPage', 'oddPage']).optional(),
}).strict();
export type WordSectionFormat = z.infer<typeof wordSectionFormatSchema>;
export const wordSectionBoundarySchema = z.object({
  /** An existing section supplies opaque properties and header/footer relationships. */
  source: z.number().int().nonnegative().optional(),
  format: wordSectionFormatSchema,
}).strict();
export type WordSectionBoundary = z.infer<typeof wordSectionBoundarySchema>;

export const DEFAULT_WORD_SECTION: WordSectionProperties = {
  elementId: -1, pageWidthTwips: 11906, pageHeightTwips: 16838, orientation: 'portrait',
  marginTopTwips: 1440, marginBottomTwips: 1440, marginLeftTwips: 1440, marginRightTwips: 1440,
  headerDistanceTwips: 720, footerDistanceTwips: 720, gutterTwips: 0,
  columnCount: 1, columnSpaceTwips: 720, breakType: 'nextPage', titlePage: false,
  headerReferences: [], footerReferences: [],
};

export function wordSectionFormat(properties: WordSectionProperties): WordSectionFormat {
  return wordSectionFormatSchema.parse(Object.fromEntries(Object.entries(properties)
    .filter(([key, value]) => key in wordSectionFormatSchema.shape && value !== undefined)));
}

/** Apply a semantic patch to imported section properties without losing references or opaque XML. */
export function resolveWordSection(base: WordSectionProperties, format: WordSectionFormat): WordSectionProperties {
  const patch = wordSectionFormatSchema.parse(format);
  const { columns, ...rest } = patch;
  const result: WordSectionProperties = { ...base, ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
    ...(columns === undefined ? {} : { columns: columns ?? undefined, columnCount: columns?.length ?? patch.columnCount ?? base.columnCount }),
  };
  const width = result.pageWidthTwips - result.marginLeftTwips - result.marginRightTwips - result.gutterTwips;
  const height = result.pageHeightTwips - Math.abs(result.marginTopTwips) - Math.abs(result.marginBottomTwips);
  if (width <= 0 || height <= 0 || !result.columns && result.columnSpaceTwips * (result.columnCount - 1) >= width)
    throw new RangeError('Section margins and spacing leave no text area.');
  return result;
}

export function sectionFormatXml(format: WordSectionFormat): Map<string, string> {
  wordSectionFormatSchema.parse(format);
  const result = new Map<string, string>();
  const attributes = (names: Readonly<Record<string, string>>) => Object.entries(names)
    .flatMap(([key, name]) => { const value = format[key as keyof WordSectionFormat]; return value === undefined ? [] : [` w:${name}="${value}"`]; }).join('');
  const size = attributes({ pageWidthTwips: 'w', pageHeightTwips: 'h', orientation: 'orient' });
  if (size) result.set('pgSz', `<w:pgSz${size}/>`);
  const margins = attributes({ marginTopTwips: 'top', marginRightTwips: 'right', marginBottomTwips: 'bottom', marginLeftTwips: 'left', headerDistanceTwips: 'header', footerDistanceTwips: 'footer', gutterTwips: 'gutter' });
  if (margins) result.set('pgMar', `<w:pgMar${margins}/>`);
  if (format.breakType !== undefined) result.set('type', `<w:type w:val="${format.breakType}"/>`);
  if (['columns', 'columnCount', 'columnSpaceTwips', 'columnSeparator'].some(key => key in format)) {
    const separator = format.columnSeparator === undefined ? '' : ` w:sep="${format.columnSeparator ? 1 : 0}"`;
    result.set('cols', format.columns ? `<w:cols w:equalWidth="0"${separator}>${format.columns.map(c => `<w:col w:w="${c.widthTwips}" w:space="${c.spaceTwips}"/>`).join('')}</w:cols>` :
      `<w:cols w:equalWidth="1"${attributes({ columnCount: 'num', columnSpaceTwips: 'space' })}${separator}/>`);
  }
  return result;
}

/** Merge attributes within pgSz/pgMar and retain all unsupported section children. */
export function sectionBoundaryXml(markup: PackageXml, boundary: WordSectionBoundary) {
  const element = boundary.source === undefined ? undefined : markup.element(boundary.source, 'sectPr');
  if (boundary.source !== undefined && !element) throw new Error('Unknown source section.');
  const format = boundary.source === undefined ? { ...wordSectionFormat(markup.document.finalSection), ...boundary.format } : boundary.format;
  const changes = sectionFormatXml(format);
  if (changes.has('cols') && element) {
    const base = wordSections(markup.document).find(section => section.elementId === element.id);
    if (base) {
      const resolved = resolveWordSection(base, boundary.format);
      changes.set('cols', sectionFormatXml({ columnCount: resolved.columnCount, columnSpaceTwips: resolved.columnSpaceTwips,
        columns: resolved.columns ? [...resolved.columns] : null, columnSeparator: resolved.columnSeparator ?? false }).get('cols')!);
    }
  }
  for (const name of ['pgSz', 'pgMar']) {
    const old = markup.children(element, name)[0];
    const fresh = changes.get(name);
    if (!old || !fresh) continue;
    const replaced = new Set([...fresh.matchAll(/ w:(\w+)=/g)].map(match => match[1]));
    const retained = old.attributes.filter(a => a.namespaceUri !== old.namespaceUri || !replaced.has(a.localName));
    const attrs = retained.map(a => ` ${a.qualified}="${a.value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join('');
    changes.set(name, fresh.replace('/>', `${attrs}/>`));
  }
  return markup.properties(element, 'sectPr', changes) || '<w:sectPr/>';
}

export function applyWordFinalSection(artifact: WordArtifact, format: WordSectionFormat): WordArtifact {
  const document = artifact.document;
  resolveWordSection(document.finalSection, format);
  const markup = new PackageXml(document);
  const existing = document.source.element(document.finalSection.elementId);
  const boundary = { ...(existing?.localName === 'sectPr' ? { source: existing.id } : {}), format };
  const editor = beginLosslessXmlEdit(document.source);
  const xml = markup.word(sectionBoundaryXml(markup, boundary));
  if (existing?.localName === 'sectPr') editor.replaceElementMarkup(existing, xml);
  else {
    const body = document.source.elements(document.source.root.namespaceUri, 'body')[0];
    if (!body) throw new Error('Section settings require the document body.');
    editor.replaceElementMarkup(body, markup.wrap(body, 'body', body.children.map(child => markup.raw(child)).join('') + xml));
  }
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, editor.commit().bytes);
  return openWordArtifact(transaction.commit(), document.openOptions);
}
