import { spreadsheetDrawingObjectId, spreadsheetDrawingBounds } from './drawings.ts';
import { spreadsheetDrawingCommand, isSpreadsheetDrawingCommand, applySpreadsheetDrawingCommand } from './drawing-commands.ts';
import { spreadsheetInteractionCommand, applySpreadsheetInteractionCommand } from './interaction.ts';
import { spreadsheetFormattingCommand, spreadsheetFormattingCommandPackage } from './formatting-commands.ts';
import { applySpreadsheetStructureCommand } from './structure.ts';
import { rewriteSpreadsheetSheetReferences } from './sheet-references.ts';
import { spreadsheetLayoutCommand, applySpreadsheetLayoutCommand } from './layout.ts';
import { z } from 'zod';
import { spreadsheetNumberFormatState } from './number-format-authoring.ts';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { beginPackageTransaction, PartName, openOpcPackageArchive, ZipArchive } from '@tumblerjs/opc';
import { SpreadsheetArtifact } from './artifact.ts';
import { beginSpreadsheetEdit } from './editor.ts';
import { parseCellRange, parseCellReference, formatCellReference } from './references.ts';
import { openSpreadsheet, type SpreadsheetSheet } from './workbook.ts';
import { DEFAULT_SPREADSHEET_FONT_FAMILY, DEFAULT_SPREADSHEET_FONT_SIZE } from './styles.ts';

const id = z.string().min(1);
const value = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const single = z.discriminatedUnion('name', [
  z.object({name:z.literal('insert-rows'),sheetId:id,index:z.number().int().positive(),count:z.number().int().positive().optional()}).strict(),
  z.object({name:z.literal('delete-rows'),sheetId:id,index:z.number().int().positive(),count:z.number().int().positive().optional()}).strict(),
  z.object({name:z.literal('insert-columns'),sheetId:id,index:z.number().int().positive(),count:z.number().int().positive().optional()}).strict(),
  z.object({name:z.literal('delete-columns'),sheetId:id,index:z.number().int().positive(),count:z.number().int().positive().optional()}).strict(),
  ...spreadsheetLayoutCommand.options,
  ...spreadsheetDrawingCommand.options,
  ...spreadsheetInteractionCommand.options,
  z.object({name:z.literal('set-cell'),sheetId:id,reference:id,value}).strict(),
  z.object({name:z.literal('set-formula'),sheetId:id,reference:id,formula:z.string()}).strict(),
  z.object({name:z.literal('set-range'),sheetId:id,reference:id,values:z.array(z.array(value))}).strict(),
  z.object({name:z.literal('clear-range'),sheetId:id,range:id}).strict(),
  ...spreadsheetFormattingCommand.options,
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
  if (isSpreadsheetDrawingCommand(command)) return applySpreadsheetDrawingCommand(artifact, command);
  if (command.name === 'insert-rows' || command.name === 'delete-rows' || command.name === 'insert-columns' || command.name === 'delete-columns') return applySpreadsheetStructureCommand(artifact, command);
  if (command.name === 'add-sheet' || command.name === 'delete-sheet' || command.name === 'rename-sheet' || command.name === 'move-sheet') return editSheets(artifact, command);
  if (command.name === 'set-column-width' || command.name === 'set-row-height' || command.name === 'merge-cells' || command.name === 'unmerge-cells' || command.name === 'freeze-panes') return applySpreadsheetLayoutCommand(artifact, command);
  if (command.name === 'replace-text' || command.name === 'set-sheet-state' || command.name === 'set-tab-color') return applySpreadsheetInteractionCommand(artifact, command);
  const sheet = resolveSheet(artifact, command.sheetId);
  if (command.name === 'format-cells' || command.name === 'set-number-format' || command.name === 'adjust-number-decimals' || command.name === 'set-borders' || command.name === 'clear-formatting') {
    const saved = spreadsheetFormattingCommandPackage(artifact, sheet, command);
    return saved === artifact.workbook.package ? artifact : fromPackage(saved, artifact.activeSheet.sheetId);
  }
  const editor = beginSpreadsheetEdit(artifact.workbook);
  if (command.name === 'set-cell') editor.setCellValue(sheet, command.reference, command.value);
  else if (command.name === 'set-formula') editor.setCellFormula(sheet, command.reference, command.formula.replace(/^=/,''));
  else if (command.name === 'set-range') {
    const start = parseCellReference(command.reference);
    const worksheet = artifact.selectSheet(sheet.sheetId).worksheet;
    for (const [row, values] of command.values.entries()) for (const [column, value] of values.entries()) {
      const reference = formatCellReference({row:start.row+row,column:start.column+column});
      const format = typeof value === 'string' && value.startsWith('=') ? spreadsheetNumberFormatState(worksheet, reference) : undefined;
      const asText = format !== undefined && (format.state === 'value' || format.state === 'inherited') && format.value.category === 'text';
      if (typeof value === 'string' && value.startsWith('=') && !asText) editor.setCellFormula(sheet, reference, value.slice(1));
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
      if(element.localName === 'workbookView') {
        for(const name of ['activeTab','firstSheet']) {
          const attr=element.attributes.find(a=>a.localName===name&&!a.namespaceUri);
          const oldIndex=Number(attr?.value??0), previous=oldOrder[oldIndex];
          const located=previous?newOrder.indexOf(previous):-1;
          const index=located<0?Math.min(oldIndex,newOrder.length-1):located;
          if(index!==oldIndex) { if(attr)editor.setAttribute(attr,String(index));else editor.insertAttribute(element,name,String(index)); }
        }
      }
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
    saved = rewriteSpreadsheetSheetReferences(saved, previous.name, command.name === 'rename-sheet' ? command.nameValue : null, workbook.sheets.map(sheet => sheet.name));
  }
  return fromPackage(saved,artifact.activeSheet.sheetId);
}

/** A blank workbook uses Excel's ordinary worksheet parts. */
export function createSpreadsheet(): SpreadsheetArtifact {
  const files = new Map([
    ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="${DEFAULT_SPREADSHEET_FONT_SIZE}"/><name val="${DEFAULT_SPREADSHEET_FONT_FAMILY}"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
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
    drawings: selected.worksheet.drawing?.anchors.map(anchor=>({ objectId: spreadsheetDrawingObjectId(selected.worksheet.drawing!,anchor), ...spreadsheetDrawingBounds(anchor,selected.worksheet.rowGeometry(),selected.worksheet.columnGeometry()) })) ?? [],
    range: reference,
    formatting: selected.formattingState(range),
    numberFormat: selected.numberFormatState(range),
    cells: selected.worksheet.rows.flatMap(row => row.cells.filter(cell => cell.address.row >= range.start.row && cell.address.row <= range.end.row && cell.address.column >= range.start.column && cell.address.column <= range.end.column).map(cell => ({reference:cell.reference,value:cell.value.type === 'blank' ? null : cell.value.value,computed:selected.calculation.value(cell.reference),formula:cell.formula,formatted:selected.calculation.displayText(cell.reference)}))),
  };
}
