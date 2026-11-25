import {
  blankLatex,
  composeLatexPage,
  isLatex,
  isLatexHeading,
  latexComposedPageKind,
  latexFrontMatterBlocks,
  latexFrontMatterOrder,
  latexFrontMatterStartsRight,
  latexPageNumberFormats,
  latexThesis,
  readLatexPageComposition,
  readLatexPageContents,
  readLatexPageNumberSection,
  replaceLatexSource,
  serializeLatex,
  setLatexFrontMatter,
  setLatexFrontMatterPageStart,
  setLatexPageContents,
  setLatexPageNumberSection,
} from '@tumblerjs/markdown/latex';
import type { Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { z } from 'zod';

const position = z.number().int().nonnegative();
const boundary = z.union([position, z.literal('end')]);
const frontMatter = z.enum(['abstract', 'tableofcontents', 'listoffigures', 'listoftables']);

export const latexOperation = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('thesis'),
    title: z.string().optional(),
    author: z.string().optional(),
    date: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('insert-page'),
    at: boundary,
    page: z.enum(['title', 'page']),
    lines: z.array(z.string()).min(1),
    contentsTitle: z.string().optional(),
  }),
  z.strictObject({
    kind: z.literal('front-matter'),
    block: frontMatter,
    startsRight: z.boolean().optional(),
  }),
  z.strictObject({
    kind: z.literal('page-numbering'),
    at: boundary,
    format: z.enum(latexPageNumberFormats),
    startAt: z.number().int().default(1),
  }),
]);

export const latexInspection = z.strictObject({
  revision: z.string(),
  nextOffset: position.nullable(),
  blocks: z.array(
    z.strictObject({
      at: position,
      kind: z.string(),
      preview: z.string(),
      startsRight: z.boolean().optional(),
      contentsTitle: z.string().optional(),
      numbering: z.strictObject({ format: z.enum(latexPageNumberFormats), startAt: z.number() }),
    }),
  ),
});

function checkDocument(document: Node) {
  if (!isLatex(document))
    throw new RangeError('Set up a LaTeX document before using authoring operations.');
}

/** Return revision-scoped insertion boundaries and short previews of top-level blocks. */
export function inspectLatexDocument(document: Node, revision: string, offset: number) {
  checkDocument(document);
  const end = Math.min(document.childCount, offset + 20);
  const front = new Map(
    latexFrontMatterOrder(document).map(({ kind, position }) => [position, kind]),
  );
  const blocks: z.infer<typeof latexInspection>['blocks'] = [];
  document.forEach((node, at, index) => {
    if (index < offset || index >= end) return;
    const source = String(node.attrs.source ?? '');
    const composition = latexComposedPageKind(source);
    const firstLine = composition && readLatexPageComposition(source)?.lines[0];
    const matter = front.get(at);
    const contentsTitle = readLatexPageContents(document, at);
    blocks.push({
      at,
      kind:
        matter ??
        (composition ? composition + '-page' : isLatexHeading(node) ? 'heading' : node.type.name),
      preview: (firstLine
        ? source.slice(firstLine.from, firstLine.to)
        : node.textContent || source || String(node.attrs.path ?? '')
      ).slice(0, 160),
      ...(matter ? { startsRight: latexFrontMatterStartsRight(document, at) } : {}),
      ...(contentsTitle !== undefined ? { contentsTitle: contentsTitle.slice(0, 160) } : {}),
      numbering: readLatexPageNumberSection(document, at),
    });
  });
  return { revision, blocks, nextOffset: end < document.childCount ? end : null };
}

function blockBoundary(document: Node, at: z.infer<typeof boundary>) {
  if (at === 'end') return document.content.size;
  if (at > document.content.size || document.resolve(at).depth !== 0)
    throw new RangeError('Use a block boundary from latex inspect, or end.');
  return at;
}

/** Apply one validated operation to the existing editor document. */
export function authorLatexDocument(document: Node, operation: z.infer<typeof latexOperation>) {
  checkDocument(document);
  if (operation.kind === 'thesis') {
    if (document.attrs.latexProject || serializeLatex(document) !== blankLatex)
      throw new RangeError('Apply the Thesis starter to a new blank LaTeX document.');
    return replaceLatexSource(document, latexThesis(operation).source);
  }

  const tr = new Transform(document);
  switch (operation.kind) {
    case 'insert-page': {
      const at = blockBoundary(document, operation.at);
      tr.insert(at, composeLatexPage(document, operation.page, operation.lines));
      if (operation.contentsTitle) setLatexPageContents(tr, at, operation.contentsTitle);
      break;
    }
    case 'page-numbering':
      setLatexPageNumberSection(tr, blockBoundary(document, operation.at), operation);
      break;
    case 'front-matter': {
      const blocks = latexFrontMatterBlocks(document, operation.block);
      if (operation.startsRight !== undefined && blocks.length > 1)
        throw new RangeError('More than one matching front matter block exists.');
      const at = blocks[0] ?? setLatexFrontMatter(tr, operation.block, true);
      if (at !== undefined && operation.startsRight !== undefined)
        setLatexFrontMatterPageStart(tr, at, operation.startsRight);
      break;
    }
  }
  return tr;
}
