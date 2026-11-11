import { editChartGradientFill, setChartSolidFill, type ChartGradientEdit } from './gradient-edit.ts';
import { clearChartFill, setChartNoFill, setChartPatternFill } from './pattern-edit.ts';
import type { DrawingPatternPreset } from '@tumblerjs/ooxml';
import type { ChartColor } from './model.ts';

export type ChartFillEdit = { readonly node: number } & (
  | { readonly kind: 'pattern'; readonly preset: DrawingPatternPreset; readonly foreground?: ChartColor | undefined; readonly background?: ChartColor | undefined }
  | { readonly kind: 'solid'; readonly color?: ChartColor | undefined; readonly opacity?: number | undefined }
  | { readonly kind: 'gradient'; readonly edit: ChartGradientEdit }
  | { readonly kind: 'automatic' | 'none' }
);

/** Human and agent fill commands address the same native source snapshot. */
export function editChartFill(source: Uint8Array, fill: ChartFillEdit): Uint8Array {
  switch (fill.kind) {
    case 'pattern': return setChartPatternFill(source, fill.node, fill);
    case 'solid': return setChartSolidFill(source, fill.node, fill);
    case 'gradient': return editChartGradientFill(source, fill.node, fill.edit);
    case 'none': return setChartNoFill(source, fill.node);
    case 'automatic': return clearChartFill(source, fill.node);
  }
}
