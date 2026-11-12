import { expect, test } from 'bun:test';
import type { ChartScene } from '@tumblerjs/charts';
import { wordChartFont, wordChartFontFamily, wordChartSceneFonts } from '../src/chart-fonts.ts';

test('chart measurement and nested painted labels resolve the authored family, not the CSS stack', () => {
  const resolve = (name: string) => name === 'Example' ? '"PrivateDocument", serif' : `"${name}", sans-serif`;
  const font = { family: '"Example", sans-serif', size: 12, weight: 400, italic: false, color: '#000' };
  const scene = { label: 'Chart', width: 100, height: 100, marks: [{ kind: 'group', marks: [{ kind: 'text', text: 'Label', x: 0, y: 0, anchor: 'start', font }] }] } satisfies ChartScene;
  expect(wordChartFont('400 12px "Example", sans-serif', resolve)).toBe('400 12px "PrivateDocument", serif');
  const group = wordChartSceneFonts(scene, resolve).marks[0];
  expect(group?.kind === 'group' && group.marks[0]?.kind === 'text' && group.marks[0].font.family).toBe('"PrivateDocument", serif');
  expect(wordChartFontFamily('sans-serif', resolve)).toBe('sans-serif');
  expect(wordChartSceneFonts(scene)).toBe(scene);
});
