import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, closeSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { editChartSource, inspectChartSource, readChartData, readChartContent, writeChartContent } from '@tumblerjs/charts';
import { applyChartContentEdit, refreshChartWorkbook, openSpreadsheetArtifact, spreadsheetDrawingObjectId, applySpreadsheetCommand } from '@tumblerjs/sheets';
import { beginPackageTransaction, openOpcPackage, type OpcPackage, type OpcPart } from '@tumblerjs/opc';
import { chartEditInput, type ChartOperationHost } from './charts.ts';

const chartContentTypes = new Set([
  'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
  'application/vnd.ms-office.chartex+xml',
]);
const revision = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function open(path: string, bytes: Uint8Array) {
  if (!['.docx', '.pptx', '.xlsx'].includes(extname(path).toLowerCase()))
    throw new Error('Chart commands require a DOCX, PPTX or XLSX document.');
  return openOpcPackage(bytes);
}
function chartPart(pkg: OpcPackage, name: string) {
  const part = pkg.getPart(name);
  if (!part || !chartContentTypes.has(part.contentType)) throw new Error(`Chart part ${name} is missing.`);
  return part;
}
function spreadsheetOwner(bytes: Uint8Array, part: OpcPart) {
  const artifact = openSpreadsheetArtifact(bytes);
  for (const sheet of artifact.workbook.sheets) {
    const selected = artifact.selectSheet(sheet.sheetId), drawing = selected.worksheet.drawing;
    const frame = drawing?.charts.find(chart => chart.partName?.equivalenceKey === part.name.equivalenceKey);
    const objectId = frame && spreadsheetDrawingObjectId(drawing!, frame.anchor);
    if (objectId !== undefined) return { artifact: selected, objectId };
  }
  throw new TypeError('The chart is not attached to a worksheet drawing.');
}
function liveSource(bytes: Uint8Array, pkg: OpcPackage, part: OpcPart): Uint8Array {
  const source = pkg.readPart(part);
  const spreadsheet = pkg.parts.some(part => part.contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  if (!spreadsheet || part.contentType !== 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml') return source;
  const artifact = openSpreadsheetArtifact(bytes);
  let owner = artifact;
  for (const sheet of artifact.workbook.sheets) {
    const candidate = artifact.selectSheet(sheet.sheetId);
    if (candidate.worksheet.drawing?.charts.some(chart => chart.partName?.equivalenceKey === part.name.equivalenceKey)) { owner = candidate; break; }
  }
  return refreshChartWorkbook(source, owner);
}
function inspect(bytes: Uint8Array, pkg: OpcPackage, part?: string) {
  const selected = part === undefined ? undefined : chartPart(pkg, part);
  const source = selected && pkg.readPart(selected);
  const classic = selected?.contentType === 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
  const data = classic && source ? readChartData(liveSource(bytes, pkg, selected!)) : undefined;
  return {
    page: revision(bytes),
    parts: pkg.parts.filter(part => chartContentTypes.has(part.contentType)).map(part => ({ part: part.name.value, contentType: part.contentType })),
    ...(part === undefined ? {} : { part, source: inspectChartSource(source!), ...(data === undefined ? {} : { data }) }),
  };
}

/** Shared chart-part edits for all three file formats, guarded by the whole-file revision. */
export function chartFileHost(): Required<ChartOperationHost> {
  return {
    async readCharts(path, input) {
      const bytes = readFileSync(path);
      return inspect(bytes, open(path, bytes), input.part);
    },
    async editChart(path, input) {
      input = chartEditInput.parse(input);
      path = realpathSync(path);
      const lock = path + '.tumbler-lock';
      const descriptor = openSync(lock, 'wx');
      const temporary = path + '.' + randomUUID() + '.tmp';
      try {
        const original = readFileSync(path);
        if (revision(original) !== input.page) throw new Error('The document changed. Read the chart again before editing.');
        const pkg = open(path, original);
        const part = chartPart(pkg, input.part);
        if ('cells' in input && extname(path).toLowerCase() === '.xlsx') throw new TypeError('Edit source cells with sheets commands in the owning workbook.');
        let bytes: Uint8Array;
        if (!('edits' in input) && extname(path).toLowerCase() === '.xlsx') {
          const { artifact, objectId } = spreadsheetOwner(original, part);
          const content = applyChartContentEdit({ ...readChartContent(pkg, part.name), xml: new TextDecoder().decode(refreshChartWorkbook(pkg.readPart(part), artifact)) }, input);
          bytes = applySpreadsheetCommand(artifact, { name: 'edit-chart', sheetId: String(artifact.activeSheet.sheetId), objectId, content, bindUnboundData: true }).bytes();
        } else {
          const transaction = beginPackageTransaction(pkg);
          if ('edits' in input) transaction.replacePart(part.name, editChartSource(pkg.readPart(part), input.edits));
          else writeChartContent(transaction, part.name, applyChartContentEdit(readChartContent(pkg, part.name), input));
          bytes = transaction.commit();
        }
        const result = inspect(bytes, open(path, bytes), input.part);
        const mode = statSync(path).mode;
        writeFileSync(temporary, bytes, { flag: 'wx', mode });
        chmodSync(temporary, mode);
        if (revision(readFileSync(path)) !== input.page) throw new Error('The document changed while editing. Read it again.');
        renameSync(temporary, path);
        return result;
      } finally {
        try { unlinkSync(temporary); } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        }
        closeSync(descriptor);
        unlinkSync(lock);
      }
    },
  };
}
