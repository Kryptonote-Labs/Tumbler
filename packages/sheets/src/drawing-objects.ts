import { OOXML_NAMESPACES, resolveDrawingGeometry, resolveDrawingColor, THEME_COLOR_SLOTS, type DrawingGeometry, type LosslessXmlElement } from '@tumblerjs/ooxml';
import type { SpreadsheetDrawing, SpreadsheetDrawingAnchor } from './drawings.ts';
import { readSpreadsheetStyles } from './styles.ts';
import { spreadsheetDrawingBounds } from './drawings.ts';
import type { SpreadsheetWorksheet } from './worksheet.ts';
import type { SpreadsheetWorkbook } from './workbook.ts';

/** Read-only drawing projection. Source XML and relationships remain in the package. */
export interface SpreadsheetDrawingObject {
  readonly elementId: number;
  readonly objectId: number;
  readonly name: string;
  readonly kind: 'shape' | 'picture' | 'group';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly flipX: boolean;
  readonly flipY: boolean;
  readonly geometry: DrawingGeometry | undefined;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly text: string;
  readonly image: { readonly bytes: Uint8Array; readonly contentType: string } | undefined;
  readonly children: readonly SpreadsheetDrawingObject[];
  readonly groupTransform: string;
}
export interface SpreadsheetDrawingObjectFrame {
  readonly anchor: SpreadsheetDrawingAnchor;
  readonly object: SpreadsheetDrawingObject;
}

export function readSpreadsheetDrawingObjects(workbook: SpreadsheetWorkbook, drawing: SpreadsheetDrawing, worksheet?: SpreadsheetWorksheet): readonly SpreadsheetDrawingObjectFrame[] {
  const ns = OOXML_NAMESPACES[workbook.conformance];
  const relNs = workbook.conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const children = (e: LosslessXmlElement | undefined, name?: string) => e?.children.filter((n): n is LosslessXmlElement => n.kind === 'element' && (n.namespaceUri === ns.drawing || n.namespaceUri === ns.spreadsheetDrawing) && (name === undefined || n.localName === name)) ?? [];
  const child = (e: LosslessXmlElement | undefined, name: string) => children(e, name)[0];
  const attr = (e: LosslessXmlElement | undefined, name: string) => e?.attributes.find(a => a.localName === name && a.namespaceUri === '')?.value;
  const number = (e: LosslessXmlElement | undefined, name: string, fallback = 0) => { const n = Number(attr(e, name) ?? fallback); return Number.isFinite(n) ? n : fallback; };
  const styles = worksheet?.styles ?? readSpreadsheetStyles(workbook);
  const scheme = (name: string) => {
    const aliases: Readonly<Record<string, string>> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    const slot = THEME_COLOR_SLOTS.find(slot => slot === (aliases[name] ?? name));
    return slot ? styles.theme?.color(slot) : undefined;
  };
  const color = (e: LosslessXmlElement | undefined, reference?: LosslessXmlElement) => {
    if (child(e, 'noFill')) return 'none';
    return resolveDrawingColor(child(e, 'solidFill'), scheme) ?? resolveDrawingColor(reference, scheme) ?? 'none';
  };
  const text = (e: LosslessXmlElement): string => e.children.map(n => n.kind === 'text' || n.kind === 'cdata' ? n.value : n.kind === 'element' ? text(n) : '').join('');
  function object(e: LosslessXmlElement, fallback?: { width: number; height: number }): SpreadsheetDrawingObject | undefined {
    if (!['sp', 'pic', 'cxnSp', 'grpSp'].includes(e.localName)) return;
    const group = e.localName === 'grpSp';
    const properties = child(e, group ? 'grpSpPr' : 'spPr');
    const transform = child(properties, 'xfrm');
    const offset = child(transform, 'off'), extent = child(transform, 'ext');
    const width = extent ? number(extent, 'cx') / 9525 : fallback?.width ?? 0, height = extent ? number(extent, 'cy') / 9525 : fallback?.height ?? 0;
    const nonvisual = children(e).find(n => n.localName.startsWith('nv'));
    const geometry = child(properties, 'prstGeom') ?? child(properties, 'custGeom');
    const line = child(properties, 'ln');
    const body = child(e, 'txBody');
    let image: SpreadsheetDrawingObject['image'];
    const blip = child(child(e, 'blipFill'), 'blip');
    const rid = blip?.attributes.find(a => a.namespaceUri === relNs && a.localName === 'embed')?.value;
    if (rid) {
      const relationship = workbook.package.relationships(drawing.partName).get(rid);
      if (relationship?.targetMode === 'Internal' && relationship.type === `${relNs}/image`) {
        const part = workbook.package.getPart(relationship.targetPartName);
        if (part?.contentType.startsWith('image/')) image = { bytes: workbook.package.readPart(part), contentType: part.contentType };
      }
    }
    const chOff = child(transform, 'chOff'), chExt = child(transform, 'chExt');
    const sx = width / (number(chExt, 'cx', 1) / 9525), sy = height / (number(chExt, 'cy', 1) / 9525);
    return {
      elementId: e.id, objectId: number(child(nonvisual, 'cNvPr'), 'id'), name: attr(child(nonvisual, 'cNvPr'), 'name') ?? e.localName,
      kind: group ? 'group' : e.localName === 'pic' ? 'picture' : 'shape',
      x: number(offset, 'x') / 9525, y: number(offset, 'y') / 9525, width, height,
      rotation: number(transform, 'rot') / 60000, flipX: attr(transform, 'flipH') === '1', flipY: attr(transform, 'flipV') === '1',
      geometry: resolveDrawingGeometry(attr(geometry, 'prst') ?? (e.localName === 'cxnSp' ? 'line' : 'rect'), geometry, width, height),
      fill: color(properties, child(child(e, 'style'), 'fillRef')), stroke: color(line, child(child(e, 'style'), 'lnRef')), strokeWidth: Math.max(1, number(line, 'w', 9525) / 9525),
      text: body ? children(body, 'p').map(text).join('\n') : '', image,
      children: group ? children(e).flatMap(e => { const result = object(e); return result ? [result] : []; }) : [],
      groupTransform: `scale(${Number.isFinite(sx) ? sx : 1} ${Number.isFinite(sy) ? sy : 1}) translate(${-number(chOff, 'x') / 9525} ${-number(chOff, 'y') / 9525})`,
    };
  }
  const rows = worksheet?.rowGeometry();
  const columns = worksheet?.columnGeometry();
  return drawing.anchors.flatMap(anchor => {
    const e = drawing.document.element(anchor.elementId);
    return children(e).flatMap(e => { const bounds = rows && columns ? spreadsheetDrawingBounds(anchor, rows, columns) : anchor.kind !== 'two-cell' ? { width: anchor.widthEmu / 9525, height: anchor.heightEmu / 9525 } : undefined; const result = object(e, bounds); return result ? [{ anchor, object: result }] : []; });
  });
}
