import { beginLosslessXmlEdit, parseLosslessXml, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { SpreadsheetArtifact } from './artifact.ts';
import {
  parseCellRange,
  parseCellReference,
  formatCellRange,
  formatCellReference,
  type CellRange,
} from './references.ts';
import { openSpreadsheet } from './workbook.ts';
import {
  interval,
  moveRange,
  normalize,
  rebaseSpreadsheetFormula,
  type SpreadsheetStructureCommand,
} from './structure-references.ts';
export { rebaseSpreadsheetFormula } from './structure-references.ts';
export type { SpreadsheetStructureCommand } from './structure-references.ts';

const attribute = (element: LosslessXmlElement, name: string) =>
  element.attributes.find(
    (candidate) => candidate.localName === name && candidate.namespaceUri === '',
  );
const children = (element: LosslessXmlElement) =>
  element.children.filter((node): node is LosslessXmlElement => node.kind === 'element');
const unsupported = new Set([
  'tableParts',
  'drawing',
  'legacyDrawing',
  'legacyDrawingHF',
  'pivotTableParts',
  'extLst',
  'controls',
  'oleObjects',
  'customSheetViews',
  'filterColumn',
  'sortState',
  'rowBreaks',
  'colBreaks',
]);
const formulaNames = new Set(['f', 'formula', 'formula1', 'formula2']);
const rangeAttributes = new Map([
  ['dimension', 'ref'],
  ['mergeCell', 'ref'],
  ['autoFilter', 'ref'],
  ['hyperlink', 'ref'],
  ['conditionalFormatting', 'sqref'],
  ['dataValidation', 'sqref'],
  ['selection', 'sqref'],
  ['ignoredError', 'sqref'],
  ['protectedRange', 'sqref'],
  ['sheetView', 'topLeftCell'],
  ['pane', 'topLeftCell'],
]);

/** Changes worksheet coordinates and references atomically, preserving all unrelated package resources. */
export function applySpreadsheetStructureCommand(
  artifact: SpreadsheetArtifact,
  command: SpreadsheetStructureCommand,
): SpreadsheetArtifact {
  const change = normalize(command);
  const target = artifact.workbook.sheets.find(
    (sheet) => String(sheet.sheetId) === command.sheetId || sheet.name === command.sheetId,
  );
  if (!target) throw new Error('Worksheet does not exist.');
  const transaction = beginPackageTransaction(artifact.workbook.package);
  // These resources contain references whose semantics require their own edit engines.
  if (
    artifact.workbook.package.parts.some((part) =>
      /(?:chart|pivot|externalLink|comments|calcChain)/i.test(part.contentType),
    )
  ) {
    // Calculation chains are disposable and are removed below. Other reference-bearing resources are retained unchanged by rejecting this edit.
    if (
      artifact.workbook.package.parts.some((part) =>
        /(?:chart|pivot|externalLink|comments)/i.test(part.contentType),
      )
    )
      throw new Error(
        'Rows and columns cannot yet move in workbooks with charts, pivot tables, comments or external links. The workbook has not changed.',
      );
  }
  for (const sheet of artifact.workbook.sheets) {
    const document = parseLosslessXml(
      artifact.workbook.package.readPart(artifact.workbook.package.getPart(sheet.partName)!),
    );
    const editor = beginLosslessXmlEdit(document);
    const namespace = document.root.namespaceUri;
    const removed = new Set<number>();
    const isTarget = sheet === target;
    const rewrite = (formula: string) =>
      rebaseSpreadsheetFormula(formula, sheet.name, target.name, command);
    function visit(element: LosslessXmlElement): void {
      if (element.namespaceUri !== namespace) {
        if (isTarget)
          throw new Error(
            'Rows and columns cannot yet move with extended worksheet content. The workbook has not changed.',
          );
        return;
      }
      if (isTarget && unsupported.has(element.localName))
        throw new Error(
          `Rows and columns cannot yet move with ${element.localName}. The workbook has not changed.`,
        );
      const remove = () => {
        editor.removeElement(element);
        removed.add(element.id);
      };
      if (isTarget && ['mergeCells', 'dataValidations'].includes(element.localName)) {
        const entries = children(element);
        if (
          entries.length &&
          entries.every((entry) => {
            const ref = attribute(entry, element.localName === 'mergeCells' ? 'ref' : 'sqref');
            return (
              ref &&
              ref.value
                .trim()
                .split(/\s+/)
                .every((value) => !moveRange(parseCellRange(value), change))
            );
          })
        ) {
          remove();
          return;
        }
      }
      if (isTarget && element.localName === 'row' && change.axis === 'row') {
        const ref = attribute(element, 'r');
        if (!ref)
          throw new Error(
            'Rows without explicit coordinates cannot yet move. The workbook has not changed.',
          );
        const next = interval(Number(ref.value), Number(ref.value), change);
        if (!next) {
          if (!change.remove)
            throw new RangeError('Inserting would move a populated row past the Excel grid.');
          remove();
          return;
        }
        if (Number(ref.value) !== next[0]) editor.setAttribute(ref, String(next[0]));
      }
      if (isTarget && element.localName === 'row') {
        const spans = attribute(element, 'spans');
        if (spans) editor.removeAttribute(spans);
      }
      if (isTarget && element.localName === 'c') {
        const ref = attribute(element, 'r');
        if (!ref)
          throw new Error(
            'Cells without explicit coordinates cannot yet move. The workbook has not changed.',
          );
        const address = parseCellReference(ref.value),
          next = moveRange({ start: address, end: address }, change);
        if (!next) {
          if (!change.remove)
            throw new RangeError('Inserting would move a populated cell past the Excel grid.');
          remove();
          return;
        }
        const normalized = formatCellReference(next.start);
        if (normalized !== ref.value) editor.setAttribute(ref, normalized);
      }
      if (isTarget && element.localName === 'col' && change.axis === 'column') {
        const min = attribute(element, 'min'),
          max = attribute(element, 'max');
        if (!min || !max) throw new Error('Column widths have invalid coordinates.');
        const next = interval(Number(min.value), Number(max.value), change);
        if (!next) {
          remove();
          return;
        }
        if (Number(min.value) !== next[0]) editor.setAttribute(min, String(next[0]));
        if (Number(max.value) !== next[1]) editor.setAttribute(max, String(next[1]));
      }
      if (isTarget) {
        const name = rangeAttributes.get(element.localName),
          ref = name ? attribute(element, name) : undefined;
        if (ref) {
          const ranges = ref.value
            .trim()
            .split(/\s+/)
            .map((value) => moveRange(parseCellRange(value), change))
            .filter((value): value is CellRange => !!value);
          if (!ranges.length) {
            if (['pane', 'sheetView', 'selection'].includes(element.localName)) {
              const previous = parseCellRange(ref.value.trim().split(/\s+/)[0]!);
              const point = { ...previous.start, [change.axis]: change.index };
              ranges.push({ start: point, end: point });
            } else {
              remove();
              return;
            }
          }
          const value = ranges.map(formatCellRange).join(' ');
          if (value !== ref.value) editor.setAttribute(ref, value);
        }
        if (element.localName === 'selection') {
          const activeId = attribute(element, 'activeCellId');
          if (activeId) editor.removeAttribute(activeId);
          const active = attribute(element, 'activeCell');
          if (active) {
            const next = moveRange(parseCellRange(active.value), change);
            editor.setAttribute(
              active,
              next
                ? formatCellReference(next.start)
                : formatCellReference({
                    row: change.axis === 'row' ? change.index : 1,
                    column: change.axis === 'column' ? change.index : 1,
                  }),
            );
          }
        }
        if (
          element.localName === 'pane' &&
          attribute(element, 'state')?.value.startsWith('frozen')
        ) {
          const split = attribute(element, change.axis === 'row' ? 'ySplit' : 'xSplit');
          if (split) {
            const next = interval(1, Number(split.value), change);
            const value = next?.[1] ?? 0;
            if (value !== Number(split.value)) editor.setAttribute(split, String(value));
          }
        }
      }
      if (element.localName === 'hyperlink') {
        const location = attribute(element, 'location');
        if (location) {
          const formula = rewrite(location.value);
          if (formula !== location.value) editor.setAttribute(location, formula);
        }
      }
      if (formulaNames.has(element.localName)) {
        if (
          element.localName === 'f' &&
          element.attributes.some((attr) => ['t', 'si', 'ref'].includes(attr.localName))
        )
          throw new Error(
            'Rows and columns cannot yet move shared, array or data-table formulas. The workbook has not changed.',
          );
        const before = document.textContent(element);
        if (before) {
          const after = rewrite(before);
          if (after !== before) editor.setText(element, after);
        }
      }
      const nodes = children(element);
      for (const child of nodes) visit(child);
      const count = attribute(element, 'count');
      if (count && ['mergeCells', 'dataValidations'].includes(element.localName)) {
        const remaining = nodes.filter((child) => !removed.has(child.id)).length;
        if (String(remaining) !== count.value) editor.setAttribute(count, String(remaining));
      }
    }
    visit(document.root);
    if (editor.hasChanges) transaction.replacePart(sheet.partName, editor.commit().bytes);
  }
  updateWorkbookNames(artifact, transaction, target.name, command);
  const chain = artifact.workbook.calculation.calculationChain;
  if (chain)
    transaction
      .removeRelationship(artifact.workbook.part.name, chain.relationshipId)
      .removePart(chain.partName);
  const workbook = openSpreadsheet(transaction.commitPackage());
  const active = workbook.sheets.find((sheet) => sheet.sheetId === artifact.activeSheet.sheetId)!;
  return new SpreadsheetArtifact(workbook, active);
}
function updateWorkbookNames(
  artifact: SpreadsheetArtifact,
  transaction: ReturnType<typeof beginPackageTransaction>,
  target: string,
  command: SpreadsheetStructureCommand,
) {
  const document = artifact.workbook.document,
    editor = beginLosslessXmlEdit(document);
  function visit(element: LosslessXmlElement): void {
    if (
      element.localName === 'definedName' &&
      element.namespaceUri === document.root.namespaceUri
    ) {
      const before = document.textContent(element);
      const local = attribute(element, 'localSheetId');
      const context = local ? artifact.workbook.sheets[Number(local.value)]?.name : undefined;
      const after = rebaseSpreadsheetFormula(before, context, target, command);
      if (after !== before) editor.setText(element, after);
    }
    for (const child of children(element)) visit(child);
  }
  visit(document.root);
  const calc = children(document.root).find((element) => element.localName === 'calcPr');
  if (calc) {
    for (const name of ['fullCalcOnLoad', 'forceFullCalc']) {
      const attr = attribute(calc, name);
      if (attr) {
        if (attr.value !== '1') editor.setAttribute(attr, '1');
      } else editor.insertAttribute(calc, name, '1');
    }
  }
  if (!calc) {
    const prefix = document.root.prefix ? document.root.prefix + ':' : '';
    const later = children(document.root).find((element) =>
      [
        'oleSize',
        'customWorkbookViews',
        'pivotCaches',
        'smartTagPr',
        'smartTagTypes',
        'webPublishing',
        'fileRecoveryPr',
        'webPublishObjects',
        'extLst',
      ].includes(element.localName),
    );
    const markup = `<${prefix}calcPr fullCalcOnLoad="1" forceFullCalc="1"/>`;
    if (later) editor.insertMarkupBefore(later, markup);
    else editor.appendMarkup(document.root, markup);
  }
  if (editor.hasChanges)
    transaction.replacePart(artifact.workbook.part.name, editor.commit().bytes);
}
