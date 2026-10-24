import { wordSectionBaseline, type WordSectionBaseline } from '../section-baseline.ts';
import type * as Y from 'yjs';
import type { WordArtifact } from '../artifact.ts';
import type { WordSectionProperties } from '../document.ts';
import { wordSections } from '../stories.ts';
import { DEFAULT_WORD_SECTION, resolveWordSection, wordSectionFormat, type WordSectionBoundary } from '../section-format.ts';
import { readWordDocumentSettings, writeWordDocumentSettings } from '../collaboration/document-settings.ts';
import { readWordSectionBoundary, sectionPropertyPatch } from '../collaboration/section-attributes.ts';
import { createWordCommands, type WordDelta, type WordRange } from '../collaboration/commands.ts';
import { wordSharedText, wordSharedOwner } from '../collaboration/structured/view.ts';
import { projectWordSharedText } from '../collaboration/structured/view-projection.ts';
import { applyWordViewDelta } from '../collaboration/structured/view-delta.ts';
import type { WordScopedSelection } from '../collaboration/structured/types.ts';
import type { WordOperation } from './definitions.ts';

export type WordLayoutOperation = Extract<WordOperation, { name: 'section-layout' | 'section-break' | 'remove-section-break' }>;
export function isWordLayoutOperation(operation: WordOperation): operation is WordLayoutOperation {
  return ['section-layout', 'section-break', 'remove-section-break'].includes(operation.name);
}

/** Section scope follows paragraph marks, including a section containing a selected table cell. */
export function inspectWordSections(text: Y.Text, source?: WordArtifact | WordSectionBaseline) {
  const settings = text.doc ? readWordDocumentSettings(wordSharedOwner(text.doc)) : {};
  const baseline = source && ('document' in source ? wordSectionBaseline(source) : source);
  const finalSection = resolveWordSection(baseline?.finalSection ?? DEFAULT_WORD_SECTION, settings.finalSection ?? {});
  const imported = baseline ? [...baseline.sections.map(section => section.properties), baseline.finalSection] : [];
  const sourceParagraphs = new Map(baseline?.sections.map(section => [section.paragraph, section.properties] as const));
  const result: { start: number; end: number; boundary?: WordSectionBoundary; properties: WordSectionProperties }[] = [];
  const lastSource = new Map<number, number>();
  let cursor = 0;
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') continue;
    for (let i = 0; i < part.insert.length; i++) if (part.insert[i] === '\n' && part.attributes?.wordParagraph !== undefined) lastSource.set(part.attributes.wordParagraph, cursor + i);
    cursor += part.insert.length;
  }
  let offset = 0, start = 0;
  for (const part of text.toDelta()) {
    if (typeof part.insert !== 'string') continue;
    const attributes = part.attributes ?? {};
    for (let i = 0; i < part.insert.length; i++) {
      if (part.insert[i] !== '\n' || attributes.table) continue;
      let boundary = readWordSectionBoundary(attributes);
      if (boundary === undefined && attributes.wordParagraph !== undefined && lastSource.get(attributes.wordParagraph) === offset + i) {
        const original = sourceParagraphs.get(attributes.wordParagraph);
        if (original) boundary = { source: original.elementId, format: {} };
      }
      if (boundary) {
        const base = boundary.source === undefined ? finalSection : imported.find(section => section.elementId === boundary.source);
        if (!base) throw new Error('Unknown source section.');
        result.push({ start, end: offset + i + 1, boundary, properties: resolveWordSection(base, boundary.format) });
        start = offset + i + 1;
      }
    }
    offset += part.insert.length;
  }
  result.push({ start, end: text.length, properties: finalSection });
  return result;
}

