import { isWordParagraphPositioning } from '../positioning.ts';
import { isWordDrawingGeometry } from '../drawing-geometry.ts';
import { isWordAuthoredInk } from '../authored-ink.ts';
import { isWordInkTraceOverrides } from '../ink-overrides.ts';
import { isShapeTextBody } from '../shape-text.ts';
import { z } from 'zod';
import { TEXT_FORMATS, isFontSize } from '../collaboration/formatting.ts';
import { isWordColour } from '../theme-colours.ts';
import { WORD_HIGHLIGHTS } from '../text-properties.ts';
import { isWordParagraphFormat } from '../paragraph-format.ts';
import { isWordCellFormat, isWordRowFormat } from '../table-format.ts';
import { isWordAuthoredShape } from '../shapes.ts';
import { isDocumentImage } from '../collaboration/images.ts';
import { isWordHyperlink } from '../hyperlinks.ts';

const toggles = Object.fromEntries(
  TEXT_FORMATS.map((key) => [key, z.boolean().nullable().optional()]),
) as {
  [K in (typeof TEXT_FORMATS)[number]]: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
};
export const characterFormat = z
  .object({
    ...toggles,
    font: z.string().min(1).nullable().optional(),
    fontFamily: z.string().min(1).nullable().optional(),
    fontSize: z.number().refine(isFontSize).nullable().optional(),
    color: z.custom<import('../theme-colours.ts').WordColour>(isWordColour).nullable().optional(),
    wordUnderline: z.enum(['single', 'double']).nullable().optional(),
    highlight: z
      .string()
      .refine((value) => WORD_HIGHLIGHTS.includes(value))
      .nullable()
      .optional(),
    shading: z.custom<import('../theme-colours.ts').WordColour>(isWordColour).nullable().optional(),
    verticalAlign: z.enum(['baseline', 'superscript', 'subscript']).nullable().optional(),
    characterSpacingPoints: z
      .number()
      .refine(
        (value) =>
          Number.isInteger(value * 20) && value * 20 >= -2147483648 && value * 20 <= 2147483647,
      )
      .nullable()
      .optional(),
    link: z.string().refine(isWordHyperlink).nullable().optional().describe('Omit to preserve the link; null or an empty string unlinks.'),
  })
  .strict();
export const paragraphFormat = z
  .object({
    positioning: z
      .custom<import('../positioning.ts').WordParagraphPositioning>(isWordParagraphPositioning)
      .describe(
        'Optional indentStartTwips, indentEndTwips, firstLineTwips, hangingTwips; tabs:[{positionTwips,alignment:start|center|end|decimal|bar|clear,leader:none|dot|hyphen|underscore|heavy|middleDot}]. 20 twips per point. Omit or pass {} to preserve positioning; null removes direct positioning and inherits styles. reset:true removes direct positioning before applying supplied members.',
      )
      .nullable()
      .optional(),
    align: z.enum(['left', 'center', 'right', 'justify']).nullable().optional(),
    paragraph: z
      .custom<import('../paragraph-format.ts').WordParagraphFormat>(isWordParagraphFormat)
      .describe(
        'Paragraph properties: spacingBeforeTwips, spacingAfterTwips (20 twips per point); lineSpacing {rule:auto|atLeast|exact,value} (auto uses 240 per line, others twips); keepNext, keepLines, pageBreakBefore, widowControl, contextualSpacing, suppressLineNumbers booleans; shading colour; borders.',
      )
      .nullable()
      .optional(),
  })
  .strict();
export const tableFormat = z
  .object({
    scope: z.enum(['cell', 'row', 'column', 'table']),
    cell: z
      .custom<import('../table-format.ts').WordCellFormat>(isWordCellFormat)
      .describe(
        'Optional shading colour, verticalAlignment top|center|bottom, margins {topTwips,endTwips,bottomTwips,startTwips}, borders {top?,right?,bottom?,left?}, each border {style:none|single|double|dotted|dashed,widthPoints,color}.',
      )
      .optional(),
    row: z
      .custom<import('../table-format.ts').WordRowFormat>(isWordRowFormat)
      .describe('Optional heightTwips and heightRule auto|atLeast|exact. 20 twips per point.')
      .optional(),
    columnWidths: z.array(z.number().positive()).optional(),
  })
  .strict();
