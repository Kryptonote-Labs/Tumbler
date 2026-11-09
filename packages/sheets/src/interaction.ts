import { z } from 'zod';
import { findTextMatches } from '@tumblerjs/core';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import { SpreadsheetArtifact } from './artifact.ts';
import { openSpreadsheet } from './workbook.ts';
import { beginSpreadsheetEdit } from './editor.ts';

const sheetId = z.string().min(1);
export const spreadsheetInteractionCommand = z.discriminatedUnion('name', [
  z.object({ name: z.literal('replace-text'), sheetId, query: z.string().min(1), replacement: z.string(), matchCase: z.boolean().optional(), wholeWord: z.boolean().optional(), reference: z.string().optional() }).strict(),
  z.object({ name: z.literal('set-sheet-state'), sheetId, state: z.enum(['visible', 'hidden']) }).strict(),
  z.object({ name: z.literal('set-tab-color'), sheetId, color: z.string().regex(/^[0-9a-fA-F]{6}$/).nullable() }).strict(),
]);

/** Replace literal text and edit worksheet metadata without flattening unrelated package content. */
export function applySpreadsheetInteractionCommand(artifact: SpreadsheetArtifact, input: z.infer<typeof spreadsheetInteractionCommand>): SpreadsheetArtifact {
  const command = spreadsheetInteractionCommand.parse(input);
  const sheet = artifact.workbook.sheets.find(s => String(s.sheetId) === command.sheetId);
  if (!sheet) throw new Error('Worksheet does not exist.');
  let saved = artifact.workbook.package;
  if (command.name === 'replace-text') {
    const selected = artifact.selectSheet(sheet.sheetId), editor = beginSpreadsheetEdit(artifact.workbook);
    for (const row of selected.worksheet.rows) for (const cell of row.cells) {
      if (command.reference && cell.reference !== command.reference) continue;
      // Search editable source, never formatted numbers or calculated formula results.
      const source = cell.formula ?? (cell.value.type === 'string' || cell.value.type === 'number' ? String(cell.value.value) : undefined);
      if (source === undefined) continue;
      const matches = findTextMatches(source, command.query, { matchCase: command.matchCase ?? false, wholeWord: command.wholeWord ?? false });
      if (!matches.length) continue;
      let text = source;
      for (const match of matches.toReversed()) text = text.slice(0, match.start) + command.replacement + text.slice(match.end);
      if (cell.formula !== undefined) editor.setCellFormula(sheet, cell.reference, text);
      else editor.setCellValue(sheet, cell.reference, cell.value.type === 'number' && text.trim() && Number.isFinite(Number(text)) ? Number(text) : text);
    }
    saved = editor.commitPackage();
  } else if (command.name === 'set-sheet-state') {
    if (command.state === 'hidden' && sheet.state === 'visible' && artifact.workbook.sheets.filter(s => s.state === 'visible').length === 1) throw new Error('A workbook needs at least one visible worksheet.');
    const document = artifact.workbook.document, editor = beginLosslessXmlEdit(document);
    const sheets = document.root.children.find(n => n.kind === 'element' && n.localName === 'sheets');
    const element = sheets?.kind === 'element' ? sheets.children.find(n => n.kind === 'element' && n.attributes.some(a => a.localName === 'sheetId' && a.value === command.sheetId)) : undefined;
    if (!element || element.kind !== 'element') throw new Error('Worksheet metadata is missing.');
    const state = element.attributes.find(a => a.localName === 'state');
    if (state) editor.setAttribute(state, command.state); else editor.insertAttribute(element, 'state', command.state);
    saved = beginPackageTransaction(saved).replacePart(artifact.workbook.part.name, editor.commit().bytes).commitPackage();
  } else {
    const document = artifact.selectSheet(sheet.sheetId).worksheet.document, editor = beginLosslessXmlEdit(document);
    const root = document.root, prefix = root.prefix ? `${root.prefix}:` : '';
    const properties = root.children.find(n => n.kind === 'element' && n.localName === 'sheetPr');
    const markup = command.color ? `<${prefix}tabColor rgb="FF${command.color.toUpperCase()}"/>` : '';
    if (properties?.kind === 'element') {
      const color = properties.children.find(n => n.kind === 'element' && n.localName === 'tabColor');
      if (color?.kind === 'element') editor.replaceElementMarkup(color, markup);
      else if (markup) {
        if (properties.selfClosing) editor.replaceElementMarkup(properties, document.source.slice(properties.span.start, properties.span.end).replace(/\s*\/>$/, `>${markup}</${properties.qualified}>`));
        else {
          const first = properties.children.find(n => n.kind === 'element');
          if (first?.kind === 'element') editor.insertMarkupBefore(first, markup); else editor.appendMarkup(properties, markup);
        }
      }
    } else if (markup) {
      const first = root.children.find(n => n.kind === 'element');
      if (first?.kind === 'element') editor.insertMarkupBefore(first, `<${prefix}sheetPr>${markup}</${prefix}sheetPr>`);
      else editor.appendMarkup(root, `<${prefix}sheetPr>${markup}</${prefix}sheetPr>`);
    }
    saved = beginPackageTransaction(saved).replacePart(sheet.partName, editor.commit().bytes).commitPackage();
  }
  const workbook = openSpreadsheet(saved);
  const active = workbook.sheet(artifact.activeSheet.sheetId);
  return new SpreadsheetArtifact(workbook, active?.state === 'visible' ? active : workbook.sheets.find(s => s.state === 'visible')!);
}
