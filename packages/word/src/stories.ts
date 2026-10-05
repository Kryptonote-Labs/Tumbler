import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { beginPackageTransaction, PartName, RelationshipsError } from '@tumblerjs/opc';
import { WordArtifact, openWordArtifact } from './artifact.ts';
import { WordDocument, type WordHeaderFooterStory, type WordSectionProperties, type WordBlock } from './document.ts';

export type WordStoryKind = WordHeaderFooterStory['kind'];
export type WordStoryType = WordHeaderFooterStory['type'];
export interface WordStoryTarget {
  readonly kind: WordStoryKind;
  readonly type: WordStoryType;
  readonly section: number;
}

/** A story uses the same content, formatting and native editing APIs as the main body.
 * Element IDs are local to this part, so callers must retain the story identity with positions. */
export function wordStoryArtifact(artifact: WordArtifact, partName: string): WordArtifact {
  const document = artifact.document;
  const story = document.headerFooters.find(item => item.part.name.value === partName);
  if (!story) throw new Error('Unknown header or footer part.');
  return new WordArtifact(new WordDocument({
    pkg: document.package, part: story.part, source: story.source,
    blocks: story.blocks, drawings: story.drawings,
    conformance: document.conformance, styles: document.styles, numbering: document.numbering,
    finalSection: document.finalSection, headerFooters: [], notes: [], evenAndOddHeaders: document.evenAndOddHeaders,
  }));
}

export function wordSections(document: Pick<WordDocument, 'blocks' | 'finalSection'>): readonly WordSectionProperties[] {
  const sections: WordSectionProperties[] = [];
  const visit = (blocks: readonly WordBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'paragraph' && block.section) sections.push(block.section);
    }
  };
  visit(document.blocks);
  sections.push(document.finalSection);
  return sections;
}

/** Add an empty, independently editable story to a section. Existing stories stay untouched. */
export function createWordStory(artifact: WordArtifact, target: WordStoryTarget): { artifact: WordArtifact; partName: string } {
  const document = artifact.document;
  const section = wordSections(document)[target.section];
  if (!section) throw new RangeError('Unknown document section.');
  const references = target.kind === 'header' ? section.headerReferences : section.footerReferences;
  const existing = references.find(item => item.type === target.type);
  if (existing) {
    const story = document.headerFooters.find(item => item.relationshipId === existing.relationshipId);
    if (!story) throw new Error('Missing header or footer part.');
    return { artifact, partName: story.part.name.value };
  }
  const transaction = beginPackageTransaction(document.package);
  const ids = new Set<string>();
  try { for (const item of document.package.relationships(document.part.name).items) ids.add(item.id); }
  catch (error) { if (!(error instanceof RelationshipsError) || error.code !== 'missing_item') throw error; }
  let index = 1;
  while (document.package.getPart(`/word/tumbler-${target.kind}-${index}.xml`) || ids.has(`tumbler-${target.kind}-${index}`)) index++;
  const partName = `/word/tumbler-${target.kind}-${index}.xml`;
  const relationshipId = `tumbler-${target.kind}-${index}`;
  const root = target.kind === 'header' ? 'hdr' : 'ftr';
  const namespace = document.source.root.namespaceUri;
  const office = document.conformance === 'strict'
    ? 'http://purl.oclc.org/ooxml/officeDocument/relationships'
    : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  transaction.addPart(PartName.parse(partName), `application/vnd.openxmlformats-officedocument.wordprocessingml.${target.kind}+xml`,
    new TextEncoder().encode(`<w:${root} xmlns:w="${namespace}"><w:p/></w:${root}>`));
  transaction.addRelationship(document.part.name, { id: relationshipId, type: `${office}/${target.kind}`, target: PartName.parse(partName) });
  const element = document.source.element(section.elementId);
  const edit = beginLosslessXmlEdit(document.source);
  const reference = `<w:${target.kind}Reference xmlns:w="${namespace}" xmlns:r="${office}" w:type="${target.type}" r:id="${relationshipId}"/>`;
  if (!element || element.localName !== 'sectPr') {
    const body = document.source.elements(namespace, 'body')[0]!;
    const markup = `<w:sectPr xmlns:w="${namespace}">${reference}</w:sectPr>`;
    if (body.selfClosing) {
      const raw = document.source.source.slice(body.span.start, body.span.end);
      edit.replaceElementMarkup(body, raw.replace(/\s*\/>$/, `>${markup}</${body.qualified}>`));
    } else edit.appendMarkup(body, markup);
  } else {
    const raw = document.source.source.slice(element.span.start, element.span.end);
    const preceding = element.children.filter(child => child.kind === 'element' &&
      (child.localName === 'headerReference' || target.kind === 'footer' && child.localName === 'footerReference')).at(-1);
    const at = (preceding?.span.end ?? element.startTagSpan.end) - element.span.start;
    const markup = element.selfClosing
      ? raw.replace(/\s*\/>$/, `>${reference}</${element.qualified}>`)
      : raw.slice(0, at) + reference + raw.slice(at);
    edit.replaceElementMarkup(element, markup);
  }
  transaction.replacePart(document.part.name, edit.commit().bytes);
  return { artifact: openWordArtifact(transaction.commit(), { maxBlocks: Number.MAX_SAFE_INTEGER, maxInlineItems: Number.MAX_SAFE_INTEGER, maxTextCharacters: Number.MAX_SAFE_INTEGER }), partName };
}