/** Run within a staged transaction. Layout changes use the same projected text as human editing. */
export function applyWordLayoutOperation(doc: Y.Doc, selection: WordScopedSelection, operation: WordLayoutOperation, source?: WordArtifact) {
  const owner = wordSharedText(doc.getText('body'));
  const range = 'story' in selection && selection.story !== 'body' ? { start: 0, end: 0 } : owner.range(selection);
  const projected = projectWordSharedText(doc, 'body');
  const sections = inspectWordSections(owner.text, source);
  const current = sections.findIndex(section => range.start < section.end);
  const apply = (delta: WordDelta) => applyWordViewDelta(doc, 'body', owner.text, projected.spans, delta, projected.tables);
  const changes: { at: number; attributes: Record<string, unknown> }[] = [];
  const patch = (index: number, format: import('../section-format.ts').WordSectionFormat) => {
    const section = sections[index];
    if (!section) throw new Error('Unknown document section.');
    resolveWordSection(section.properties, format);
    if (section.boundary) changes.push({ at: section.end - 1, attributes: { wordSection: section.boundary, ...sectionPropertyPatch(format) } });
    else writeWordDocumentSettings(doc, { finalSection: format });
  };
  if (operation.name === 'section-layout') {
    const targets = operation.input.scope === 'document' ? sections.map((_, i) => i) : [operation.input.section ?? Math.max(0, current)];
    for (const index of targets) patch(index, operation.input.format);
  } else if (operation.name === 'section-break') {
    if (range.start !== range.end || 'cell' in selection || 'story' in selection && selection.story !== 'body') throw new Error('Insert a section break at a body caret outside a table.');
    const section = sections[Math.max(0, current)]!;
    patch(Math.max(0, current), { breakType: operation.input.type });
    const boundary: WordSectionBoundary = {
      ...(section.boundary?.source !== undefined ? { source: section.boundary.source } : source && source.document.finalSection.elementId >= 0 ? { source: source.document.finalSection.elementId } : {}),
      format: wordSectionFormat(section.properties),
    };
    const delta = createWordCommands().replaceWordDelta(owner.text, range, '\n');
    const inserted = delta.find(part => part.insert === '\n');
    if (!inserted) throw new Error('Missing section paragraph.');
    inserted.attributes = { ...inserted.attributes, wordSection: boundary };
    // Format the old terminator before inserting, so both edits retain stable original coordinates.
    if (changes.length) {
      const change = changes[0]!;
      apply([{ retain: change.at }, { retain: 1, attributes: change.attributes }]);
    }
    owner.sync();
    const updated = projectWordSharedText(doc, 'body');
    applyWordViewDelta(doc, 'body', owner.text, updated.spans, delta, updated.tables);
    owner.sync();
    return owner.selection({ start: range.start + 1, end: range.start + 1 });
  } else {
    const boundary = sections.find(section => section.boundary && (section.end - 1 === range.start || section.end === range.start));
    if (!boundary) throw new Error('Place the caret at a section break.');
    const index = sections.indexOf(boundary);
    const inherited = new Map<string, import('../document.ts').WordHeaderFooterReference>();
    for (const section of sections.slice(0, index + 2))
      for (const reference of [...section.properties.headerReferences, ...section.properties.footerReferences]) inherited.set(`${reference.kind}:${reference.type}`, reference);
    const following = sections[index + 1]!;
    const references: import('../section-format.ts').WordSectionFormat = {};
    const headers = [...inherited.values()].filter(reference => reference.kind === 'header');
    const footers = [...inherited.values()].filter(reference => reference.kind === 'footer');
    if (JSON.stringify(headers) !== JSON.stringify(following.properties.headerReferences)) references.headerReferences = headers;
    if (JSON.stringify(footers) !== JSON.stringify(following.properties.footerReferences)) references.footerReferences = footers;
    if (Object.keys(references).length) {
      patch(index + 1, references);
      for (const change of changes) apply([{ retain: change.at }, { retain: 1, attributes: change.attributes }]);
      owner.sync();
    }

    apply([{ retain: boundary.end - 1 }, { delete: 1 }]);
    owner.sync();
    const at = boundary.end - 1;
    return owner.selection({ start: at, end: at });
  }
  const delta: WordDelta = [];
  let cursor = 0;
  for (const change of changes.sort((a, b) => a.at - b.at)) {
    if (change.at > cursor) delta.push({ retain: change.at - cursor });
    delta.push({ retain: 1, attributes: change.attributes });
    cursor = change.at + 1;
  }
  if (delta.length) apply(delta);
  return selection;
}
