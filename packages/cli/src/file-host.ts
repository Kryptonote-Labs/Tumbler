import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  statSync,
  realpathSync,
} from 'node:fs';
import { extname } from 'node:path';
import { z } from 'zod';
import {
  createWordArtifact,
  openWordArtifact,
  formatWordSelection,
  wordParagraphText,
  wordParagraphTextSegments,
  type WordArtifact,
  type WordBlock,
  type WordFormattingPatch,
  type WordParagraph,
} from '@tumblerjs/word';
import type { FormatInput, OperationHost, ReadInput, ReplaceInput } from './registry.ts';

const handleSchema = z.object({
  revision: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
const revision = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const open = (bytes: Uint8Array) =>
  openWordArtifact(bytes, {
    maxBlocks: Number.MAX_SAFE_INTEGER,
    maxInlineItems: Number.MAX_SAFE_INTEGER,
    maxTextCharacters: Number.MAX_SAFE_INTEGER,
  });
function checkExtension(path: string) {
  if (extname(path).toLowerCase() !== '.docx')
    throw new Error('This CLI currently supports .docx documents.');
}
function paragraphs(artifact: WordArtifact) {
  const result: { paragraph: WordParagraph; start: number; end: number }[] = [];
  let text = '';
  const visit = (blocks: readonly WordBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'table')
        for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
      else if (block.kind === 'paragraph') {
        const value = wordParagraphText(artifact.document, block);
        result.push({ paragraph: block, start: text.length, end: text.length + value.length });
        text += value + '\n';
      }
    }
  };
  visit(artifact.document.blocks);
  return { paragraphs: result, text };
}
function page(artifact: WordArtifact, offset: number) {
  const content = paragraphs(artifact);
  if (offset > content.text.length) throw new Error('Offset is outside the document.');
  // Transport pages are bounded; this does not constrain document size.
  let end = Math.min(content.text.length, offset + 4000);
  if (end < content.text.length && /[\uDC00-\uDFFF]/.test(content.text[end]!)) end--;
  const handle = { revision: revision(artifact.bytes()), start: offset, end };
  return {
    page: Buffer.from(JSON.stringify(handle)).toString('base64url'),
    region: 'body',
    start: offset,
    end,
    next: end < content.text.length ? end : null,
    text: content.text.slice(offset, end),
    runs: content.paragraphs.flatMap(({ paragraph, start }) => {
      const runs = paragraph.inlines.flatMap((inline) =>
        inline.kind === 'run'
          ? [inline]
          : inline.kind === 'hyperlink' || inline.kind === 'insertion'
            ? [...inline.runs]
            : [],
      );
      return wordParagraphTextSegments(artifact.document, paragraph).flatMap((segment) => {
        const from = Math.max(offset, start + segment.start);
        const to = Math.min(end, start + segment.end);
        return to > from
          ? [
              {
                text: content.text.slice(from, to),
                start: from,
                end: to,
                attributes: artifact.document.styles.runFormat(
                  artifact.document,
                  paragraph,
                  runs.find((run) => run.elementId === segment.runElementId),
                ),
              },
            ]
          : [];
      });
    }),
  };
}
function resolveTarget(artifact: WordArtifact, input: FormatInput | ReplaceInput) {
  if (!input.page) throw new Error('Read first and supply --page <handle> when editing a file.');
  const handle = handleSchema.parse(JSON.parse(Buffer.from(input.page, 'base64url').toString()));
  if (handle.revision !== revision(artifact.bytes()))
    throw new Error('The document changed. Read it again before editing.');
  const content = paragraphs(artifact);
  if (handle.end > content.text.length || handle.end < handle.start)
    throw new Error('Invalid page range.');
  let start: number;
  let end: number;
  if ('text' in input.target) {
    const target = input.target;
    const found: number[] = [];
    const visible = content.text.slice(handle.start, handle.end);
    for (
      let at = visible.indexOf(target.text);
      at >= 0;
      at = visible.indexOf(target.text, at + 1)
    ) {
      if (target.within) {
        let contained = false;
        for (
          let context = visible.indexOf(target.within);
          context >= 0;
          context = visible.indexOf(target.within, context + 1)
        )
          if (at >= context && at + target.text.length <= context + target.within.length)
            contained = true;
        if (!contained) continue;
      }
      found.push(handle.start + at);
    }
    if (found.length !== 1)
      throw new Error(
        `Expected one exact match; found ${found.length}. Narrow the target or reread.`,
      );
    start = found[0]!;
    end = start + target.text.length;
  } else {
    start = input.target.start;
    end = input.target.end;
  }
  if (start < handle.start || end > handle.end || end < start)
    throw new Error('Target is outside the read page.');
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(content.text);
  for (const offset of [start, end]) {
    const segment = segments.containing(offset);
    if (segment && segment.index !== offset) throw new Error('Target splits a character.');
  }
  const position = (offset: number) => {
    const entry = content.paragraphs.find((entry) => offset >= entry.start && offset <= entry.end);
    if (!entry) throw new Error('Target is outside editable paragraph text.');
    return { paragraphElementId: entry.paragraph.elementId, offset: offset - entry.start };
  };
  return {
    selection: { anchor: position(start), focus: position(end) },
    start,
    end,
    offset: handle.start,
  };
}
function formatting(input: FormatInput['format']): WordFormattingPatch {
  const change = <T>(value: T | null) =>
    value === null ? { inherit: true as const } : { set: value };
  return {
    text: {
      ...(input.bold === undefined ? {} : { bold: change(input.bold) }),
      ...(input.italic === undefined ? {} : { italic: change(input.italic) }),
      ...(input.strike === undefined ? {} : { strike: change(input.strike) }),
      ...(input.underline === undefined
        ? {}
        : {
            underline: change(
              input.underline === null
                ? null
                : input.underline
                  ? ('single' as const)
                  : ('none' as const),
            ),
          }),
      ...(input.fontFamily === undefined ? {} : { fontFamily: change(input.fontFamily) }),
      ...(input.fontSize === undefined ? {} : { fontSize: change(input.fontSize) }),
      ...(input.color === undefined
        ? {}
        : {
            color: change(
              input.color === null ? null : { type: 'rgb' as const, value: input.color },
            ),
          }),
    },
  };
}

