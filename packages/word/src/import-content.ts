import { WORD_LIST_KINDS } from './authored-list.ts';
import { restoredWordContent } from './import-content-cache.ts';
import type { WordArtifact } from './artifact.ts';
import type { WordBlock, WordParagraph, WordRun } from './document.ts';
import type { WordContentBlock } from './create-content.ts';
import type { WordTextRun } from './create.ts';
import { wordParagraphTextSegments } from './text.ts';

/** Editable content plus references to its immutable package. References retain properties that
 * an authoring UI does not expose, including styles, hyperlinks, sections and drawing markup. */
export function importWordContent(artifact: WordArtifact): WordContentBlock[] {
  const restored = restoredWordContent(artifact);
  if (restored) return restored;
  const document = artifact.document;
  const paragraph = (block: WordParagraph): WordContentBlock => {
    const runs = new Map<number, WordRun>();
    const links = new Map<number, string>();
    for (const inline of block.inlines) if (inline.kind === 'hyperlink') for (const run of inline.runs) links.set(run.elementId, inline.target ?? (inline.anchor ? `#${inline.anchor}` : ''));
    for (const inline of block.inlines) {
      if (inline.kind === 'run') runs.set(inline.elementId, inline);
      else if (inline.kind === 'hyperlink' || inline.kind === 'insertion')
        for (const run of inline.runs) runs.set(run.elementId, run);
    }
    const projected: WordTextRun[] = wordParagraphTextSegments(document, block).map((segment) => {
      const computed = document.styles.runFormat(document, block, runs.get(segment.runElementId));
      const drawing = document.drawings.get(segment.elementId);
      return {
        ...(drawing?.kind === 'shape' ? { shape: drawing.shape } : {}),
        source: segment.elementId,
        ...(segment.breakType ? { breakType: segment.breakType } : {}),
        // Empty-target wrappers are source markup, not the explicit unlink sentinel.
        ...(links.get(segment.runElementId) ? { link: links.get(segment.runElementId)! } : {}),
        ...(segment.tab ? { tab: segment.tab } : {}),
        ...(segment.field ? { field: segment.field } : {}),
        // Soft line breaks are distinct from paragraph boundaries in a collaborative text stream.
        text: segment.kind === 'break' ? '\u2028' : segment.value,
        format: {
          fontFamily: segment.symbolFont ?? computed.fontFamily,
          fontSizePoints: computed.fontSizePoints,
          bold: computed.bold,
          italic: computed.italic,
          underline: computed.underline,
          color: computed.themeColour ?? computed.color,
          strike: computed.strike,
          highlight: computed.highlight,
          ...(computed.shading === undefined ? {} : { shading: computed.shadingColour ?? computed.shading }),
          verticalAlign: computed.verticalAlign,
          ...(computed.characterSpacingPoints === undefined ? {} : { characterSpacingPoints: computed.characterSpacingPoints }),
          ...(computed.kerningPoints === undefined ? {} : { kerningPoints: computed.kerningPoints }),
        },
      };
    });
    if (!projected.length)
      projected.push({ text: '', format: document.styles.runFormat(document, block) });
    const reference = document.numbering.paragraphReference(document, block);
    const level = reference && document.numbering.level(reference);
    const list =
      reference && level
        ? {
            id: `source-list-${reference.numId}`,
            kind: WORD_LIST_KINDS.find(kind => kind === level.format) ?? 'decimal',
            ...(level.format === 'bullet' ? { marker: level.text } : {}),
            ...(level.start !== 1 ? { start: level.start } : {}),
            level: reference.level,
          }
        : undefined;
    const { styleId, alignment } = document.styles.paragraphFormat(document, block);
    const positioning = document.styles.paragraphPositioning(document, block);
    const { spacingBeforeTwips, spacingAfterTwips, lineSpacing, keepNext, keepLines, pageBreakBefore, suppressLineNumbers, widowControl, contextualSpacing, shading, borders, outlineLevel } = document.styles.paragraphFormat(document, block);
    return {
      kind: 'paragraph',
          ...(block.section ? { section: { source: block.section.elementId, format: {} } } : {}),
      ...(styleId === undefined ? {} : { styleId }),
      paragraph: { ...(outlineLevel === undefined ? {} : { outlineLevel }), spacingBeforeTwips, spacingAfterTwips, lineSpacing, keepNext, keepLines, pageBreakBefore, suppressLineNumbers, widowControl, contextualSpacing, ...(shading === undefined ? {} : { shading: document.styles.paragraphFormat(document, block).shadingColour ?? shading }), ...(borders === undefined ? {} : { borders: document.styles.paragraphFormat(document, block).borderColours ?? borders }) },
      ...(positioning === undefined ? {} : { positioning }),
      id: `source-${block.elementId}`,
      source: block.elementId,
      runs: projected,
      alignment: alignment === 'distribute' ? 'justify' : alignment,
      ...(list ? { list } : {}),
    };
  };
  const visit = (blocks: readonly WordBlock[]): WordContentBlock[] =>
    blocks.flatMap<WordContentBlock>((block) => {
      if (block.kind === 'paragraph') return [paragraph(block)];
      if (block.kind === 'unsupported') return [];
      return [
        {
          kind: 'table',
          source: block.elementId,
          id: `source-${block.elementId}`,
          rowSources: block.rows.map((row) => row.elementId),
          rowGrids: block.rows.map((row) => ({ before: row.gridBefore, after: row.gridAfter })),
          columnWidths: block.gridColumnWidthsTwips.map((width) => width / 20),
          rows: block.rows.map((row) =>
            row.cells.map((cell) => ({
              source: cell.elementId,
              gridSpan: cell.gridSpan,
              ...(cell.verticalMerge ? { verticalMerge: cell.verticalMerge } : {}),
              blocks: visit(cell.blocks),
            })),
          ),
        },
      ];
    });
  return visit(document.blocks);
}
