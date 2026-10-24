import { expect, test } from 'bun:test';
import * as Y from 'yjs';
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
