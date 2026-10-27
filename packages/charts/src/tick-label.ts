import type { ChartSceneOptions } from './scene-marks.ts';

let defaultFormat: Intl.NumberFormat | undefined;

/** Use the host formatter consistently across Cartesian, combination and XY axes. */
export function chartTickLabel(value: number, format: string | undefined, options: ChartSceneOptions): string {
  return options.formatNumber?.(value, format) ?? (defaultFormat ??= new Intl.NumberFormat('en-US', { maximumSignificantDigits: 21 })).format(value);
}
