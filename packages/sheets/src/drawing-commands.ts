import { extendChartWorkbook } from './chart-workbook.ts';
import { addChartContent, writeChartContent } from '@tumblerjs/charts';
import { z } from 'zod';
import { beginLosslessXmlEdit, OOXML_NAMESPACES, parseLosslessXml, presetGeometries, type LosslessXmlElement } from '@tumblerjs/ooxml';
import { beginPackageTransaction, PartName, relationshipItemName } from '@tumblerjs/opc';
import { SpreadsheetArtifact } from './artifact.ts';
import { openSpreadsheet } from './workbook.ts';
import { parseCellRange } from './references.ts';
import { spreadsheetDrawingBounds, spreadsheetDrawingObjectId } from './drawings.ts';

const id = z.string().min(1);
const position = { x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive() };
const chartContent = z.object({ xml: z.string(), workbook: z.string().optional() }).strict();
const target = { sheetId: id, objectId: z.number().int().nonnegative() };
export const spreadsheetDrawingCommand = z.discriminatedUnion('name', [
  z.object({ name: z.literal('insert-chart'), sheetId: id, ...position, content: chartContent, bindUnboundData: z.boolean().optional() }).strict(),
  z.object({ name: z.literal('edit-chart'), ...target, content: chartContent, bindUnboundData: z.boolean().optional() }).strict(),
  z.object({ name: z.literal('insert-shape'), sheetId: id, ...position, preset: id, text: z.string().optional(), fill: z.string().optional(), stroke: z.string().optional() }).strict(),
  z.object({ name: z.literal('insert-image'), sheetId: id, ...position, data: id, contentType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']), alt: z.string().optional() }).strict(),
  z.object({ name:z.literal('align-drawing'), ...target, range:id, action:z.enum(['left','center','right','top','middle','bottom']) }).strict(),
  z.object({ name: z.literal('style-drawing'), ...target, fill: z.string().optional(), stroke: z.string().optional(), strokeWidth: z.number().finite().nonnegative().optional() }).strict(),
  z.object({ name: z.literal('move-drawing'), ...target, ...position }).strict(),
  z.object({ name: z.literal('delete-drawing'), ...target }).strict(),
  z.object({ name: z.literal('duplicate-drawing'), ...target }).strict(),
  z.object({ name: z.literal('order-drawing'), ...target, action: z.enum(['front', 'forward', 'backward', 'back']) }).strict(),
]);
export type SpreadsheetDrawingCommand = z.infer<typeof spreadsheetDrawingCommand>;
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const emu = (n: number) => {
  const value = Math.round(n * 9525);
  if (!Number.isSafeInteger(value)) throw new RangeError('Drawing coordinate exceeds the supported integer range.');
  return value;
};
const children = (e: LosslessXmlElement) => e.children.filter((n): n is LosslessXmlElement => n.kind === 'element');

/** Drawing operations share one transactional OOXML engine across human and agent hosts. */
export function applySpreadsheetDrawingCommand(artifact: SpreadsheetArtifact, input: SpreadsheetDrawingCommand): SpreadsheetArtifact {
  const command = spreadsheetDrawingCommand.parse(input);
  const sheet = artifact.workbook.sheets.find(s => String(s.sheetId) === command.sheetId || s.name === command.sheetId);
  if (!sheet) throw new Error('Worksheet does not exist.');
  const worksheet = artifact.selectSheet(sheet.sheetId).worksheet;
  if (command.name === 'insert-chart' && command.bindUnboundData) {
    const bound = extendChartWorkbook(new TextEncoder().encode(command.content.xml), artifact.selectSheet(sheet.sheetId));
    return applySpreadsheetDrawingCommand(bound.artifact.selectSheet(artifact.activeSheet.sheetId), { ...command, content: { ...command.content, xml: new TextDecoder().decode(bound.source) }, bindUnboundData: false });
  }
  if (command.name === 'edit-chart') {
    const drawing = worksheet.drawing;
    const frame = drawing?.charts.find(frame => spreadsheetDrawingObjectId(drawing, frame.anchor) === command.objectId);
    if (!frame?.partName) throw new TypeError('Select an editable chart.');
    const bound = command.bindUnboundData ? extendChartWorkbook(new TextEncoder().encode(command.content.xml), artifact.selectSheet(sheet.sheetId)) : undefined;
    const transaction = beginPackageTransaction(bound?.artifact.workbook.package ?? artifact.workbook.package);
    writeChartContent(transaction, frame.partName, bound ? { ...command.content, xml: new TextDecoder().decode(bound.source) } : command.content);
    const workbook = openSpreadsheet(transaction.commitPackage());
    return new SpreadsheetArtifact(workbook, workbook.sheet(artifact.activeSheet.sheetId)!);
  }
  if(command.name==='align-drawing') {
    const drawing=worksheet.drawing;
    const anchor=drawing?.anchors.find(a=>spreadsheetDrawingObjectId(drawing,a)===command.objectId);
    if(!anchor)throw new Error('Drawing object does not exist.');
    const rows=worksheet.rowGeometry(),columns=worksheet.columnGeometry(),range=parseCellRange(command.range);
    const bounds=spreadsheetDrawingBounds(anchor,rows,columns);
    const left=columns.start(range.start.column),top=rows.start(range.start.row),right=columns.start(range.end.column)+columns.size(range.end.column),bottom=rows.start(range.end.row)+rows.size(range.end.row);
    const patch=command.action==='left'?{x:left}:command.action==='center'?{x:(left+right-bounds.width)/2}:command.action==='right'?{x:right-bounds.width}:command.action==='top'?{y:top}:command.action==='middle'?{y:(top+bottom-bounds.height)/2}:{y:bottom-bounds.height};
    return applySpreadsheetDrawingCommand(artifact,{name:'move-drawing',sheetId:command.sheetId,objectId:command.objectId,...bounds,...patch});
  }
  const workbook = artifact.workbook;
  const ns = OOXML_NAMESPACES[workbook.conformance];
  const rel = workbook.conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const transaction = beginPackageTransaction(workbook.package);
  const drawing = worksheet.drawing;
  const uniquePart = (stem: string, extension: string) => {
    let index = 1;
    while (workbook.package.getPart(PartName.parse(`${stem}${index}.${extension}`))) index++;
    return PartName.parse(`${stem}${index}.${extension}`);
  };
  const drawingPart = drawing?.partName ?? uniquePart('/xl/drawings/drawing', 'xml');
  let document = drawing?.document ?? parseLosslessXml(new TextEncoder().encode(`<xdr:wsDr xmlns:xdr="${ns.spreadsheetDrawing}" xmlns:a="${ns.drawing}" xmlns:r="${rel}"></xdr:wsDr>`));
  if(document.root.selfClosing) document = parseLosslessXml(new TextEncoder().encode(document.source.replace(/\/>\s*$/, `></${document.root.qualified}>`)));
  const editor = beginLosslessXmlEdit(document);
  const raw = (e: LosslessXmlElement) => document.source.slice(e.span.start, e.span.end);
  const insertAfter = (element: LosslessXmlElement, markup: string) => {
    const siblings = children(document.root);
    const next = siblings[siblings.indexOf(element) + 1];
    if (next) editor.insertMarkupBefore(next, markup); else editor.appendMarkup(document.root, markup);
  };
  const anchors = drawing?.anchors ?? [];
  const allIds: number[] = [];
  const scan = (e: LosslessXmlElement) => { if (e.localName === 'cNvPr') allIds.push(Number(e.attributes.find(a => a.localName === 'id')?.value ?? 0)); children(e).forEach(scan); };
  scan(document.root);
  let nextId = Math.max(0, ...allIds) + 1;
  const anchorMarkup = (bounds: { x: number; y: number; width: number; height: number }, content: string, original?: LosslessXmlElement) => {
    const attributes=original?.attributes.filter(a=>a.qualified!=='editAs'&&!['xmlns:xdr','xmlns:a','xmlns:r'].includes(a.qualified)).map(a=>`${a.qualified}="${escape(a.value)}"`).join(' ') ?? '';
    const clientData=original && children(original).find(e=>e.localName==='clientData');
    return `<xdr:absoluteAnchor xmlns:xdr="${ns.spreadsheetDrawing}" xmlns:a="${ns.drawing}" xmlns:r="${rel}" ${attributes}><xdr:pos x="${emu(bounds.x)}" y="${emu(bounds.y)}"/><xdr:ext cx="${emu(bounds.width)}" cy="${emu(bounds.height)}"/>${content}${clientData?raw(clientData):'<xdr:clientData/>'}</xdr:absoluteAnchor>`;
  };
  if (command.name === 'insert-shape' || command.name === 'insert-image' || command.name === 'insert-chart') {
    const objectId = nextId++;
    const xfrm = `<a:xfrm><a:off x="${emu(command.x)}" y="${emu(command.y)}"/><a:ext cx="${emu(command.width)}" cy="${emu(command.height)}"/></a:xfrm>`;
    let content: string;
    if (command.name === 'insert-shape') {
      if (!Object.hasOwn(presetGeometries, command.preset)) throw new Error('Unknown DrawingML shape preset.');
      const fill = command.fill ?? '#729fcf', stroke = command.stroke ?? '#3465a4';
      const paint = (value: string) => {
        if (value === 'none') return '<a:noFill/>';
        if (!/^#[a-f\d]{6}$/i.test(value)) throw new Error('Drawing colors must be #rrggbb or none.');
        return `<a:solidFill><a:srgbClr val="${value.slice(1)}"/></a:solidFill>`;
      };
      content = `<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${objectId}" name="Shape ${objectId}"/><xdr:cNvSpPr txBox="${command.text === undefined ? 0 : 1}"/></xdr:nvSpPr><xdr:spPr>${xfrm}<a:prstGeom prst="${escape(command.preset)}"><a:avLst/></a:prstGeom>${paint(fill)}<a:ln w="9525">${paint(stroke)}</a:ln></xdr:spPr>${command.text === undefined ? '' : `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${escape(command.text)}</a:t></a:r></a:p></xdr:txBody>`}</xdr:sp>`;
    } else if (command.name === 'insert-chart') {
      const chartPart = uniquePart('/xl/charts/chart', 'xml');
      addChartContent(transaction, chartPart, command.content);
      let relationshipIndex = objectId;
      const relationships = drawing && workbook.package.archive.get(relationshipItemName(drawingPart)) ? workbook.package.relationships(drawingPart) : undefined;
      while (relationships?.get(`chart${relationshipIndex}`)) relationshipIndex++;
      const relationshipId = `chart${relationshipIndex}`;
      if (!drawing) transaction.addPart(drawingPart, 'application/vnd.openxmlformats-officedocument.drawing+xml', document.originalBytes());
      transaction.addRelationship(drawingPart, { id: relationshipId, type: `${rel}/chart`, target: chartPart });
      content = `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${objectId}" name="Chart ${objectId}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(command.width)}" cy="${emu(command.height)}"/></xdr:xfrm><a:graphic><a:graphicData uri="${ns.chart}"><c:chart xmlns:c="${ns.chart}" r:id="${relationshipId}"/></a:graphicData></a:graphic></xdr:graphicFrame>`;
    } else {
      const extension = command.contentType === 'image/jpeg' ? 'jpg' : command.contentType.split('/')[1]!.replace('+xml', '');
      const imagePart = uniquePart('/xl/media/image', extension);
      const bytes = Uint8Array.from(atob(command.data), c => c.charCodeAt(0));
      if (!bytes.length) throw new Error('An image must contain data.');
      let relationshipIndex = objectId;
      const relationships = drawing && workbook.package.archive.get(relationshipItemName(drawingPart)) ? workbook.package.relationships(drawingPart) : undefined;
      while(relationships?.get(`image${relationshipIndex}`)) relationshipIndex++;
      const relationshipId = `image${relationshipIndex}`;
      transaction.addPart(imagePart, command.contentType, bytes);
      // A new drawing must exist before its relationships can be added.
      if (!drawing) transaction.addPart(drawingPart, 'application/vnd.openxmlformats-officedocument.drawing+xml', document.originalBytes());
      transaction.addRelationship(drawingPart, { id: relationshipId, type: `${rel}/image`, target: imagePart });
      content = `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${objectId}" name="Picture ${objectId}" descr="${escape(command.alt ?? '')}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>`;
    }
    editor.appendMarkup(document.root, anchorMarkup(command, content));
  } else {
    const anchor = anchors.find(a => {
      const element = document.element(a.elementId);
      const object = element && children(element).find(e => ['sp','pic','cxnSp','grpSp','graphicFrame'].includes(e.localName));
      const props = object && children(object).find(e => e.localName.startsWith('nv'));
      const identity = props && children(props).find(e => e.localName === 'cNvPr');
      return Number(identity?.attributes.find(a => a.localName === 'id')?.value) === command.objectId;
    });
    const element = anchor && document.element(anchor.elementId);
    if (!anchor || !element) throw new Error('Drawing object does not exist.');
    if(command.name === 'style-drawing') {
      const object = children(element).find(e=>e.localName==='sp'||e.localName==='cxnSp');
      const properties = object && children(object).find(e=>e.localName==='spPr');
      if(!properties) throw new Error('Select a shape to change its style.');
      const fillTypes = new Set(['solidFill','noFill','gradFill','pattFill','blipFill','grpFill']);
      const paint = (value:string) => { if(value==='none')return '<a:noFill/>'; if(!/^#[a-f\d]{6}$/i.test(value))throw new Error('Drawing colors must be #rrggbb or none.');return `<a:solidFill><a:srgbClr val="${value.slice(1)}"/></a:solidFill>`; };
      const line = children(properties).find(e=>e.localName==='ln');
      const lineAttrs=line?.attributes.filter(a=>!(a.localName==='w'&&!a.namespaceUri)&&a.qualified!=='xmlns:a').map(a=>`${a.qualified}="${escape(a.value)}"`).join(' ') ?? '';
      const linePaint=command.stroke===undefined?(line?children(line).filter(e=>fillTypes.has(e.localName)).map(raw).join(''):''):paint(command.stroke);
      const lineRest=line?children(line).filter(e=>!fillTypes.has(e.localName)).map(raw).join(''):'';
      const nextLine = command.stroke === undefined && command.strokeWidth === undefined ? (line ? raw(line) : '') : `<a:ln xmlns:a="${ns.drawing}" w="${emu(command.strokeWidth ?? Number(line?.attributes.find(a=>a.localName==='w')?.value ?? 9525)/9525)}" ${lineAttrs}>${linePaint}${lineRest}</a:ln>`;
      const geometryTypes=new Set(['xfrm','prstGeom','custGeom']);
      const geometry=children(properties).filter(e=>geometryTypes.has(e.localName)).map(raw).join('');
      const fill=command.fill===undefined?children(properties).filter(e=>fillTypes.has(e.localName)).map(raw).join(''):paint(command.fill);
      const rest=children(properties).filter(e=>!geometryTypes.has(e.localName)&&!fillTypes.has(e.localName)&&e.localName!=='ln').map(raw).join('');
      const propertyAttrs=properties.attributes.filter(a=>a.qualified!=='xmlns:a').map(a=>`${a.qualified}="${escape(a.value)}"`).join(' ');
      editor.replaceElementMarkup(properties, `<${properties.qualified} ${propertyAttrs} xmlns:a="${ns.drawing}">${geometry}${fill}${nextLine}${rest}</${properties.qualified}>`);
    } else if (command.name === 'delete-drawing') editor.removeElement(element);
    else if (command.name === 'order-drawing') {
      const index = anchors.indexOf(anchor);
      const targetIndex = command.action === 'front' ? anchors.length - 1 : command.action === 'back' ? 0 : Math.max(0, Math.min(anchors.length - 1, index + (command.action === 'forward' ? 1 : -1)));
      if (index === targetIndex) return artifact;
      const other = document.element(anchors[targetIndex]!.elementId)!;
      editor.removeElement(element);
      if (targetIndex < index) editor.insertMarkupBefore(other, raw(element));
      else insertAfter(other, raw(element));
    } else {
      const bounds = command.name === 'move-drawing' ? command : spreadsheetDrawingBounds(anchor, worksheet.rowGeometry(), worksheet.columnGeometry());
      const content = children(element).filter(e => ['sp', 'pic', 'cxnSp', 'grpSp', 'graphicFrame'].includes(e.localName)).map(raw).join('');
      if (command.name === 'duplicate-drawing') {
        const cloneEditor = beginLosslessXmlEdit(document);
        const renumber = (e: LosslessXmlElement) => {
          if(e.localName === 'cNvPr') {
            const id = e.attributes.find(a => a.localName === 'id' && !a.namespaceUri);
            if(id) cloneEditor.setAttribute(id, String(nextId++));
          }
          children(e).forEach(renumber);
        };
        renumber(element);
        const cloneDocument = parseLosslessXml(cloneEditor.commit().bytes);
        const cloneElement = cloneDocument.element(element.id)!;
        const clone = children(cloneElement).filter(e => ['sp','pic','cxnSp','grpSp','graphicFrame'].includes(e.localName)).map(e=>cloneDocument.source.slice(e.span.start,e.span.end)).join('');
        insertAfter(element, anchorMarkup({ ...bounds, x: bounds.x + 16, y: bounds.y + 16 }, clone, element));
      } else editor.replaceElementMarkup(element, anchorMarkup(bounds, content, element));
    }
  }
  const bytes = editor.commit().bytes;
  if (!drawing) {
    if (command.name !== 'insert-image' && command.name !== 'insert-chart') transaction.addPart(drawingPart, 'application/vnd.openxmlformats-officedocument.drawing+xml', bytes);
    else transaction.replacePart(drawingPart, bytes);
    const rels = workbook.package.archive.get(relationshipItemName(sheet.partName)) ? workbook.package.relationships(sheet.partName) : undefined;
    let index = 1;
    while (rels?.get(`drawing${index}`)) index++;
    const rid = `drawing${index}`;
    transaction.addRelationship(sheet.partName, { id: rid, type: `${rel}/drawing`, target: drawingPart });
    const sheetEditor = beginLosslessXmlEdit(worksheet.document);
    const following = children(worksheet.document.root).find(e => ['legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'].includes(e.localName));
    const markup = `<drawing xmlns="${ns.spreadsheet}" xmlns:r="${rel}" r:id="${rid}"/>`;
    if (following) sheetEditor.insertMarkupBefore(following, markup); else sheetEditor.appendMarkup(worksheet.document.root, markup);
    transaction.replacePart(sheet.partName, sheetEditor.commit().bytes);
  } else transaction.replacePart(drawingPart, bytes);
  const next = openSpreadsheet(transaction.commitPackage());
  return new SpreadsheetArtifact(next, next.sheet(artifact.activeSheet.sheetId)!);
}

export function isSpreadsheetDrawingCommand(command: { name: string }): command is SpreadsheetDrawingCommand {
  return spreadsheetDrawingCommand.options.some(option => option.shape.name.value === command.name);
}
