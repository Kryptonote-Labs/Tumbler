import {
  chartPropertyDefinition,
  chartPropertyTree,
  editChartSource,
  insertChartProperty,
  type ChartPropertyNode,
} from '@tumblerjs/charts';
import { chartFormatTargets, chartPropertyChild as child } from './chart-properties.ts';

export interface ChartFormatOption {
  readonly label: string;
  readonly path: readonly string[];
  readonly kind: 'number' | 'choice' | 'toggle' | 'text' | 'color';
  readonly attribute?: string;
  readonly choices?: readonly (readonly [string, string])[] | undefined;
  readonly defaultValue?: string | undefined;
  readonly textContent?: boolean;
  readonly scale?: number;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}
const number = (
  label: string,
  path: readonly string[],
  min?: number,
  max?: number,
): ChartFormatOption => ({ label, path, kind: 'number', min, max });
const toggle = (label: string, path: readonly string[], defaultValue = '0'): ChartFormatOption => ({
  label,
  path,
  kind: 'toggle',
  defaultValue,
});
const choice = (
  label: string,
  path: readonly string[],
  choices: ChartFormatOption['choices'],
  defaultValue?: string,
): ChartFormatOption => ({ label, path, kind: 'choice', choices, defaultValue });
export const localChartName = (node: ChartPropertyNode) => node.name.split(':').at(-1)!;
export function chartOptionNode(target: ChartPropertyNode, option: ChartFormatOption) {
  return option.path.reduce<ChartPropertyNode | undefined>(
    (node, name) => child(node, name),
    target,
  );
}

