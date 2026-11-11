import { formatOoxmlNumber } from '@tumblerjs/ooxml';
import type { ChartSceneOptions } from './scene-marks.ts';

let defaultFormat: Intl.NumberFormat | undefined;

/** Use the host formatter consistently across Cartesian, combination and XY axes. */
export function chartTickLabel(value: number, format: string | undefined, options: ChartSceneOptions): string {
  return options.formatNumber?.(value, format) ?? (format && format.toLowerCase() !== "general" ? formatOoxmlNumber(value, format, options.dateSystem ?? "1900", "en-US") : (defaultFormat ??= new Intl.NumberFormat('en-US', { maximumSignificantDigits: 21 })).format(value));
}
