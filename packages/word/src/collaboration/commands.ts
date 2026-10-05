import { editTableDelta, type TableAction } from './table-edits.ts';
import { isDocumentImage, normalizeImage, imagePositions, type DocumentImage } from './images.ts';
import { insertTableDelta, protectTableBoundaries, tableParagraphs, type TableCell } from './tables.ts';
import * as Y from 'yjs';
import { validateText, validateWordText } from './validation.ts';
import { validateAttributes as validateWordAttributes, type TextAttributes } from './formatting.ts';

export type WordFormatPatch = { [Key in keyof TextAttributes]: TextAttributes[Key] | null };
export type WordRange = { start: number; end: number };
export type WordAnchor = { start: Y.RelativePosition; end: Y.RelativePosition };
export type WordChange =
  | {
      kind: 'table-edit';
      target: WordAnchor;
      expected?: string;
      tableId: string;
      cellId: string;
      action: TableAction;
    }
  | {
      kind: 'image-update';
      target: WordAnchor;
      expected?: string;
      image: DocumentImage;
      previous: DocumentImage;
    }
  | {
      kind: 'image-move';
      target: WordAnchor;
      destination: WordAnchor;
      previous: DocumentImage;
      expected?: string;
    }
  | { kind: 'image'; target: WordAnchor; expected?: string; image: DocumentImage }
  | { kind: 'table'; target: WordAnchor; expected?: string; rows: readonly (readonly string[])[] }
  | {
      kind: 'replace';
      target: WordAnchor;
      value: string;
      expected?: string;
      attributes?: TextAttributes;
    }
  | { kind: 'format'; target: WordAnchor; attributes: WordFormatPatch; expected?: string };
export type WordDelta = Parameters<Y.Text['applyDelta']>[0];

/** The same anchored operations drive human input and headless agents. Hosts own storage validation. */
export function createWordCommands({ defaultFontSize = 12, defaultAttributes, validateAttributes = validateWordAttributes, validateUpdate, validateDocument }: {
  defaultFontSize?: number;
  defaultAttributes?: (text: Y.Text) => TextAttributes;
  validateAttributes?: (attributes: Record<string, unknown> | undefined) => void;
  validateUpdate?: (state: Uint8Array, update: Uint8Array) => void;
  /** Inspect the staged edit synchronously without mutating either document. Throw to reject it. */
  validateDocument?: (staged: Y.Doc, original: Y.Doc) => void;
} = {}) {
function bodyLength(text: Y.Text) {
  return Math.max(0, text.length - (text.toString().endsWith('\n') ? 1 : 0));
}

// Durable references identify collaborative characters, not revision-local XML elements.
function anchorWordRange(text: Y.Text, range: WordRange): WordAnchor {
  checkRange(text, range);
  return {
    start: Y.createRelativePositionFromTypeIndex(text, range.start),
    end: Y.createRelativePositionFromTypeIndex(text, range.end),
  };
}

function resolveWordRange(text: Y.Text, anchor: WordAnchor): WordRange {
  if (!text.doc) throw new Error('The document is not attached.');
  const start = Y.createAbsolutePositionFromRelativePosition(anchor.start, text.doc);
  const end = Y.createAbsolutePositionFromRelativePosition(anchor.end, text.doc);
  if (!start || !end || start.type !== text || end.type !== text)
    throw new Error('The edit target no longer exists.');
  return {
    start: Math.min(start.index, end.index, bodyLength(text)),
    end: Math.min(Math.max(start.index, end.index), bodyLength(text)),
  };
}

function checkRange(text: Y.Text, range: WordRange) {
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    range.end > bodyLength(text)
  )
    throw new Error('The edit range is outside the document.');
  const value = text.toString();
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value);
  const boundary = (at: number) => {
    if (at === 0 || at === value.length) return true;
    const previous = segments.containing(at - 1);
    return previous !== undefined && previous.index + previous.segment.length === at;
  };
  if (!boundary(range.start) || !boundary(range.end))
    throw new Error('The edit would split a character.');
}

