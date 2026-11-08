import { z } from 'zod';
import { beginLosslessXmlEdit, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { SpreadsheetArtifact } from './artifact.ts';
import { openSpreadsheet } from './workbook.ts';
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, formatCellReference, parseCellRange, type CellRange } from './references.ts';

const sheetId = z.string().min(1);
const column = z.number().int().min(1).max(EXCEL_MAX_COLUMNS);
const row = z.number().int().min(1).max(EXCEL_MAX_ROWS);
export const spreadsheetLayoutCommand = z.discriminatedUnion('name', [
  z.object({ name: z.literal('set-column-width'), sheetId, first: column, last: column, width: z.number().finite().min(0).max(255) }).strict(),
  z.object({ name: z.literal('set-row-height'), sheetId, first: row, last: row, height: z.number().finite().min(0).max(409) }).strict(),
  z.object({ name: z.literal('merge-cells'), sheetId, range: z.string().min(1) }).strict(),
  z.object({ name: z.literal('unmerge-cells'), sheetId, range: z.string().min(1) }).strict(),
  z.object({ name: z.literal('freeze-panes'), sheetId, rows: z.number().int().min(0).max(EXCEL_MAX_ROWS - 1), columns: z.number().int().min(0).max(EXCEL_MAX_COLUMNS - 1) }).strict(),
]);
export type SpreadsheetLayoutCommand = z.infer<typeof spreadsheetLayoutCommand>;
const escapeAttribute = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const attribute = (element: LosslessXmlElement, name: string) => element.attributes.find(a => a.localName === name && !a.namespaceUri)?.value;
const intersects = (a: CellRange, b: CellRange) => a.start.row <= b.end.row && a.end.row >= b.start.row && a.start.column <= b.end.column && a.end.column >= b.start.column;
// SpreadsheetML worksheet child order, preserving extensions and unrelated markup.
const order = ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState', 'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'];

