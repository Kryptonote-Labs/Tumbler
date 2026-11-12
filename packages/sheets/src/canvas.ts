import { chartScenePictures, paintChartScene, type ChartCanvasContext } from '@tumblerjs/charts';
import { paintDrawingPicture, type DrawingPictureCanvasContext, type DrawingPictureFill } from '@tumblerjs/ooxml';
import { paintSpreadsheetCell, wrapSpreadsheetText, type SpreadsheetCellCanvasContext, type SpreadsheetPaintColours } from './canvas-cell.ts';
import type { SpreadsheetDrawingObject } from './drawing-objects.ts';
import { formatCellReference } from './references.ts';
import type { SpreadsheetViewportLayout } from './viewport.ts';

/** Portable Canvas 2D subset for worksheet viewports, satisfied by browser and server canvases. */
export type SpreadsheetCanvasContext<Path, Image> = SpreadsheetCellCanvasContext & ChartCanvasContext<Path, Image> & DrawingPictureCanvasContext<Path, Image> & {
  scale(x: number, y: number): void;
};

/** Embedded bytes a host decodes before painting; pictures and chart fills are both of this shape. */
export interface SpreadsheetImageSource {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}
export interface SpreadsheetDecodedImage<Image> {
  readonly image: Image;
  readonly width: number;
  readonly height: number;
}

export interface SpreadsheetViewportPaintOptions<Path, Image> {
  readonly scale?: number;
  readonly path: (d: string) => Path;
  /** Returns images decoded from `spreadsheetViewportImages`; missing images stay unpainted. */
  readonly image?: (source: SpreadsheetImageSource) => SpreadsheetDecodedImage<Image> | undefined;
  readonly prepareFont?: (family: string) => string;
  readonly colours?: Partial<SpreadsheetPaintColours & { readonly heading: string; readonly headingText: string }>;
}

/** Every embedded image in a layout, by identity, so hosts can decode them before painting. */
export function spreadsheetViewportImages(layout: SpreadsheetViewportLayout): readonly SpreadsheetImageSource[] {
  const images: SpreadsheetImageSource[] = [];
  const visit = (object: SpreadsheetDrawingObject) => {
    if (object.image) images.push(object.image);
    object.children.forEach(visit);
  };
  for (const drawing of layout.drawings) {
    if (drawing.kind === 'object') visit(drawing.object);
    else images.push(...chartScenePictures(drawing.scene));
  }
  return images;
}

