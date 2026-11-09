import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlDocument, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { beginPackageTransaction, type OpcPackage } from "@tumblerjs/opc";
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_ROWS, formatCellReference, parseCellRange, type CellAddress, type CellRange } from "./references.ts";
import { SpreadsheetStylePlanner, type SpreadsheetStyleTransform } from "./style-planner.ts";
import { attribute, child, children, escapeAttribute, qualified, sourceForNode, spreadsheetNamespace } from "./style-xml.ts";
import { openWorksheet, type SpreadsheetWorksheet } from "./worksheet.ts";
import { SpreadsheetError, type SpreadsheetSheet, type SpreadsheetWorkbook } from "./workbook.ts";

interface StyleEdit {
  readonly address: CellAddress;
  readonly styleIndex: number;
}

/**
 * Applies one style transform to a rectangle. Large rectangles use column or
 * row defaults plus sparse cell overrides instead of materializing every cell.
 */
export function restyleSpreadsheetRange(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  range: CellRange,
  transform: SpreadsheetStyleTransform,
): OpcPackage {
  const worksheet = openWorksheet(workbook, sheet);
  const planner = new SpreadsheetStylePlanner(workbook, worksheet.styles);
  const height=range.end.row-range.start.row+1, width=range.end.column-range.start.column+1;
  const cellsCost=height*width;
  const columnCost=(EXCEL_MAX_ROWS-height)*width+worksheet.columns.length+1;
  const defaults=predominantColumnStyle(worksheet);
  const rowCost=height*(EXCEL_MAX_COLUMNS-width+1+defaults.exceptions);
  if(columnCost < cellsCost && columnCost <= rowCost)return formatWholeColumns(workbook,worksheet,range,planner,transform);
  if(rowCost < cellsCost)return formatWholeRows(workbook,worksheet,range,planner,transform);
  const edits: StyleEdit[] = [];
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = { row, column };
      edits.push({ address, styleIndex: planner.formatIndex(worksheet.effectiveStyleIndex(address) ?? 0, transform) });
    }
  }
  return commitCellEdits(workbook, worksheet, planner, edits);
}

/** Applies individual transforms to explicit cells, such as merged-cell boundaries. */
export function restyleSpreadsheetCells(
  workbook: SpreadsheetWorkbook,
  sheet: SpreadsheetSheet,
  items: readonly { readonly address: CellAddress; readonly baseIndex: number; readonly transform: SpreadsheetStyleTransform }[],
): OpcPackage {
  const worksheet = openWorksheet(workbook, sheet);
  const planner = new SpreadsheetStylePlanner(workbook, worksheet.styles);
  return commitCellEdits(workbook, worksheet, planner, items.map((item) => ({
    address: item.address,
    styleIndex: planner.formatIndex(item.baseIndex, item.transform),
  })));
}

function commitCellEdits(workbook: SpreadsheetWorkbook, worksheet: SpreadsheetWorksheet, planner: SpreadsheetStylePlanner, edits: readonly StyleEdit[]): OpcPackage {
  const changed = edits.filter(({ address, styleIndex }) => styleIndex !== (worksheet.effectiveStyleIndex(address) ?? 0));
  if (changed.length === 0) return workbook.package;
  const transaction = beginPackageTransaction(workbook.package);
  planner.stage(transaction);
  transaction.replacePart(worksheet.sheet.partName, styleWorksheetCells(worksheet.document, workbook.conformance, changed));
  return transaction.commitPackage();
}

