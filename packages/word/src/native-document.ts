import { isWordCellFormat, isWordRowFormat } from './table-format.ts';
import { isWordParagraphPositioning, positionalTabXml } from './positioning.ts';
import { createWordStory, wordStoryArtifact, type WordStoryTarget } from './stories.ts';
import { openWordArtifact } from './artifact.ts';
import { NativeWordSource, retainOpaqueBlocks } from './native-source.ts';
import type { WordArtifact } from './artifact.ts';
import { reconcileWordContent } from './content-export.ts';
import { wordParagraphText } from './text.ts';
import type { WordInline } from './document.ts';
import type { WordParagraphNumbering } from './numbering.ts';
import { authoredTableGrid } from './authored-table.ts';
import { nativeImageDrawing } from './native-image.ts';
import type { WordContentBlock } from './create-content.ts';
import { createWordArtifact, type CreateWordOptions, type WordTextParagraph } from './create.ts';
import type {
  WordBlock,
  WordParagraph,
  WordRun,
  WordRunContent,
  WordSectionProperties,
  WordTable,
} from './document.ts';
import type { WordDrawing, WordImageDrawing } from './drawings.ts';
import {
  layoutWordSource,
  wordLayoutStories,
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

export interface NativeWordOptions extends Omit<CreateWordOptions, 'blocks' | 'paragraphs'> {
  readonly source?: WordArtifact;
  /** Reuse signatures by authored object identity. All supplied blocks and descendants must remain immutable. */
  readonly immutableContent?: boolean;
}

interface RecordBlock {
  signature: string;
  block: WordBlock;
  drawings: readonly WordDrawing[];
  tableGrid?: readonly (readonly { column: number; width: number }[])[];
  subtree?: { input: WordContentBlock; records: readonly (readonly [string, RecordBlock])[] } | undefined;
}

/** Shared in-memory Word engine. Imports compile source properties once; only export writes a package. */
export class NativeWordDocument implements WordLayoutSource {
  private nextId = -1;
  private readonly compiled: NativeWordSource | undefined;
  private exported: WordArtifact | undefined;
  private records = new Map<string, RecordBlock>();
  private authored: readonly WordContentBlock[] = [];
  private paragraphFormats = new WeakMap<WordParagraph, ComputedWordParagraphFormat>();
  private paragraphTextFormats = new WeakMap<WordParagraph, ComputedWordTextFormat>();
  private runFormats = new WeakMap<WordRun, ComputedWordTextFormat>();
  private imageIds = new WeakMap<Uint8Array, number>();
  // Media identity follows immutable image bytes, independent of drawing geometry.
  private readonly imagePartNames = new WeakMap<Uint8Array, WordImageDrawing['partName']>();
  private nextImageId = 0;
  private readonly signatures = new WeakMap<WordContentBlock, string>();
  private readonly paragraphTexts = new WeakMap<WordParagraph, string>();
  private readonly independentBlocks = new WeakMap<WordContentBlock, boolean>();
  // Source continuations and numbering depend on preceding content and must still be visited.
  private independent(block: WordContentBlock): boolean {
    const cached = this.independentBlocks.get(block);
    if (cached !== undefined) return cached;
    const value = (!('source' in block) || block.source === undefined) &&
      (block.kind !== 'paragraph' || !block.list) &&
      (block.kind !== 'table' || block.rows.every(row => row.every(cell => cell.blocks.every(child => this.independent(child)))));
    this.independentBlocks.set(block, value);
    return value;
  }
  blocks: readonly WordBlock[] = [];
  drawings: ReadonlyMap<number, WordDrawing> = new Map();
  listMarkers: ReadonlyMap<number, WordListMarker> = new Map();
  readonly cache = new WordLayoutCache();
  private readonly editedStories = new Map<string, { target: string | WordStoryTarget; model: NativeWordDocument; blocks: readonly WordContentBlock[] }>();
  readonly finalSection: WordSectionProperties;
  readonly wrapTrailSpaces: boolean;

  constructor(private readonly options: NativeWordOptions = {}) {
    this.compiled = options.source ? new NativeWordSource(options.source) : undefined;
    this.wrapTrailSpaces = options.source?.document.wrapTrailSpaces ?? false;
    const { width = 595.3, height = 841.9, margin = 72 } = options.page ?? {};
    if (
      ![width, height, margin].every(Number.isFinite) ||
      margin < 0 ||
      width <= margin * 2 ||
      height <= margin * 2
    )
      throw new RangeError('Invalid page dimensions.');
    this.finalSection = this.compiled?.artifact.document.finalSection ?? {
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
    if (this.compiled) {
      this.update(this.compiled.original);
      this.exported = this.compiled.artifact;
    }
  }
  paragraphFormat(paragraph: WordParagraph) {
    return this.paragraphFormats.get(paragraph) ?? DEFAULT_PARAGRAPH;
  }
  runFormat(paragraph: WordParagraph, run: WordRun | undefined) {
    return (run && this.runFormats.get(run)) ?? this.paragraphTextFormats.get(paragraph) ?? this.compiled?.defaults.text ?? { ...DEFAULT_TEXT, ...(this.options.defaultFormat ?? { fontFamily: 'Aptos', fontSizePoints: 12 }) };
  }
  removeStory(target: string | WordStoryTarget) {
    const key = typeof target === 'string' ? target : `${target.section}:${target.kind}:${target.type}`;
    if (this.editedStories.delete(key)) this.exported = undefined;
  }
  /** Update a shared header/footer once; every page referencing it uses this same native model. */
  updateStory(target: string | WordStoryTarget, blocks: readonly WordContentBlock[]) {
    const key = typeof target === 'string' ? target : `${target.section}:${target.kind}:${target.type}`;
    let entry = this.editedStories.get(key);
    if (!entry) {
      const source = typeof target === 'string' && this.options.source ? wordStoryArtifact(this.options.source, target) : undefined;
      const { source: _bodySource, ...options } = this.options;
      entry = { target, blocks, model: new NativeWordDocument({ ...options, ...(source ? { source } : {}) }) };
      this.editedStories.set(key, entry);
    }
    entry.blocks = blocks;
    entry.model.update(blocks);
    this.exported = undefined;
    return entry.model;
  }
  layout(measurer: WordTextMeasurer, options: WordLayoutOptions = {}) {
    return layoutWordSource(this, measurer, {
      maxPages: Number.MAX_SAFE_INTEGER,
      maxFragments: Number.MAX_SAFE_INTEGER,
      ...options,
    }, this.layoutStories());
  }
  private layoutStories() {
    const original = this.compiled ? wordLayoutStories(this.compiled.artifact.document) : { headerFooters: [], notes: [] };
    const headerFooters = original.headerFooters.map(story => {
      const part = this.options.source?.document.headerFooters.find(item => item.relationshipId === story.relationshipId)?.part.name.value;
      const edited = part && this.editedStories.get(part);
      return edited ? { ...story, context: edited.model } : story;
    });
    const bindings: { section: number; kind: 'header' | 'footer'; type: 'default' | 'first' | 'even'; relationshipId: string }[] = [];
    for (const [key, entry] of this.editedStories) {
      if (typeof entry.target === 'string') continue;
      bindings.push({ ...entry.target, relationshipId: key });
      headerFooters.push({ ...entry.target, relationshipId: key, context: entry.model });
    }
    return { ...original, headerFooters, bindings };
  }
  artifact() {
    if (this.exported) return this.exported;
    let result = this.compiled
      ? reconcileWordContent(this.compiled.artifact, this.authored)
      : createWordArtifact({ ...this.options, blocks: this.authored });
    for (const entry of this.editedStories.values()) {
      let partName: string;
      if (typeof entry.target === 'string') partName = entry.target;
      else {
        const created = createWordStory(result, entry.target);
        result = created.artifact;
        partName = created.partName;
      }
      const edited = reconcileWordContent(wordStoryArtifact(result, partName), entry.blocks);
      result = openWordArtifact(edited.bytes(), { maxBlocks: Number.MAX_SAFE_INTEGER, maxInlineItems: Number.MAX_SAFE_INTEGER, maxTextCharacters: Number.MAX_SAFE_INTEGER });
    }
    return this.exported = result;
  }

  update(input: readonly WordContentBlock[]) {
    const records = new Map<string, RecordBlock>();
    const visited: (readonly [string, RecordBlock])[] = [];
    const keys = new Set<string>();
    const sourceOccurrences = new Map<string, number>();
    const drawings = new Map<number, WordDrawing>();
    const markers = new Map<number, WordListMarker>();
    const counters = new Map<string, { kind: string; start: number; values: number[] }>();
    const allocate = () => this.nextId--;
    const compiled = this.compiled;
    const numbering: { elementId: number; reference: WordParagraphNumbering }[] = [];
    // A split paragraph owns its section break only at its final continuation.
    const sectionOwners = new Map<string, WordTextParagraph>();
    const collectSections = (blocks: readonly WordContentBlock[]) => {
      for (const block of blocks) {
        if (block.kind === 'paragraph' && block.source !== undefined)
          sectionOwners.set(`${block.sourceCopy ?? ''}:${block.source}`, block);
        else if (block.kind === 'table') for (const row of block.rows) for (const cell of row) collectSections(cell.blocks);
      }
    };
    collectSections(input);
    const format = (patch: WordTextParagraph['runs'][number]['format'], inherited?: ComputedWordTextFormat): ComputedWordTextFormat => {
      const value = { ...DEFAULT_TEXT, ...(this.options.defaultFormat ?? { fontFamily: 'Aptos', fontSizePoints: 12 }), ...this.compiled?.defaults.text, ...inherited, ...patch };
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
    const signature = (block: WordContentBlock, width: number) => {
      let serialized = this.options.immutableContent ? this.signatures.get(block) : undefined;
      serialized ??= JSON.stringify(block, (key, value: unknown) => {
        // Child records detect cell edits. Grid signatures only need table/cell properties.
        if (block.kind === 'table' && key === 'blocks') return undefined;
        if (!(value instanceof Uint8Array)) return value;
        let id = this.imageIds.get(value);
        if (id === undefined) {
          id = this.nextImageId++;
          this.imageIds.set(value, id);
        }
        return { nativeImage: id };
      });
      if (this.options.immutableContent) this.signatures.set(block, serialized);
      return `${width}:${serialized}`;
    };
    const visit = (blocks: readonly WordContentBlock[], width: number, path: string, originalBlocks: readonly WordBlock[] = []): WordBlock[] => {
      const output = blocks.map((source, index) => {
        const declared = 'id' in source ? source.id : undefined;
        const sourceId = 'source' in source ? source.source : undefined;
        const importedIdentity = sourceId !== undefined && (!declared || declared === `source-${sourceId}`);
        const scope = source.kind === 'paragraph' ? source.sourceCopy ?? '' : '';
        const origin = `${scope}:${sourceId}`;
        const occurrence = sourceOccurrences.get(origin) ?? 0;
        if (importedIdentity) sourceOccurrences.set(origin, occurrence + 1);
        const key = importedIdentity ? `import:${origin}:${occurrence}` : declared ?? `${path}/${index}`;
        if (keys.has(key)) throw new Error('Native document block identities must be unique.');
        keys.add(key);
        const previous = this.records.get(key);
        const original = source.kind === 'paragraph' ? compiled?.paragraphs.get(source.source!) : undefined;
        const hasSection = source.kind === 'paragraph' && sectionOwners.get(`${source.sourceCopy ?? ''}:${source.source}`) === source;
        const fingerprint = `${hasSection}:${signature(source, width)}`;
        const descendantsStart = visited.length;
        let result: RecordBlock;
        if (this.options.immutableContent && previous?.signature === fingerprint && previous.subtree?.input === source) {
          for (const [childKey, child] of previous.subtree.records) {
            if (keys.has(childKey)) throw new Error('Native document block identities must be unique.');
            keys.add(childKey);
            records.set(childKey, child);
            visited.push([childKey, child]);
            for (const drawing of child.drawings) drawings.set(drawing.elementId, drawing);
          }
          result = previous;
        } else if (source.kind === 'table' && previous?.signature === fingerprint && previous.block.kind === 'table' && previous.tableGrid) {
          // Visit semantic children for numbering, identities and section ownership, but keep
          // the unchanged grid and cells instead of constructing a throwaway table.
          const previousTable = previous.block;
          const rows = previousTable.rows.map((row, rowIndex) => {
            const cells = row.cells.map((cell, cellIndex) => {
              const authored = source.rows[rowIndex]![cellIndex]!;
              const geometry = previous.tableGrid![rowIndex]![cellIndex]!;
              const blocks = visit(
                authored.blocks.length ? authored.blocks : [{ kind: 'paragraph', runs: [] }],
                geometry.width,
                `${key}/${rowIndex}/${geometry.column}`,
                compiled?.cells.get(authored.source!)?.blocks,
              );
              return blocks.length === cell.blocks.length && blocks.every((block, index) => block === cell.blocks[index])
                ? cell : { ...cell, blocks };
            });
            return cells.every((cell, index) => cell === row.cells[index]) ? row : { ...row, cells };
          });
          result = rows.every((row, index) => row === previousTable.rows[index])
            ? previous : { ...previous, block: { ...previous.block, rows } };
        } else if (source.kind === 'table') {
          for (const format of source.rowFormats ?? []) if (format && !isWordRowFormat(format)) throw new TypeError('Invalid row formatting.');
          for (const row of source.rows) for (const cell of row) if (cell.format && !isWordCellFormat(cell.format)) throw new TypeError('Invalid cell formatting.');
          const originalTable = compiled?.tables.get(source.source!);
          const widthsChanged = source.columnWidths !== undefined && JSON.stringify(source.columnWidths.map(w => Math.round(w * 20))) !== JSON.stringify(originalTable?.gridColumnWidthsTwips);
          const layoutWidths = originalTable && !widthsChanged ? compiled?.tableWidths.get(originalTable.elementId) : source.columnWidths;
          const grid = authoredTableGrid(source.rows, layoutWidths, width, source.rowGrids);
          const widths = grid.widths;
          const rows = grid.rows.map((row, rowIndex) => ({
            ...compiled?.rows.get(source.rowSources?.[rowIndex]!),
            elementId: allocate(),
            gridBefore: grid.rowGrids[rowIndex]!.before,
            gridAfter: grid.rowGrids[rowIndex]!.after,
            cantSplit: compiled?.rows.get(source.rowSources?.[rowIndex]!)?.cantSplit ?? false,
            repeatHeader: compiled?.rows.get(source.rowSources?.[rowIndex]!)?.repeatHeader ?? false,
            heightTwips: source.rowFormats?.[rowIndex]?.heightTwips ?? compiled?.rows.get(source.rowSources?.[rowIndex]!)?.heightTwips,
            heightRule: source.rowFormats?.[rowIndex]?.heightRule ?? compiled?.rows.get(source.rowSources?.[rowIndex]!)?.heightRule ?? 'auto' as const,
            cells: row.map(({ cell, column, span, width: cellWidth }) => ({
              ...compiled?.cells.get(cell.source!),
              ...cell.format,
              borders: { ...compiled?.cells.get(cell.source!)?.borders, ...cell.format?.borders },
              elementId: allocate(),
              gridSpan: span,
              verticalMerge: cell.verticalMerge,
              width: !widthsChanged && compiled?.cells.has(cell.source!) ? compiled.cells.get(cell.source!)!.width : { type: 'dxa' as const, value: Math.round(cellWidth * 20) },
              verticalAlignment: cell.format?.verticalAlignment ?? compiled?.cells.get(cell.source!)?.verticalAlignment ?? 'top' as const,
              margins: cell.format?.margins ?? compiled?.cells.get(cell.source!)?.margins,
              blocks: visit(
                cell.blocks.length ? cell.blocks : [{ kind: 'paragraph', runs: [] }],
                cellWidth,
                `${key}/${rowIndex}/${column}`,
                compiled?.cells.get(cell.source!)?.blocks,
              ),
            })),
          }));
          const block: WordTable = {
            kind: 'table',
            elementId: previous?.block.elementId ?? allocate(),
            gridColumnWidthsTwips: originalTable && !widthsChanged ? originalTable.gridColumnWidthsTwips : widths.map((value) => Math.round(value * 20)),
            properties: originalTable && !widthsChanged ? originalTable.properties : {
              ...(originalTable?.properties),
              width: { type: 'dxa', value: Math.round(widths.reduce((a, b) => a + b, 0) * 20) },
              alignment: originalTable?.properties.alignment ?? 'start',
              indentTwips: originalTable?.properties.indentTwips ?? 0,
              layout: originalTable?.properties.layout ?? 'fixed',
              borders: originalTable?.properties.borders ?? Object.fromEntries(['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => [side, { style: 'single' as const, widthPoints: 0.5, color: '#000000' }])),
              cellMargins: originalTable?.properties.cellMargins ?? { topTwips: 0, endTwips: 108, bottomTwips: 0, startTwips: 108 },
            },
            rows,
          };
          result = { signature: fingerprint, block, drawings: [], tableGrid: grid.rows.map(row => row.map(({ column, width }) => ({ column, width }))) };
        } else {
          const authored: WordTextParagraph =
            source.kind === 'image' ? { runs: [{ text: '\uFFFC', image: source }] } : source;
          if (previous?.signature === fingerprint) result = previous;
          else {
            if (authored.positioning && !isWordParagraphPositioning(authored.positioning)) throw new TypeError("Invalid paragraph positioning.");
            const media: WordDrawing[] = [];
            const inlines: WordInline[] = authored.runs.map((authoredRun) => {
              const inherited = compiled?.leaves.get(authoredRun.source!);
              const contents: WordRunContent[] = [];
              if (authoredRun.tab) {
                positionalTabXml(authoredRun.tab, authoredRun.text);
                contents.push({ kind: 'tab', elementId: allocate(), position: authoredRun.tab });
              } else if (authoredRun.field) {
                if (authoredRun.text !== '\uFFFC' || authoredRun.image) throw new TypeError('Page fields use one object replacement character.');
                contents.push({ kind: 'page-field', elementId: allocate(), field: authoredRun.field });
              } else if (authoredRun.image) {
                const id = allocate();
                contents.push({ kind: 'drawing', elementId: id });
                const originalDrawing = compiled?.artifact.document.drawings.get(authoredRun.source!);
                const image = authoredRun.image;
                const partName = this.imagePartNames.get(image.bytes) ??
                  (originalDrawing?.kind === 'image' && originalDrawing.bytes === image.bytes ? originalDrawing.partName : undefined);
                const drawing = nativeImageDrawing(id, image, width, partName);
                this.imagePartNames.set(image.bytes, drawing.partName);
                // Retain crop/rotation/wrapping and positioning semantics on unchanged images.
                if (originalDrawing?.kind === 'image') {
                  const anchor = originalDrawing.anchor;
                  const placementUnchanged = image.layout === (originalDrawing.placement === 'inline' ? 'inline' : anchor?.behindDocument ? 'behind' : 'front') &&
                    (image.x ?? 0) === (anchor?.horizontalOffsetPoints ?? 0) && (image.y ?? 0) === (anchor?.verticalOffsetPoints ?? 0) &&
                    (image.moveWithText !== false) === (anchor?.verticalRelativeTo !== 'page');
                  media.push({ ...originalDrawing, ...drawing, ...(placementUnchanged ? { placement: originalDrawing.placement, anchor } : {}) });
                } else media.push(drawing);
              } else if (authoredRun.text === '\uFFFC' && inherited && ['drawing', 'footnote-reference', 'endnote-reference'].includes(inherited.content.kind)) {
                const id = allocate();
                contents.push({ ...inherited.content, elementId: id });
                const drawing = compiled?.artifact.document.drawings.get(inherited.content.elementId);
                if (drawing) media.push({ ...drawing, elementId: id });
              } else {
                if (!authoredRun.text.isWellFormed()) throw new Error('Invalid document text.');
                for (const part of authoredRun.text.split(/([\t\n\u2028])/)) {
                  if (!part) continue;
                  const elementId = allocate();
                  contents.push(
                    part === '\t'
                      ? { kind: 'tab', elementId, ...(inherited?.content.kind === 'tab' && inherited.content.position ? { position: inherited.content.position } : {}) }
                      : part === '\n' || part === '\u2028'
                        ? { kind: 'break', elementId, breakType: inherited?.content.kind === 'break' ? inherited.content.breakType : 'line' }
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
              this.runFormats.set(run, format(authoredRun.format, inherited?.format ?? original?.textFormat));
              return inherited?.owner.kind === 'hyperlink' || inherited?.owner.kind === 'insertion'
                ? { ...inherited.owner, elementId: allocate(), runs: [run] } : run;
            });
            const block: WordParagraph = {
              kind: 'paragraph',
              elementId: previous?.block.elementId ?? allocate(),
              propertiesElementId: undefined,
              section: hasSection ? original?.block.section : undefined,
              inlines,
            };
            this.paragraphTextFormats.set(block, format(undefined, original?.textFormat));
            this.paragraphFormats.set(
              block,
              Object.freeze({
                ...DEFAULT_PARAGRAPH,
                ...compiled?.defaults.paragraph,
                ...original?.format,
                ...authored.positioning,
                alignment: authored.alignment === 'justify' && original?.format.alignment === 'distribute' ? 'distribute' : authored.alignment ?? original?.format.alignment ?? compiled?.defaults.paragraph.alignment ?? 'start',
                lineSpacing: original?.format.lineSpacing ?? compiled?.defaults.paragraph.lineSpacing ?? {
                  rule: 'auto' as const,
                  value: Math.round((this.options.lineSpacing ?? 1) * 240),
                },
              }),
            );
            result = { signature: fingerprint, block, drawings: media };
          }
          const list = authored.list;
          if (list && original?.numbering && JSON.stringify(list) === JSON.stringify(compiled?.lists.get(authored.source!))) {
            numbering.push({ elementId: result.block.elementId, reference: original.numbering });
          } else if (list) {
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
        if (this.options.immutableContent && source.kind === 'table' && result.subtree?.input !== source) {
          result = { ...result, subtree: this.independent(source)
            ? { input: source, records: visited.slice(descendantsStart) } : undefined };
        }
        records.set(key, result);
        if (this.options.immutableContent) visited.push([key, result]);
        for (const drawing of result.drawings) drawings.set(drawing.elementId, drawing);
        return result.block;
      });
      return retainOpaqueBlocks(blocks.map(block => 'source' in block && block.source !== undefined ? {source:block.source} : {}), output, originalBlocks);
    };
    const blocks = visit(
      input.length ? input : [{ kind: 'paragraph', runs: [] }],
      (this.finalSection.pageWidthTwips -
        this.finalSection.marginLeftTwips -
        this.finalSection.marginRightTwips) /
        20,
      'body',
      compiled?.artifact.document.blocks,
    );
    if (compiled) for (const [id, marker] of compiled.artifact.document.numbering.markersFor(numbering)) markers.set(id, marker);
    if (blocks.length !== this.blocks.length || blocks.some((block, index) => block !== this.blocks[index])) this.exported = undefined;
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
        let text = this.paragraphTexts.get(block);
        if (text === undefined) {
          text = wordParagraphText(undefined, block).replaceAll('\n', '\u2028');
          this.paragraphTexts.set(block, text);
        }
        const value = { id: block.elementId, start, end: start + text.length, text };
        start += text.length + 1;
        return [value];
      });
    return visit(this.blocks);
  }
}
