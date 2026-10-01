import { PartName } from '@tumblerjs/opc';
import type { WordContentBlock, WordAuthoredImage } from './create-content.ts';
import { createWordArtifact, type CreateWordOptions, type WordTextParagraph } from './create.ts';
import type {
  WordBlock,
  WordParagraph,
  WordRun,
  WordRunContent,
  WordSectionProperties,
  WordTable,
} from './document.ts';
import type { WordDrawing } from './drawings.ts';
import {
  layoutWordSource,
  WordLayoutCache,
  type WordLayoutSource,
  type WordTextMeasurer,
  type WordLayoutOptions,
} from './layout.ts';
import type { WordListMarker } from './numbering.ts';
import {
  DEFAULT_TEXT,
  DEFAULT_PARAGRAPH,
  type ComputedWordParagraphFormat,
  type ComputedWordTextFormat,
} from './styles.ts';

interface RecordBlock {
  signature: string;
  block: WordBlock;
  drawings: readonly WordDrawing[];
}

/** Native authored document. Updates reconcile stable block identities atomically; packaging is lazy.
 * Existing package-backed documents retain their preservation API and are never silently converted.
 */
export class NativeWordDocument implements WordLayoutSource {
  private nextId = 1;
  private records = new Map<string, RecordBlock>();
  private authored: readonly WordContentBlock[] = [];
  private paragraphFormats = new WeakMap<WordParagraph, ComputedWordParagraphFormat>();
  private runFormats = new WeakMap<WordRun, ComputedWordTextFormat>();
  private imageIds = new WeakMap<Uint8Array, number>();
  private nextImageId = 0;
  blocks: readonly WordBlock[] = [];
  drawings: ReadonlyMap<number, WordDrawing> = new Map();
  listMarkers: ReadonlyMap<number, WordListMarker> = new Map();
  readonly cache = new WordLayoutCache();
  readonly finalSection: WordSectionProperties;

  constructor(private readonly options: Omit<CreateWordOptions, 'blocks' | 'paragraphs'> = {}) {
    const { width = 595.3, height = 841.9, margin = 72 } = options.page ?? {};
    if (
      ![width, height, margin].every(Number.isFinite) ||
      margin < 0 ||
      width <= margin * 2 ||
      height <= margin * 2
    )
      throw new RangeError('Invalid page dimensions.');
    this.finalSection = {
      elementId: 0,
      pageWidthTwips: Math.round(width * 20),
      pageHeightTwips: Math.round(height * 20),
      orientation: 'portrait',
      marginTopTwips: Math.round(margin * 20),
      marginRightTwips: Math.round(margin * 20),
      marginBottomTwips: Math.round(margin * 20),
      marginLeftTwips: Math.round(margin * 20),
      headerDistanceTwips: 720,
      footerDistanceTwips: 720,
      gutterTwips: 0,
      columnCount: 1,
      columnSpaceTwips: 720,
      breakType: 'nextPage',
      titlePage: false,
      headerReferences: [],
      footerReferences: [],
    };
  }
  paragraphFormat(paragraph: WordParagraph) {
    return this.paragraphFormats.get(paragraph) ?? DEFAULT_PARAGRAPH;
  }
  runFormat(_paragraph: WordParagraph, run: WordRun | undefined) {
    return (run && this.runFormats.get(run)) ?? { ...DEFAULT_TEXT, ...this.options.defaultFormat };
  }
  layout(measurer: WordTextMeasurer, options: WordLayoutOptions = {}) {
    return layoutWordSource(this, measurer, {
      maxPages: Number.MAX_SAFE_INTEGER,
      maxFragments: Number.MAX_SAFE_INTEGER,
      ...options,
    });
  }
  artifact() {
    return createWordArtifact({ ...this.options, blocks: this.authored });
  }

