import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { ChartAxis } from './model.ts';
import { parseChartLine, parseChartTextStyle } from './formatting-parser.ts';
import { ChartParseError } from './parser-errors.ts';

/** Axis placement and scale properties shared by category, date, value and depth axes. */
export function parseChartAxisProperties(element: LosslessXmlElement, ns: string, drawing: string): Partial<ChartAxis> {
  const child = (node: LosslessXmlElement | undefined, name: string) => node?.children.find((child): child is LosslessXmlElement => child.kind === 'element' && child.namespaceUri === ns && child.localName === name);
  const val = (node: LosslessXmlElement | undefined) => node?.attributes.find(attr => !attr.namespaceUri && attr.localName === 'val')?.value;
  function number(node: LosslessXmlElement | undefined) {
    const raw = val(node);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new ChartParseError('Invalid numeric axis property.');
    return value;
  }
  function choice<const T extends string>(raw: string | undefined, values: readonly T[], fallback: T): T {
    if (raw === undefined) return fallback;
    const result = values.find(value => value === raw);
    if (result === undefined) throw new ChartParseError(`Invalid axis property ${raw}.`);
    return result;
  }
  const scaling = child(element, 'scaling');
  const logBase = number(child(scaling, 'logBase'));
  if (logBase !== undefined && (logBase < 2 || logBase > 1000)) throw new ChartParseError('Logarithmic axis base must be between 2 and 1000.');
  const crossesAt = number(child(element, 'crossesAt')), crossAxisId = number(child(element, 'crossAx'));
  const minorUnit = number(child(element, 'minorUnit'));
  if (minorUnit !== undefined && minorUnit <= 0) throw new ChartParseError('Axis minor unit must be positive.');
  const tickLabelSkip = number(child(element, 'tickLblSkip')), tickMarkSkip = number(child(element, 'tickMarkSkip'));
  if ([tickLabelSkip, tickMarkSkip].some(value => value !== undefined && (!Number.isInteger(value) || value < 1))) throw new ChartParseError('Axis tick skips must be positive integers.');
  const minor = child(element, 'minorGridlines');
  const minorGridlineStyle = parseChartLine(child(minor, 'spPr'), drawing);
  const titleStyle = parseChartTextStyle(child(element, 'title'), ns, drawing);
  const units = child(element, 'dispUnits');
  const custom = number(child(units, 'custUnit'));
  if (custom !== undefined && custom <= 0) throw new ChartParseError('Display units must be positive.');
  const builtIn = choice(val(child(units, 'builtInUnit')), ['hundreds', 'thousands', 'tenThousands', 'hundredThousands', 'millions', 'tenMillions', 'hundredMillions', 'billions', 'trillions'], 'hundreds');
  const factors = { hundreds: 100, thousands: 1000, tenThousands: 10000, hundredThousands: 100000, millions: 1000000, tenMillions: 10000000, hundredMillions: 100000000, billions: 1000000000, trillions: 1000000000000 };
  const labelOffset = val(child(element, 'lblOffset'));
  const offset = labelOffset === undefined ? undefined : Number(labelOffset.replace(/%$/, ''));
  if (offset !== undefined && (!Number.isFinite(offset) || offset < 0 || offset > 1000)) throw new ChartParseError('Invalid category label offset.');
  return {
    sourceType: element.localName,
    ...(logBase === undefined ? {} : { logBase }),
    reversed: choice(val(child(scaling, 'orientation')), ['minMax', 'maxMin'], 'minMax') === 'maxMin',
    ...(crossAxisId === undefined ? {} : { crossAxisId }),
    crosses: choice(val(child(element, 'crosses')), ['autoZero', 'min', 'max'], 'autoZero'),
    ...(crossesAt === undefined ? {} : { crossesAt }),
    crossBetween: choice(val(child(element, 'crossBetween')), ['between', 'midCat'], 'between'),
    tickLabelPosition: choice(val(child(element, 'tickLblPos')), ['high', 'low', 'nextTo', 'none'], 'nextTo'),
    majorTickMark: choice(val(child(element, 'majorTickMark')), ['cross', 'in', 'out', 'none'], 'none'),
    minorTickMark: choice(val(child(element, 'minorTickMark')), ['cross', 'in', 'out', 'none'], 'none'),
    ...(minorUnit === undefined ? {} : { minorUnit }), minorGridlines: !!minor,
    ...(minorGridlineStyle ? { minorGridlineStyle } : {}),
    ...(tickLabelSkip === undefined ? {} : { tickLabelSkip }), ...(tickMarkSkip === undefined ? {} : { tickMarkSkip }),
    ...(offset === undefined ? {} : { labelOffset: offset }),
    ...(titleStyle ? { titleStyle } : {}),
    ...(units ? { displayUnit: custom ?? factors[builtIn], displayUnitName: custom === undefined ? builtIn : String(custom), showDisplayUnitLabel: !!child(units, 'dispUnitsLbl') } : {}),
    ...(element.localName === 'dateAx' ? { dateAxis: true, baseTimeUnit: choice(val(child(element, 'baseTimeUnit')), ['days', 'months', 'years'], 'days'),
      majorTimeUnit: choice(val(child(element, 'majorTimeUnit')), ['days', 'months', 'years'], 'days'), minorTimeUnit: choice(val(child(element, 'minorTimeUnit')), ['days', 'months', 'years'], 'days') } : {}),
  };
}
