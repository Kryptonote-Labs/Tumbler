import type { WordTabStop } from './styles.ts';

/** Combine direct tab declarations with inherited positions without exposing clear entries. */
export function mergeWordTabStops(base: readonly WordTabStop[], overlay: readonly WordTabStop[]): readonly WordTabStop[] {
  const tabs = new Map(base.filter(tab => tab.alignment !== 'clear').map(tab => [tab.positionTwips, tab]));
  for (const tab of overlay) {
    if (tab.alignment === 'clear') tabs.delete(tab.positionTwips);
    else tabs.set(tab.positionTwips, tab);
  }
  return Object.freeze([...tabs.values()].sort((a, b) => a.positionTwips - b.positionTwips));
}
