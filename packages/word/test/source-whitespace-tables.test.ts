import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { openWordArtifact } from '../src/index.ts';
import { openWordOperationDocument } from '../src/operations/index.ts';
import { restoreWordSourceWhitespace } from '../src/collaboration/source-whitespace.ts';
import { tableParagraphs } from '../src/collaboration/tables.ts';
import { structuredGrid, validateWordSharedDocument, WordStructuredUndo, prepareWordUpdate, commitWordUpdate } from '../src/collaboration/structured/index.ts';
import { tableAddresses, tableName, type TableRecord } from '../src/collaboration/structured/state.ts';
import { apply } from './structured-table-fixtures.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { clone, sync } from './structured-table-fixtures.ts';
import { wordSharedText } from '../src/collaboration/structured/view.ts';

function fixture(story: string, nested: boolean, spelling = 'A&#13;B', migrate = true) {
  const paragraph = `<w:p><w:r><w:t>${spelling}</w:t></w:r></w:p>`;
  const table = (content: string) => '<w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>' +
    [0, 1].map(() => '<w:tr>' + [0, 1].map(() => `<w:tc>${content}</w:tc>`).join('') + '</w:tr>').join('') + '</w:tbl>';
  const artifact = openWordArtifact(buildWordDocumentFixture({ documentXml:
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    table(paragraph + (nested ? table(paragraph) + '<w:p/>' : '')) + '<w:p/></w:body></w:document>' }));
  const session = openWordOperationDocument(artifact), doc = session.text.doc!, body = doc.getText('body');
  const text = story === 'body' ? body : doc.getText(story);
  if (text !== body) text.applyDelta(body.toDelta());
  // Recreate a v8 shared import before the semantic source whitespace fix.
  const previous: { insert: string; attributes?: Record<string, unknown> }[] = text.toDelta();
  text.delete(0, text.length);
  text.applyDelta(previous.map(part => {
    const element = typeof part.attributes?.wordSource === 'number' ? artifact.document.source.element(part.attributes.wordSource) : undefined;
    return { ...part, insert: element?.localName === 't'
      ? artifact.document.source.textContentOrigins(element).map(value => value.original).join('') : part.insert };
  }));
  const ids = [...new Set(tableParagraphs(text).flatMap(p => p.table ? [...(p.table.parents ?? []), p.table].map(cell => cell.id) : []))];
  if (migrate) for (const table of ids) apply(doc, { kind: 'migrate', table: { story, table } });
  return { session, doc, text, artifact, table: { story, table: ids[0]! }, nested: ids.slice(1).map(table => ({ story, table })) };
}

for (const story of ['body', 'header:1']) for (const kind of ['row', 'column', 'table'] as const)
  test(`source whitespace migration keeps deleted ${kind} witnesses valid in ${story}`, () => {
    const value = fixture(story, true), { doc, text, artifact, table, session } = value;
    try {
      // Child deletions are embedded in the parent's signature and must refresh first.
      for (const nested of value.nested) apply(doc, { kind: 'delete-table', table: nested });
      if (kind === 'table') apply(doc, { kind: 'delete-table', table });
      else {
        const cell = structuredGrid(doc, table)[0]!.cells[0]!.address;
        apply(doc, { kind: 'delete-axis', table, dimension: kind, id: cell[kind] });
      }
      expect(() => validateWordSharedDocument(doc)).not.toThrow();
      const before = text.toDelta();
      expect(restoreWordSourceWhitespace(text, artifact)).toBeGreaterThan(0);
      expect(text.toDelta()).toEqual(before);
      expect(wordSharedText(text).text.toString()).not.toContain('\r');
      expect(() => validateWordSharedDocument(doc)).not.toThrow();
      const cloned = new Y.Doc();
      try {
        Y.applyUpdate(cloned, Y.encodeStateAsUpdate(doc));
        expect(() => validateWordSharedDocument(cloned)).not.toThrow();
      } finally { cloned.destroy(); }
      // Undo the removals after migration: retained source is still usable.
      for (const address of tableAddresses(doc)) for (const [key, record] of doc.getMap<TableRecord>(tableName(address)))
        if (record.kind === 'remove' || record.kind === 'remove-table') doc.getMap(tableName(address)).delete(key);
      expect(() => validateWordSharedDocument(doc)).not.toThrow();
      expect(structuredGrid(doc, table)).toHaveLength(2);
    } finally { session.destroy(); }
  });

test('source whitespace migration does not accept an edit to previously deleted content', () => {
  const { doc, text, artifact, table, session } = fixture('body', true);
  try {
    apply(doc, { kind: 'delete-table', table });
    text.insert(0, 'Unobserved edit');
    expect(() => validateWordSharedDocument(doc)).toThrow('Deleted axis');
    expect(restoreWordSourceWhitespace(text, artifact)).toBeGreaterThan(0);
    expect(() => validateWordSharedDocument(doc)).toThrow('Deleted axis');
  } finally { session.destroy(); }
});

