import type { WordLayoutLine, WordLayoutTable } from '@tumblerjs/word';
import { wordDisplaySurface } from './word-display-colour.ts';

/** Line identities remain distinct when body and auxiliary XML parts reuse element IDs. */
export function wordDisplaySurfaces(lines: readonly WordLayoutLine[], tables: readonly WordLayoutTable[], background: string, result = new Map<WordLayoutLine, string>()) {
  for (const line of lines) result.set(line, wordDisplaySurface(line.paragraphDecoration?.shading, background));
  for (const table of tables) for (const cell of table.cells) {
    wordDisplaySurfaces(cell.lines, cell.tables, wordDisplaySurface(cell.shading, background), result);
  }
  return result;
}