function styleWorksheetCells(
  document: LosslessXmlDocument,
  conformance: "strict" | "transitional",
  edits: readonly { readonly address: CellAddress; readonly styleIndex: number }[],
): Uint8Array {
  const namespace = spreadsheetNamespace(conformance);
  const sheetData = child(document.root, namespace, "sheetData");
  if (sheetData === undefined) throw new SpreadsheetError("invalid_worksheet", "A worksheet must contain sheetData before it can be formatted.");
  const byRow = new Map<number, { readonly address: CellAddress; readonly styleIndex: number }[]>();
  for (const edit of edits) {
    const row = byRow.get(edit.address.row) ?? [];
    row.push(edit);
    byRow.set(edit.address.row, row);
  }
  const rows = children(sheetData, namespace, "row").map((element, index, all) => ({
    index: Number(attribute(element, "r")?.value ?? inferredRowIndex(all, index)),
    element,
  }));
  const editor = beginLosslessXmlEdit(document);
  const missing: { row: number; markup: string }[] = [];
  for (const [rowIndex, rowEdits] of byRow) {
    const row = rows.find((candidate) => candidate.index === rowIndex)?.element;
    if (row === undefined) {
      missing.push({ row: rowIndex, markup: serializeNewStyledRow(sheetData.prefix, rowIndex, rowEdits) });
    } else {
      editor.replaceElementMarkup(row, serializeStyledRow(document, row, namespace, rowEdits));
    }
  }
  if (missing.length > 0) {
    missing.sort((left, right) => left.row - right.row);
    if (sheetData.selfClosing) {
      const start = document.source.slice(sheetData.startTagSpan.start, sheetData.startTagSpan.end).replace(/\/\s*>$/, ">");
      editor.replaceElementMarkup(sheetData, `${start}${missing.map((item) => item.markup).join("")}</${sheetData.qualified}>`);
    } else {
      const groups = new Map<LosslessXmlElement | undefined, string[]>();
      for (const item of missing) {
        const next = rows.find((row) => row.index > item.row)?.element;
        const markup = groups.get(next) ?? [];
        markup.push(item.markup);
        groups.set(next, markup);
      }
      for (const [next, markup] of groups) {
        if (next === undefined) editor.appendMarkup(sheetData, markup.join(""));
        else editor.insertMarkupBefore(next, markup.join(""));
      }
    }
  }
  updateDimension(editor, document, namespace, sheetData, edits.map((edit) => edit.address));
  return editor.commit().bytes;
}

function serializeStyledRow(
  document: LosslessXmlDocument,
  row: LosslessXmlElement,
  namespace: string,
  edits: readonly { readonly address: CellAddress; readonly styleIndex: number }[],
): string {
  const editByColumn = new Map(edits.map((edit) => [edit.address.column, edit.styleIndex]));
  const existing = children(row, namespace, "c").map((cell, index, all) => ({
    column: parseCellColumn(cell, edits[0]!.address.row, index, all),
    markup: document.source.slice(cell.span.start, cell.span.end),
    element: cell,
  }));
  const byColumn = new Map(existing.map((cell) => [cell.column, cell]));
  const columns = [...new Set([...byColumn.keys(), ...editByColumn.keys()])].sort((left, right) => left - right);
  const cellsMarkup = columns.map((column) => {
    const source = byColumn.get(column);
    const styleIndex = editByColumn.get(column);
    return styleIndex === undefined ? source!.markup : source === undefined
      ? serializeNewStyledCell(row.prefix, { row: edits[0]!.address.row, column }, styleIndex)
      : setCellStyle(document, source.element, styleIndex);
  }).join("");
  const nonCells = row.children
    .filter((node) => node.kind !== "element" || node.namespaceUri !== namespace || node.localName !== "c")
    .map((node) => sourceForNode(document, node))
    .join("");
  const start = document.source.slice(row.startTagSpan.start, row.startTagSpan.end).replace(/\/\s*>$/, ">");
  return `${start}${cellsMarkup}${nonCells}</${row.qualified}>`;
}

function serializeNewStyledRow(
  prefix: string,
  row: number,
  edits: readonly { readonly address: CellAddress; readonly styleIndex: number }[],
): string {
  return `<${qualified(prefix, "row")} r="${row}">${[...edits]
    .sort((left, right) => left.address.column - right.address.column)
    .map((edit) => serializeNewStyledCell(prefix, edit.address, edit.styleIndex)).join("")}</${qualified(prefix, "row")}>`;
}

function serializeNewStyledCell(prefix: string, address: CellAddress, styleIndex: number): string {
  return `<${qualified(prefix, "c")} r="${formatCellReference(address)}" s="${styleIndex}"/>`;
}