/** Worksheet layout edits preserve cell contents and use the ordinary package transaction engine. */
export function applySpreadsheetLayoutCommand(artifact: SpreadsheetArtifact, input: SpreadsheetLayoutCommand): SpreadsheetArtifact {
  const command = spreadsheetLayoutCommand.parse(input);
  const sheet = artifact.workbook.sheets.find(s => String(s.sheetId) === command.sheetId) ?? artifact.workbook.sheet(command.sheetId);
  if (!sheet) throw new Error('Worksheet does not exist.');
  const selected = artifact.selectSheet(sheet.sheetId), document = selected.worksheet.document;
  const root = document.root, ns = root.namespaceUri, prefix = root.prefix ? `${root.prefix}:` : '';
  const editor = beginLosslessXmlEdit(document);
  const children = (element: LosslessXmlElement, name?: string) => element.children.filter((n): n is LosslessXmlElement => n.kind === 'element' && n.namespaceUri === ns && (!name || n.localName === name));
  const raw = (element: LosslessXmlElement) => document.source.slice(element.span.start, element.span.end);
  function put(name: string, markup: string) {
    const current = children(root, name)[0];
    if (current) { editor.replaceElementMarkup(current, markup); return; }
    const next = children(root).find(n => order.indexOf(n.localName) > order.indexOf(name));
    if (next) editor.insertMarkupBefore(next, markup);
    else if (root.selfClosing) editor.replaceElementMarkup(root, `<${root.qualified}${root.attributes.map(a => ` ${a.qualified}="${escapeAttribute(a.value)}"`).join('')}>${markup}</${root.qualified}>`);
    else editor.appendMarkup(root, markup);
  }
  // Attribute edits are made against source elements, retaining unknown attributes and children.
  const startTag = (element: LosslessXmlElement, updates: Record<string, string>) => {
    const attributes = new Map(element.attributes.map(a => [a.qualified, a.value]));
    for (const [key, value] of Object.entries(updates)) attributes.set(key, value);
    return `<${element.qualified}${[...attributes].map(([k,v]) => ` ${k}="${escapeAttribute(v)}"`).join('')}`;
  };
  if (command.name === 'set-column-width') {
    if (command.last < command.first) throw new RangeError('Column bounds are reversed.');
    const cols = children(root, 'cols')[0];
    const output: { first: number; markup: string }[] = [];
    for (const col of cols ? children(cols, 'col') : []) {
      const first = Number(attribute(col, 'min')), last = Number(attribute(col, 'max'));
      if (last < command.first || first > command.last) output.push({ first, markup: raw(col) });
      else {
        if (first < command.first) output.push({first, markup: `${startTag(col, {min:String(first), max:String(command.first - 1)})}/>`});
        const left = Math.max(first, command.first), right = Math.min(last, command.last);
        output.push({first:left,markup:`${startTag(col,{min:String(left),max:String(right),width:String(command.width),customWidth:'1',hidden:command.width === 0 ? '1' : '0'})}/>`});
        if (last > command.last) output.push({first:command.last+1,markup:`${startTag(col,{min:String(command.last+1),max:String(last)})}/>`});
      }
    }
    // Fill uncovered intervals without enumerating every column.
    let cursor = command.first;
    for (const entry of [...output].sort((a,b) => a.first-b.first)) {
      if (entry.first > command.last) break;
      if (entry.first >= cursor) {
        if (entry.first > cursor) output.push({first:cursor,markup:`<${prefix}col min="${cursor}" max="${entry.first-1}" width="${command.width}" customWidth="1" hidden="${command.width === 0 ? 1 : 0}"/>`});
        const max = /\bmax="(\d+)"/.exec(entry.markup)?.[1];
        cursor = Math.max(cursor, Number(max) + 1);
      }
    }
    if (cursor <= command.last) output.push({first:cursor,markup:`<${prefix}col min="${cursor}" max="${command.last}" width="${command.width}" customWidth="1" hidden="${command.width === 0 ? 1 : 0}"/>`});
    put('cols', `<${prefix}cols>${output.sort((a,b) => a.first-b.first).map(n=>n.markup).join('')}</${prefix}cols>`);
  } else if (command.name === 'set-row-height') {
    if (command.last < command.first) throw new RangeError('Row bounds are reversed.');
    const data = children(root,'sheetData')[0];
    const existing = new Map((data ? children(data,'row') : []).map(r => [Number(attribute(r,'r')), r]));
    const rows = new Map([...existing].map(([index,element]) => [index,raw(element)]));
    for (let index=command.first; index<=command.last; index++) {
      const element = existing.get(index);
      const attrs = {r:String(index), ht:String(command.height), customHeight:'1', hidden: command.height === 0 ? '1' : '0'};
      rows.set(index, element ? `${startTag(element,attrs)}${element.selfClosing ? '/>' : `>${document.source.slice(element.startTagSpan.end,element.endTagSpan!.start)}</${element.qualified}>`}` : `<${prefix}row r="${index}" ht="${command.height}" customHeight="1" hidden="${command.height === 0 ? 1 : 0}"/>`);
    }
    put('sheetData',`<${prefix}sheetData>${[...rows].sort(([a],[b])=>a-b).map(([,xml])=>xml).join('')}</${prefix}sheetData>`);
  } else if (command.name === 'freeze-panes') {
    const views = children(root,'sheetViews')[0];
    const view = views && children(views,'sheetView')[0];
    const pane = command.rows || command.columns ? `<${prefix}pane xSplit="${command.columns}" ySplit="${command.rows}" topLeftCell="${formatCellReference({row:command.rows+1,column:command.columns+1})}" activePane="${command.rows ? command.columns ? 'bottomRight':'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
    if (view) {
      const nested = beginLosslessXmlEdit(document);
      const current = children(view,'pane')[0];
      if (current) nested.replaceElementMarkup(current,pane);
      else if (view.selfClosing) nested.replaceElementMarkup(view,`${startTag(view,{})}>${pane}</${view.qualified}>`);
      else {
        const first = children(view)[0];
        if (first) nested.insertMarkupBefore(first,pane);
        else nested.appendMarkup(view,pane);
      }
      // Pane selection is derived from the new freeze state; stale pane selections can invalidate Excel views.
      for (const selection of children(view,'selection')) nested.removeElement(selection);
      const result = nested.commit().bytes;
      const tx = beginPackageTransaction(artifact.workbook.package).replacePart(sheet.partName,result);
      return reopen(tx.commitPackage(),artifact);
    }
    put('sheetViews',`<${prefix}sheetViews><${prefix}sheetView workbookViewId="0">${pane}</${prefix}sheetView></${prefix}sheetViews>`);
  } else {
    const range = parseCellRange(command.range);
    const container = children(root,'mergeCells')[0];
    const merges = container ? children(container,'mergeCell') : [];
    const kept = merges.filter(m => !intersects(parseCellRange(attribute(m,'ref')!),range));
    if (command.name === 'merge-cells') {
      if (range.start.row === range.end.row && range.start.column === range.end.column) return artifact;
      if (kept.length !== merges.length) throw new Error('Unmerge overlapping cells before merging this range.');
      for (const r of selected.worksheet.rows) for (const cell of r.cells) {
        if (cell.address.row === range.start.row && cell.address.column === range.start.column) continue;
        if (intersects({start:cell.address,end:cell.address},range) && (cell.value.type !== 'blank' || cell.formula)) throw new Error('Clear the other cells before merging so their contents are preserved.');
      }
      put('mergeCells',`<${prefix}mergeCells count="${kept.length+1}">${kept.map(raw).join('')}<${prefix}mergeCell ref="${command.range}"/></${prefix}mergeCells>`);
    } else if (container) {
      if (!kept.length) editor.removeElement(container);
      else put('mergeCells',`<${prefix}mergeCells count="${kept.length}">${kept.map(raw).join('')}</${prefix}mergeCells>`);
    } else return artifact;
  }
  const transaction = beginPackageTransaction(artifact.workbook.package).replacePart(sheet.partName,editor.commit().bytes);
  return reopen(transaction.commitPackage(),artifact);
}

function reopen(pkg: SpreadsheetArtifact['workbook']['package'], original: SpreadsheetArtifact) {
  const workbook = openSpreadsheet(pkg);
  return new SpreadsheetArtifact(workbook, workbook.sheet(original.activeSheet.sheetId)!);
}
