import { readWordParagraphFormat } from './paragraph-attributes.ts';
import * as Y from 'yjs';
import { wordAuthoringStyles } from '../authored-styles.ts';
const shapeStyles = wordAuthoringStyles(undefined, { fontFamily: 'Aptos', fontSizePoints: 12 });
import { createWordCommands, type WordRange, type WordFormatPatch } from './commands.ts';
import { validateAttributes, type TextAttributes } from './formatting.ts';
import type { WordTextParagraph, WordTextFormat } from '../create.ts';
import { shapeTextParagraphs, isShapeTextBody } from '../shape-text.ts';
import type { WordAuthoredShape } from '../shapes.ts';

const commands = createWordCommands({
  defaultAttributes: (text, range) => {
    const end = text.toString().indexOf('\n', range.start);
    let offset = 0;
    let paragraph: TextAttributes = {};
    for (const part of text.toDelta()) {
      const length = typeof part.insert === 'string' ? part.insert.length : 0;
      if (offset <= end && offset + length > end) {
        paragraph = part.attributes ?? {};
        break;
      }
      offset += length;
    }
    const style = shapeStyles.resolveParagraphStyle(paragraph.styleId ?? 'Normal');
    return {
      fontFamily: style.text.fontFamily,
      fontSize: style.text.fontSizePoints,
      bold: style.text.bold,
      italic: style.text.italic,
      align: 'center',
      ...(paragraph.styleId ? { styleId: paragraph.styleId } : {}),
    };
  },
});