function wordFormats(text: Y.Text, range: WordRange): TextAttributes {
  const defaults = defaultAttributes?.(text) ?? {};
  const formats: TextAttributes[] = [];
  const sizes: number[] = [];
  let offset = 0;
  const collapsed = range.start === range.end;
  const at = collapsed
    ? Math.max(
        0,
        range.start - (range.start > 0 && text.toString()[range.start - 1] !== '\n' ? 1 : 0),
      )
    : range.start;
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') continue;
    const end = offset + part.insert.length;
    if (end > at && offset < (collapsed ? at + 1 : range.end)) formats.push({ ...defaults, ...part.attributes });
    if (end > at && offset < (collapsed ? at + 1 : range.end)) {
      const selected = part.insert.slice(
        Math.max(0, at - offset),
        collapsed ? at + 1 - offset : range.end - offset,
      );
      if (collapsed || selected.replace(/\n/g, '').length)
        sizes.push(part.attributes?.fontSize ?? defaults.fontSize ?? defaultFontSize);
    }
    offset = end;
  }
  const first = formats[0] ?? defaults;
  const result: TextAttributes = {};
  const size = sizes[0] ?? defaults.fontSize ?? defaultFontSize;
  if (sizes.every((value) => value === size)) result.fontSize = size;
  for (const key of [
    'bold',
    'italic',
    'underline',
    'color',
    'font',
    'fontFamily',
    'wordSource',
    'wordCopy',
    'wordUnderline',
  ] as const) {
    const value = first[key];
    if (value !== undefined && formats.every((format) => format[key] === value))
      Object.assign(result, { [key]: value });
  }
  const value = text.toString();
  const last = value.indexOf('\n', range.start);
  offset = 0;
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') continue;
    if (last >= offset && last < offset + part.insert.length) {
      if (part.attributes?.wordParagraph) result.wordParagraph = part.attributes.wordParagraph;
      if (part.attributes?.align) result.align = part.attributes.align;
      if (part.attributes?.list) result.list = part.attributes.list;
      if (part.attributes?.table) result.table = part.attributes.table;
    }
    offset += part.insert.length;
  }
  return result;
}

function replaceWordDelta(
  text: Y.Text,
  range: WordRange,
  value: string,
  attributes = wordFormats(text, range),
): WordDelta {
  checkRange(text, range);
  protectTableBoundaries(text, range.start, range.end);
  value = value.replace(/\r\n?/g, '\n');
  validateText(text.toString().slice(0, range.start) + value + text.toString().slice(range.end));
  validateAttributes(attributes);
  const { align, list, table: inheritedTable, wordParagraph, image: _image, field: _field, ...inline } = attributes;
  let table = inheritedTable;
  if (table && range.end > range.start) {
    const paragraphs = tableParagraphs(text);
    // Replacing a whole table must not recreate its first cell on every inserted paragraph.
    while (table) {
      const id = table.id;
      const members = paragraphs.filter(paragraph => paragraph.table?.id === id || paragraph.table?.parents?.some(parent => parent.id === id));
      if (!members.length || range.start > members[0]!.start || range.end < members.at(-1)!.end) break;
      const parents: NonNullable<TableCell['parents']> = table.parents ?? [];
      const parent = parents.at(-1);
      table = parent ? {...parent, ...(parents.length > 1 ? {parents: parents.slice(0,-1)} : {})} : undefined;
    }
  }
  const inserts: WordDelta = [];
  const lines = value.split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (lines[index]) inserts.push({ insert: lines[index], attributes: inline });
    if (index < lines.length - 1)
      inserts.push({
        insert: '\n',
        attributes: {
          ...(wordParagraph ? { wordParagraph } : {}),
          ...(attributes.wordCopy ? { wordCopy: attributes.wordCopy } : {}),
          ...(align ? { align } : {}),
          ...(list ? { list } : {}),
          ...(table ? { table } : {}),
        },
      });
  }
  return [
    ...(range.start ? [{ retain: range.start }] : []),
    ...(range.end > range.start ? [{ delete: range.end - range.start }] : []),
    ...inserts,
  ];
}

function formatWordDelta(
  text: Y.Text,
  range: WordRange,
  attributes: WordFormatPatch,
): WordDelta {
  checkRange(text, range);
  validateAttributes(
    Object.fromEntries(Object.entries(attributes).filter(([, value]) => value !== null)),
  );
  if (
    attributes.wordParagraph !== undefined ||
    attributes.wordSource !== undefined ||
    attributes.wordCopy !== undefined
  )
    throw new Error('Source identities cannot be formatted.');
  if (attributes.field !== undefined) throw new Error('Insert or delete page fields as content.');
  if (attributes.image !== undefined) throw new Error('Use image operations to change images.');
  if (attributes.table !== undefined)
    throw new Error('Use table operations to change cell structure.');
  const value = text.toString();
  const { align, list, table: _table, image: _image, field: _field, ...inline } = attributes;
  const delta: WordDelta = [];
  let cursor = 0;
  const append = (start: number, length: number, attributes: WordFormatPatch) => {
    if (!length) return;
    if (start > cursor) delta.push({ retain: start - cursor });
    delta.push({ retain: length, attributes });
    cursor = start + length;
  };
  let start = value.lastIndexOf('\n', range.start - 1) + 1;
  if (range.start === 0) start = 0;
  while (start < text.length) {
    const end = value.indexOf('\n', start);
    if (end < 0) break;
    if (Object.keys(inline).length) {
      const from = Math.max(start, range.start);
      const to = Math.min(end, range.end);
      if (to > from) append(from, to - from, inline);
    }
    if (align !== undefined || list !== undefined)
      append(end, 1, {
        ...(align !== undefined ? { align: align === 'left' ? null : align } : {}),
        ...(list !== undefined ? { list } : {}),
      });
    if (end >= Math.max(range.start, range.end - 1)) break;
    start = end + 1;
  }
  return delta;
}

