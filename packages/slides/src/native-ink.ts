import {
  authoredOfficeInkXml,
  createOfficeInkScene,
  renderOfficeInkRaster,
  encodeInkPng,
  type OfficeInkDocument,
} from '@tumblerjs/ink';
import { LosslessXmlDocument } from '@tumblerjs/ooxml';
import { insertNativeObject } from './native-shape.ts';
import type { PresentationCommand } from './commands.ts';
import type { SlideObject } from './model.ts';

/** Calibrated samples compile directly to the shared ink engine; no slide markup is parsed. */
export function insertNativeInk(
  input: Extract<PresentationCommand, { name: 'insert-ink' }>,
  key: string,
  part: string,
): SlideObject {
  const stroke = {
    points: input.points.map(([x, y, p]) => [x * 0.75, y * 0.75, p] as const),
    color: input.color,
    size: input.size,
    highlighter: input.highlighter ?? false,
  };
  const document: OfficeInkDocument = {
    source: new LosslessXmlDocument(new TextEncoder().encode(authoredOfficeInkXml([stroke]))),
    recognition: [],
    diagnostics: [],
    traces: [
      {
        elementId: 0,
        id: 'stroke0',
        channels: [
          { name: 'X', type: 'integer', units: 'cm', resolution: 1000, resolutionUnits: '1/cm' },
          { name: 'Y', type: 'integer', units: 'cm', resolution: 1000, resolutionUnits: '1/cm' },
          { name: 'F', type: 'integer', units: 'dev', min: 0, max: 1023 },
        ],
        points: stroke.points.map(([x, y, p]) => [
          Math.round((x * 2540) / 72),
          Math.round((y * 2540) / 72),
          Math.round(p * 1023),
        ]),
        brush: {
          widthPoints: input.size,
          heightPoints: input.size,
          color: input.color,
          transparency: input.highlighter ? 128 : 0,
          tip: input.highlighter ? 'rectangle' : 'ellipse',
          rasterOp: 'copyPen',
          antiAliased: true,
          fitToCurve: false,
          ignorePressure: !!input.highlighter,
        },
      },
    ],
  };
  const options = { renderingProfile: 'word', maxPoints: Infinity } as const;
  const scene = createOfficeInkScene(document, options);
  if (!scene.supported) throw new Error('Unsupported ink samples.');
  const bounds = scene.bounds,
    scale = Math.min(4 / 3, Math.sqrt(1_000_000 / Math.max(1, bounds.width * bounds.height)));
  const raster = renderOfficeInkRaster(document, {
    ...options,
    scale,
    bounds,
    maxPixels: Infinity,
  });
  if (!raster.supported) throw new Error('Cannot render ink.');
  const object = insertNativeObject(
    {
      name: 'insert-object',
      slideId: input.slideId,
      bounds: {
        x: bounds.x / 0.75,
        y: bounds.y / 0.75,
        width: Math.max(bounds.width / 0.75, 1 / 9525),
        height: Math.max(bounds.height / 0.75, 1 / 9525),
      },
      object: { kind: 'shape' },
    },
    key,
    key,
    part,
  );
  const projected = createOfficeInkScene(document, {
    ...options,
    sampleTransform: [1, 0, 0, 1, -bounds.x, -bounds.y],
  });
  if (!projected.supported) throw new Error('Cannot project ink.');
  return {
    ...object,
    kind: 'picture',
    name: `Ink ${key}`,
    text: undefined,
    textEditable: false,
    ink: {
      document,
      scene: projected,
      partName: `/native/${key}.ink`,
      sampleMatrix: [4 / 3, 0, 0, 4 / 3, (-bounds.x * 4) / 3, (-bounds.y * 4) / 3],
    },
    image: {
      bytes: encodeInkPng(raster.width, raster.height, raster.data),
      contentType: 'image/png',
      crop: [0, 0, 0, 0],
    },
  };
}