function setCellStyle(document: LosslessXmlDocument, cell: LosslessXmlElement, styleIndex: number): string {
  let start = document.source.slice(cell.startTagSpan.start, cell.startTagSpan.end);
  const style = attribute(cell, "s");
  if (style === undefined) {
    const offset = start.search(/\/?>\s*$/);
    start = `${start.slice(0, offset)} s="${styleIndex}"${start.slice(offset)}`;
  } else {
    const relativeStart = style.valueSpan.start - cell.startTagSpan.start;
    const relativeEnd = style.valueSpan.end - cell.startTagSpan.start;
    start = `${start.slice(0, relativeStart)}${styleIndex}${start.slice(relativeEnd)}`;
  }
  return `${start}${document.source.slice(cell.startTagSpan.end, cell.span.end)}`;
}

function parseCellColumn(
  cell: LosslessXmlElement,
  row: number,
  index: number,
  siblings: readonly LosslessXmlElement[],
): number {
  const reference = attribute(cell, "r")?.value;
  if (reference !== undefined) return parseCellRange(reference).start.column;
  if (index === 0) return 1;
  return parseCellColumn(siblings[index - 1]!, row, index - 1, siblings) + 1;
}

function inferredRowIndex(rows: readonly LosslessXmlElement[], index: number): number {
  if (index === 0) return 1;
  return Number(attribute(rows[index - 1]!, "r")?.value ?? inferredRowIndex(rows, index - 1)) + 1;
}

function updateDimension(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: LosslessXmlDocument,
  namespace: string,
  sheetData: LosslessXmlElement,
  addresses: readonly CellAddress[],
): void {
  const dimension = child(document.root, namespace, "dimension");
  const previous = dimension === undefined || attribute(dimension, "ref") === undefined
    ? undefined
    : parseCellRange(attribute(dimension, "ref")!.value);
  const points = [...addresses, ...(previous === undefined ? [] : [previous.start, previous.end])];
  const range = {
    start: { row: Math.min(...points.map((point) => point.row)), column: Math.min(...points.map((point) => point.column)) },
    end: { row: Math.max(...points.map((point) => point.row)), column: Math.max(...points.map((point) => point.column)) },
  };
  const value = range.start.row === range.end.row && range.start.column === range.end.column
    ? formatCellReference(range.start)
    : `${formatCellReference(range.start)}:${formatCellReference(range.end)}`;
  if (dimension === undefined) editor.insertMarkupBefore(sheetData, `<${qualified(document.root.prefix, "dimension")} ref="${value}"/>`);
  else {
    const reference = attribute(dimension, "ref");
    if (reference === undefined) editor.insertAttribute(dimension, "ref", value);
    else editor.setAttribute(reference, value);
  }
}

