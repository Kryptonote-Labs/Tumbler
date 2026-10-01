import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { beginPackageTransaction, PartName, RelationshipsError } from '@tumblerjs/opc';
import { openWordArtifact, type WordArtifact } from './artifact.ts';
import { createWordArtifact, type WordTextParagraph } from './create.ts';
import type { WordContentBlock } from './create-content.ts';
import { importWordContent } from './import-content.ts';
import { mergeContentNumbering } from './package-numbering.ts';
import { PackageXml } from './package-xml.ts';
import { wordParagraphRenderer } from './package-paragraphs.ts';
import { contentCopyScopes } from './package-copies.ts';
import { renderWordBlocks } from './package-blocks.ts';
import { layoutWordSource, WordLayoutCache, type WordTextMeasurer } from './layout.ts';
import { wordParagraphText, wordParagraphTextSegments } from './text.ts';
import type { WordBlock } from './document.ts';

export function wordContentParagraphs(
  blocks: readonly WordContentBlock[],
): WordTextParagraph[] {
  return blocks.flatMap((block) =>
    block.kind === 'table'
      ? block.rows.flatMap((row) => row.flatMap((cell) => wordContentParagraphs(cell.blocks)))
      : block.kind === 'paragraph'
        ? [block]
        : [{ runs: [{ text: '\uFFFC', image: block }] }],
  );
}

/** Materializes shared editable content against an immutable DOCX. The caller owns collaboration;
 * this engine owns the Word semantics and is equally usable by a UI and a headless agent. */
export class WordPackageDocument {
  readonly original: readonly WordContentBlock[];
  private current: WordArtifact;
  private signature: string;
  private imageIds = new WeakMap<Uint8Array, number>();
  private nextImageId = 0;
  private fingerprint(blocks: readonly WordContentBlock[]) {
    return JSON.stringify(blocks, (_key, value: unknown) => {
      if (!(value instanceof Uint8Array)) return value;
      let id = this.imageIds.get(value);
      if (id === undefined) {
        id = this.nextImageId++;
        this.imageIds.set(value, id);
      }
      return { image: id };
    });
  }
  constructor(readonly source: WordArtifact) {
    this.original = importWordContent(source);
    this.signature = this.fingerprint(this.original);
    this.current = source;
  }
  readonly cache = new WordLayoutCache();
  get blocks() {
    return this.current.document.blocks;
  }
  get listMarkers() {
    return this.current.document.numbering.markers(this.current.document);
  }
  artifact() {
    return this.current;
  }
  layout(measurer: WordTextMeasurer) {
    const document = this.current.document;
    return layoutWordSource(
      {
        blocks: document.blocks,
        drawings: document.drawings,
        finalSection: document.finalSection,
        listMarkers: this.listMarkers,
        cache: this.cache,
        paragraphFormat: (p) => document.styles.paragraphFormat(document, p),
        runFormat: (p, run) => document.styles.runFormat(document, p, run),
      },
      measurer,
      {
        maxPages: Number.MAX_SAFE_INTEGER,
        maxFragments: Number.MAX_SAFE_INTEGER,
      },
      document,
    );
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
        const text = wordParagraphText(this.current.document, block).replaceAll('\n', '\u2028');
        const result = {
          id: block.elementId,
          start,
          end: start + text.length,
          text,
        };
        start += text.length + 1;
        return [result];
      });
    return visit(this.current.document.blocks);
  }
  update(blocks: readonly WordContentBlock[]) {
    const signature = this.fingerprint(blocks);
    if (signature === this.signature) return;
    const artifact = reconcileWordContent(this.source, blocks);
    this.current = artifact;
    this.signature = signature;
  }
}

