import { formatSpreadsheetNumbersPackage } from './formatting.ts';
import { applySpreadsheetStructureCommand } from './structure.ts';
import { rewriteSpreadsheetSheetReferences } from './sheet-references.ts';
import { spreadsheetLayoutCommand, applySpreadsheetLayoutCommand } from './layout.ts';
import { z } from 'zod';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { beginPackageTransaction, PartName, openOpcPackageArchive, ZipArchive } from '@tumblerjs/opc';
import { normalizeFormattingPatch, type FormattingPatch } from '@tumblerjs/core';
import { SpreadsheetArtifact } from './artifact.ts';
import { beginSpreadsheetEdit } from './editor.ts';
import { parseCellRange, parseCellReference, formatCellReference } from './references.ts';
import { openSpreadsheet, type SpreadsheetSheet } from './workbook.ts';

const id = z.string().min(1);
const value = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const change = <T extends z.ZodType>(type: T) => z.union([z.object({set:type}).strict(), z.object({inherit:z.literal(true)}).strict()]);
const patch = z.object({
  text: z.object({
    fontSize: change(z.number().min(1).max(409)).optional(), fontFamily: change(z.string().min(1)).optional(),
    bold: change(z.boolean()).optional(), italic: change(z.boolean()).optional(), underline: change(z.enum(['none','single','double'])).optional(),
    color: change(z.discriminatedUnion('type', [z.object({type:z.literal('automatic')}).strict(),z.object({type:z.literal('rgb'),value:z.string().regex(/^#[a-f\d]{6}$/i)}).strict()])).optional(),
  }).strict().optional(),
  block: z.object({horizontalAlignment:change(z.enum(['start','center','end','justify'])).optional(),verticalAlignment:change(z.enum(['top','center','bottom'])).optional()}).strict().optional(),
}).strict().transform(value => normalizeFormattingPatch(value as FormattingPatch));
const single = z.discriminatedUnion('name', [
  z.object({name:z.literal('insert-rows'),sheetId:id,index:z.number().int().positive(),count:z.number().int().positive().optional()}).strict(),
  z.object({name:z.literal('delete-rows'),sheetId:id,index:z.number().int().positive(),count:z.number().int().positive().optional()}).strict(),
  z.object({name:z.literal('insert-columns'),sheetId:id,index:z.number().int().positive(),count:z.number().int().positive().optional()}).strict(),
  z.object({name:z.literal('delete-columns'),sheetId:id,index:z.number().int().positive(),count:z.number().int().positive().optional()}).strict(),
  ...spreadsheetLayoutCommand.options,
  z.object({name:z.literal('set-cell'),sheetId:id,reference:id,value}).strict(),
  z.object({name:z.literal('set-formula'),sheetId:id,reference:id,formula:z.string()}).strict(),
  z.object({name:z.literal('set-range'),sheetId:id,reference:id,values:z.array(z.array(value))}).strict(),
  z.object({name:z.literal('clear-range'),sheetId:id,range:id}).strict(),
  z.object({name:z.literal('format-cells'),sheetId:id,range:id,patch}).strict(),
  z.object({name:z.literal('set-number-format'),sheetId:id,range:id,format:z.enum(['general','number','currency','percent','date'])}).strict(),
  z.object({name:z.literal('add-sheet'),nameValue:z.string().optional()}).strict(),
  z.object({name:z.literal('delete-sheet'),sheetId:id}).strict(),
  z.object({name:z.literal('rename-sheet'),sheetId:id,nameValue:z.string()}).strict(),
  z.object({name:z.literal('move-sheet'),sheetId:id,index:z.number().int().nonnegative()}).strict(),
]);
export const spreadsheetCommand = z.discriminatedUnion('name',[...single.options,z.object({name:z.literal('batch'),commands:z.array(single).min(1)}).strict()]);
export type SpreadsheetCommand = z.infer<typeof spreadsheetCommand>;

function resolveSheet(artifact: SpreadsheetArtifact, id: string): SpreadsheetSheet {
  const sheet = artifact.workbook.sheets.find(sheet => String(sheet.sheetId) === id) ?? artifact.workbook.sheet(id);
  if (!sheet) throw new Error(`Worksheet ${JSON.stringify(id)} does not exist.`);
  return sheet;
}
function fromPackage(pkg: SpreadsheetArtifact['workbook']['package'], active: number): SpreadsheetArtifact {
  const workbook = openSpreadsheet(pkg);
  return new SpreadsheetArtifact(workbook, workbook.sheet(active) ?? workbook.sheets.find(sheet => sheet.state === 'visible') ?? workbook.sheets[0]!);
}
const escape = (text: string) => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function validName(artifact: SpreadsheetArtifact, name: string, except?: SpreadsheetSheet) {
  if (!name || name.length > 31 || /[\\/*?:\[\]]/.test(name) || name.startsWith("'") || name.endsWith("'")) throw new Error('Worksheet names must contain 1 to 31 characters and cannot contain \\ / * ? : [ ] or start or end with an apostrophe.');
  if (artifact.workbook.sheets.some(sheet => sheet !== except && sheet.name.toLowerCase() === name.toLowerCase())) throw new Error('A worksheet with that name already exists.');
}

/** Apply the same validated spreadsheet actions in browser, service and command line hosts. */
export function applySpreadsheetCommand(artifact: SpreadsheetArtifact, input: SpreadsheetCommand): SpreadsheetArtifact {
  const command = spreadsheetCommand.parse(input);
  if (command.name === 'batch') return command.commands.reduce(applySpreadsheetCommand, artifact);
  if (command.name === 'insert-rows' || command.name === 'delete-rows' || command.name === 'insert-columns' || command.name === 'delete-columns') return applySpreadsheetStructureCommand(artifact, command);
  if (command.name === 'add-sheet' || command.name === 'delete-sheet' || command.name === 'rename-sheet' || command.name === 'move-sheet') return editSheets(artifact, command);
  if (command.name === 'set-column-width' || command.name === 'set-row-height' || command.name === 'merge-cells' || command.name === 'unmerge-cells' || command.name === 'freeze-panes') return applySpreadsheetLayoutCommand(artifact, command);
  const sheet = resolveSheet(artifact, command.sheetId);
  if (command.name === 'set-number-format') return fromPackage(formatSpreadsheetNumbersPackage(artifact.workbook,sheet,command.range,command.format),artifact.activeSheet.sheetId);
  if (command.name === 'format-cells') return artifact.formatCellsOnSheet(sheet, command.range, command.patch);
  const editor = beginSpreadsheetEdit(artifact.workbook);
  if (command.name === 'set-cell') editor.setCellValue(sheet, command.reference, command.value);
  else if (command.name === 'set-formula') editor.setCellFormula(sheet, command.reference, command.formula.replace(/^=/,''));
  else if (command.name === 'set-range') {
    const start = parseCellReference(command.reference);
    for (const [row, values] of command.values.entries()) for (const [column, value] of values.entries()) {
      const reference = formatCellReference({row:start.row+row,column:start.column+column});
      if (typeof value === 'string' && value.startsWith('=')) editor.setCellFormula(sheet, reference, value.slice(1));
      else editor.setCellValue(sheet,reference,value);
    }
  } else {
    const range = parseCellRange(command.range);
    // Clearing a sparse range visits existing cells, including a full Excel column or sheet.
    const selected = artifact.selectSheet(sheet.sheetId);
    for (const row of selected.worksheet.rows) for (const cell of row.cells) if (cell.address.row >= range.start.row && cell.address.row <= range.end.row && cell.address.column >= range.start.column && cell.address.column <= range.end.column) editor.setCellValue(sheet,cell.reference,null);
  }
  return fromPackage(editor.commitPackage(), artifact.activeSheet.sheetId);
}

type SheetCommand = Extract<z.infer<typeof single>, {name:'add-sheet'|'delete-sheet'|'rename-sheet'|'move-sheet'}>;
function editSheets(artifact: SpreadsheetArtifact, command: SheetCommand) {
  const workbook = artifact.workbook;
  const ns = workbook.document.root.namespaceUri;
  const container = workbook.document.root.children.find(node => node.kind === 'element' && node.namespaceUri === ns && node.localName === 'sheets');
  if (!container || container.kind !== 'element') throw new Error('Workbook sheets are missing.');
  const elements = container.children.filter(node => node.kind === 'element' && node.namespaceUri === ns && node.localName === 'sheet');
  const editor = beginLosslessXmlEdit(workbook.document);
  const transaction = beginPackageTransaction(workbook.package);
  if (command.name === 'add-sheet') {
    let fallback = 'Sheet1', counter = 1;
    while (workbook.sheet(fallback)) fallback = `Sheet${++counter}`;
    const name = command.nameValue ?? fallback;
    validName(artifact,name);
    const sheetId = Math.max(0,...workbook.sheets.map(sheet => sheet.sheetId)) + 1;
    let part = PartName.parse(`/xl/worksheets/sheet${sheetId}.xml`), suffix = sheetId;
    while (workbook.package.getPart(part)) part = PartName.parse(`/xl/worksheets/sheet${++suffix}.xml`);
    const relationships = workbook.package.relationships(workbook.part.name);
    let relId = `rId${sheetId}`, relNumber = sheetId;
    while (relationships.items.some(rel => rel.id === relId)) relId = `rId${++relNumber}`;
    const relationshipNs = workbook.conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    transaction.addPart(part,'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',new TextEncoder().encode(`<worksheet xmlns="${ns}"><sheetData/></worksheet>`));
    transaction.addRelationship(workbook.part.name,{id:relId,type:`${relationshipNs}/worksheet`,target:part});
    const prefix = container.prefix ? `${container.prefix}:` : '';
    editor.appendMarkup(container,`<${prefix}sheet xmlns:r="${relationshipNs}" name="${escape(name)}" sheetId="${sheetId}" r:id="${relId}"/>`);
  } else {
    const sheet = resolveSheet(artifact,command.sheetId);
    const element = elements.find(node => node.kind === 'element' && node.attributes.some(attribute => attribute.localName === 'sheetId' && attribute.value === String(sheet.sheetId)));
    if (!element || element.kind !== 'element') throw new Error('Worksheet metadata is missing.');
    if (command.name === 'rename-sheet') {
      validName(artifact,command.nameValue,sheet);
      const name = element.attributes.find(attribute => attribute.localName === 'name');
      if (!name) throw new Error('Worksheet name is missing.');
      editor.setAttribute(name,command.nameValue);
    } else if (command.name === 'delete-sheet') {
      if (workbook.sheets.length <= 1 || (sheet.state === 'visible' && workbook.sheets.filter(sheet => sheet.state === 'visible').length === 1)) throw new Error('A workbook needs at least one visible worksheet.');
      editor.removeElement(element);
      transaction.removeRelationship(workbook.part.name,sheet.relationshipId);
      transaction.removePart(sheet.partName);
    } else {
      if (command.index >= elements.length) throw new RangeError('Worksheet index is out of range.');
      const reordered = [...elements];
      reordered.splice(elements.indexOf(element),1);
      reordered.splice(command.index,0,element);
      const startTag = workbook.document.source.slice(container.startTagSpan.start,container.startTagSpan.end);
      editor.replaceElementMarkup(container,`${startTag}${reordered.map(node => workbook.document.source.slice(node.span.start,node.span.end)).join('')}</${container.qualified}>`);
    }
  }
  if (command.name === 'delete-sheet' || command.name === 'move-sheet') {
    const target = resolveSheet(artifact,command.sheetId), oldOrder = [...workbook.sheets];
    const newOrder = oldOrder.filter(sheet => sheet !== target);
    if(command.name === 'move-sheet')newOrder.splice(command.index,0,target);
    const visit = (element: typeof workbook.document.root) => {
      if(element.localName === 'definedName') {
        const local = element.attributes.find(attribute => attribute.localName === 'localSheetId' && !attribute.namespaceUri);
        if(local) {
          const previous = oldOrder[Number(local.value)], next = previous ? newOrder.indexOf(previous) : -1;
          if(next < 0)editor.removeElement(element);else if(String(next)!==local.value)editor.setAttribute(local,String(next));
        }
      } else for(const child of element.children)if(child.kind==='element')visit(child);
    };
    visit(workbook.document.root);
  }
  transaction.replacePart(workbook.part.name,editor.commit().bytes);
  let saved = transaction.commitPackage();
  if (command.name === 'rename-sheet' || command.name === 'delete-sheet') {
    const previous = resolveSheet(artifact,command.sheetId);
    saved = rewriteSpreadsheetSheetReferences(saved, previous.name, command.name === 'rename-sheet' ? command.nameValue : null);
  }
  return fromPackage(saved,artifact.activeSheet.sheetId);
}

/** A blank workbook uses Excel's ordinary worksheet parts. */
export function createSpreadsheet(): SpreadsheetArtifact {
  const files = new Map([
    ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
    ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'],
  ]);
  const pkg = openOpcPackageArchive(new ZipArchive(new Uint8Array(), [], "", new Map()).withChanges({ additions: [...files].map(([name,data]) => ({name,data:new TextEncoder().encode(data)})) }));
  const workbook = openSpreadsheet(pkg);
  return new SpreadsheetArtifact(workbook,workbook.sheets[0]!);
}

/** Inspect populated cells in a requested range, retaining formula source and computed display text. */
export function inspectSpreadsheet(artifact: SpreadsheetArtifact, sheetId?: string, reference = 'A1:J30') {
  const sheet = sheetId ? resolveSheet(artifact,sheetId) : artifact.activeSheet;
  const selected = artifact.selectSheet(sheet.sheetId), range = parseCellRange(reference);
  return {
    sheets: artifact.workbook.sheets.map(sheet => ({id:String(sheet.sheetId),name:sheet.name,state:sheet.state})),
    sheet: {id:String(sheet.sheetId),name:sheet.name,state:sheet.state,dimension:selected.worksheet.dimension},
    range: reference,
    cells: selected.worksheet.rows.flatMap(row => row.cells.filter(cell => cell.address.row >= range.start.row && cell.address.row <= range.end.row && cell.address.column >= range.start.column && cell.address.column <= range.end.column).map(cell => ({reference:cell.reference,value:cell.value.type === 'blank' ? null : cell.value.value,computed:selected.calculation.value(cell.reference),formula:cell.formula,formatted:selected.calculation.displayText(cell.reference)}))),
  };
}