/** A shape story uses the same range operations and paragraph semantics as body text. */
export class WordShapeText {
  private doc = new Y.Doc();
  readonly text = this.doc.getText('body');
  private typing: WordFormatPatch = {};
  constructor(shape: Pick<WordAuthoredShape, 'text' | 'textBody'>) {
    this.load(shapeTextParagraphs(shape));
  }
  get length() {
    return commands.bodyLength(this.text);
  }
  load(paragraphs: readonly WordTextParagraph[]) {
    if (!isShapeTextBody(paragraphs)) throw new TypeError('Invalid shape text.');
    this.doc.transact(() => {
      this.text.delete(0, this.text.length);
      for (const p of paragraphs) {
        for (const r of p.runs) this.text.insert(this.text.length, r.text, attributes(r.format));
        this.text.insert(this.text.length, '\n', {
          ...(p.runs.every((r) => !r.text) ? attributes(p.runs[0]?.format) : {}),
          ...(p.alignment
            ? {
                align:
                  p.alignment === 'start' ? 'left' : p.alignment === 'end' ? 'right' : p.alignment,
              }
            : {}),
          ...(p.paragraph ? { paragraph: p.paragraph } : {}),
          ...(p.positioning ? { positioning: p.positioning } : {}),
          ...(p.styleId ? { styleId: p.styleId } : {}),
          ...(p.list ? { list: { ...p.list, level: p.list.level ?? 0 } } : {}),
        });
      }
    });
  }
  formats(range: WordRange): TextAttributes {
    const formats = commands.wordFormats(this.text, range);
    if (range.start === range.end)
      for (const [key, value] of Object.entries(this.typing)) {
        if (value === null) Reflect.deleteProperty(formats, key);
        else Object.assign(formats, { [key]: value });
      }
    return formats;
  }
  resetTyping() {
    this.typing = {};
  }
  replace(range: WordRange, value: string) {
    this.text.applyDelta(
      commands.replaceWordDelta(
        this.text,
        range,
        value.replace(/\r\n?/g, '\n'),
        this.formats(range),
      ),
    );
  }
  format(range: WordRange, patch: WordFormatPatch) {
    if (patch.styleId !== undefined) {
      const text = this.text.toString();
      range = {
        start: range.start === 0 ? 0 : text.lastIndexOf('\n', range.start - 1) + 1,
        end: Math.min(this.length, text.indexOf('\n', Math.max(range.start, range.end - 1))),
      };
    }
    validateAttributes(Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)));
    const paragraph = ['align', 'list', 'paragraph', 'positioning', 'styleId'].some(
      (k) => k in patch,
    );
    if (range.start === range.end && !paragraph) {
      Object.assign(this.typing, patch);
      const value = this.text.toString();
      if (value[range.start] === '\n' && (range.start === 0 || value[range.start - 1] === '\n'))
        this.text.format(range.start, 1, patch);
    } else this.text.applyDelta(commands.formatWordDelta(this.text, range, patch));
  }
  previousList(range: WordRange) {
    let offset = 0;
    let previous: TextAttributes['list'];
    const start = range.start === 0 ? 0 : this.text.toString().lastIndexOf('\n', range.start - 1) + 1;
    for (const part of this.text.toDelta()) {
      if (typeof part.insert !== 'string') continue;
      offset += part.insert.length;
      if (offset <= start && part.insert.includes('\n') && part.attributes?.list)
        previous = part.attributes.list;
    }
    return previous;
  }
  /** Clipboard fragments keep run formatting and the selected paragraphs' properties. */
  slice(range: WordRange): WordTextParagraph[] {
    const copy = new WordShapeText({ text: '' });
    copy.text.delete(0, copy.text.length);
    let offset = 0;
    for (const part of this.text.toDelta()) {
      if (typeof part.insert !== 'string') continue;
      const from = Math.max(0, range.start - offset),
        to = Math.min(part.insert.length, range.end - offset);
      if (to > from)
        copy.text.insert(copy.text.length, part.insert.slice(from, to), part.attributes);
      offset += part.insert.length;
    }
    copy.text.insert(copy.text.length, '\n', this.formats({ start: range.end, end: range.end }));
    const result = copy.paragraphs();
    copy.destroy();
    return result;
  }
  paste(range: WordRange, paragraphs: readonly WordTextParagraph[]) {
    if (!isShapeTextBody(paragraphs)) throw new TypeError('Invalid pasted shape text.');
    const fragment = new WordShapeText({ textBody: paragraphs });
    const value = fragment.text.toString().slice(0, fragment.length);
    this.replace(range, value);
    if (value.length)
      this.text.format(
        range.start,
        value.length,
        Object.fromEntries(
          [
            'fontFamily',
            'fontSize',
            'bold',
            'italic',
            'underline',
            'wordUnderline',
            'strike',
            'color',
            'highlight',
            'shading',
            'verticalAlign',
            'characterSpacingPoints',
          ].map((k) => [k, null]),
        ),
      );
    let offset = 0;
    for (const part of fragment.text.toDelta()) {
      if (typeof part.insert !== 'string') continue;
      const length = Math.min(part.insert.length, fragment.length - offset);
      if (length > 0) this.text.format(range.start + offset, length, part.attributes ?? {});
      offset += part.insert.length;
    }
    fragment.destroy();
    return value.length;
  }
  paragraphs(): WordTextParagraph[] {
    const result: WordTextParagraph[] = [];
    let runs: { text: string; format: WordTextFormat }[] = [];
    for (const part of this.text.toDelta()) {
      if (typeof part.insert !== 'string') continue;
      const a: TextAttributes = part.attributes ?? {};
      const paragraph = readWordParagraphFormat(part.attributes);
      const lines = part.insert.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) runs.push({ text: lines[i]!, format: format(a) });
        if (i < lines.length - 1) {
          result.push({
            runs: runs.length ? runs : [{ text: '', format: format(a) }],
            ...(a.align
              ? { alignment: a.align === 'left' ? 'start' : a.align === 'right' ? 'end' : a.align }
              : {}),
            ...(paragraph !== undefined ? { paragraph } : {}),
            ...(a.positioning ? { positioning: a.positioning } : {}),
            ...(a.styleId ? { styleId: a.styleId } : {}),
            ...(a.list ? { list: a.list } : {}),
          });
          runs = [];
        }
      }
    }
    return result;
  }
  destroy() {
    this.doc.destroy();
  }
}
function attributes(f: WordTextFormat = {}): TextAttributes {
  const { fontSizePoints, underline, highlight, ...rest } = f;
  return {
    ...rest,
    ...(highlight === undefined ? {} : { highlight }),
    ...(fontSizePoints === undefined ? {} : { fontSize: fontSizePoints }),
    ...(underline === undefined
      ? {}
      : {
          underline: underline !== 'none',
          wordUnderline: underline === 'double' ? 'double' : 'single',
        }),
  };
}
function format(a: TextAttributes): WordTextFormat {
  return {
    ...(a.fontFamily ? { fontFamily: a.fontFamily } : {}),
    ...(a.fontSize === undefined ? {} : { fontSizePoints: a.fontSize }),
    ...(a.bold === undefined ? {} : { bold: a.bold }),
    ...(a.italic === undefined ? {} : { italic: a.italic }),
    ...(a.underline === undefined
      ? {}
      : { underline: a.underline ? (a.wordUnderline ?? 'single') : 'none' }),
    ...(a.strike === undefined ? {} : { strike: a.strike }),
    ...(a.color === undefined ? {} : { color: a.color }),
    ...(a.highlight === undefined ? {} : { highlight: a.highlight }),
    ...(a.shading === undefined ? {} : { shading: a.shading }),
    ...(a.verticalAlign === undefined ? {} : { verticalAlign: a.verticalAlign }),
    ...(a.characterSpacingPoints === undefined
      ? {}
      : { characterSpacingPoints: a.characterSpacingPoints }),
  };
}