/** User-facing options mirror Office's Format Axis and Format Data Series panes. */
function elementOptions(target: ChartPropertyNode): readonly ChartFormatOption[] {
  const name = localChartName(target);
  if (['catAx', 'valAx', 'dateAx', 'serAx'].includes(name))
    return [
      toggle('Show axis', ['delete'], '0'),
      ...(name === 'valAx' || name === 'dateAx'
        ? [
            number('Minimum', ['scaling', 'min']),
            number('Maximum', ['scaling', 'max']),
            number('Major unit', ['majorUnit'], 0),
            number('Minor unit', ['minorUnit'], 0),
          ]
        : []),
      ...(name === 'valAx' ? [number('Logarithmic base', ['scaling', 'logBase'], 2, 1000)] : []),
      choice(
        'Order',
        ['scaling', 'orientation'],
        [
          ['minMax', 'Normal'],
          ['maxMin', 'Reversed'],
        ],
        'minMax',
      ),
      {
        label: 'Number format',
        path: ['numFmt'],
        attribute: 'formatCode',
        kind: 'text',
        defaultValue: 'General',
      },
      {
        label: 'Label angle °',
        path: ['txPr', 'bodyPr'],
        attribute: 'rot',
        kind: 'number',
        scale: 60000,
        min: -90,
        max: 90,
      },
      choice(
        'Label position',
        ['tickLblPos'],
        [
          ['nextTo', 'Next to axis'],
          ['high', 'High'],
          ['low', 'Low'],
          ['none', 'None'],
        ],
        'nextTo',
      ),
      choice(
        'Major tick marks',
        ['majorTickMark'],
        [
          ['none', 'None'],
          ['out', 'Outside'],
          ['in', 'Inside'],
          ['cross', 'Cross'],
        ],
        'none',
      ),
      choice(
        'Minor tick marks',
        ['minorTickMark'],
        [
          ['none', 'None'],
          ['out', 'Outside'],
          ['in', 'Inside'],
          ['cross', 'Cross'],
        ],
        'none',
      ),
      choice(
        'Axis crosses',
        ['crosses'],
        [
          ['autoZero', 'Automatic'],
          ['min', 'At minimum'],
          ['max', 'At maximum'],
        ],
        'autoZero',
      ),
      number('Crosses at value', ['crossesAt']),
      ...(name === 'valAx'
        ? [
            choice(
              'Axis position',
              ['crossBetween'],
              [
                ['between', 'Between tick marks'],
                ['midCat', 'On tick marks'],
              ],
              'between',
            ),
          ]
        : []),
      ...(name === 'catAx'
        ? [
            number('Label interval', ['tickLblSkip'], 1),
            number('Tick interval', ['tickMarkSkip'], 1),
          ]
        : []),
    ];
  if (name === 'dLbls')
    return [
      toggle('Show value', ['showVal'], '1'),
      toggle('Show category name', ['showCatName']),
      toggle('Show series name', ['showSerName']),
      toggle('Show percentage', ['showPercent']),
      toggle('Show legend key', ['showLegendKey']),
      choice(
        'Label position',
        ['dLblPos'],
        [
          ['bestFit', 'Best fit'],
          ['ctr', 'Centre'],
          ['inEnd', 'Inside end'],
          ['outEnd', 'Outside end'],
          ['inBase', 'Inside base'],
        ],
        'bestFit',
      ),
      {
        label: 'Number format',
        path: ['numFmt'],
        attribute: 'formatCode',
        kind: 'text',
        defaultValue: 'General',
      },
    ];
  if (name === 'ser') {
    const fields: ChartFormatOption[] = [];
    const has = (name: string) =>
      !!child(target, name) ||
      target.availableChildren.some(
        (entry) => chartPropertyDefinition(entry.definition)?.name.split(':').at(-1) === name,
      );
    if (has('smooth')) fields.push(toggle('Smooth line', ['smooth']));
    if (has('marker'))
      fields.push(
        choice(
          'Marker',
          ['marker', 'symbol'],
          [
            ['none', 'None'],
            ['circle', 'Circle'],
            ['square', 'Square'],
            ['diamond', 'Diamond'],
            ['triangle', 'Triangle'],
            ['x', 'Cross'],
            ['plus', 'Plus'],
          ],
          'none',
        ),
        number('Marker size', ['marker', 'size'], 2, 72),
      );
    if (has('explosion')) fields.push(number('Point explosion %', ['explosion'], 0, 400));
    if (has('invertIfNegative'))
      fields.push(toggle('Invert negative colours', ['invertIfNegative']));
    if (has('trendline'))
      fields.push(
        choice(
          'Trendline',
          ['trendline', 'trendlineType'],
          [
            ['linear', 'Linear'],
            ['exp', 'Exponential'],
            ['log', 'Logarithmic'],
            ['poly', 'Polynomial'],
            ['power', 'Power'],
            ['movingAvg', 'Moving average'],
          ],
        ),
        number('Polynomial order', ['trendline', 'order'], 2, 6),
        number('Moving average period', ['trendline', 'period'], 2, 255),
        toggle('Show equation', ['trendline', 'dispEq']),
        toggle('Show R²', ['trendline', 'dispRSqr']),
        number('Forecast forward', ['trendline', 'forward'], 0),
        number('Forecast backward', ['trendline', 'backward'], 0),
        number('Intercept', ['trendline', 'intercept']),
      );
    if (has('errBars'))
      fields.push(
        choice(
          'Error bars',
          ['errBars', 'errValType'],
          [
            ['stdErr', 'Standard error'],
            ['stdDev', 'Standard deviation'],
            ['percentage', 'Percentage'],
            ['fixedVal', 'Fixed value'],
            ['cust', 'Custom'],
          ],
        ),
        choice(
          'Error direction',
          ['errBars', 'errBarType'],
          [
            ['both', 'Both'],
            ['plus', 'Positive'],
            ['minus', 'Negative'],
          ],
          'both',
        ),
        number('Error amount', ['errBars', 'val'], 0),
        {
          label: 'Positive error values',
          path: ['errBars', 'plus', 'numRef', 'f'],
          kind: 'text',
          textContent: true,
        },
        {
          label: 'Negative error values',
          path: ['errBars', 'minus', 'numRef', 'f'],
          kind: 'text',
          textContent: true,
        },
      );
    return fields;
  }
  const fields: ChartFormatOption[] = [];
  const available = (key: string) =>
    !!child(target, key) ||
    target.availableChildren.some(
      (entry) => chartPropertyDefinition(entry.definition)?.name.split(':').at(-1) === key,
    );
  if (available('gapWidth')) fields.push(number('Gap width %', ['gapWidth'], 0, 500));
  if (available('overlap')) fields.push(number('Series overlap %', ['overlap'], -100, 100));
  if (available('holeSize')) fields.push(number('Hole size %', ['holeSize'], 10, 90));
  if (available('firstSliceAng'))
    fields.push(number('First slice angle °', ['firstSliceAng'], 0, 360));
  if (available('bubbleScale')) fields.push(number('Bubble size %', ['bubbleScale'], 0, 300));
  if (available('overlay')) fields.push(toggle('Overlay chart', ['overlay']));
  if (name === 'chartSpace') fields.push(toggle('Rounded corners', ['roundedCorners']));
  return fields;
}

