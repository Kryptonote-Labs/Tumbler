import { multiply, shapeMatrix } from './geometry.ts';
import { nativePresetGeometry, resizeDrawingGeometry } from './drawing-geometry.ts';
import type { PresentationCommand } from './commands.ts';
import type { SlideObject, SlideText } from './model.ts';
import type { DrawingGradient } from './appearance.ts';
import type { GradientFill } from './gradient-authoring.ts';

export function nativeColour(value: string, opacity = 1) {
  return /^#[a-f0-9]{6}$/i.test(value)
    ? `rgba(${parseInt(value.slice(1, 3), 16)},${parseInt(value.slice(3, 5), 16)},${parseInt(value.slice(5, 7), 16)},${opacity})`
    : value;
}

export function nativeGradient(fill: GradientFill): DrawingGradient {
  return {
    kind: fill.type,
    angle: fill.angle ?? 0,
    scaled: fill.scaled ?? true,
    center: fill.center ?? [0.5, 0.5],
    stops: [...fill.stops]
      .sort((a, b) => a.offset - b.offset)
      .map((s) => ({
        offset: s.offset,
        color:
          s.opacity === undefined || s.opacity === 1
            ? nativeColour(s.color)
            : `rgba(${parseInt(s.color.slice(1, 3), 16)},${parseInt(s.color.slice(3, 5), 16)},${parseInt(s.color.slice(5, 7), 16)},${s.opacity})`,
      })),
  };
}

/** Coordinates stay native; package markup is reconciled only when exported. */
export function moveNativeObject(
  object: SlideObject,
  command: Extract<PresentationCommand, { name: 'update-object' }>,
): SlideObject {
  for (const number of [command.x, command.y, command.width, command.height])
    if (!Number.isFinite(number) || Math.abs(number * 9525) > 2147483647)
      throw new RangeError('Object bounds exceed DrawingML coordinates.');
  if (
    object.geometry === 'line'
      ? command.width + command.height <= 0
      : command.width <= 0 || command.height <= 0
  )
    throw new RangeError('Object dimensions must be positive.');
  if (command.rotation !== undefined && !Number.isFinite(command.rotation))
    throw new RangeError('Rotation must be finite.');
  const transform = {
    ...object.transform,
    x: Math.round(command.x * 9525) / 9525,
    y: Math.round(command.y * 9525) / 9525,
    width: Math.round(command.width * 9525) / 9525,
    height: Math.round(command.height * 9525) / 9525,
    rotation:
      Math.round(((((command.rotation ?? object.transform.rotation) % 360) + 360) % 360) * 60000) /
      60000,
  };
  const sx = transform.width / object.transform.width,
    sy = transform.height / object.transform.height;
  const ink = object.ink
    ? { ...object.ink, sampleMatrix: multiply([sx, 0, 0, sy, 0, 0], object.ink.sampleMatrix) }
    : undefined;
  return {
    ...object,
    transform,
    matrix: multiply(object.parentMatrix ?? [1, 0, 0, 1, 0, 0], shapeMatrix(transform)),
    table: object.table,
    ...(ink ? { ink } : {}),
    cornerRadius:
      object.geometry === 'roundRect'
        ? (Math.min(transform.width, transform.height) *
            Math.min(50000, Math.max(0, object.drawingGeometry?.adjustments.adj ?? 16667))) /
          100000
        : 0,
    drawingGeometry: object.drawingGeometry
      ? resizeDrawingGeometry(object.drawingGeometry, transform.width, transform.height)
      : undefined,
  };
}

export function nativeObjectText(text = '', fontSize = 24, centered = false): SlideText {
  const run = {
    text: '',
    fontFamily: 'Aptos',
    fontSize: (fontSize * 4) / 3,
    color: '#222222',
    bold: false,
    italic: false,
    underline: false,
  };
  return {
    editable: true,
    autoFit: 'none',
    paragraphs: text.split('\n').map((text) => ({
      runs: text ? [{ ...run, text }] : [],
      endRun: run,
      align: centered ? 'center' : 'left',
      bullet: '',
      marginLeft: 0,
      indent: 0,
      before: 0,
      after: 0,
      lineHeight: 1,
    })),
    inset: [9.6, 4.8, 9.6, 4.8],
    anchor: centered ? 'center' : 'top',
    wrap: true,
    textElementId: undefined,
  };
}