for (const kind of ['row', 'column', 'table'] as const)
  test(`pre-upgrade pending ${kind} deletion applies after binding source text`, () => {
    const { doc, text, artifact, table, session } = fixture('body', true), peer = clone(doc);
    try {
      const vector = Y.encodeStateVector(peer);
      if (kind === 'table') apply(peer, { kind: 'delete-table', table });
      else {
        const cell = structuredGrid(peer, table)[0]!.cells[0]!.address;
        apply(peer, { kind: 'delete-axis', table, dimension: kind, id: cell[kind] });
      }
      const pending = Y.encodeStateAsUpdate(peer, vector);
      restoreWordSourceWhitespace(text, artifact);
      Y.applyUpdate(doc, pending);
      expect(() => validateWordSharedDocument(doc)).not.toThrow();
      const reopened = clone(doc);
      try { expect(() => validateWordSharedDocument(reopened)).not.toThrow(); }
      finally { reopened.destroy(); }
    } finally { peer.destroy(); session.destroy(); }
  });

test('same-byte replacement with different source whitespace semantics is still an unobserved edit', () => {
  const { doc, text, artifact, table, session } = fixture('body', false, 'A\rB'), peer = clone(doc);
  try {
    restoreWordSourceWhitespace(text, artifact);
    const cell = structuredGrid(doc, table)[0]!.cells[0]!.address;
    apply(doc, { kind: 'delete-axis', table, dimension: 'row', id: cell.row });
    const replacement = peer.getText('body');
    const parts: { attributes?: Record<string, unknown> }[] = replacement.toDelta();
    replacement.delete(1, 1); replacement.insert(1, '\r', parts[0]!.attributes);
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer));
    expect(() => validateWordSharedDocument(doc)).toThrow('Deleted axis');
  } finally { peer.destroy(); session.destroy(); }
});

for (const spelling of ['A\nB', 'A\r\nB', 'A&#13;B'])
  test(`pending row deletion retains its witness across projection: ${JSON.stringify(spelling)}`, () => {
    const { doc, text, artifact, table, session } = fixture('body', false, spelling, false);
    let peer: Y.Doc | undefined;
    try {
      restoreWordSourceWhitespace(text, artifact);
      const view = wordSharedText(text);
      view.commit(view.prepareMigration());
      peer = clone(doc);
      const vector = Y.encodeStateVector(peer), row = structuredGrid(peer, table)[0]!.id;
      apply(peer, { kind: 'delete-axis', table, dimension: 'row', id: row });
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer, vector));
      expect(() => validateWordSharedDocument(doc)).not.toThrow();
      expect(structuredGrid(doc, table)).toHaveLength(1);
      expect(view.text.toString()).not.toContain('\r');
      const cold = clone(doc);
      try { expect(wordSharedText(cold.getText('body')).text.toDelta()).toEqual(view.text.toDelta()); }
      finally { cold.destroy(); }
    } finally { peer?.destroy(); session.destroy(); }
  });

test('already committed table ranges cannot absorb an unobserved literal-LF prefix', () => {
  const { doc, text, artifact, table, session } = fixture('body', false, 'A\nB', false);
  try {
    // Only the first source cell contains LF, the historical parser left its A-prefix outside.
    const value = text.toString();
    for (let at = value.length - 1; at > value.indexOf('\n'); at--)
      if (value[at] === '\n' && value[at + 1] === 'B') text.delete(at, 1);
    apply(doc, { kind: 'migrate', table });
    restoreWordSourceWhitespace(text, artifact);
    apply(doc, { kind: 'delete-axis', table, dimension: 'row', id: structuredGrid(doc, table)[0]!.id });
    text.insert(0, 'UNOBSERVED');
    expect(() => validateWordSharedDocument(doc)).not.toThrow();
    expect(wordSharedText(text).text.toString()).toContain('UNOBSERVEDA\n');
  } finally { session.destroy(); }
});

for (const concurrent of [false, true]) test(`migration preserves selective deletion undo and redo, concurrent=${concurrent}`, () => {
  const { doc, text, artifact, table, session } = fixture('body', true);
  const undo = new WordStructuredUndo(doc);
  let peer: Y.Doc | undefined;
  try {
    const row = structuredGrid(doc, table)[0]!.id;
    commitWordUpdate(doc, prepareWordUpdate(doc, [{ kind: 'delete-axis', table, dimension: 'row', id: row }]), undo.origin);
    if (concurrent) {
      peer = clone(doc);
      restoreWordSourceWhitespace(peer.getText('body'), artifact);
    } else restoreWordSourceWhitespace(text, artifact);
    expect(undo.undo()).toBe(true);
    if (peer) sync(doc, peer);
    expect(structuredGrid(doc, table)).toHaveLength(2);
    expect(undo.redo()).toBe(true);
    if (peer) sync(doc, peer);
    expect(structuredGrid(doc, table)).toHaveLength(1);
    expect(() => validateWordSharedDocument(doc)).not.toThrow();
    expect(undo.undo()).toBe(true);
    if (peer) sync(doc, peer);
    expect(structuredGrid(doc, table)).toHaveLength(2);
  } finally { undo.destroy(); peer?.destroy(); session.destroy(); }
});
