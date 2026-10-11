import type { TaskProbe } from './probe-model.ts';
/** Supported-task regressions fail CI; known gaps still appear as failures in the measurement. */
export const requiredProbes = ['formatting.lists', 'structure.table-edit', 'content.images', 'structure.headers', 'editing.typing', 'viewing.pages', 'viewing.zoom', 'viewing.selection'] as const;
export function requiredProbesPass(results: readonly TaskProbe[]): boolean {
  return requiredProbes.every(id => results.find(result => result.id === id)?.status === 'verified');
}
