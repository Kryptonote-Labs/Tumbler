import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import { attribute, children } from './xml.ts';

export const INK_RASTER_OPERATIONS = ['black', 'copyPen', 'maskNotPen', 'maskPenNot', 'maskPen', 'mergeNotPen', 'mergePen', 'mergePenNot', 'noOperation', 'not', 'notCopyPen', 'notMaskPen', 'notMergePen', 'notXOrPen', 'white', 'xOrPen'] as const;
export type InkRasterOperation = typeof INK_RASTER_OPERATIONS[number];
export interface InkBrush {
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly color: string;
  readonly transparency: number;
  readonly tip: 'ellipse' | 'rectangle';
  readonly rasterOp: InkRasterOperation;
  readonly antiAliased: boolean;
  readonly fitToCurve: boolean;
  readonly ignorePressure: boolean;
}

export function lengthInPoints(value: number, units: string): number | undefined {
  const scale = { cm: 72 / 2.54, mm: 72 / 25.4, in: 72, pt: 1 }[units];
  return scale === undefined ? undefined : value * scale;
}

/** MS-ODRAWXML §2.1.4 specifies defaults even for invalid property values. */
export function readOfficeBrush(element: LosslessXmlElement): InkBrush {
  const props = new Map(children(element, 'brushProperty').map(property => [attribute(property, 'name'), property]));
  const plain = (name: string) => {
    const prop = props.get(name);
    return prop && attribute(prop, 'units') === undefined ? attribute(prop, 'value') : undefined;
  };
  const dimension = (name: string, fallback: number) => {
    const prop = props.get(name);
    const raw = prop && attribute(prop, 'value');
    const value = raw && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? lengthInPoints(Number(raw), attribute(prop!, 'units') ?? '') : undefined;
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback * 72 / 2.54;
  };
  const boolean = (name: string, fallback: boolean) => {
    const value = plain(name);
    return value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : fallback;
  };
  const transparency = plain('transparency');
  const color = plain('color');
  const rasterOp = INK_RASTER_OPERATIONS.find(value => value === plain('rasterOp')) ?? 'copyPen';
  return {
    widthPoints: dimension('width', .053), heightPoints: dimension('height', .001),
    color: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000',
    transparency: transparency && /^[+-]?\d+$/.test(transparency) && Number(transparency) >= 0 && Number(transparency) <= 255 ? Number(transparency) : 0,
    tip: plain('tip') === 'rectangle' ? 'rectangle' : 'ellipse', rasterOp,
    antiAliased: boolean('antiAliased', true), fitToCurve: boolean('fitToCurve', false), ignorePressure: boolean('ignorePressure', false),
  };
}

/** Apply MS-ODRAWXML §2.1.4 operands to RGB bytes; alpha composition is the caller's job. */
export function applyInkRasterOperation(operation: InkRasterOperation, pen: number, destination: number): number {
  const p = pen & 0xffffff, d = destination & 0xffffff;
  // The Office profile's two mask-negation descriptions differ from Windows ROP2 names.
  const operations: Record<InkRasterOperation, number> = {
    black: 0, copyPen: p, maskNotPen: p & ~d, maskPenNot: ~p & d, maskPen: p & d,
    mergeNotPen: ~p | d, mergePen: p | d, mergePenNot: p | ~d, noOperation: d,
    not: ~d, notCopyPen: ~p, notMaskPen: ~(p & d), notMergePen: ~(p | d),
    notXOrPen: ~(p ^ d), white: 0xffffff, xOrPen: p ^ d,
  };
  return operations[operation] & 0xffffff;
}
