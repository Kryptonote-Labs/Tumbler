import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction, type OpcPackage } from '@tumblerjs/opc';

const sheetName = "(?:'(?:[^']|'')+'|[\\p{L}\\p{N}_\\\\][\\p{L}\\p{N}_.]*)";
const qualifier = new RegExp(`^(${sheetName})(?:\\s*:\\s*(${sheetName}))?\\s*!`, 'u');
const decodeName = (name: string) => name.startsWith("'") ? name.slice(1, -1).replaceAll("''", "'") : name;
const equal = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
const quote = (name: string) => `'${name.replaceAll("'", "''")}'!`;

function bracketEnd(source: string, start: number): number {
  let depth = 0, offset = start;
  while (offset < source.length) {
    const character = source[offset++]!;
    if (character === '[') depth++;
    else if (character === ']' && --depth === 0) break;
  }
  return offset;
}

/** Consume the entire qualified reference when its worksheet disappears. */
function referenceLength(source: string): number {
  const reference = /^(?:\$?[A-Za-z]{1,3}\$?[1-9]\d*(?:\s*:\s*\$?[A-Za-z]{1,3}\$?[1-9]\d*)?|\$?[A-Za-z]{1,3}\s*:\s*\$?[A-Za-z]{1,3}|\$?[1-9]\d*\s*:\s*\$?[1-9]\d*)(?![\p{L}\p{N}_.])/u.exec(source);
  const named = /^(?:[\p{L}_\\][\p{L}\p{N}_.]*|#REF!)/u.exec(source);
  let length = reference?.[0].length ?? named?.[0].length ?? 0;
  // Named table references and spilled cell references also belong to the removed sheet.
  while (source[length] === '[') length = bracketEnd(source, length);
  if (source[length] === '#') length++;
  return length;
}

function replacementNames(names: readonly string[], oldName: string, newName: string | null, sheetOrder: readonly string[]): string[] | undefined {
  if (newName !== null) return names.map(name => equal(name, oldName) ? newName : name);
  if (names.length === 1) return;
  const first = names[0]!, last = names[1]!;
  let start = sheetOrder.findIndex(name => equal(name, first)), end = sheetOrder.findIndex(name => equal(name, last));
  if (start < 0 || end < 0 || start === end) return;
  const direction = Math.sign(end - start);
  if (equal(first, oldName)) start += direction;
  if (equal(last, oldName)) end -= direction;
  const left = sheetOrder[start], right = sheetOrder[end];
  return left && right ? equal(left, right) ? [left] : [left, right] : undefined;
}

/** Rewrite worksheet qualifiers, including 3D endpoints, while preserving strings and external references. */
export function rewriteFormulaSheetReferences(source: string, oldName: string, newName: string | null, sheetOrder: readonly string[] = []): string {
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
    if (source[offset] === '[') {
      const end = bracketEnd(source, offset);
      output += source.slice(offset, end); offset = end;
      continue;
    }
    const qualified = qualifier.exec(source.slice(offset));
    if (qualified) {
      const first = decodeName(qualified[1]!);
      const names = qualified[2] ? [first, decodeName(qualified[2])] : first.split(':');
      const external = names.some(name => /[\[\]]/.test(name)) || source.slice(0, offset).trimEnd().endsWith(']');
      if (!external && names.some(name => equal(name, oldName))) {
        const rewritten = replacementNames(names, oldName, newName, sheetOrder);
        if (rewritten) output += quote(rewritten.join(':'));
        else {
          output += '#REF!';
          offset += referenceLength(source.slice(offset + qualified[0].length));
        }
      } else output += qualified[0];
      offset += qualified[0].length;
      continue;
    }
    output += source[offset++]!;
  }
  return output;
}

const formulaElements = new Set(['f', 'formula', 'formula1', 'formula2', 'definedName', 'calculatedColumnFormula', 'totalsRowFormula']);

/** Sheet changes update cell and table formulas, names, chart sources, and validation rules. */
export function rewriteSpreadsheetSheetReferences(pkg: OpcPackage, oldName: string, newName: string | null, sheetOrder: readonly string[] = []): OpcPackage {
  const transaction = beginPackageTransaction(pkg);
  for (const part of pkg.parts) {
    if (!part.contentType.includes('xml') || !/\/(?:worksheets|charts|tables)\/|\/workbook\.xml$/.test(part.name.value)) continue;
    const document = parseLosslessXml(pkg.readPart(part));
    const editor = beginLosslessXmlEdit(document);
    const visit = (element: LosslessXmlElement) => {
      if (formulaElements.has(element.localName)) {
        const source = document.textContent(element), rewritten = rewriteFormulaSheetReferences(source, oldName, newName, sheetOrder);
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
