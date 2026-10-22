import { expect, test } from 'bun:test';
import { importWordContent, layoutWordDocument, NativeWordDocument, openWordArtifact } from '../src/index.ts';
import { numberingStoryFixture, numberingStoryMeasurer as measure } from './numbering-story-fixture.ts';

const heading = [{ kind: 'paragraph' as const, styleId: 'Heading1', runs: [{ text: 'heading' }] }];
const headerMarkers = (layout: ReturnType<typeof layoutWordDocument>) => layout.pages[0]!.headerLines.flatMap(line => line.marker ? [line.marker.text.trim()] : []);
const bodyMarkers = (model: NativeWordDocument) => [...model.listMarkers.values()].map(marker => marker.text);
const exportedBody = (model: NativeWordDocument) => {
  const document = openWordArtifact(model.artifact().bytes()).document;
  return [...document.numbering.markers(document).values()].map(marker => marker.text);
};

for (const immutableContent of [false, true]) for (const cached of [false, true]) {
  test(`header style materialization updates body numbering: immutable=${immutableContent}, cached=${cached}`, () => {
    const source = numberingStoryFixture();
    const model = new NativeWordDocument({ source, immutableContent });
    if (cached) model.layout(measure);
    model.updateStory('/word/header.xml', heading);
    expect(bodyMarkers(model)).toEqual(['5.']);
    expect(exportedBody(model)).toEqual(['5.']);
    expect(headerMarkers(model.layout(measure))).toEqual(['5.']);
    expect(headerMarkers(layoutWordDocument(model.artifact().document, measure))).toEqual(['5.']);
    model.removeStory('/word/header.xml');
    expect(bodyMarkers(model)).toEqual([]);
    expect(headerMarkers(model.layout(measure))).toEqual([]);
    expect(exportedBody(model)).toEqual([]);
  });

  test(`body style materialization updates retained header numbering: immutable=${immutableContent}, cached=${cached}`, () => {
    const source = numberingStoryFixture();
    const originalHeader = source.document.package.readPart(source.document.headerFooters[0]!.part);
    const model = new NativeWordDocument({ source, immutableContent });
    const body = importWordContent(source);
    if (cached) model.layout(measure);
    model.update([...body, ...heading]);
    expect(bodyMarkers(model)).toEqual(['5.', '6.']);
    expect(headerMarkers(model.layout(measure))).toEqual(['5.']);
    expect(headerMarkers(layoutWordDocument(model.artifact().document, measure))).toEqual(['5.']);
    const progressive = model.layoutProgressively(measure);
    let result = progressive.next();
    while (!result.done) result = progressive.next();
    expect(headerMarkers(result.value)).toEqual(['5.']);
    expect(model.artifact().document.package.readPart(model.artifact().document.headerFooters[0]!.part)).toEqual(originalHeader);
    model.update(body);
    expect(headerMarkers(model.layout(measure))).toEqual([]);
    expect(headerMarkers(layoutWordDocument(model.artifact().document, measure))).toEqual([]);
  });
}

test('body materialization preserves inherited numbering in an edited existing header', () => {
  const source = numberingStoryFixture();
  const model = new NativeWordDocument({ source });
  model.update([...importWordContent(source), ...heading]);
  model.updateStory('/word/header.xml', [{ kind: 'paragraph', source: source.document.headerFooters[0]!.blocks[0]!.elementId, styleId: 'Child', runs: [{ text: 'edited' }] }]);
  expect(headerMarkers(model.layout(measure))).toEqual(['5.']);
  expect(headerMarkers(layoutWordDocument(model.artifact().document, measure))).toEqual(['5.']);
});

test('a section-targeted new header shares package numbering styles', () => {
  const source = numberingStoryFixture();
  const model = new NativeWordDocument({ source });
  model.updateStory({ section: 0, kind: 'header', type: 'first' }, heading);
  expect(bodyMarkers(model)).toEqual(['5.']);
  expect(exportedBody(model)).toEqual(['5.']);
});

for (const immutableContent of [false, true]) {
  test(`existing section target preserves shared numbering, immutable=${immutableContent}`, () => {
    const source = numberingStoryFixture();
    const model = new NativeWordDocument({ source, immutableContent });
    model.update([...importWordContent(source), ...heading]);
    model.updateStory({ section: 0, kind: 'header', type: 'default' }, [{ kind: 'paragraph', source: source.document.headerFooters[0]!.blocks[0]!.elementId, styleId: 'Child', runs: [{ text: 'edited' }] }]);
    expect(headerMarkers(model.layout(measure))).toEqual(['5.']);
    expect(headerMarkers(layoutWordDocument(model.artifact().document, measure))).toEqual(['5.']);
  });
  test(`replacement story budgets only final content, immutable=${immutableContent}`, () => {
    const source = numberingStoryFixture();
    const model = new NativeWordDocument({ source, immutableContent, maxMarkerCharacters: 0 });
    const story = model.updateStory('/word/header.xml', [{ kind: 'paragraph', source: source.document.headerFooters[0]!.blocks[0]!.elementId, styleId: 'Child', runs: [{ text: 'edited' }] }]);
    expect(story.listMarkers.size).toBe(0);
    expect(headerMarkers(model.layout(measure))).toEqual([]);
    expect(headerMarkers(layoutWordDocument(model.artifact().document, measure))).toEqual([]);
  });
}