/** Full columns use column defaults and explicit cell overrides instead of a million empty cells. */
function formatWholeColumns(workbook: SpreadsheetWorkbook, worksheet: SpreadsheetWorksheet, range: CellRange, planner: SpreadsheetStylePlanner, transform: SpreadsheetStyleTransform): OpcPackage {
  const document = worksheet.document, ns = spreadsheetNamespace(workbook.conformance);
  const prefix = document.root.prefix ? `${document.root.prefix}:` : '';
  const original = child(document.root,ns,'cols');
  const definitions = original ? children(original,ns,'col') : [];
  const editor = beginLosslessXmlEdit(document);
  const intervals: {min:number;max:number;markup:string}[] = [];
  const boundaries = new Set([range.start.column,range.end.column+1]);
  for (const column of definitions) { boundaries.add(Number(attribute(column,'min')?.value)); boundaries.add(Number(attribute(column,'max')?.value)+1); }
  const sorted = [...boundaries].sort((a,b)=>a-b);
  for (let index=0;index<sorted.length-1;index++) {
    const min = sorted[index]!, max = sorted[index+1]!-1;
    const source = definitions.findLast(c => Number(attribute(c,'min')?.value)<=min && Number(attribute(c,'max')?.value)>=max);
    const selected = min >= range.start.column && max <= range.end.column;
    if (!source && !selected) continue;
    const attrs = new Map(source?.attributes.map(a=>[a.qualified,a.value]));
    attrs.set('min',String(min)); attrs.set('max',String(max));
    if (selected) attrs.set('style',String(planner.formatIndex(Number(attribute(source ?? document.root,'style')?.value ?? 0),transform)));
    const markup = `<${prefix}col${[...attrs].map(([k,v])=>` ${k}="${escapeAttribute(v)}"`).join('')}/>`;
    intervals.push({min,max,markup});
  }
  const markup = `<${prefix}cols>${intervals.map(i=>i.markup).join('')}</${prefix}cols>`;
  if (original) editor.replaceElementMarkup(original,markup);
  else { const data=child(document.root,ns,'sheetData'); if(data)editor.insertMarkupBefore(data,markup);else editor.appendMarkup(document.root,markup); }
  // Row defaults take precedence over columns. Preserve that precedence while applying the patch.
  const allColumns = range.start.column === 1 && range.end.column === EXCEL_MAX_COLUMNS;
  const edits: {address:CellAddress;styleIndex:number}[] = [];
  const sheetData = child(document.root,ns,'sheetData');
  for (const row of worksheet.rows) {
    if (row.index < range.start.row || row.index > range.end.row) continue;
    if (row.customFormat && allColumns && sheetData) {
      const element = children(sheetData,ns,'row').find((r,index,all)=>Number(attribute(r,'r')?.value??inferredRowIndex(all,index))===row.index);
      if (element) {
        const style = attribute(element,'s'), value=String(planner.formatIndex(row.styleIndex??0,transform));
        if(style)editor.setAttribute(style,value);else editor.insertAttribute(element,'s',value);
      }
    } else if (row.customFormat) {
      for(let column=range.start.column;column<=range.end.column;column++)edits.push({address:{row:row.index,column},styleIndex:planner.formatIndex(worksheet.effectiveStyleIndex({row:row.index,column})??0,transform)});
    }
    for (const cell of row.cells) if(cell.address.column>=range.start.column && cell.address.column<=range.end.column && (!row.customFormat || allColumns)) edits.push({address:cell.address,styleIndex:planner.formatIndex(worksheet.effectiveStyleIndex(cell.address)??0,transform)});
  }
  // Column defaults span the grid. Restore rows outside the requested rectangle exactly.
  for (const [first,last] of [[1,range.start.row-1],[range.end.row+1,EXCEL_MAX_ROWS]]) {
    for(let row=first!;row<=last!;row++) {
      if (worksheet.row(row)?.customFormat) continue;
      for(let column=range.start.column;column<=range.end.column;column++) {
        const address={row,column};
        edits.push({address,styleIndex:worksheet.effectiveStyleIndex(address)??0});
      }
    }
  }
  // Stage column/row defaults first, then explicit cell overrides against the updated XML.
  const updated = parseLosslessXml(editor.commit().bytes);
  const bytes = edits.length ? styleWorksheetCells(updated,workbook.conformance,edits) : updated.originalBytes();
  const transaction=beginPackageTransaction(workbook.package);
  planner.stage(transaction);
  transaction.replacePart(worksheet.sheet.partName,bytes);
  return transaction.commitPackage();
}

