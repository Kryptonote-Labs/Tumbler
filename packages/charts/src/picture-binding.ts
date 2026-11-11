import { PartName, type OpcPackage } from '@tumblerjs/opc';
import { chartPartRelationships, type ChartResources } from './resources.ts';
import { chartBase64ToBytes } from './base64.ts';
import { parseOoxmlChart } from './parser.ts';
import type { ChartModel } from './model.ts';
import type { ChartImage } from './picture-parser.ts';
const portableImages = new WeakMap<ChartResources, Readonly<Record<string, ChartImage>>>();

export function bindChartImages(model: ChartModel, images: Readonly<Record<string, ChartImage>> | undefined): ChartModel {
  if (!images || !Object.keys(images).length) return model;
  const bound = Object.freeze(Object.fromEntries(Object.entries(images).map(([id, image]) => [id, Object.freeze({ ...image })])));
  return Object.freeze({ ...model, images: bound, ...(model.status === 'supported' && model.plots ? { plots: Object.freeze(model.plots.map(plot => Object.freeze({ ...plot, images: bound }))) } : {}) });
}

export function bindChartResourceImages(model: ChartModel, resources: ChartResources | undefined): ChartModel {
  if (!resources) return model;
  const cached = portableImages.get(resources);
  if (cached) return bindChartImages(model, cached);
  const parts = new Map(resources.parts.map(part => [part.key, part]));
  const images = Object.fromEntries(resources.relationships.flatMap(item => {
    const part = item.targetMode !== 'External' && item.type.endsWith('/image') ? parts.get(item.target) : undefined;
    return part && part.contentType.startsWith('image/') ? [[item.id, { bytes: chartBase64ToBytes(part.data), contentType: part.contentType }]] : [];
  }));
  portableImages.set(resources, images);
  return bindChartImages(model, images);
}

/** Resolve embedded image relationships locally. External image links remain source-only. */
export function readChartModel(pkg: OpcPackage, partName: PartName | string, conformance: 'strict' | 'transitional'): ChartModel {
  const name = typeof partName === 'string' ? PartName.parse(partName) : partName, part = pkg.getPart(name);
  if (!part) throw new TypeError('Chart part is missing.');
  const model = parseOoxmlChart(pkg.readPart(part), conformance);
  const images = Object.fromEntries(chartPartRelationships(pkg, name).items.flatMap(item => {
    const part = item.targetMode === 'Internal' && item.type.endsWith('/image') ? pkg.getPart(item.targetPartName) : undefined;
    return part && part.contentType.startsWith('image/') ? [[item.id, { bytes: pkg.readPart(part), contentType: part.contentType }]] : [];
  }));
  return bindChartImages(model, images);
}
