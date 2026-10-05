import { wordStoryArtifact, wordSections } from './stories.ts';
import { wordDocumentDefaults } from './document-defaults.ts';
import type { ComputedWordTextFormat } from './styles.ts';
import type { WordArtifact } from './artifact.ts';
import type { WordBlock } from './document.ts';
import { wordParagraphTextSegments } from './text.ts';

/** Immutable import metadata for validating remote edits without reopening the source package. */
export interface WordSourceManifest {
  readonly version: 1;
  readonly sectionCount?: number;
  readonly stories?: Readonly<Record<string, WordSourceManifest>>;
  readonly defaultTextFormat?: ComputedWordTextFormat;
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
        for (const segment of wordParagraphTextSegments(artifact.document, block)) runs.push(segment.elementId);
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
  return { version: 1, sectionCount: wordSections(artifact.document).length, ...(artifact.document.headerFooters.length ? { stories: Object.fromEntries(artifact.document.headerFooters.map(story => [story.part.name.value, createWordSourceManifest(wordStoryArtifact(artifact, story.part.name.value))])) } : {}), defaultTextFormat: wordDocumentDefaults(artifact.document).text, paragraphs, runs, tables, rows, cells, images: [...artifact.document.drawings.values()].flatMap(drawing => drawing.kind === 'image' ? [{ id: drawing.elementId, contentType: drawing.contentType }] : []) };
}
