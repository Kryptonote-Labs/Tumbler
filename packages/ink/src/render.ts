import type { OfficeInkDocument, InkDiagnostic } from './document.ts';
import { createOfficeInkScene, type InkBounds, type InkShape, type InkSvgOptions, type InkSceneResult } from './scene.ts';
export type { InkBounds, InkSvgOptions } from './scene.ts';
export type InkSvgResult =
  | { readonly supported: true; readonly svg: string; readonly bounds: InkBounds; readonly traceBounds: InkBounds }
  | { readonly supported: false; readonly diagnostics: readonly InkDiagnostic[] };

/** Native vector rendering. Destination-dependent raster ops use renderOfficeInkRaster with the actual backdrop. */
export function renderOfficeInkSvg(document: OfficeInkDocument, options: InkSvgOptions = {}): InkSvgResult {
  const scene = createOfficeInkScene(document, options);
  if (!scene.supported) return scene;
  return renderInkSceneSvg(scene);
}
export function renderInkSceneSvg(scene: Extract<InkSceneResult, { supported: true }>): InkSvgResult {
  const unsupported = scene.strokes.filter(s => !['copyPen', 'noOperation', 'black', 'white', 'notCopyPen'].includes(s.brush.rasterOp));
  if (unsupported.length) return { supported: false, diagnostics: unsupported.map(s => ({ elementId: s.elementId, code: 'rendering', message: `${s.brush.rasterOp} requires raster composition with the destination.` })) };
  const paths = scene.strokes.map(({ shapes, brush }) => {
    const color = brush.rasterOp === 'black' ? '#000000' : brush.rasterOp === 'white' ? '#ffffff'
      : brush.rasterOp === 'notCopyPen' ? '#' + (0xffffff ^ Number.parseInt(brush.color.slice(1), 16)).toString(16).padStart(6, '0') : brush.color;
    return `<g fill="${color}" opacity="${1 - brush.transparency / 255}"${brush.antiAliased ? '' : ' shape-rendering="crispEdges"'}>${shapes.map(shapeSvg).join('')}</g>`;
  });
  const { bounds, traceBounds } = scene;
  return { supported: true, bounds, traceBounds, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}pt" height="${bounds.height}pt" viewBox="${bounds.x} ${bounds.y} ${bounds.width || 1} ${bounds.height || 1}">${paths.join('')}</svg>` };
}
function shapeSvg(shape: InkShape) {
  if (shape.kind === 'polygon') return `<polygon points="${shape.points.map(p => `${p.x},${p.y}`).join(' ')}"/>`;
  return `<ellipse cx="${shape.x}" cy="${shape.y}" rx="${shape.rx}" ry="${shape.ry}"${shape.angle ? ` transform="rotate(${shape.angle * 180 / Math.PI} ${shape.x} ${shape.y})"` : ''}/>`;
}