/** Whole rows inherit a row format; materialize only cells that override column or cell styles. */
function formatWholeRows(workbook: SpreadsheetWorkbook, worksheet: SpreadsheetWorksheet, range: CellRange, planner: SpreadsheetStylePlanner, transform: SpreadsheetStyleTransform): OpcPackage {
  const document=worksheet.document, ns=spreadsheetNamespace(workbook.conformance);
  const data=child(document.root,ns,'sheetData');
  if(!data)throw new SpreadsheetError('invalid_worksheet','Worksheet data is missing.');
  const elements=children(data,ns,'row');
  const rowElements=new Map(elements.map((element,index,all)=>[Number(attribute(element,'r')?.value??inferredRowIndex(all,index)),element]));
  const markup=new Map([...rowElements].map(([row,element])=>[row,sourceForNode(document,element)]));
  const prefix=data.prefix;
  const overrides=new Map<string,{address:CellAddress;styleIndex:number}>();
  const columnDefaults=predominantColumnStyle(worksheet);
  const defaultBase=columnDefaults.style;
  for(let row=range.start.row;row<=range.end.row;row++) {
    const element=rowElements.get(row), model=worksheet.row(row);
    const base=model?.customFormat ? model.styleIndex??0 : defaultBase;
    const style=planner.formatIndex(base,transform);
    const attrs=new Map(element?.attributes.map(a=>[a.qualified,a.value]));
    attrs.set('r',String(row));attrs.set('s',String(style));attrs.set('customFormat','1');
    const body=element&&!element.selfClosing ? document.source.slice(element.startTagSpan.end,element.endTagSpan!.start) : '';
    markup.set(row,`<${qualified(prefix,'row')}${[...attrs].map(([key,value])=>` ${key}="${escapeAttribute(value)}"`).join('')}>${body}</${qualified(prefix,'row')}>`);
    if(!model?.customFormat) for(const column of columnDefaults.runs) {
      const target=planner.formatIndex(column.styleIndex??0,transform);
      if(target===style)continue;
      for(let index=Math.max(column.min,range.start.column);index<=Math.min(column.max,range.end.column);index++) {
        const address={row,column:index};
        overrides.set(formatCellReference(address),{address,styleIndex:planner.formatIndex(worksheet.effectiveStyleIndex(address)??0,transform)});
      }
    }
    for (const [first,last] of [[1,range.start.column-1],[range.end.column+1,EXCEL_MAX_COLUMNS]]) for(let column=first!;column<=last!;column++) {
      const address={row,column};
      overrides.set(formatCellReference(address),{address,styleIndex:worksheet.effectiveStyleIndex(address)??0});
    }
    for(const cell of model?.cells??[]) {
      if(cell.address.column<range.start.column || cell.address.column>range.end.column)continue;
      const target=planner.formatIndex(worksheet.effectiveStyleIndex(cell.address)??0,transform);
      if(target!==style || cell.styleIndex!==undefined) overrides.set(cell.reference,{address:cell.address,styleIndex:target});
    }
  }
  const editor=beginLosslessXmlEdit(document);
  const nonRows=data.children.filter(node=>node.kind!=='element'||node.namespaceUri!==ns||node.localName!=='row').map(node=>sourceForNode(document,node)).join('');
  editor.replaceElementMarkup(data,`<${data.qualified}${data.attributes.map(a=>` ${a.qualified}="${escapeAttribute(a.value)}"`).join('')}>${[...markup].sort(([a],[b])=>a-b).map(([,xml])=>xml).join('')}${nonRows}</${data.qualified}>`);
  const updated=parseLosslessXml(editor.commit().bytes);
  const bytes=overrides.size?styleWorksheetCells(updated,workbook.conformance,[...overrides.values()]):updated.originalBytes();
  const tx=beginPackageTransaction(workbook.package);
  planner.stage(tx);
  tx.replacePart(worksheet.sheet.partName,bytes);
  return tx.commitPackage();
}

function predominantColumnStyle(worksheet: SpreadsheetWorksheet) {
  const boundaries=new Set([1,EXCEL_MAX_COLUMNS+1]);
  for(const column of worksheet.columns){boundaries.add(column.min);boundaries.add(column.max+1);}
  const sorted=[...boundaries].sort((a,b)=>a-b), counts=new Map<number,number>();
  const runs:{min:number;max:number;styleIndex:number}[]=[];
  for(let i=0;i<sorted.length-1;i++){
    const min=sorted[i]!, max=sorted[i+1]!-1;
    const style=worksheet.columns.findLast(column=>min>=column.min&&max<=column.max&&column.styleIndex!==undefined)?.styleIndex??0;
    counts.set(style,(counts.get(style)??0)+(max-min+1));
    runs.push({min,max,styleIndex:style});
  }
  const [style,count]=[...counts].sort((a,b)=>b[1]-a[1])[0]??[0,EXCEL_MAX_COLUMNS];
  return {style,exceptions:EXCEL_MAX_COLUMNS-count,runs};
}
