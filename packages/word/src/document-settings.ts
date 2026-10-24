import { beginLosslessXmlEdit, parseLosslessXml } from '@tumblerjs/ooxml';
import { beginPackageTransaction, RelationshipsError } from '@tumblerjs/opc';
import { openWordArtifact, type WordArtifact } from './artifact.ts';
import { PackageXml } from './package-xml.ts';
import { wordColourAttributes } from './theme-colour-xml.ts';
import { isWordColour, type WordColour } from './theme-colours.ts';

export interface WordDocumentSettings {
  /** Omitted preserves the source; null removes its background, including any background drawing. */
  readonly background?: WordColour | null;
}

export function isWordDocumentSettings(value: unknown): value is WordDocumentSettings {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, item]) => key === 'background' && (item === null || isWordColour(item)));
}

/** ECMA-376 §17.2.1 and §17.15.1.26. Changes retain unrelated XML and package parts. */
export function applyWordDocumentSettings(artifact: WordArtifact, settings: WordDocumentSettings): WordArtifact {
  if (!isWordDocumentSettings(settings)) throw new TypeError('Invalid document settings.');
  if (settings.background === undefined) return artifact;
  const document = artifact.document;
  if (document.source.root.localName !== 'document') throw new Error('Document settings require the main document.');
  const namespace = document.source.root.namespaceUri;
  const markup = new PackageXml(document);
  const background = settings.background === null ? '' :
    `<w:background xmlns:w="${namespace}" ${wordColourAttributes(settings.background).replace('w:val=', 'w:color=')}/>`;
  const editor = beginLosslessXmlEdit(document.source);
  editor.replaceElementMarkup(document.source.root, markup.properties(document.source.root, 'document', new Map([['background', background]])));
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, editor.commit().bytes);
  if (settings.background !== null) {
    let relationships;
    try { relationships = document.package.relationships(document.part.name); }
    catch (error) { if (!(error instanceof RelationshipsError) || error.code !== 'missing_item') throw error; }
    const relationship = relationships?.items.find(item => item.type.endsWith('/settings') && item.targetMode === 'Internal');
    const part = relationship?.targetMode === 'Internal' ? document.package.getPart(relationship.targetPartName) : undefined;
    const display = `<w:displayBackgroundShape xmlns:w="${namespace}"/>`;
    if (part) {
      const source = parseLosslessXml(document.package.readPart(part));
      const edit = beginLosslessXmlEdit(source);
      const existing = source.elements(namespace, 'displayBackgroundShape')[0];
      if (existing) edit.replaceElementMarkup(existing, display);
      else if (source.root.selfClosing) edit.replaceElementMarkup(source.root,
        source.source.slice(source.root.span.start, source.root.span.end).replace(/\s*\/>$/, `>${display}</${source.root.qualified}>`));
      else {
        const preceding = new Set(['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries']);
        const first = source.root.children.find(child => child.kind === 'element' && child.namespaceUri === namespace && !preceding.has(child.localName));
        if (first?.kind === 'element') edit.insertMarkupBefore(first, display);
        else edit.appendMarkup(source.root, display);
      }
      transaction.replacePart(part.name, edit.commit().bytes);
    } else {
      let index = 1;
      const ids = new Set(relationships?.items.map(item => item.id));
      while (document.package.getPart(`/word/tumbler-settings-${index}.xml`) || ids.has(`tumbler-settings-${index}`)) index++;
      const name = `/word/tumbler-settings-${index}.xml`;
      transaction.addPart(name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml',
        new TextEncoder().encode(`<w:settings xmlns:w="${namespace}">${display}</w:settings>`));
      transaction.addRelationship(document.part.name, { id: `tumbler-settings-${index}`,
        type: `${document.conformance === 'strict' ? 'http://purl.oclc.org/ooxml' : 'http://schemas.openxmlformats.org'}/officeDocument/${document.conformance === 'strict' ? '' : '2006/'}relationships/settings`, target: name });
    }
  }
  return openWordArtifact(transaction.commit(), document.openOptions);
}
