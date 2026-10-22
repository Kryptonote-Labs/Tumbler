import type { ChartSceneOptions } from './scene-marks.ts';

const defaultFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });

/** Use the host formatter consistently across Cartesian, combination and XY axes. */
export function chartTickLabel(value: number, format: string | undefined, options: ChartSceneOptions): string {
  return options.formatNumber?.(value, format) ?? defaultFormat.format(value);
}