/** File writes use a sibling lock and atomic replacement. Other writers should honor the lock. */
export function createFileHost(): OperationHost {
  function edit(path: string, input: FormatInput | ReplaceInput) {
    checkExtension(path);
    path = realpathSync(path);
    const lock = `${path}.tumbler-lock`;
    const descriptor = openSync(lock, 'wx');
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const original = readFileSync(path);
      const artifact = open(original);
      const target = resolveTarget(artifact, input);
      if ('format' in input && target.start === target.end)
        throw new Error('Formatting requires a nonempty target.');
      const result =
        'value' in input
          ? artifact.replaceText(target.selection, input.value)
          : open(
              formatWordSelection(artifact.document, target.selection, formatting(input.format)),
            );
      writeFileSync(temporary, result.bytes(), { flag: 'wx', mode: statSync(path).mode });
      if (revision(readFileSync(path)) !== revision(original))
        throw new Error('The document changed while editing. Read it again.');
      renameSync(temporary, path);
      return { page: page(result, Math.min(target.offset, paragraphs(result).text.length)) };
    } finally {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
      closeSync(descriptor);
      unlinkSync(lock);
    }
  }
  return {
    async read(path: string, input: ReadInput) {
      checkExtension(path);
      if (input.region !== 'body')
        throw new Error('The file host currently reads the body region.');
      return page(open(readFileSync(path)), input.offset);
    },
    async format(path, input) {
      return edit(path, input);
    },
    async replace(path, input) {
      return edit(path, input);
    },
    async create(path) {
      checkExtension(path);
      const artifact = createWordArtifact();
      writeFileSync(path, artifact.bytes(), { flag: 'wx' });
      return page(artifact, 0);
    },
  };
}
