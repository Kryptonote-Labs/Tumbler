import type { Snippet } from 'svelte';

/** Host a workbench's chart-wide controls in a ribbon without duplicating its editing state. */
export interface ChartDesignControls {
  readonly type: Snippet<[close: () => void]>;
  readonly elements: Snippet;
  readonly appearance: Snippet;
  readonly data: Snippet<[close: () => void]>;
  readonly editData: () => void;
  readonly embeddedData: boolean;
}
