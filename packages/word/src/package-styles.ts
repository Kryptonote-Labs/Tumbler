import { beginLosslessXmlEdit, parseLosslessXml } from '@tumblerjs/ooxml';
import { PartName, RelationshipsError, type PackageTransaction } from '@tumblerjs/opc';
import { WORD_BUILTIN_STYLES, builtinStyleXml } from './authored-styles.ts';
import type { WordDocument } from './document.ts';

/** Add missing built-ins only when an authored paragraph requests one. Existing definitions win. */
export function mergeAuthoredStyles(document: WordDocument, ids: readonly string[], transaction: PackageTransaction) {
  const missing = missingAuthoredStyles(document, ids);
  if (!missing.length) return;
  const namespace = document.source.root.namespaceUri;
  const content = missing.map(style => builtinStyleXml(style).replace('<w:style ', `<w:style xmlns:w="${namespace}" `)).join('');
  const name = document.styles.partName;
  if (name) {
    const parsed = parseLosslessXml(document.package.readPart(document.package.getPart(name)!));
    const edit = beginLosslessXmlEdit(parsed); edit.appendMarkup(parsed.root, content);
    transaction.replacePart(name, edit.commit().bytes);
  } else {
    let suffix = 0;
    let path = PartName.parse('/word/tumbler-styles.xml');
    while (document.package.getPart(path)) path = PartName.parse(`/word/tumbler-styles-${++suffix}.xml`);
    transaction.addPart(path, 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml', new TextEncoder().encode(`<w:styles xmlns:w="${namespace}">${content}</w:styles>`));
    const office = document.conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const owner = document.package.mainOfficeDocumentPart().name;
    let id = 'tumbler-styles';
    let existingIds = new Set<string>();
    try { existingIds = new Set(document.package.relationships(owner).items.map(rel => rel.id)); }
    catch (error) { if (!(error instanceof RelationshipsError) || error.code !== 'missing_item') throw error; }
    while (existingIds.has(id)) id += '-new';
    transaction.addRelationship(owner, { id, type: `${office}/styles`, target: path });
  }
}

/** Shared resource preflight for sequential and batched content exports. */
export function missingAuthoredStyles(document: WordDocument, ids: readonly string[]) {
  const required = new Set(ids);
  if (ids.some(id => WORD_BUILTIN_STYLES.some(style => style.styleId === id))) required.add('Normal');
  return WORD_BUILTIN_STYLES.filter(style => required.has(style.styleId) && !document.styles.style(style.styleId));
}