export function insertNativeObject(
  command: Extract<PresentationCommand, { name: 'insert-object' }>,
  key: string,
  shapeId: string,
  sourcePart: string,
): SlideObject {
  const { bounds, input } = { bounds: command.bounds, input: command.object };
  const shape = input.kind === 'shape' ? input : undefined;
  const object: SlideObject = {
    key,
    shapeId,
    sourcePart,
    elementId: -1,
    layer: 'slide',
    name:
      input.kind === 'shape'
        ? `${input.geometry ? 'Shape' : 'Text Box'} ${shapeId}`
        : input.kind === 'image'
          ? `Picture ${shapeId}`
          : `Table ${shapeId}`,
    kind: input.kind === 'image' ? 'picture' : input.kind,
    geometry: shape?.geometry ?? 'rect',
    drawingGeometry: nativePresetGeometry(
      shape?.geometry ?? 'rect',
      100,
      100,
      shape?.cornerRadius === undefined
        ? []
        : [
            [
              'adj',
              `val ${Math.round(Math.min(0.5, shape.cornerRadius / Math.min(bounds.width, bounds.height)) * 100000)}`,
            ],
          ],
    ),
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, flipH: false, flipV: false },
    matrix: [1, 0, 0, 1, 0, 0],
    fill: nativeColour(
      shape?.fill ?? (shape?.geometry && shape.geometry !== 'line' ? '#4472C4' : 'none'),
    ),
    gradient: undefined,
    shadow: undefined,
    strokeDash: 'solid',
    strokeCap: 'butt',
    head: undefined,
    tail: undefined,
    stroke: nativeColour(shape?.stroke ?? (shape?.geometry === 'line' ? '#4472C4' : 'none')),
    strokeWidth: shape?.stroke && shape.stroke !== 'none' ? 1.3333333333333333 : 0,
    cornerRadius: shape?.cornerRadius ?? 0,
    text: shape
      ? nativeObjectText(shape.text, shape.fontSize, !!shape.geometry && shape.geometry !== 'line')
      : undefined,
    image: undefined,
    chart: undefined,
    table: undefined,
    movable: true,
    textEditable: !!shape,
    restriction: undefined,
    transformElementId: undefined,
  };
  let result = moveNativeObject(object, {
    name: 'update-object',
    slideId: command.slideId,
    objectKey: key,
    ...bounds,
  });
  if (input.kind === 'image') {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.data) || input.data.length % 4)
      throw new TypeError('Image data must be base64.');
    const bytes = Uint8Array.from(atob(input.data), (c) => c.charCodeAt(0));
    if (
      input.contentType === 'image/png'
        ? ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
        : !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    )
      throw new TypeError('Image bytes do not match the content type.');
    result = { ...result, image: { bytes, contentType: input.contentType, crop: [0, 0, 0, 0] } };
  }
  if (input.kind === 'table') {
    const cells = Array.from({ length: input.rows * input.columns }, (_, i) => {
      const row = Math.floor(i / input.columns),
        column = i % input.columns;
      return {
        elementId: -i - 1,
        row,
        column,
        rowSpan: 1,
        columnSpan: 1,
        x: (column * bounds.width) / input.columns,
        y: (row * bounds.height) / input.rows,
        width: bounds.width / input.columns,
        height: bounds.height / input.rows,
        fill: nativeColour(row === 0 ? '#E8EEF7' : '#FFFFFF'),
        text: nativeObjectText('', 18),
        borders: ['left', 'right', 'top', 'bottom'].map(() => ({
          color: '#98A5B5',
          width: 1.3333333333333333,
          dash: 'solid',
        })),
      };
    });
    result = {
      ...result,
      table: {
        elementId: -1,
        width: bounds.width,
        height: bounds.height,
        columnWidths: Array.from({ length: input.columns }, () => bounds.width / input.columns),
        rowHeights: Array.from({ length: input.rows }, () => bounds.height / input.rows),
        cells,
      },
    };
  }
  return result;
}
