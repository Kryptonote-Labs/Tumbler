import type { Component } from 'svelte';
import type { SampleFile } from '$lib/samples';
import wordSource from '$lib/components/showcase/WordPreview.svelte?raw';
import gridSource from '$lib/components/showcase/GridPreview.svelte?raw';
import formulaSource from '$lib/components/showcase/FormulaPreview.svelte?raw';
import toolbarSource from '$lib/components/showcase/ToolbarPreview.svelte?raw';
import slideSource from '$lib/components/showcase/SlidePreview.svelte?raw';
import chartSource from '$lib/components/showcase/ChartPreview.svelte?raw';
import workbookSheetsSource from '$lib/components/showcase/WorkbookSheetsPreview.svelte?raw';

type ExampleBase = {
  /** Filename shown above the source; the preview runs exactly this file. */
  file: string;
  source: string;
  /** One sentence on what to try in the preview. */
  hint: string;
  /** Loaded preview height in px, reserved while it loads so the page does not jump. */
  height: number;
};

/** Previews load on demand so a page only downloads the example it shows. */
type Lazy<Props extends Record<string, unknown>> = () => Promise<{ default: Component<Props> }>;

/** Examples either open a bundled sample document or supply their own data. */
export type ExampleDefinition = ExampleBase & (
  | { sample: SampleFile; component: Lazy<{ bytes: Uint8Array }> }
  | { sample?: never; component: Lazy<Record<string, never>> }
);

/**
 * Every live example in the docs. The preview and the source panel both come from the
 * same showcase file, so the code a reader copies is the code that is running.
 */
const definitions = {
  'word-document-view': { height: 452, file: 'WordPreview.svelte', source: wordSource, component: () => import('$lib/components/showcase/WordPreview.svelte'), sample: 'project-brief.docx', hint: 'Select text, or pinch to zoom.' },
  'spreadsheet-grid': { height: 352, file: 'GridPreview.svelte', source: gridSource, component: () => import('$lib/components/showcase/GridPreview.svelte'), sample: 'project-budget.xlsx', hint: 'Double-click a Quantity or Unit cost cell and change it; Total recalculates. On a phone, scroll the grid sideways to reach those columns.' },
  'spreadsheet-formula-bar': { height: 180, file: 'FormulaPreview.svelte', source: formulaSource, component: () => import('$lib/components/showcase/FormulaPreview.svelte'), sample: 'project-budget.xlsx', hint: 'With Cell set to D2, type =B2*C2*2 in the bar. Press Enter to apply it or Escape to cancel.' },
  'formatting-toolbar': { height: 312, file: 'ToolbarPreview.svelte', source: toolbarSource, component: () => import('$lib/components/showcase/ToolbarPreview.svelte'), sample: 'project-budget.xlsx', hint: 'Select some cells, then format them. A control shows as mixed when the cells differ, for example when only some are bold.' },
  'presentation-slide-view': { height: 504, file: 'SlidePreview.svelte', source: slideSource, component: () => import('$lib/components/showcase/SlidePreview.svelte'), sample: 'workspace-brief.pptx', hint: 'Choose a slide, or pinch to zoom.' },
  'ooxml-chart': { height: 356, file: 'ChartPreview.svelte', source: chartSource, component: () => import('$lib/components/showcase/ChartPreview.svelte'), hint: 'Change the chart type to see the same data as columns, a line, a pie or a doughnut.' },
  'workbook-sheets': { height: 348, file: 'WorkbookSheetsPreview.svelte', source: workbookSheetsSource, component: () => import('$lib/components/showcase/WorkbookSheetsPreview.svelte'), sample: 'project-budget.xlsx', hint: 'Edit a cell, switch to Notes, then switch back: your edit is still there.' },
} satisfies Record<string, ExampleDefinition>;

export type ExampleId = keyof typeof definitions;
export const examples: Record<ExampleId, ExampleDefinition> = definitions;
