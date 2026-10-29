import type { NativeWordDocument } from './native-document.ts';
import type { WordBlock } from './document.ts';
import type { WordParagraphPositioning } from './positioning.ts';
import type { WordFormatPatch } from './collaboration/commands.ts';
import { wordParagraphTextSegments } from './text.ts';

export interface WordFormatPainterSample {
  readonly character: WordFormatPatch;
  readonly paragraph: WordFormatPatch;
}

/** Sample the first character's resolved appearance, without copying content or source identities. */
export function wordFormatPainterSample(
  document: NativeWordDocument,
  offset: number,
  options: { defaultStyleId?: string; positioning?: WordParagraphPositioning } = {},
): WordFormatPainterSample | undefined {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Invalid formatting position.');
  let start = 0;
  function visit(blocks: readonly WordBlock[]): WordFormatPainterSample | undefined {
    for (const block of blocks) {
      if (block.kind === 'table') {
        for (const row of block.rows) for (const cell of row.cells) {
          const found = visit(cell.blocks);
          if (found) return found;
        }
      } else if (block.kind === 'paragraph') {
        const segments = wordParagraphTextSegments(undefined, block);
        const length = segments.at(-1)?.end ?? 0;
        if (offset >= start && offset <= start + length) {
          const local = offset - start;
          const segment = segments.find(segment => segment.start <= local && local < segment.end) ?? segments.at(-1);
          const runs = block.inlines.flatMap(inline => inline.kind === 'run' ? [inline] : inline.kind === 'hyperlink' || inline.kind === 'insertion' ? inline.runs : []);
          const text = document.runFormat(block, runs.find(run => run.elementId === segment?.runElementId));
          const paragraph = document.paragraphFormat(block);
          const emptyBorder = {style:'none',widthPoints:0,color:'#000000'} as const;
          return {
            character: {
              font: null, fontFamily:text.fontFamily, fontSize:text.fontSizePoints,
              bold:text.bold, italic:text.italic, strike:text.strike,
              underline:text.underline !== 'none', wordUnderline:text.underline === 'none' ? 'single' : text.underline,
              color:text.themeColour ?? text.color,
              highlight:text.highlight ?? 'none', shading:text.shadingColour ?? text.shading ?? 'transparent',
              verticalAlign:text.verticalAlign, characterSpacingPoints:text.characterSpacingPoints ?? 0,
            },
            paragraph: {
              styleId:paragraph.styleId ?? options.defaultStyleId ?? 'Normal',
              align:paragraph.alignment === 'start' ? 'left' : paragraph.alignment === 'end' ? 'right' : paragraph.alignment === 'distribute' ? 'justify' : paragraph.alignment,
              positioning:{...options.positioning,reset:true},
              paragraph: {
                outlineLevel:paragraph.outlineLevel ?? 9,
                spacingBeforeTwips:paragraph.spacingBeforeTwips,spacingAfterTwips:paragraph.spacingAfterTwips,lineSpacing:paragraph.lineSpacing,
                keepNext:paragraph.keepNext,keepLines:paragraph.keepLines,pageBreakBefore:paragraph.pageBreakBefore,widowControl:paragraph.widowControl,contextualSpacing:paragraph.contextualSpacing,suppressLineNumbers:paragraph.suppressLineNumbers,
                shading:paragraph.shadingColour ?? paragraph.shading ?? 'transparent',
                borders:Object.fromEntries((['top','right','bottom','left'] as const).map(side=>[side,(paragraph.borderColours ?? paragraph.borders)?.[side] ?? emptyBorder])),
              },
            },
          };
        }
        start += length + 1;
      }
    }
  }
  return visit(document.blocks);
}