// Agents submit anchored changes as one transaction. Preflight on a replica makes failures atomic.
function wordTransaction(text: Y.Text, changes: readonly WordChange[]): WordDelta {
  if (!text.doc) throw new Error('The document is not attached.');
  const state = Y.encodeStateAsUpdate(text.doc);
  const replica = new Y.Doc();
  try {
    Y.applyUpdate(replica, state);
    const staged = replica.getText(wordTextName(text));
    let result: WordDelta = [];
    staged.observe((event) => {
      result = event.delta;
    });
    replica.transact(() => {
      for (const change of changes) {
        const range = resolveWordRange(staged, change.target);
        if (
          change.expected !== undefined &&
          staged.toString().slice(range.start, range.end) !== change.expected
        )
          throw new Error('The document changed since this edit was prepared.');
        if (change.kind === 'table-edit') {
          staged.applyDelta(
            editTableDelta(staged, range.start, change.action, change.tableId, change.cellId),
          );
        } else if (change.kind === 'image-move') {
          const current = imagePositions(staged).get(range.start);
          if (
            range.end !== range.start + 1 ||
            !current ||
            JSON.stringify(current) !== JSON.stringify(change.previous)
          )
            throw new Error('The image changed while dragging.');
          const destination = resolveWordRange(staged, change.destination).start;
          if (destination >= range.start && destination <= range.end) continue;
          const { wordSource: source, wordCopy } = wordFormats(staged, range);
          staged.applyDelta(replaceWordDelta(staged, range, ''));
          const at = destination > range.start ? destination - 1 : destination;
          const image = current;
          staged.applyDelta([
            ...(at ? [{ retain: at }] : []),
            {
              insert: '\uFFFC',
              attributes: {
                image,
                ...(source ? { wordSource: source } : {}),
                ...(wordCopy ? { wordCopy } : {}),
              },
            },
          ]);
        } else if (change.kind === 'image-update') {
          const current = imagePositions(staged).get(range.start);
          if (
            range.end !== range.start + 1 ||
            !current ||
            JSON.stringify(current) !== JSON.stringify(change.previous)
          )
            throw new Error('The image changed. Read the document again.');
          if (
            !isDocumentImage(change.image) ||
            current.id !== change.image.id ||
            current.type !== change.image.type
          )
            throw new Error('Invalid image update.');
          const image = normalizeImage(change.image);
          staged.applyDelta([
            ...(range.start ? [{ retain: range.start }] : []),
            { retain: 1, attributes: { image } },
          ]);
          if ((image.layout ?? 'inline') === 'inline' && image.alignment)
            staged.applyDelta(formatWordDelta(staged, range, { align: image.alignment }));
        } else if (change.kind === 'image') {
          if (!isDocumentImage(change.image)) throw new Error('Invalid image.');
          const image = normalizeImage(change.image);
          staged.applyDelta(
            replaceWordDelta(staged, range, '\uFFFC').map((part) =>
              part.insert ? { ...part, attributes: { image } } : part,
            ),
          );
        } else if (change.kind === 'table') {
          staged.applyDelta(insertTableDelta(staged, range.end, change.rows).delta);
          validateText(staged.toString());
        } else if (change.kind === 'format')
          staged.applyDelta(formatWordDelta(staged, range, change.attributes));
        else staged.applyDelta(replaceWordDelta(staged, range, change.value, change.attributes));
      }
    });
    validateWordText(staged);
    validateDocument?.(replica, text.doc);
    validateUpdate?.(state, Y.encodeStateAsUpdate(replica, Y.encodeStateVector(text.doc)));
    return result;
  } finally {
    replica.destroy();
  }
}

function validateWordDelta(text: Y.Text, delta: WordDelta) {
  if (!text.doc) throw new Error('The document is not attached.');
  const state = Y.encodeStateAsUpdate(text.doc);
  const staged = new Y.Doc();
  try {
    Y.applyUpdate(staged, state);
    const vector = Y.encodeStateVector(staged);
    staged.getText(wordTextName(text)).applyDelta(delta);
    validateWordText(staged.getText(wordTextName(text)));
    validateDocument?.(staged, text.doc);
    validateUpdate?.(state, Y.encodeStateAsUpdate(staged, vector));
  } finally {
    staged.destroy();
  }
}

return { bodyLength, anchorWordRange, resolveWordRange, wordFormats, replaceWordDelta, formatWordDelta, wordTransaction, validateWordDelta };
}

/** Resolve the text scope before staging operations; positions never cross document stories. */
function wordTextName(text: Y.Text) {
  const name = Y.createRelativePositionFromTypeIndex(text, 0).tname;
  if (!name) throw new Error('Word text must be a named document region.');
  return name;
}
