import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import { openWordArtifact } from '../src/index.ts';
import { openWordOperationDocument } from '../src/operations/index.ts';
import { restoreWordSourceWhitespace } from '../src/collaboration/source-whitespace.ts';
import { tableParagraphs } from '../src/collaboration/tables.ts';
import { structuredGrid, validateWordSharedDocument } from '../src/collaboration/structured/index.ts';
import { tableAddresses, tableName, type TableRecord } from '../src/collaboration/structured/state.ts';
import { apply } from './structured-table-fixtures.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

function fixture(story: string, nested: boolean) {
  const paragraph = '<w:p><w:r><w:t>A&#13;B</w:t></w:r></w:p>';
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
  text.applyDelta(previous.map(part => ({ ...part, insert: part.insert.replaceAll('\u2028', '\r') })));
  const ids = [...new Set(tableParagraphs(text).flatMap(p => p.table ? [...(p.table.parents ?? []), p.table].map(cell => cell.id) : []))];
  for (const table of ids) apply(doc, { kind: 'migrate', table: { story, table } });
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
      expect(restoreWordSourceWhitespace(text, artifact)).toBeGreaterThan(0);
      expect(text.toString()).not.toContain('\r');
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
