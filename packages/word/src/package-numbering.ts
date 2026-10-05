import { beginLosslessXmlEdit, parseLosslessXml } from '@tumblerjs/ooxml';
import { PartName, type PackageTransaction } from '@tumblerjs/opc';
import type { WordDocument } from './document.ts';

/** New lists share the document's numbering part without renumbering existing definitions. */
export function mergeContentNumbering(
  source: WordDocument,
  generated: WordDocument,
  transaction: PackageTransaction,
  prefix: string,
) {
  const generatedName = generated.numbering.partName;
  if (!generatedName) return (value: string) => value;
  const used = new Set([
    ...source.numbering.abstracts.map((item) => item.id),
    ...source.numbering.instances.map((item) => item.id),
  ]);
  const ids = new Map<number, number>();
  let next = 1;
  for (const item of generated.numbering.instances) {
    while (used.has(next)) next++;
    ids.set(item.id, next);
    used.add(next++);
  }
  const rewrite = (value: string) =>
    value.replace(
      /w:(numId|abstractNumId)="(\d+)"|<w:(numId|abstractNumId) w:val="(\d+)"/g,
      (
        match,
        attribute: string | undefined,
        id: string | undefined,
        element: string | undefined,
        value: string | undefined,
      ) =>
        attribute
          ? `w:${attribute}="${ids.get(Number(id))}"`
          : `<w:${element} w:val="${ids.get(Number(value))}"`,
    );
  const input = parseLosslessXml(
    generated.package.readPart(generated.package.getPart(generatedName)!),
  );
  const children = input.root.children
    .filter((node) => node.kind === 'element')
    .map((node) =>
      rewrite(input.source.slice(node.span.start, node.span.end)).replace(
        /^<w:(\w+)/,
        `<w:$1 xmlns:w="${source.source.root.namespaceUri}"`,
      ),
    );
  const existingName = source.numbering.partName;
  if (existingName) {
    const existing = parseLosslessXml(
      source.package.readPart(source.package.getPart(existingName)!),
    );
    const edit = beginLosslessXmlEdit(existing);
    const abstracts = children.filter((node) => node.startsWith('<w:abstractNum'));
    const instances = children.filter((node) => node.startsWith('<w:num '));
    const firstInstance = existing.elements(source.source.root.namespaceUri, 'num')[0];
    const extension = existing.elements().find((element) => element.localName === 'extLst');
    if (firstInstance)
      edit.replaceElementMarkup(
        firstInstance,
        abstracts.join('') +
          existing.source.slice(firstInstance.span.start, firstInstance.span.end),
      );
    else if (extension) edit.insertMarkupBefore(extension, abstracts.join(''));
    else edit.appendMarkup(existing.root, abstracts.join(''));
    if (extension) edit.insertMarkupBefore(extension, instances.join(''));
    else edit.appendMarkup(existing.root, instances.join(''));
    transaction.replacePart(existingName, edit.commit().bytes);
  } else {
    const name = PartName.parse(`/word/${prefix}numbering.xml`);
    transaction.addPart(
      name,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml',
      new TextEncoder().encode(
        `<w:numbering xmlns:w="${source.source.root.namespaceUri}">${children.join('')}</w:numbering>`,
      ),
    );
    const office =
      source.conformance === 'strict'
        ? 'http://purl.oclc.org/ooxml/officeDocument/relationships'
        : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    transaction.addRelationship(source.package.mainOfficeDocumentPart().name, {
      id: `${prefix}numbering`,
      type: `${office}/numbering`,
      target: name,
    });
  }
  return rewrite;
}
