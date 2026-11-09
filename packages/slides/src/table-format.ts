import type { PresentationCommand } from './commands.ts';
import type { SlideTable, SlideTableCell } from './model.ts';
import type { PresentationArtifact } from './artifact.ts';
import { objectTarget } from './authoring-objects.ts';
import { children, raw } from './authoring-slides.ts';
import { A, commitXml, emu, xml } from './authoring-xml.ts';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
type Command = Extract<PresentationCommand, { name: 'format-table' }>;
const sides = ['top', 'right', 'bottom', 'left'] as const;
function selected(cell: SlideTableCell, anchor: SlideTableCell, scope: Command['scope']) {
  return scope === 'table' || (scope === 'cell' ? cell === anchor : scope === 'row'
    ? cell.row < anchor.row + anchor.rowSpan && cell.row + cell.rowSpan > anchor.row
    : cell.column < anchor.column + anchor.columnSpan && cell.column + cell.columnSpan > anchor.column);
}
export function formatNativeTable(table: SlideTable, command: Command): SlideTable {
  const anchor = table.cells.find(c => c.row === command.row && c.column === command.column);
  if (!anchor) throw new Error('Select a table cell.');
  return { ...table, cells: table.cells.map(cell => !selected(cell, anchor, command.scope) ? cell : ({ ...cell,
    fill: command.fill ?? cell.fill,
    borders: sides.map((side, index) => command.borders?.[side] ?? cell.borders[index]!),
    text: cell.text ? { ...cell.text, anchor: command.verticalAlignment ?? cell.text.anchor,
      inset: command.padding === undefined ? cell.text.inset : [command.padding, command.padding, command.padding, command.padding] } : cell.text,
  })) };
}
/** Update cell properties without replacing text, merged geometry or table style references. */
export function formatPresentationTable(artifact: PresentationArtifact, command: Command) {
  const { object, source, slide } = objectTarget(artifact, command.slideId, command.objectKey);
  if (!object.table) throw new Error('Select a table.');
  const formatted = formatNativeTable(object.table, command);
  const edit = beginLosslessXmlEdit(source);
  for (const [index, cell] of object.table.cells.entries()) {
    if (formatted.cells[index] === cell) continue;
    const node = source.element(cell.elementId)!;
    const props = children(node).find(n => n.localName === 'tcPr');
    const tags = ['lnT', 'lnR', 'lnB', 'lnL'];
    const replaced = new Set<string>();
    const added = new Map<string, string>();
    if (command.fill !== undefined) {
      ['solidFill', 'noFill', 'gradFill', 'pattFill', 'blipFill', 'grpFill'].forEach(n => replaced.add(n));
      added.set(command.fill === 'none' ? 'noFill' : 'solidFill', command.fill === 'none' ? '<a:noFill/>' : `<a:solidFill><a:srgbClr val="${xml(command.fill.slice(1))}"/></a:solidFill>`);
    }
    for (const [i, side] of sides.entries()) {
      const border = command.borders?.[side];
      if (!border) continue;
      replaced.add(tags[i]!);
      added.set(tags[i]!, `<a:${tags[i]} w="${emu(border.width)}" cmpd="${border.dash === 'double' ? 'dbl' : 'sng'}">${border.color === 'none' ? '<a:noFill/>' : `<a:solidFill><a:srgbClr val="${xml(border.color.slice(1))}"/></a:solidFill>`}<a:prstDash val="${border.dash === 'dot' ? 'sysDot' : border.dash === 'dash' ? 'dash' : 'solid'}"/></a:${tags[i]}>`);
    }
    const attrs = new Map(props?.attributes.filter(a => !a.namespaceUri).map(a => [a.localName, a.value]));
    if (command.verticalAlignment) attrs.set('anchor', command.verticalAlignment === 'center' ? 'ctr' : command.verticalAlignment === 'bottom' ? 'b' : 't');
    if (command.padding !== undefined) for (const side of ['marT', 'marR', 'marB', 'marL']) attrs.set(side, String(emu(command.padding)));
    const content = new Map((props ? children(props).filter(n => !replaced.has(n.localName)) : []).map(n => [n.localName, raw(source, n)]));
    for (const [name, markup] of added) content.set(name, markup);
    const order = ['lnL', 'lnR', 'lnT', 'lnB', 'lnTlToBr', 'lnBlToTr', 'cell3D', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'headers', 'extLst'];
    const inner = [...content].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([, markup]) => markup).join('');
    const markup = `<a:tcPr xmlns:a="${A}" ${[...attrs].map(([k,v]) => `${k}="${xml(v)}"`).join(' ')}>${inner}</a:tcPr>`;
    if (props) edit.replaceElementMarkup(props, markup);
    else edit.replaceElementMarkup(node, raw(source,node).replace(/<\/[^>]+>$/, markup + `</${node.qualified}>`));
  }
  return commitXml(artifact, slide.part, edit.commit().bytes);
}
