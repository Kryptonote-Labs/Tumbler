import { beginLosslessXmlEdit, parseLosslessXml } from '@tumblerjs/ooxml';
import { PartName, type PackageTransaction } from '@tumblerjs/opc';
import { WORD_BUILTIN_STYLES, builtinStyleXml } from './authored-styles.ts';
import type { WordDocument } from './document.ts';

/** Add missing built-ins only when an authored paragraph requests one. Existing definitions win. */
export function mergeAuthoredStyles(document: WordDocument, ids: readonly string[], transaction: PackageTransaction) {
  const required = new Set(ids);
  if (ids.some(id => WORD_BUILTIN_STYLES.some(style => style.styleId === id))) required.add('Normal');
  const missing = WORD_BUILTIN_STYLES.filter(style => required.has(style.styleId) && !document.styles.style(style.styleId));
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
    let id = 'tumbler-styles';
    const existing = document.package.relationships(document.part.name).items;
    while (existing.some(rel => rel.id === id)) id += '-new';
    transaction.addRelationship(document.part.name, { id, type: `${office}/styles`, target: path });
  }
}