/** Paints a laid-out worksheet viewport. Hosts own canvas creation and encoding. */
export function paintSpreadsheetViewport<Path, Image>(
  context: SpreadsheetCanvasContext<Path, Image>,
  layout: SpreadsheetViewportLayout,
  options: SpreadsheetViewportPaintOptions<Path, Image>,
) {
  const colours = {
    background: '#ffffff',
    foreground: '#111111',
    gridline: '#d9ded9',
    selection: 'transparent',
    heading: '#f4f4f5',
    headingText: '#52525b',
    ...options.colours,
  };
  const { rowHeaderWidth: left, columnHeaderHeight: top } = layout;
  context.save();
  context.scale(options.scale ?? 1, options.scale ?? 1);
  context.fillStyle = colours.background;
  context.fillRect(0, 0, layout.width, layout.height);

  context.save();
  context.beginPath();
  context.rect(left, top, layout.width - left, layout.height - top);
  context.clip();
  for (const phase of ['background', 'text'] as const)
    for (const cell of layout.cells) {
      context.save();
      if (cell.clip) {
        context.beginPath();
        context.rect(cell.clip.x, cell.clip.y, cell.clip.width, cell.clip.height);
        context.clip();
      }
      paintSpreadsheetCell(context, cell.paint, cell.frame, colours, layout.gridlines, phase, { opaque: true, ...(options.prepareFont ? { prepareFont: options.prepareFont } : {}) });
      context.restore();
    }
  context.restore();

  if (left || top) {
    context.save();
    context.fillStyle = colours.heading;
    context.fillRect(0, 0, layout.width, top);
    context.fillRect(0, 0, left, layout.height);
    context.strokeStyle = colours.gridline;
    context.lineWidth = 1;
    context.setLineDash([]);
    context.font = `12px ${JSON.stringify(options.prepareFont?.('Inter') ?? 'Inter')},sans-serif`;
    context.fillStyle = colours.headingText;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (const column of layout.columns) {
      context.fillText(formatCellReference({ row: 1, column: column.index }).replace(/\d+$/, ''), column.start + column.size / 2, top / 2);
      line(context, column.start + column.size - 0.5, 0, column.start + column.size - 0.5, top);
    }
    for (const row of layout.rows) {
      context.fillText(String(row.index), left / 2, row.start + row.size / 2);
      line(context, 0, row.start + row.size - 0.5, left, row.start + row.size - 0.5);
    }
    line(context, 0, top - 0.5, layout.width, top - 0.5);
    line(context, left - 0.5, 0, left - 0.5, layout.height);
    context.restore();
  }

  for (const drawing of layout.drawings) {
    const { bounds, clip } = drawing;
    context.save();
    context.beginPath();
    context.rect(clip.x, clip.y, clip.width, clip.height);
    context.clip();
    context.translate(bounds.x, bounds.y);
    if (drawing.kind === 'chart')
      paintChartScene(context, drawing.scene, options.path, {
        image: options.image,
        picture: (fill, width, height) => {
          const decoded = options.image?.(fill);
          if (decoded) paintDrawingPicture(context, fill, width, height, decoded);
        },
      });
    else {
      const object = drawing.object;
      context.scale(bounds.width / Math.max(1, object.width), bounds.height / Math.max(1, object.height));
      paintObject(context, object, true, options);
    }
    context.restore();
  }
  context.restore();
}

function line(context: SpreadsheetCellCanvasContext, x1: number, y1: number, x2: number, y2: number) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

const fullPicture = { crop: [0, 0, 0, 0] } as const;

/** Mirrors the editor's SVG drawing objects: geometry paths, pictures, groups and plain text. */
function paintObject<Path, Image>(context: SpreadsheetCanvasContext<Path, Image>, item: SpreadsheetDrawingObject, root: boolean, options: SpreadsheetViewportPaintOptions<Path, Image>) {
  const { width, height } = item;
  context.save();
  if (!root) context.translate(item.x, item.y);
  context.translate(width / 2, height / 2);
  context.rotate((item.rotation * Math.PI) / 180);
  context.translate(-width / 2, -height / 2);
  context.translate(item.flipX ? width : 0, item.flipY ? height : 0);
  context.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
  if (item.kind === 'group') {
    context.scale(item.groupChild.scaleX, item.groupChild.scaleY);
    context.translate(-item.groupChild.x, -item.groupChild.y);
    for (const child of item.children) paintObject(context, child, false, options);
  } else if (item.kind === 'picture') {
    const decoded = item.image && options.image?.(item.image);
    if (item.image && decoded) paintDrawingPicture(context, { ...item.image, ...fullPicture } satisfies DrawingPictureFill, width, height, decoded);
  } else {
    for (const path of item.geometry?.paths ?? []) {
      const shape = options.path(path.d);
      if (path.fill !== 'none' && item.fill !== 'none') {
        context.fillStyle = item.fill;
        context.fill(shape);
      }
      if (path.stroke && item.stroke !== 'none') {
        context.strokeStyle = item.stroke;
        context.lineWidth = item.strokeWidth;
        context.lineJoin = 'round';
        context.setLineDash([]);
        context.stroke(shape);
      }
    }
    if (item.text) {
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();
      context.font = '16px sans-serif';
      context.fillStyle = '#111111';
      context.textAlign = 'left';
      context.textBaseline = 'top';
      for (const [index, text] of wrapSpreadsheetText(context, item.text, width).entries()) context.fillText(text, 0, index * 20);
    }
  }
  context.restore();
}
