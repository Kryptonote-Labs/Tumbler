import { chartTitleFromWord } from './chart-title.ts';
import { updateChartTitle } from '@tumblerjs/charts';
import { mergeAuthoredStyles, missingAuthoredStyles } from './package-styles.ts';
import { wordStoryArtifact } from './stories.ts';
import type { WordBlock } from './document.ts';
import { beginLosslessXmlEdit } from '@tumblerjs/ooxml';
import { beginPackageTransaction, PartName, RelationshipsError, type PackageTransaction } from '@tumblerjs/opc';
import { openWordArtifact, type WordArtifact } from './artifact.ts';
import { createWordArtifact, type WordTextParagraph } from './create.ts';
import type { WordContentBlock } from './create-content.ts';
import { importWordContent } from './import-content.ts';
import { mergeContentNumbering } from './package-numbering.ts';
import { PackageXml } from './package-xml.ts';
import { wordParagraphRenderer } from './package-paragraphs.ts';
import { contentCopyScopes } from './package-copies.ts';
import { renderWordBlocks } from './package-blocks.ts';
import { wordParagraphTextSegments } from './text.ts';

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

export function reconcileWordContent(
  source: WordArtifact,
  blocks: readonly WordContentBlock[],
): WordArtifact {
  const { transaction, paragraphs, document, isStory } = prepareWordContent(source, blocks)!;
  let result = openWordArtifact(transaction.commit(), {
    inkRendering: source.document.inkRendering,
    maxBlocks: Number.MAX_SAFE_INTEGER,
    maxInlineItems: Number.MAX_SAFE_INTEGER,
    maxTextCharacters: Number.MAX_SAFE_INTEGER,
  });
  if (isStory) result = wordStoryArtifact(result, document.part.name.value);
  for (const [paragraphIndex, paragraph] of paragraphs.entries()) {
    let offset = 0;
    for (const run of paragraph.runs) {
      const drawing = document.drawings.get(run.source!);
      const image = run.drawing ?? run.image;
      if (drawing && image) {
        const layout =
          drawing.placement === 'inline'
            ? 'inline'
            : drawing.anchor?.behindDocument
              ? 'behind'
              : 'front';
        const moved = drawingNeedsUpdate(drawing, { ...image, width: drawing.widthPoints, height: drawing.heightPoints }, run.drawing !== undefined);
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
                  wrap: image.wrap,
                  horizontalRelativeTo: image.horizontalRelativeTo ?? (run.image ? 'column' : 'page'),
                  verticalRelativeTo: image.verticalRelativeTo ?? (run.image ? (run.image.moveWithText === false ? 'page' : 'paragraph') : 'page'),
                  xPoints: image.x ?? 0,
                  yPoints: image.y ?? 0,
                }
              : {}),
          });
        }
      }
      if (run.inkTraces?.length) {
        for (const edit of run.inkTraces) {
          const current = wordContentParagraphs(importWordContent(result))[paragraphIndex];
          if (!current) throw new Error('The ink paragraph was lost during materialization.');
          let at = 0;
          const target = current.runs.find(candidate => { const match = at === offset; at += candidate.text.length; return match; });
          if (target?.source === undefined) throw new Error('The ink drawing was lost during materialization.');
          const ink = result.document.drawings.get(target.source)?.ink;
          const trace = ink?.traces[edit.traceIndex];
          if (!trace) throw new Error('The ink trace was lost during materialization.');
          result = result.replaceInkTrace({ elementId: target.source, traceElementId: trace.elementId, points: edit.points, preserveSampleTransform: true });
        }
      }
      offset += run.text.length;
    }
  }
  return result;
}

