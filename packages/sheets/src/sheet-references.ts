import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction, type OpcPackage } from '@tumblerjs/opc';

/** Rewrite worksheet qualifiers without changing string literals or external workbook references. */
export function rewriteFormulaSheetReferences(source: string, oldName: string, newName: string | null): string {
  let output = '', offset = 0;
  while (offset < source.length) {
    if (source[offset] === '"') {
      const start = offset++;
      while (offset < source.length) {
        if (source[offset++] === '"') { if (source[offset] === '"') offset++; else break; }
      }
      output += source.slice(start, offset);
      continue;
    }
    const qualified = /^(?:'((?:[^']|'')+)'|([\p{L}_\\][\p{L}\p{N}_.]*))\s*!/u.exec(source.slice(offset));
    if (qualified) {
      const name = qualified[1]?.replaceAll("''", "'") ?? qualified[2]!;
      if (name.toLowerCase() === oldName.toLowerCase() && source[offset - 1] !== ']') {
        if (newName !== null) output += `'${newName.replaceAll("'", "''")}'!`;
        else {
          const reference = /^\$?[A-Za-z]{1,3}\$?[1-9]\d*(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?/.exec(source.slice(offset + qualified[0].length));
          output += '#REF!';
          offset += reference?.[0].length ?? 0;
        }
      } else output += qualified[0];
      offset += qualified[0].length;
      continue;
    }
    output += source[offset++]!;
  }
  return output;
}

/** Sheet renames and removals update formulas, named ranges, chart sources and validation rules. */
export function rewriteSpreadsheetSheetReferences(pkg: OpcPackage, oldName: string, newName: string | null): OpcPackage {
  const transaction = beginPackageTransaction(pkg);
  for (const part of pkg.parts) {
    if (!part.contentType.includes('xml') || !/\/(?:worksheets|charts)\/|\/workbook\.xml$/.test(part.name.value)) continue;
    const document = parseLosslessXml(pkg.readPart(part));
    const editor = beginLosslessXmlEdit(document);
    const visit = (element: LosslessXmlElement) => {
      if (['f','formula','formula1','formula2','definedName'].includes(element.localName)) {
        const source = document.textContent(element), rewritten = rewriteFormulaSheetReferences(source,oldName,newName);
        if (rewritten !== source) editor.setText(element,rewritten);
      } else for (const child of element.children) if (child.kind === 'element') visit(child);
    };
    visit(document.root);
    if (part.name.equivalenceKey === pkg.mainOfficeDocumentPart().name.equivalenceKey) {
      const calc = document.root.children.find((node): node is LosslessXmlElement => node.kind === 'element' && node.localName === 'calcPr' && node.namespaceUri === document.root.namespaceUri);
      if (calc) for (const key of ['fullCalcOnLoad','forceFullCalc']) {
        const attribute = calc.attributes.find(attribute => attribute.localName === key && !attribute.namespaceUri);
        if (attribute) editor.setAttribute(attribute,'1'); else editor.insertAttribute(calc,key,'1');
      }
      else {
        const prefix=document.root.prefix?`${document.root.prefix}:`:'';
        const later = document.root.children.find((node): node is LosslessXmlElement => node.kind==='element' && ['oleSize','customWorkbookViews','pivotCaches','smartTagPr','smartTagTypes','webPublishing','fileRecoveryPr','webPublishObjects','extLst'].includes(node.localName));
        const markup=`<${prefix}calcPr fullCalcOnLoad="1" forceFullCalc="1"/>`;
        if(later)editor.insertMarkupBefore(later,markup);else editor.appendMarkup(document.root,markup);
      }
    }
    if(editor.hasChanges)transaction.replacePart(part.name,editor.commit().bytes);
  }
  return transaction.commitPackage();
}
