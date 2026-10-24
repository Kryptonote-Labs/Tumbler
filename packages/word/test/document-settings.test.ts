import { expect, test } from 'bun:test';
import * as Y from 'yjs';
import type { TextAttributes } from '../src/collaboration/formatting.ts';
import { NativeWordDocument, applyWordDocumentSettings, createWordArtifact, openWordArtifact } from '../src/index.ts';
import { commitWordUpdate, prepareWordDocumentSettings, readWordDocumentSettings, WordStructuredUndo, wordSharedText } from '../src/collaboration/index.ts';
import { openWordOperationDocument } from '../src/operations/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
import { OOXML_NAMESPACES } from '@tumblerjs/ooxml';

const measurer = { measure: (text: string) => ({ width: text.length * 6, ascent: 9, descent: 3 }) };

for (const conformance of ['strict', 'transitional'] as const) {
  test(`${conformance} page colour creates settings and preserves source XML`, () => {
    const namespace = OOXML_NAMESPACES[conformance].wordprocessing;
    const source = openWordArtifact(buildWordDocumentFixture({ conformance,
      documentXml: `<x:document xmlns:x="${namespace}" xmlns:z="urn:retained" z:flag="yes"><x:body><x:p><x:r><x:t>Text</x:t></x:r></x:p></x:body></x:document>`,
    }));
    const edited = applyWordDocumentSettings(source, { background: '#C1E4F5' });
    expect(edited.document.background).toBe('#C1E4F5');
    expect(edited.document.source.source).toContain('z:flag="yes"');
    expect(edited.document.source.source.indexOf('w:background')).toBeLessThan(edited.document.source.source.indexOf('x:body'));
    const relationship = edited.document.package.relationships(edited.document.part.name).items.find(item => item.type.endsWith('/settings'))!;
    if (relationship.targetMode !== 'Internal') throw new Error('Expected internal settings');
    const settings = new TextDecoder().decode(edited.document.package.readPart(edited.document.package.getPart(relationship.targetPartName)!));
    expect(settings).toContain('displayBackgroundShape');
    expect(applyWordDocumentSettings(edited, { background: null }).document.background).toBeUndefined();
    expect(source.document.background).toBeUndefined();
  });
}

test('native settings affect rendering and export, and clearing overrides restores source values', () => {
  const source = applyWordDocumentSettings(createWordArtifact(), { background: '#112233' });
  const native = new NativeWordDocument({ source });
  native.updateSettings({ background: { theme: 'accent1', fallback: '#156082', tint: 153 } });
  expect(native.layout(measurer).background).toBe(native.background);
  const exported = native.artifact();
  expect(exported.document.background).toMatchObject({ theme: 'accent1', tint: 153 });
  native.updateSettings({ background: null });
  expect(native.layout(measurer).background).toBeUndefined();
  expect(native.artifact().document.background).toBeUndefined();
  native.updateSettings({});
  expect(native.background).toBe('#112233');
});

test('shared page settings replicate and undo without altering text', () => {
  const first = new Y.Doc();
  first.getText('body').insert(0, 'Text\n');
  const second = new Y.Doc();
  Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
  const history = new WordStructuredUndo(first);
  const edit = prepareWordDocumentSettings(first, { background: '#112233' });
  expect(readWordDocumentSettings(first)).toEqual({});
  commitWordUpdate(first, edit, history.origin);
  Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
  expect(readWordDocumentSettings(second)).toEqual({ background: '#112233' });
  expect(first.getText('body').toString()).toBe('Text\n');
  history.undo();
  expect(readWordDocumentSettings(first)).toEqual({});
  history.redo();
  expect(readWordDocumentSettings(first).background).toBe('#112233');
  history.destroy(); first.destroy(); second.destroy();
});

test('page colour uses the supported operation path for agents and projected editors', () => {
  const source = createWordArtifact({ paragraphs: [{ runs: [{ text: 'Text' }] }] });
  const session = openWordOperationDocument(source);
  session.commit(session.prepareOperation({ story: 'body', range: { start: 0, end: 0 } }, { name: 'page-color', input: { color: '#ABCDEF' } }));
  expect(session.artifact().document.background).toBe('#ABCDEF');
  const view = wordSharedText(session.text);
  view.commit(view.prepareOperation({ start: 0, end: 0 }, { name: 'page-color', input: { color: null } }));
  expect(session.artifact().document.background).toBeUndefined();
  session.destroy();
});

test('invalid shared settings fail before commit', () => {
  const doc = new Y.Doc();
  expect(() => prepareWordDocumentSettings(doc, { background: '#nothex' })).toThrow('Invalid document settings');
  doc.destroy();
});