  update(input: readonly WordContentBlock[]) {
    const records = new Map<string, RecordBlock>();
    const keys = new Set<string>();
    const drawings = new Map<number, WordDrawing>();
    const markers = new Map<number, WordListMarker>();
    const counters = new Map<string, { kind: string; start: number; values: number[] }>();
    const allocate = () => this.nextId++;
    const format = (patch: WordTextParagraph['runs'][number]['format']): ComputedWordTextFormat => {
      const value = { ...DEFAULT_TEXT, ...this.options.defaultFormat, ...patch };
      if (
        !Number.isFinite(value.fontSizePoints) ||
        value.fontSizePoints < 1 ||
        value.fontSizePoints > 1638
      )
        throw new RangeError('Font size must be between 1 and 1638 points.');
      return Object.freeze({
        ...value,
        color: value.color.toUpperCase(),
        fontSizePoints: Math.round(value.fontSizePoints * 2) / 2,
      });
    };
    const imageDrawing = (id: number, image: WordAuthoredImage, width: number): WordDrawing => {
      if (![image.width, image.height].every((value) => Number.isFinite(value) && value > 0))
        throw new RangeError('Invalid image dimensions.');
      const floating = image.layout && image.layout !== 'inline';
      return {
        kind: 'image',
        elementId: id,
        placement: floating ? 'anchor' : 'inline',
        widthPoints: Math.round(image.width * 12700) / 12700,
        heightPoints: Math.round(image.height * 12700) / 12700,
        name: `Image ${id}`,
        altText: image.alt ?? '',
        relationshipId: `native-${id}`,
        partName: PartName.parse(
          `/word/media/native-${id}.${image.contentType === 'image/png' ? 'png' : 'jpg'}`,
        ),
        contentType: image.contentType,
        bytes: image.bytes,
        anchor: floating
          ? {
              horizontalRelativeTo: 'column',
              verticalRelativeTo: image.moveWithText === false ? 'page' : 'paragraph',
              horizontalOffsetPoints:
                image.x ??
                (image.alignment === 'center'
                  ? (width - image.width) / 2
                  : image.alignment === 'right'
                    ? width - image.width
                    : 0),
              verticalOffsetPoints: image.y ?? 0,
              wrap: 'none',
              behindDocument: image.layout === 'behind',
              allowOverlap: true,
              distanceTopPoints: 0,
              distanceEndPoints: 0,
              distanceBottomPoints: 0,
              distanceStartPoints: 0,
            }
          : undefined,
      };
    };
    const signature = (block: WordContentBlock, width: number) =>
      `${width}:${JSON.stringify(block, (_key, value: unknown) => {
        if (!(value instanceof Uint8Array)) return value;
        let id = this.imageIds.get(value);
        if (id === undefined) {
          id = this.nextImageId++;
          this.imageIds.set(value, id);
        }
        return { nativeImage: id };
      })}`;
    const visit = (blocks: readonly WordContentBlock[], width: number, path: string): WordBlock[] =>
      blocks.map((source, index) => {
        const key = 'id' in source && source.id ? source.id : `${path}/${index}`;
        if (keys.has(key)) throw new Error('Native document block identities must be unique.');
        keys.add(key);
      const previous = this.records.get(key);
        const fingerprint = signature(source, width);
        let result: RecordBlock;
        if (source.kind === 'table') {
          const columns = source.rows[0]?.length ?? 0;
          if (!columns || columns > 63 || source.rows.some((row) => row.length !== columns))
            throw new RangeError('Word tables need one to 63 cells per row.');
          const widths =
            source.columnWidths ?? Array.from({ length: columns }, () => width / columns);
          if (
            widths.length !== columns ||
            widths.some((value) => !Number.isFinite(value) || value <= 0) ||
            widths.reduce((a, b) => a + b, 0) > width + 0.01
          )
            throw new RangeError('Invalid table column widths.');
          const rows = source.rows.map((row, rowIndex) => ({
            elementId: allocate(),
            gridBefore: 0,
            gridAfter: 0,
            cantSplit: false,
            repeatHeader: false,
            heightTwips: undefined,
            heightRule: 'auto' as const,
            cells: row.map((cell, column) => ({
              elementId: allocate(),
              gridSpan: 1,
              verticalMerge: undefined,
              width: { type: 'dxa' as const, value: Math.round(widths[column]! * 20) },
              verticalAlignment: 'top' as const,
              margins: undefined,
              blocks: visit(
                cell.blocks.length ? cell.blocks : [{ kind: 'paragraph', runs: [] }],
                widths[column]!,
                `${key}/${rowIndex}/${column}`,
              ),
            })),
          }));
          const block: WordTable = {
            kind: 'table',
            elementId: previous?.block.elementId ?? allocate(),
            gridColumnWidthsTwips: widths.map((value) => Math.round(value * 20)),
            properties: {
              width: { type: 'dxa', value: Math.round(widths.reduce((a, b) => a + b, 0) * 20) },
              alignment: 'start',
              indentTwips: 0,
              layout: 'fixed',
              cellMargins: { topTwips: 0, endTwips: 108, bottomTwips: 0, startTwips: 108 },
            },
            rows,
          };
          result =
            previous?.signature === fingerprint
              ? previous
              : { signature: fingerprint, block, drawings: [] };
        } else {
          const authored: WordTextParagraph =
            source.kind === 'image' ? { runs: [{ text: '\uFFFC', image: source }] } : source;
          if (previous?.signature === fingerprint) result = previous;
          else {
            const media: WordDrawing[] = [];
            const inlines: WordRun[] = authored.runs.map((authoredRun) => {
              const contents: WordRunContent[] = [];
              if (authoredRun.image) {
                const id = allocate();
                contents.push({ kind: 'drawing', elementId: id });
                media.push(imageDrawing(id, authoredRun.image, width));
              } else {
                if (!authoredRun.text.isWellFormed()) throw new Error('Invalid document text.');
                for (const part of authoredRun.text.split(/([\t\n])/)) {
                  if (!part) continue;
                  const elementId = allocate();
                  contents.push(
                    part === '\t'
                      ? { kind: 'tab', elementId }
                      : part === '\n'
                        ? { kind: 'break', elementId, breakType: 'line' }
                        : { kind: 'text', elementId, value: part, preserveSpace: true },
                  );
                }
              }
              const run: WordRun = {
                kind: 'run',
                elementId: allocate(),
                propertiesElementId: undefined,
                contents,
              };
              this.runFormats.set(run, format(authoredRun.format));
              return run;
            });
            const block: WordParagraph = {
              kind: 'paragraph',
              elementId: previous?.block.elementId ?? allocate(),
              propertiesElementId: undefined,
              section: undefined,
              inlines,
            };
            this.paragraphFormats.set(
              block,
              Object.freeze({
                ...DEFAULT_PARAGRAPH,
                alignment: authored.alignment ?? 'start',
                lineSpacing: {
                  rule: 'auto' as const,
                  value: Math.round((this.options.lineSpacing ?? 1) * 240),
                },
              }),
            );
            result = { signature: fingerprint, block, drawings: media };
          }
          const list = authored.list;
          if (list) {
            const level = list.level ?? 0,
              start = list.start ?? 1;
            if (
              !Number.isInteger(level) ||
              level < 0 ||
              level > 8 ||
              !Number.isInteger(start) ||
              start < 1
            )
              throw new RangeError('Invalid list level or start.');
            const counter = counters.get(list.id) ?? { kind: list.kind, start, values: [] };
            if (counter.kind !== list.kind || counter.start !== start)
              throw new Error('A list must use consistent numbering.');
            counter.values.length = level + 1;
            for (let i = 0; i <= level; i++)
              counter.values[i] =
                counter.values[i] === undefined
                  ? start
                  : counter.values[i]! + (i === level ? 1 : 0);
            counters.set(list.id, counter);
            markers.set(result.block.elementId, {
              text: list.kind === 'bullet' ? '•' : `${counter.values[level]}.`,
              suffix: 'tab',
              level,
              indentStartTwips: (level + 1) * 720,
              hangingTwips: 360,
            });
          }
        }
        records.set(key, result);
        for (const drawing of result.drawings) drawings.set(drawing.elementId, drawing);
        return result.block;
      });
    const blocks = visit(
      input.length ? input : [{ kind: 'paragraph', runs: [] }],
      (this.finalSection.pageWidthTwips -
        this.finalSection.marginLeftTwips -
        this.finalSection.marginRightTwips) /
        20,
      'body',
    );
    this.records = records;
    this.blocks = blocks;
    this.drawings = drawings;
    this.listMarkers = markers;
    this.authored = input;
  }

  paragraphs() {
    let start = 0;
    const visit = (
      blocks: readonly WordBlock[],
    ): { id: number; start: number; end: number; text: string }[] =>
      blocks.flatMap((block) => {
        if (block.kind === 'table')
          return block.rows.flatMap((row) => row.cells.flatMap((cell) => visit(cell.blocks)));
        if (block.kind !== 'paragraph') return [];
        const text = block.inlines
          .flatMap((inline) =>
            inline.kind === 'run'
              ? inline.contents.map((content) =>
                  content.kind === 'text'
                    ? content.value
                    : content.kind === 'tab'
                      ? '\t'
                      : content.kind === 'break'
                        ? '\n'
                        : content.kind === 'drawing'
                          ? '\uFFFC'
                          : '',
                )
              : [],
          )
          .join('');
        const value = { id: block.elementId, start, end: start + text.length, text };
        start += text.length + 1;
        return [value];
      });
    return visit(this.blocks);
  }
}
