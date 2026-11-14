import { expect, test } from 'bun:test';
import { beginPackageTransaction, openZipArchive, writeZipArchiveChanges } from '@tumblerjs/opc';
import { parseLosslessXml } from '@tumblerjs/ooxml';
import {
  createPresentation, applyPresentationCommand, importNativePresentation,
  openPresentationArtifact, createPresentationNativeArchive, openPresentationNativeArchive,
  slideTransitionKinds, normalizeSlideTransition, PresentationEditingSession,
} from '../src/index.ts';
import { readSlideTransition } from '../src/transition-reader.ts';
import { POWERPOINT_2010, POWERPOINT_2012 } from '../src/transitions.ts';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const bytes = (s: string) => new TextEncoder().encode(s);
function xml(artifact: ReturnType<typeof createPresentation>) {
  const pkg = artifact.document.package;
  return new TextDecoder().decode(pkg.readPart(pkg.getPart(artifact.document.slides[0]!.part)!));
}
function fixture(content: string) {
  const artifact = createPresentation(), pkg = artifact.document.package, slide = artifact.document.slides[0]!;
  return openPresentationArtifact(beginPackageTransaction(pkg).replacePart(slide.part, bytes(xml(artifact).replace('</p:sld>', content + '</p:sld>'))).commit());
}
for (const kind of slideTransitionKinds) test(`${kind} authors and round-trips through native archives and pptx`, () => {
  const source = importNativePresentation(createPresentation());
  const slideId = source.document.slides[0]!.id;
  const input = { kind, duration: 1234, advanceAfter: 0, advanceOnClick: false };
  const authored = applyPresentationCommand(source, { name: 'set-transition', slideId, transition: input });
  expect(authored.document.slides[0]!.transition).toEqual(normalizeSlideTransition(input));
  const restored = openPresentationNativeArchive(createPresentationNativeArchive(authored));
  const exported = openPresentationArtifact(restored.bytes());
  expect(exported.document.slides[0]!.transition).toEqual(authored.document.slides[0]!.transition);
  expect(exported.document.slides[0]!.diagnostics.filter(d => d.message.includes('transition'))).toEqual([]);
  expect(xml(exported)).toContain('p14:dur="1234"');
  expect(xml(exported)).not.toContain('morph');
});
test('effect options use the schema attribute names and preserve zero and false values', () => {
  const source = createPresentation(), slideId = source.document.slides[0]!.id;
  const set = (transition: Parameters<typeof normalizeSlideTransition>[0]) => applyPresentationCommand(source, { name: 'set-transition', slideId, transition });
  for (const transition of [
    { kind: 'split', direction: 'in', orientation: 'vert' },
    { kind: 'blinds', orientation: 'vert' },
    { kind: 'wheelReverse', spokes: 8 },
    { kind: 'prism', direction: 'd', content: true, inverted: false },
    { kind: 'glitter', pattern: 'hexagon', direction: 'u' },
    { kind: 'shred', pattern: 'rectangle', direction: 'out' },
    { kind: 'flythrough', direction: 'in', bounce: true },
    { kind: 'pageCurlSingle', invertX: true, invertY: false },
    { kind: 'fade', throughBlack: true, duration: 0 },
  ] as const) {
    const edited = set(transition);
    expect(edited.document.slides[0]!.transition).toEqual(normalizeSlideTransition(transition));
  }
  expect(xml(set({ kind: 'blinds', orientation: 'vert' }))).toContain('<p:blinds dir="vert"');
  expect(xml(set({ kind: 'split', orientation: 'vert' }))).toContain('orient="vert"');
  expect(xml(set({ kind: 'pageCurlSingle' }))).toContain('<p15:prstTrans prst="pageCurlSingle"');
});
test('changing and removing transitions retains independent slide timing and extensions', () => {
  const timing = '<p:timing><p:tnLst/></p:timing>';
  const extension = '<p:extLst><p:ext uri="keep"><x:thing xmlns:x="urn:keep"/></p:ext></p:extLst>';
  let artifact = fixture(timing + extension);
  const slideId = artifact.document.slides[0]!.id;
  artifact = applyPresentationCommand(artifact, { name: 'set-transition', slideId, transition: { kind: 'fade' } });
  expect(xml(artifact)).toContain(timing + extension);
  const root = parseLosslessXml(bytes(xml(artifact))).root;
  const children = root.children.filter(n => n.kind === 'element');
  expect(children.findIndex(n => n.localName === 'AlternateContent')).toBeLessThan(children.findIndex(n => n.localName === 'timing'));
  artifact = applyPresentationCommand(artifact, { name: 'set-transition', slideId, transition: { kind: 'curtains' } });
  expect(artifact.document.slides[0]!.transition?.kind).toBe('curtains');
  artifact = applyPresentationCommand(artifact, { name: 'set-transition', slideId, transition: null });
  expect(artifact.document.slides[0]!.transition).toBeUndefined();
  expect(xml(artifact)).not.toContain('AlternateContent');
  expect(xml(artifact)).toContain(timing + extension);
});
test('PowerPoint alternate content selects supported extensions and falls back from unknown namespaces', () => {
  const read = (requires: string, effect: string) => readSlideTransition(parseLosslessXml(bytes(
    `<p:sld xmlns:p="${P}" xmlns:mc="${MC}" xmlns:p14="${POWERPOINT_2010}" xmlns:p15="${POWERPOINT_2012}" xmlns:future="urn:future"><mc:AlternateContent><mc:Choice Requires="${requires}"><p:transition p14:dur="2500">${effect}</p:transition></mc:Choice><mc:Fallback><p:transition><p:fade/></p:transition></mc:Fallback></mc:AlternateContent></p:sld>`)).root);
  expect(read('p14 p15', '<p15:prstTrans prst="fracture" invX="true"/>')).toMatchObject({ kind: 'fracture', duration: 2500, invertX: true });
  expect(read('future', '<future:magic/>')?.kind).toBe('fade');
});
test('strict presentation namespaces survive transition editing', () => {
  const source = createPresentation();
  const archive = openZipArchive(source.bytes());
  const replacements = new Map<string, Uint8Array>();
  for (const part of archive.entries.filter(e => /\.(xml|rels)$/.test(e.name))) {
    const s = new TextDecoder().decode(archive.read(part));
    replacements.set(part.name, bytes(s.replaceAll(P, 'http://purl.oclc.org/ooxml/presentationml/main').replaceAll('http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main').replaceAll('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships').replaceAll('lim="800000"', 'lim="800%"')));
  }
  const strict = openPresentationArtifact(writeZipArchiveChanges(archive, { replacements }));
  const edited = applyPresentationCommand(strict, { name: 'set-transition', slideId: strict.document.slides[0]!.id, transition: { kind: 'prism' } });
  expect(edited.document.conformance).toBe('strict');
  expect(edited.document.slides[0]!.transition?.kind).toBe('prism');
  expect(xml(edited)).not.toContain(P);
});
test('transition commands participate in undo and redo', () => {
  const session = new PresentationEditingSession(importNativePresentation(createPresentation()));
  session.execute({ name: 'set-transition', slideId: session.artifact.document.slides[0]!.id, transition: { kind: 'push', direction: 'r' } });
  expect(session.artifact.document.slides[0]!.transition?.kind).toBe('push');
  expect(session.undo().document.slides[0]!.transition).toBeUndefined();
  expect(session.redo().document.slides[0]!.transition?.direction).toBe('r');
});
test('invalid combinations and Morph authoring are rejected without modifying the deck', () => {
  const source = createPresentation(), slideId = source.document.slides[0]!.id;
  for (const transition of [
    { kind: 'morph' }, { kind: 'push', direction: 'in' }, { kind: 'fade', spokes: 4 },
    { kind: 'shred', pattern: 'hexagon' }, { kind: 'fade', duration: -1 }, { kind: 'fade', advanceAfter: 4294967296 },
  ]) expect(() => applyPresentationCommand(source, JSON.parse(JSON.stringify({ name: 'set-transition', slideId, transition })))).toThrow();
  expect(source.document.slides[0]!.transition).toBeUndefined();
});
test('transition edits preserve sounds and extensions with declarations inherited inside the old transition', () => {
  const artifact = fixture('<p:transition xmlns:extra="urn:keep"><p:fade/><p:sndAc><p:endSnd/></p:sndAc><p:extLst><p:ext uri="keep"><extra:setting value="yes"/></p:ext></p:extLst></p:transition>');
  const edited = applyPresentationCommand(artifact, { name: 'set-transition', slideId: artifact.document.slides[0]!.id, transition: { kind: 'curtains' } });
  expect(edited.document.slides[0]!.transition?.kind).toBe('curtains');
  const parsed = parseLosslessXml(bytes(xml(edited)));
  expect([...parsed.elements('urn:keep', 'setting')].length).toBe(2);
  expect([...parsed.elements(P, 'endSnd')].length).toBe(2);
});
test('replacing a transition in mixed alternate content retains its independent slide timing', () => {
  const timing = '<p:timing><p:tnLst/></p:timing>';
  const artifact = fixture(`<mc:AlternateContent xmlns:mc="${MC}" xmlns:p14="${POWERPOINT_2010}"><mc:Choice Requires="p14"><p:transition><p:fade/></p:transition>${timing}</mc:Choice><mc:Fallback><p:transition><p:cut/></p:transition>${timing}</mc:Fallback></mc:AlternateContent>`);
  const edited = applyPresentationCommand(artifact, { name: 'set-transition', slideId: artifact.document.slides[0]!.id, transition: { kind: 'curtains' } });
  expect(edited.document.slides[0]!.transition?.kind).toBe('curtains');
  expect([...parseLosslessXml(bytes(xml(edited))).elements(P, 'timing')].length).toBe(2);
});
test('an unknown effect cannot impersonate a known effect using its local name', () => {
  const root = parseLosslessXml(bytes(`<p:sld xmlns:p="${P}"><p:transition><fake:fade xmlns:fake="urn:future"/></p:transition></p:sld>`)).root;
  expect(readSlideTransition(root)?.kind).toBe('{urn:future}fade');
});
