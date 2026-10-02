import type { WordArtifact } from './artifact.ts';
import type { WordBlock } from './document.ts';
import { wordParagraphTextSegments } from './text.ts';

/** Immutable import metadata for validating remote edits without reopening the source package. */
export interface WordSourceManifest {
  readonly version: 1;
  readonly paragraphs: readonly number[];
  readonly runs: readonly number[];
  readonly tables: readonly number[];
  readonly rows: readonly number[];
  readonly cells: readonly number[];
  readonly images: readonly { readonly id: number; readonly contentType: string }[];
}

export function createWordSourceManifest(artifact: WordArtifact): WordSourceManifest {
  const paragraphs: number[] = [], runs: number[] = [], tables: number[] = [], rows: number[] = [], cells: number[] = [];
  const visit = (blocks: readonly WordBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'paragraph') {
        paragraphs.push(block.elementId);
        runs.push(...wordParagraphTextSegments(artifact.document, block).map(segment => segment.elementId));
      } else if (block.kind === 'table') {
        tables.push(block.elementId);
        for (const row of block.rows) {
          rows.push(row.elementId);
          for (const cell of row.cells) { cells.push(cell.elementId); visit(cell.blocks); }
        }
      }
    }
  };
  visit(artifact.document.blocks);
  return { version: 1, paragraphs, runs, tables, rows, cells, images: [...artifact.document.drawings.values()].flatMap(drawing => drawing.kind === 'image' ? [{ id: drawing.elementId, contentType: drawing.contentType }] : []) };
}