export function reconcileWordContent(
  source: WordArtifact,
  blocks: readonly WordContentBlock[],
): WordArtifact {
  const normalize = (input: readonly WordContentBlock[]): WordContentBlock[] =>
    input.map((block) =>
      block.kind === 'image'
        ? { kind: 'paragraph', runs: [{ text: '\uFFFC', image: block }] }
        : block.kind === 'table'
          ? {
              ...block,
              rows: block.rows.map((row) =>
                row.map((cell) => ({
                  ...cell,
                  blocks: normalize(cell.blocks),
                })),
              ),
            }
          : { ...block },
    );
  blocks = normalize(blocks);
  const document = source.document;
  const markup = new PackageXml(document);
  const originals = wordContentParagraphs(importWordContent(source));
  const originalParagraphs = new Map(originals.map((p) => [p.source!, p]));
  const paragraphs = wordContentParagraphs(blocks);
  const copies = contentCopyScopes(blocks, markup);
  const replacedImages = new Set(
    paragraphs.flatMap((p) =>
      p.runs.filter((run) => {
        const drawing = document.drawings.get(run.source!);
        if (!run.image || drawing?.kind !== 'image') return false;
        return (
          run.image.contentType !== drawing.contentType ||
          run.image.bytes.length !== drawing.bytes.length ||
          run.image.bytes.some((byte, index) => byte !== drawing.bytes[index])
        );
      }),
    ),
  );
  // A generated package supplies new media and numbering, with its own relationship namespace.
  const generated = createWordArtifact({
    paragraphs: paragraphs.map((p) => ({
      runs: p.runs.map((run) => ({
        text: run.text.replaceAll('\u2028', ''),
        ...(run.image && (!document.drawings.has(run.source!) || replacedImages.has(run))
          ? { image: run.image }
          : {}),
      })),
      ...(p.list &&
      JSON.stringify(p.list) !== JSON.stringify(originalParagraphs.get(p.source!)?.list)
        ? { list: p.list }
        : {}),
    })),
  });
  const transaction = beginPackageTransaction(document.package);
  const relationships = generated.document.package.relationships(
    generated.document.part.name,
  ).items;
  let prefix = 'tumbler-content-';
  let existingIds = new Set<string>();
  try {
    existingIds = new Set(
      document.package.relationships(document.part.name).items.map((rel) => rel.id),
    );
  } catch (error) {
    if (!(error instanceof RelationshipsError) || error.code !== 'missing_item') throw error;
  }
  while (
    relationships.some((rel) => existingIds.has(prefix + rel.id)) ||
    generated.document.package.parts.some((part) =>
      document.package.getPart(`/word/${prefix}${part.name.value.split('/').at(-1)}`),
    )
  )
    prefix += 'x';
  const conformanceMarkup = (value: string) =>
    document.conformance === 'strict'
      ? value
          .replaceAll(
            'http://schemas.openxmlformats.org/drawingml/2006/',
            'http://purl.oclc.org/ooxml/drawingml/',
          )
          .replaceAll(
            'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'http://purl.oclc.org/ooxml/officeDocument/relationships',
          )
      : value;
  const bindings = {
    w: document.source.root.namespaceUri,
    r: conformanceMarkup('http://schemas.openxmlformats.org/officeDocument/2006/relationships'),
    wp: conformanceMarkup(
      'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    ),
    a: conformanceMarkup('http://schemas.openxmlformats.org/drawingml/2006/main'),
    pic: conformanceMarkup('http://schemas.openxmlformats.org/drawingml/2006/picture'),
  };
  const bind = (value: string) =>
    value.replace(
      /^<[^>]+>/,
      (match) =>
        match.slice(0, -1) +
        Object.entries(bindings)
          .filter(([prefix]) => !match.includes(`xmlns:${prefix}=`))
          .map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`)
          .join('') +
        '>',
    );
  const remap = (value: string) =>
    bind(
      conformanceMarkup(
        value.replace(/r:embed="([^"]+)"/g, (_, id: string) => `r:embed="${prefix}${id}"`),
      ),
    );
  for (const rel of relationships) {
    if (rel.targetMode !== 'Internal' || !/\/(image|numbering)$/.test(rel.type)) continue;
    const part = generated.document.package.getPart(rel.targetPartName)!;
    const name = PartName.parse(`/word/${prefix}${part.name.value.split('/').at(-1)}`);
    if (/\/numbering$/.test(rel.type)) {
      // Numbering is a singleton. Merge definitions with disjoint numeric IDs into the original part.
      continue;
    }
    transaction.addPart(name, part.contentType, generated.document.package.readPart(part));
    transaction.addRelationship(document.part.name, {
      id: prefix + rel.id,
      type: conformanceMarkup(rel.type),
      target: name,
    });
  }
  const numberingMarkup = mergeContentNumbering(
    document,
    generated.document,
    transaction,
    prefix,
  );
  const renderParagraph = wordParagraphRenderer(
    markup,
    originals,
    paragraphs,
    generated,
    numberingMarkup,
    remap,
    copies,
    replacedImages,
  );
  const body = document.source.elements(document.source.root.namespaceUri, 'body')[0]!;
  const edit = beginLosslessXmlEdit(document.source);
  const content = markup.container(
    body,
    'body',
    ['p', 'tbl'],
    renderWordBlocks(markup, blocks, renderParagraph),
  );
  // Bind generated prefixes before validating the source edit; preserve the source encoding.
  const output = bind(content);
  edit.replaceElementMarkup(body, output);
  transaction.replacePart(document.part.name, edit.commit().bytes);
  let result = openWordArtifact(transaction.commit(), {
    maxBlocks: Number.MAX_SAFE_INTEGER,
    maxInlineItems: Number.MAX_SAFE_INTEGER,
    maxTextCharacters: Number.MAX_SAFE_INTEGER,
  });
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    let offset = 0;
    for (const run of paragraph.runs) {
      const drawing = document.drawings.get(run.source!);
      const image = run.image;
      if (drawing && image) {
        const layout =
          drawing.placement === 'inline'
            ? 'inline'
            : drawing.anchor?.behindDocument
              ? 'behind'
              : 'front';
        const moved =
          (image.layout !== undefined && image.layout !== layout) ||
          (image.x !== undefined &&
            image.x !== (drawing.anchor?.horizontalOffsetPoints ?? 0)) ||
          (image.y !== undefined && image.y !== (drawing.anchor?.verticalOffsetPoints ?? 0));
        if (
          drawing.widthPoints !== image.width ||
          drawing.heightPoints !== image.height ||
          moved
        ) {
          const all: import('./document.ts').WordParagraph[] = [];
          const visit = (blocks: readonly WordBlock[]) => {
            for (const block of blocks) {
              if (block.kind === 'paragraph') all.push(block);
              else if (block.kind === 'table')
                for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
            }
          };
          visit(result.document.blocks);
          const segment = wordParagraphTextSegments(result.document, all[paragraphIndex]!).find(
            (segment) => segment.start === offset && segment.kind === 'drawing',
          );
          if (!segment)
            throw new Error('The drawing position was lost during materialization.');
          result = result.updateDrawing({
            elementId: segment.elementId,
            widthPoints: image.width,
            heightPoints: image.height,
            ...(moved
              ? {
                  layout: image.layout ?? layout,
                  xPoints: image.x ?? 0,
                  yPoints: image.y ?? 0,
                }
              : {}),
          });
        }
      }
      offset += run.text.length;
    }
  }
  return result;
}
