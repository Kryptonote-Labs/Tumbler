import type { WordTextParagraph, WordTextFormat } from './create.ts';
import type { WordAuthoredShape } from './shapes.ts';
import { runProperties, textContent } from './create-xml.ts';
import { isWordParagraphFormat } from './paragraph-format.ts';
import { isWordParagraphPositioning } from './positioning.ts';
import { isWordAuthoredList } from './authored-list.ts';

/** Legacy shapes enter the same paragraph model as newly authored rich text. */
export function shapeTextParagraphs(
  shape: Pick<WordAuthoredShape, 'text' | 'textBody'>,
): readonly WordTextParagraph[] {
  return (
    shape.textBody ??
    (shape.text ?? '').split(/\r\n?|\n/).map((text) => ({ alignment: 'center', runs: [{ text }] }))
  );
}
export function shapePlainText(shape: Pick<WordAuthoredShape, 'text' | 'textBody'>): string {
  return shapeTextParagraphs(shape)
    .map((p) => p.runs.map((r) => r.text).join(''))
    .join('\n');
}

/** Validate authored rich text at the storage boundary, before it reaches the renderer. */
export function isShapeTextBody(value: unknown): value is readonly WordTextParagraph[] {
  if (!Array.isArray(value) || !value.length) return false;
  try {
    return value.every((p) => {
      if (!p || typeof p !== 'object' || !Array.isArray(p.runs)) return false;
      if (
        Object.keys(p).some(
          (k) => !['runs', 'alignment', 'paragraph', 'positioning', 'list', 'styleId'].includes(k),
        )
      )
        return false;
      if (p.alignment !== undefined && !['start', 'center', 'end', 'justify'].includes(p.alignment))
        return false;
      if (
        p.styleId !== undefined &&
        (typeof p.styleId !== 'string' || !p.styleId || /[\x00-\x1f]/.test(p.styleId))
      )
        return false;
      if (p.paragraph !== undefined && !isWordParagraphFormat(p.paragraph)) return false;
      if (p.positioning !== undefined && !isWordParagraphPositioning(p.positioning)) return false;
      if (p.list !== undefined && !isWordAuthoredList(p.list)) return false;
      return p.runs.every((r: { text?: unknown; format?: WordTextFormat }) => {
        if (
          !r ||
          typeof r !== 'object' ||
          Object.keys(r).some((k) => !['text', 'format'].includes(k)) ||
          typeof r.text !== 'string'
        )
          return false;
        textContent(r.text);
        if (r.format !== undefined) {
          if (!r.format || typeof r.format !== 'object' || Array.isArray(r.format)) return false;
          if (
            Object.keys(r.format).some(
              (k) =>
                ![
                  'fontFamily',
                  'fontSizePoints',
                  'bold',
                  'italic',
                  'underline',
                  'strike',
                  'highlight',
                  'shading',
                  'verticalAlign',
                  'characterSpacingPoints',
                  'color',
                ].includes(k),
            )
          )
            return false;
          for (const key of ['bold', 'italic', 'strike'] as const)
            if (r.format[key] !== undefined && typeof r.format[key] !== 'boolean') return false;
          if (
            r.format.fontFamily !== undefined &&
            (typeof r.format.fontFamily !== 'string' ||
              !r.format.fontFamily ||
              /[\x00-\x1f]/.test(r.format.fontFamily))
          )
            return false;
          runProperties(r.format);
        }
        return true;
      });
    });
  } catch {
    return false;
  }
}
