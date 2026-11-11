import { chartDatePosition } from './date-axis.ts';
import { chartAxisCoordinate } from './axis-scale.ts';
import type { CartesianChartLayout } from './layout.ts';
import type { SupportedChartModel } from './model.ts';

/** One projection for marks, labels, error bars and axis ticks. */
export function cartesianGeometry(model: SupportedChartModel, layout: CartesianChartLayout) {
  const { plot, minimum, maximum } = layout;
  const horizontal = model.kind === 'bar';
  const valueAxis = model.axes.find(axis => axis.kind === 'value');
  const categoryAxis = model.axes.find(axis => axis.kind === 'category');
  const categoryReversed = horizontal !== !!categoryAxis?.reversed;
  const count = Math.max(1, layout.categories.length);
  const length = horizontal ? plot.height : plot.width;
  const start = horizontal ? plot.y : plot.x;
  const value = (number: number) => chartAxisCoordinate(valueAxis?.logBase && number <= 0 ? minimum : number, minimum, maximum, horizontal ? plot.x : plot.y, horizontal ? plot.width : plot.height, valueAxis, !horizontal);
  const dateScale = layout.categoryScale;
  const domain = layout.categoryDomain;
  const datePosition = (index: number) => {
    const values = dateScale?.values;
    if (!values?.length) return index + 1;
    const lower = Math.min(Math.max(0, count - 2), Math.max(0, Math.floor(index))), upper = Math.min(count - 1, lower + 1);
    const first = values[Math.max(0, lower)], last = values[upper];
    const base = categoryAxis?.baseTimeUnit ?? 'days', epoch = model.dateSystem ?? '1900';
    return first === undefined ? index + 1 : last === undefined ? chartDatePosition(first, base, epoch) : chartDatePosition(first, base, epoch) + (chartDatePosition(last, base, epoch) - chartDatePosition(first, base, epoch)) * (index - lower);
  };
  const forecastMinimum = categoryAxis?.minimum === undefined && dateScale && domain ? Math.min(dateScale.minimum, datePosition(domain.minimum - .5)) : dateScale?.minimum;
  const forecastMaximum = categoryAxis?.maximum === undefined && dateScale && domain ? Math.max(dateScale.maximum, datePosition(domain.maximum - 1.5)) : dateScale?.maximum;
  const dateMinimum = forecastMinimum ?? 0, dateMaximum = forecastMaximum ?? 1;
  const band = length / (dateScale ? dateMaximum - dateMinimum : domain ? domain.maximum - domain.minimum : count);
  const fractionPosition = (fraction: number) => start + (categoryReversed ? 1 - fraction : fraction) * length;
  const category = (index: number, centered = true) => {
    const fraction = dateScale ? (datePosition(index) - dateMinimum) / (dateMaximum - dateMinimum)
      : domain ? (index + 1 - domain.minimum) / (domain.maximum - domain.minimum)
      : centered ? (index + .5) / count : index / Math.max(1, count - 1);
    return fractionPosition(fraction);
  };
  const categoryBand = (index: number) => category(index) - band / 2;
  const dateCategory = (serial: number) => fractionPosition((chartDatePosition(serial, categoryAxis?.baseTimeUnit ?? 'days', model.dateSystem ?? '1900') - dateMinimum) / (dateMaximum - dateMinimum));
  return { horizontal, valueAxis, categoryAxis, count, band, value, category, categoryBand, categoryReversed, dateCategory };
}
