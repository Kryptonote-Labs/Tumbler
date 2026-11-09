import { expect, test } from 'bun:test';
import { applyPresentationCommand as run, createPresentation, openPresentationArtifact, importNativePresentation, slideTextValue } from '../src/index.ts';

for (const native of [false, true]) {
  test(`notes, text links, shape links and alt text survive export (${native ? 'native' : 'package'})`, () => {
    let deck = createPresentation();
    if (native) deck = importNativePresentation(deck);
    const slideId = deck.document.slides[0]!.id;
    deck = run(deck, {name: 'set-notes', slideId, notes: 'Talk about A & B\nNext topic'});
    deck = run(deck, {name: 'insert-object', slideId, bounds: {x: 10, y: 10, width: 300, height: 100}, object: {kind: 'shape', text: 'Hello world\nSecond line'}});
    const objectKey = deck.document.slides[0]!.objects[0]!.key;
    deck = run(deck, {name: 'set-link', slideId, objectKey, start: 2, end: 8, href: 'https://example.com/a?b=1&c=2'});
    deck = run(deck, {name: 'set-link', slideId, objectKey, href: 'https://example.com/shape'});
    deck = run(deck, {name: 'set-alt-text', slideId, objectKey, alt: 'An accessible shape'});
    let saved = openPresentationArtifact(deck.bytes());
    expect(saved.document.slides[0]!.notes).toBe('Talk about A & B\nNext topic');
    let object = saved.document.slides[0]!.objects[0]!;
    expect(slideTextValue(object)).toBe('Hello world\nSecond line');
    expect(object.alt).toBe('An accessible shape');
    expect(object.hyperlink?.href).toBe('https://example.com/shape');
    expect(object.text!.paragraphs[0]!.runs.filter(r => r.hyperlink).map(r => r.text).join('')).toBe('llo wo');
    saved = run(saved, {name: 'set-link', slideId: saved.document.slides[0]!.id, objectKey: object.key, start: 2, end: 8, href: ''});
    saved = run(saved, {name: 'set-notes', slideId: saved.document.slides[0]!.id, notes: ''});
    saved = openPresentationArtifact(saved.bytes());
    object = saved.document.slides[0]!.objects[0]!;
    expect(object.text!.paragraphs[0]!.runs.some(r => r.hyperlink)).toBe(false);
    expect(saved.document.slides[0]!.notes).toBe('');
  });
}

test('replacing a picture retains its frame, alt text and shape link', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  let deck: ReturnType<typeof createPresentation> = importNativePresentation(createPresentation());
  const slideId = deck.document.slides[0]!.id;
  deck = run(deck, {name: 'insert-object', slideId, bounds: {x: 20, y: 30, width: 150, height: 100}, object: {kind: 'image', data: png, contentType: 'image/png'}});
  const before = deck.document.slides[0]!.objects[0]!, objectKey = before.key;
  deck = run(deck, {name: 'set-alt-text', slideId, objectKey, alt: 'A picture'});
  deck = run(deck, {name: 'set-link', slideId, objectKey, href: 'https://example.com'});
  deck = run(deck, {name: 'replace-picture', slideId, objectKey, data: png, contentType: 'image/png'});
  const saved = openPresentationArtifact(deck.bytes()).document.slides[0]!.objects[0]!;
  expect(saved.transform).toEqual(before.transform);
  expect(saved.alt).toBe('A picture');
  expect(saved.hyperlink?.href).toBe('https://example.com/');
  expect(saved.image?.bytes).toEqual(Uint8Array.from(atob(png), c => c.charCodeAt(0)));
});