export const shape = z
  .custom<import('../shapes.ts').WordAuthoredShape>(isWordAuthoredShape)
  .describe(
    'Shape object: required preset (rect|roundRect|ellipse|triangle|diamond|rightArrow|line), width/height in points, fill/outline colours, outlineWidth in points. Optional text, textBody rich paragraphs, textAnchor top|center|bottom, textInsets {top?,right?,bottom?,left?} in points (omitted sides: top/bottom 3.6, left/right 7.2; zero allowed), alt. Placement: layout inline|front|behind, x/y points, horizontalRelativeTo page|column, verticalRelativeTo page|line|paragraph, alignment left|center|right, moveWithText boolean, wrap none.',
  );
export const image = z
  .custom<import('../collaboration/images.ts').DocumentImage>(isDocumentImage)
  .describe(
    'Image object: required id of an existing host asset, type image/png|image/jpeg, width/height in points, alt text. Optional layout inline|front|behind, x/y points, horizontalRelativeTo page|column, verticalRelativeTo page|line|paragraph, alignment left|center|right, moveWithText boolean, wrap none. Does not generate images or edit pixels.',
  );
export const targetSchema = z.union([
  z.object({ text: z.string().min(1), within: z.string().min(1).optional() }).strict(),
  z
    .object({
      kind: z.literal('range'),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    })
    .strict()
    .refine((value) => value.end >= value.start, 'end must be at least start'),
  z.object({ kind: z.literal('cell'), tableId: z.string(), cellId: z.string() }).strict(),
  z.object({ kind: z.literal('table'), tableId: z.string() }).strict(),
]);

export const drawing = z
  .custom<import('../drawing-geometry.ts').WordDrawingGeometry>((value) =>
    isWordDrawingGeometry(value),
  )
  .describe(
    'Drawing geometry: required positive width and height in points. Optional layout inline|front|behind; x/y offsets in points; horizontalRelativeTo page|column; verticalRelativeTo page|line|paragraph; wrap none. Use page/page for fixed positioning or line/paragraph vertical positioning to follow text. Applies to existing objects.',
  );
export const ink = z
  .custom<import('../authored-ink.ts').WordAuthoredInk>(isWordAuthoredInk)
  .describe(
    'Ink drawing: required width/height in points and nonempty strokes array. Each stroke has points [[x,y,pressure],...], color #RRGGBB, positive size in points, optional highlighter boolean. Pressure 0..1. All strokes share one coordinate frame. A one-point stroke is a dot. Optional layout inline|front|behind, x/y, horizontalRelativeTo page|column, verticalRelativeTo page|line|paragraph, alignment left|center|right, moveWithText boolean, wrap none. Legacy points/color/size at the top level replace strokes and fit a single stroke to the frame.',
  );
export const objectPatch = z
  .object({
    shape: shape.optional(),
    image: image.optional(),
    drawing: drawing.optional(),
    ink: ink.optional(),
    inkTraces: z
      .custom<readonly import('../ink-overrides.ts').WordInkTraceOverride[]>(
        isWordInkTraceOverrides,
      )
      .describe(
        'Array of {traceIndex,points}; retain the native channel units and ordering returned by object inspection. These are source device samples, not authored point coordinates.',
      )
      .optional(),
    chartTitle: z.string().optional(),
    chartTitleText: z
      .custom<readonly import('../create.ts').WordTextParagraph[]>(isShapeTextBody)
      .describe(
        'Rich paragraphs [{runs:[{text,format?}],format?}]; use chartTitle for a plain text title.',
      )
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Supply an object property');