/** Stage content into a shared transaction, or decline when later edits must see its resources. */
export function prepareWordContent(
  source: WordArtifact,
  blocks: readonly WordContentBlock[],
  batchTransaction?: PackageTransaction,
  batchRole: 'story' | 'body' = 'story',
) {
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
          : { ...block, runs: block.runs.map((run) => ({ ...run })) },
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
        ...(run.shape ? { shape: run.shape } : {}),
        ...(run.ink ? { ink: { ...run.ink, ...run.drawing } } : {}),
        ...(run.link === undefined ? {} : { link: run.link }),
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
  const relationships = generated.document.package.relationships(
    generated.document.part.name,
  ).items;
  // Stories must not add shared resources. The body may append media/numbering,
  // provided story numbering already resolves. New styles/themes and drawing
  // transforms require the sequential path so later edits see their effects.
  if (batchTransaction && (
    (batchRole === 'story' && generated.document.numbering.partName) ||
    missingAuthoredStyles(document, paragraphs.flatMap(p => p.styleId ? [p.styleId] : [])).length ||
    relationships.some(rel => rel.targetMode === 'Internal' &&
      ((batchRole === 'story' && /\/(image|numbering|customXml)$/.test(rel.type)) || (/\/theme$/.test(rel.type) && !document.styles.themeColors))) ||
    paragraphs.some(p => p.runs.some(run => {
      const drawing = document.drawings.get(run.source!);
      const geometry = run.drawing ?? run.image;
      if (run.inkTraces?.length || run.chartTitle !== undefined || run.chartTitleText !== undefined) return true;
      return drawing && geometry && drawingNeedsUpdate(drawing, geometry, run.drawing !== undefined);
    }))
  )) return undefined;
  const transaction = batchTransaction ?? beginPackageTransaction(document.package);
  for (const paragraph of paragraphs) for (const run of paragraph.runs) {
    const drawing = document.drawings.get(run.source!);
    if (drawing?.kind !== 'chart' || (run.chartTitle === undefined && run.chartTitleText === undefined)) continue;
    const part = document.package.getPart(drawing.partName)!;
    transaction.replacePart(drawing.partName, updateChartTitle(document.package.readPart(part), run.chartTitleText ? chartTitleFromWord(run.chartTitleText) : run.chartTitle!));
  }
  mergeAuthoredStyles(document, paragraphs.flatMap(p => p.styleId ? [p.styleId] : []), transaction);
  const sharedOwner = document.package.mainOfficeDocumentPart().name;
  let prefix = 'tumbler-content-';
  let existingIds = new Set<string>();
  // Generated IDs must be free in both the story and shared resource owner.
  for (const owner of new Set([document.part.name.value, sharedOwner.value])) {
    try {
      for (const rel of document.package.relationships(PartName.parse(owner)).items) existingIds.add(rel.id);
    } catch (error) {
      if (!(error instanceof RelationshipsError) || error.code !== 'missing_item') throw error;
    }
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
  const usedHyperlinks = new Set<string>();
  const remap = (value: string) =>
    bind(
      conformanceMarkup(
        value.replace(/r:(embed|id)="([^"]+)"/g, (_, key: string, id: string) => { if (key === 'id') usedHyperlinks.add(id); return `r:${key}="${prefix}${id}"`; }),
      ),
    );
  for (const rel of relationships) {
    if (rel.targetMode === 'External' && /\/hyperlink$/.test(rel.type)) {
      continue;
    }
    if (rel.targetMode !== 'Internal' || !/\/(image|numbering|theme|customXml)$/.test(rel.type)) continue;
    if (/\/theme$/.test(rel.type) && document.styles.themeColors) continue;
    const part = generated.document.package.getPart(rel.targetPartName)!;
    const name = PartName.parse(`/word/${prefix}${part.name.value.split('/').at(-1)}`);
    if (/\/numbering$/.test(rel.type)) {
      // Numbering is a singleton. Merge definitions with disjoint numeric IDs into the original part.
      continue;
    }
    const isTheme = /\/theme$/.test(rel.type);
    const bytes = generated.document.package.readPart(part);
    transaction.addPart(name, part.contentType, isTheme
      ? new TextEncoder().encode(conformanceMarkup(new TextDecoder().decode(bytes)))
      : bytes);
    // Themes and styles are shared; images and custom XML stay with this story.
    transaction.addRelationship(isTheme ? sharedOwner : document.part.name, {
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
  const isStory = document.source.root.localName !== 'document';
  const body = isStory ? document.source.root : document.source.elements(document.source.root.namespaceUri, 'body')[0]!;
  const edit = beginLosslessXmlEdit(document.source);
  const content = markup.container(
    body,
    body.localName,
    ['p', 'tbl'],
    renderWordBlocks(markup, blocks, renderParagraph),
  );
  // Bind generated prefixes before validating the source edit; preserve the source encoding.
  const output = bind(content);
  edit.replaceElementMarkup(body, output);
  transaction.replacePart(document.part.name, edit.commit().bytes);
  for (const rel of relationships) if (usedHyperlinks.has(rel.id) && rel.targetMode === 'External' && /\/hyperlink$/.test(rel.type))
    transaction.addRelationship(document.part.name, { id: prefix + rel.id, type: conformanceMarkup(rel.type), target: rel.target, targetMode: 'External' });
  return { transaction, paragraphs, document, isStory };
}

function drawingNeedsUpdate(
  drawing: import('./drawings.ts').WordDrawing,
  image: import('./drawing-geometry.ts').WordDrawingGeometry & { moveWithText?: boolean },
  pageRelative = false,
) {
  const layout = drawing.placement === 'inline' ? 'inline' : drawing.anchor?.behindDocument ? 'behind' : 'front';
  return (image.wrap !== undefined && image.wrap !== drawing.anchor?.wrap) || (pageRelative && image.x !== undefined && drawing.anchor?.horizontalRelativeTo !== (image.horizontalRelativeTo ?? 'page')) ||
    (pageRelative && image.y !== undefined && drawing.anchor?.verticalRelativeTo !== (image.verticalRelativeTo ?? 'page')) ||
    (image.horizontalRelativeTo !== undefined && image.horizontalRelativeTo !== drawing.anchor?.horizontalRelativeTo) ||
    (image.verticalRelativeTo !== undefined && image.verticalRelativeTo !== drawing.anchor?.verticalRelativeTo) ||
    (image.moveWithText !== undefined && image.verticalRelativeTo === undefined && image.moveWithText !== (drawing.anchor?.verticalRelativeTo !== 'page')) ||
    drawing.widthPoints !== image.width || drawing.heightPoints !== image.height ||
    (image.layout !== undefined && image.layout !== layout) ||
    (image.x !== undefined && image.x !== (drawing.anchor?.horizontalOffsetPoints ?? 0)) ||
    (image.y !== undefined && image.y !== (drawing.anchor?.verticalOffsetPoints ?? 0));
}
