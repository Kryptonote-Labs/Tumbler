import { chartTypeThumbnails } from './chart-type-thumbnails.ts';
import type { ChartTypeChange } from './chart-properties.ts';

/** Static renderer-generated artwork; no OOXML parsing or chart layout when the gallery opens. */
export function chartTypePreview(change: ChartTypeChange): string | undefined {
  return chartTypeThumbnails[JSON.stringify(change, Object.keys(change).sort())];
}