test('page colour accepts a selection spanning cells and undo survives a remote column insertion', () => {
  const source = createWordArtifact({ blocks: [{ kind: 'table', rows: [[
    { blocks: [{ kind: 'paragraph', runs: [{ text: 'A' }] }] },
    { blocks: [{ kind: 'paragraph', runs: [{ text: 'B' }] }] },
  ]] }] });
  const session = openWordOperationDocument(source);
  const view = wordSharedText(session.text);
  const history = session.history();
  view.commit(view.prepareOperation({ start: 0, end: 3 }, { name: 'page-color', input: { color: '#ABCDEF' } }), history.origin);
  const remote = new Y.Doc();
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(session.text.doc!));
  const other = wordSharedText(remote.getText('body'));
  const parts: { attributes?: TextAttributes }[] = other.text.toDelta();
  const cell = parts.find(part => part.attributes?.table)?.attributes?.table;
  if (!cell) throw new Error('Expected a table cell');
  other.commit(other.prepareOperation({ start: 0, end: 0 }, { name: 'edit-table', input: { cellId: cell.cell, action: 'column-after' } }));
  Y.applyUpdate(session.text.doc!, Y.encodeStateAsUpdate(remote));
  expect(() => history.undo()).not.toThrow();
  expect(readWordDocumentSettings(session.text.doc!)).toEqual({});
  expect(session.grid(cell.id)[0]!.cells).toHaveLength(3);
  history.destroy(); session.destroy(); remote.destroy();
});

test('background display follows view and zoom even with leading ignorable extensions', () => {
  const ns = OOXML_NAMESPACES.transitional.wordprocessing;
  const source = openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${ns}"><w:body><w:p/></w:body></w:document>`,
    relationships: [{ id: 'settings', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', target: 'settings.xml' }],
    parts: [{ itemName: 'word/settings.xml', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml', xml: `<w:settings xmlns:w="${ns}" xmlns:x="urn:extension"><x:retained/><w:view w:val="print"/><w:zoom w:percent="100"/><w:compat/></w:settings>` }],
  }));
  const edited = applyWordDocumentSettings(source, { background: '#123456' });
  const xml = new TextDecoder().decode(edited.document.package.readPart(edited.document.package.getPart('/word/settings.xml')!));
  expect(xml).toContain('<x:retained/>');
  expect(xml.indexOf('displayBackgroundShape')).toBeGreaterThan(xml.indexOf('w:zoom'));
  expect(xml.indexOf('displayBackgroundShape')).toBeLessThan(xml.indexOf('w:compat'));
});


test('an imported theme colour without a theme part retains its RGB fallback', () => {
  const ns = OOXML_NAMESPACES.transitional.wordprocessing;
  const source = openWordArtifact(buildWordDocumentFixture({ documentXml: `<w:document xmlns:w="${ns}"><w:background w:color="FF0000" w:themeColor="accent1"/><w:body><w:p/></w:body></w:document>` }));
  const native = new NativeWordDocument({ source });
  expect(native.layout(measurer).background).toBe('#ff0000');
  expect(native.artifact().document.background).toMatchObject({ fallback: '#ff0000' });
});


test('page colour preserves a representable scoped selection', () => {
  const session = openWordOperationDocument(createWordArtifact({ paragraphs: [{ runs: [{ text: 'First second' }] }] }));
  const view = wordSharedText(session.text);
  const edit = view.prepareOperation({ start: 6, end: 12 }, { name: 'page-color', input: { color: '#123456' } });
  expect(view.commit(edit)).toEqual({ story: 'body', range: { start: 6, end: 12 } });
  session.destroy();
});


test('page colour omits scopes that cannot anchor across retained table content', () => {
  const session = openWordOperationDocument(createWordArtifact({ blocks: [
    { kind: 'paragraph', runs: [{ text: 'Before' }] },
    { kind: 'table', rows: [[{ blocks: [{ kind: 'paragraph', runs: [{ text: 'Cell' }] }] }]] },
    { kind: 'paragraph', runs: [{ text: 'After' }] },
  ] }));
  const view = wordSharedText(session.text);
  view.commit(view.prepareMigration());
  const range = { start: 3, end: view.text.length - 3 };
  const edit = view.prepareOperation(range, { name: 'page-color', input: { color: '#123456' } });
  expect(edit.range).toEqual(range);
  if (edit.selection) expect(() => session.anchor(edit.selection!)).not.toThrow();
  view.commit(edit);
  expect(session.artifact().document.background).toBe('#123456');
  session.destroy();
});
