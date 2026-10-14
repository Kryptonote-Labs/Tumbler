import { WORD_LIST_KINDS } from './authored-list.ts';
import type { WordArtifact } from './artifact.ts';
import type { WordBlock, WordParagraph, WordRun } from './document.ts';
import type { WordContentBlock } from './create-content.ts';
import type { WordTextRun } from './create.ts';
import { wordParagraphTextSegments } from './text.ts';

/** Editable content plus references to its immutable package. References retain properties that
 * an authoring UI does not expose, including styles, hyperlinks, sections and drawing markup. */
export function importWordContent(artifact: WordArtifact): WordContentBlock[] {
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
        ...(links.has(segment.runElementId) ? { link: links.get(segment.runElementId)! } : {}),
        ...(segment.tab ? { tab: segment.tab } : {}),
        ...(segment.field ? { field: segment.field } : {}),
        // Soft line breaks are distinct from paragraph boundaries in a collaborative text stream.
        text: segment.kind === 'break' ? '\u2028' : segment.value,
        format: {
          fontFamily: computed.fontFamily,
          fontSizePoints: computed.fontSizePoints,
          bold: computed.bold,
          italic: computed.italic,
          underline: computed.underline,
          color: computed.color,
          strike: computed.strike,
          highlight: computed.highlight,
          verticalAlign: computed.verticalAlign,
          ...(computed.characterSpacingPoints === undefined ? {} : { characterSpacingPoints: computed.characterSpacingPoints }),
        },
      };
    });
    if (!projected.length)
      projected.push({ text: '', format: document.styles.runFormat(document, block) });
    const reference = document.numbering.paragraphReference(document, block);
    const instance = document.numbering.instances.find((item) => item.id === reference?.numId);
    const definition = document.numbering.abstracts.find(
      (item) => item.id === instance?.abstractId,
    );
    const level =
      reference &&
      (instance?.levelOverrides.get(reference.level) ??
        definition?.levels.find((item) => item.level === reference.level));
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
    const { styleId, alignment, tabs, indentStartTwips, indentEndTwips, firstLineTwips, hangingTwips } = document.styles.paragraphFormat(document, block);
    const { spacingBeforeTwips, spacingAfterTwips, lineSpacing, keepNext, keepLines, pageBreakBefore, widowControl, contextualSpacing, shading, borders } = document.styles.paragraphFormat(document, block);
    return {
      kind: 'paragraph',
      ...(styleId === undefined ? {} : { styleId }),
      paragraph: { spacingBeforeTwips, spacingAfterTwips, lineSpacing, keepNext, keepLines, pageBreakBefore, widowControl, contextualSpacing, ...(shading === undefined ? {} : { shading }), ...(borders === undefined ? {} : { borders }) },
      ...(tabs.length || indentStartTwips || indentEndTwips || firstLineTwips || hangingTwips
        ? { positioning: { tabs, indentStartTwips, indentEndTwips, firstLineTwips, hangingTwips } } : {}),
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