/** Appearance controls apply to the selected chart part, with DrawingML units converted to points. */
export function chartFormatOptions(target: ChartPropertyNode): readonly ChartFormatOption[] {
  const fields = [...elementOptions(target)];
  const supports = (name: string) =>
    !!child(target, name) ||
    target.availableChildren.some(
      (entry) => chartPropertyDefinition(entry.definition)?.name.split(':').at(-1) === name,
    );
  if (supports('spPr'))
    fields.push(
      {
        label: 'Line width (pt)',
        path: ['spPr', 'ln'],
        attribute: 'w',
        kind: 'number',
        min: 0,
        scale: 12700,
      },
      { label: 'Line colour', path: ['spPr', 'ln', 'solidFill', 'srgbClr'], kind: 'color' },
      choice(
        'Line dash',
        ['spPr', 'ln', 'prstDash'],
        [
          ['solid', 'Solid'],
          ['dash', 'Dash'],
          ['dot', 'Dot'],
          ['dashDot', 'Dash dot'],
        ],
        'solid',
      ),
    );
  if (supports('txPr'))
    fields.push(
      {
        label: 'Font size (pt)',
        path: ['txPr', 'p', 'pPr', 'defRPr'],
        attribute: 'sz',
        kind: 'number',
        min: 1,
        max: 4000,
        scale: 100,
      },
      {
        label: 'Font',
        path: ['txPr', 'p', 'pPr', 'defRPr', 'latin'],
        attribute: 'typeface',
        kind: 'text',
      },
      { label: 'Bold', path: ['txPr', 'p', 'pPr', 'defRPr'], attribute: 'b', kind: 'toggle' },
      { label: 'Italic', path: ['txPr', 'p', 'pPr', 'defRPr'], attribute: 'i', kind: 'toggle' },
      {
        label: 'Text colour',
        path: ['txPr', 'p', 'pPr', 'defRPr', 'solidFill', 'srgbClr'],
        kind: 'color',
      },
    );
  return fields;
}

/** Resolve nodes afresh after every insertion; never carry positional IDs across source edits. */
export function editChartFormatOption(
  bytes: Uint8Array,
  targetKey: string,
  option: ChartFormatOption,
  next: string | undefined,
): Uint8Array {
  let source = bytes;
  const locate = () =>
    chartFormatTargets(chartPropertyTree(source)).find((target) => target.key === targetKey)?.node;
  let node = locate();
  if (!node) throw new Error('Select a chart element again.');
  if (
    next === undefined &&
    ['trendline', 'errBars'].includes(option.path[0]!) &&
    option.path.length === 2
  ) {
    const group = child(node, option.path[0]!);
    return group ? editChartSource(source, [{ kind: 'remove', node: group.id }]) : source;
  }
  for (let index = 0; index < option.path.length; index++) {
    const name = option.path[index]!;
    if (!node) throw new Error('Select a chart element again.');
    let existing = child(node, name);
    if (index === option.path.length - 1 && next === undefined)
      return existing
        ? editChartSource(
            source,
            option.attribute && option.attribute !== 'formatCode'
              ? [{ kind: 'attribute', node: existing.id, name: option.attribute, value: null }]
              : [{ kind: 'remove', node: existing.id }],
          )
        : source;
    if (!existing) {
      const definition = node.availableChildren.find(
        (entry) => chartPropertyDefinition(entry.definition)?.name.split(':').at(-1) === name,
      )?.definition;
      if (!definition) throw new Error('This option is unavailable for this chart element.');
      source = insertChartProperty(source, node.id, definition);
      node = locate();
      for (const parent of option.path.slice(0, index)) node = child(node, parent);
      existing = child(node, name);
    }
    node = existing;
  }
  if (!node) throw new Error('This chart option could not be changed.');
  if (option.textContent)
    return editChartSource(source, [{ kind: 'text', node: node.id, value: next ?? '' }]);
  const edits = [
    { kind: 'attribute' as const, node: node.id, name: option.attribute ?? 'val', value: next! },
  ];
  if (option.attribute === 'formatCode')
    edits.push({ kind: 'attribute', node: node.id, name: 'sourceLinked', value: '0' });
  return editChartSource(source, edits);
}
