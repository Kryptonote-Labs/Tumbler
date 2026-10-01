import { beginLosslessXmlEdit, OOXML_NAMESPACES, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction } from '@tumblerjs/opc';
import type { WordDocument, WordBlock, WordTable } from './document.ts';
import { resolveWordTableGrid } from './table-grid.ts';
import { editWordTableBorders, resolveWordCellBorders, WORD_BORDER_SIDES, type WordBorderEdges, type WordBorder } from './table-borders.ts';
import { wordBorderMarkup, wordBordersMarkup } from './table-border-xml.ts';

export interface WordTableBorderChange {
  readonly tableElementId: number;
  /** Omit to format every cell. IDs must belong to this table. */
  readonly cellElementIds?: readonly number[];
  readonly edges: WordBorderEdges;
  readonly border: Partial<WordBorder>;
}

/** Edits direct cell borders without rebuilding the document or other package parts. */
export function formatWordTableBorders(document: WordDocument, change: WordTableBorderChange): Uint8Array {
  const find = (blocks: readonly WordBlock[]): WordTable | undefined => {
    for (const block of blocks) if (block.kind === 'table') {
      if (block.elementId === change.tableElementId) return block;
      for (const row of block.rows) for (const cell of row.cells) {
        const found = find(cell.blocks);
        if (found) return found;
      }
    }
  };
  const table = find(document.blocks);
  if (!table) throw new RangeError('The table no longer exists.');
  const grid = resolveWordTableGrid(table);
  const cells = grid.rows.flatMap(row => row.cells).map(cell => ({ ...cell,
    borders: resolveWordCellBorders({ ...cell, borders: cell.source.borders ?? {} }, grid.rows.length, grid.columnCount, table.properties.borders),
  }));
  const selected = change.cellElementIds?.map(id => cells.findIndex(cell => cell.source.elementId === id || cell.continuationElementIds.includes(id))) ?? cells.map((_, index) => index);
  const edited = editWordTableBorders(cells, selected, change.edges, change.border);
  const editor = beginLosslessXmlEdit(document.source);
  const namespace = OOXML_NAMESPACES[document.conformance].wordprocessing;
  for (let index = 0; index < cells.length; index++) {
    const before = cells[index]!, after = edited[index]!;
    const changed = WORD_BORDER_SIDES.filter(side => before.borders[side] !== after.borders[side]);
    if (!changed.length) continue;
    for (const id of [before.source.elementId, ...before.continuationElementIds]) {
      const cell = document.source.element(id)!;
      const elements = (element: LosslessXmlElement) => element.children.filter((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === namespace);
      const properties = elements(cell).find(child => child.localName === 'tcPr');
      const borders = properties && elements(properties).find(child => child.localName === 'tcBorders');
      const prefix = cell.prefix;
      const tag = (name: string) => prefix ? `${prefix}:${name}` : name;
      const patch = Object.fromEntries(changed.map(side => [side, after.borders[side]!]));
      const markup = wordBordersMarkup(patch, 'tcBorders', prefix, namespace);
      if (borders) {
        // Preserve untouched edges, extension attributes, and unsupported border styles.
        if (borders.selfClosing) editor.replaceElementMarkup(borders, markup);
        else for (const side of changed) {
          const old = elements(borders).filter(child => child.localName === side || child.localName === (side === 'left' ? 'start' : side === 'right' ? 'end' : side));
          for (const element of old) editor.removeElement(element);
          const edge = wordBorderMarkup(side, after.borders[side]!, prefix, namespace);
          editor.appendMarkup(borders, edge);
        }
      } else if (properties) {
        if (properties.selfClosing) {
          const start = document.source.source.slice(properties.startTagSpan.start, properties.startTagSpan.end).replace(/\/\s*>$/, '>');
          editor.replaceElementMarkup(properties, `${start}${markup}</${properties.qualified}>`);
        }
        else {
          const next = elements(properties).find(child => ['shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark', 'headers', 'cellIns', 'cellDel', 'cellMerge', 'tcPrChange'].includes(child.localName));
          if (next) editor.insertMarkupBefore(next, markup);
          else editor.appendMarkup(properties, markup);
        }
      } else {
        const propertiesMarkup = `<${tag('tcPr')}>${markup}</${tag('tcPr')}>`;
        const first = elements(cell)[0];
        if (first) editor.insertMarkupBefore(first, propertiesMarkup);
        else editor.appendMarkup(cell, propertiesMarkup);
      }
    }
  }
  if (!editor.hasChanges) return document.bytes();
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, editor.commit().bytes);
  return transaction.commit();
}
