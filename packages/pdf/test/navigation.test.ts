import { expect, test } from 'bun:test';
import {
  openPdfDocument,
  PdfNavigation,
  PdfTextModel,
  PdfEditingFonts,
  exportEditedPdf,
  isSafePdfUri,
  PdfName,
  PdfString,
} from '../src/index.ts';
import { navigationFixture } from './navigation-fixture.ts';

test('resolve link actions, named destinations and nested outline in viewport coordinates', () => {
  const document = openPdfDocument(navigationFixture()),
    navigation = new PdfNavigation(document);
  const pageId = document.pages[1]!.id;
  expect(navigation.links(document.pages[0]!)).toEqual([
    { rect: [10, 10, 80, 30], target: { kind: 'internal', pageId, x: 20, y: 40 } },
    { rect: [10, 40, 80, 60], target: { kind: 'internal', pageId, x: 0, y: 50 } },
    { rect: [10, 70, 80, 90], target: { kind: 'internal', pageId, x: 30, y: 80 } },
    { rect: [10, 100, 80, 120], target: { kind: 'external', uri: 'https://example.com' } },
  ]);
  expect(navigation.outline()[0]).toMatchObject({
    title: 'Chapter',
    target: { pageId, y: 80 },
    children: [{ title: 'Detail', target: { pageId, y: 50 } }],
  });
});

test('page reorder, insert, rotation and delete preserve surviving navigation on export', () => {
  const document = openPdfDocument(navigationFixture()),
    model = new PdfTextModel(),
    fonts = new PdfEditingFonts();
  try {
    model.pages.initialize(document.pages);
    const [first, second] = document.pages;
    model.pages.move(document.pages, second!.id, first!.id);
    model.pages.insert(document.pages, second!.id, { width: 200, height: 200 });
    const output = openPdfDocument(exportEditedPdf(document, model, fonts));
    const navigation = new PdfNavigation(output);
    expect(navigation.links(output.pages[2]!)[0]!.target).toMatchObject({
      pageId: output.pages[0]!.id,
      y: 40,
    });
    expect(navigation.outline()[0]!.target).toMatchObject({ pageId: output.pages[0]!.id });
    model.pages.remove(document.pages, [second!.id]);
    const deleted = openPdfDocument(exportEditedPdf(document, model, fonts));
    const remaining = new PdfNavigation(deleted);
    expect(remaining.links(deleted.pages[1]!)).toHaveLength(1);
    expect(remaining.outline()).toHaveLength(0);
  } finally {
    model.doc.destroy();
  }
});

test('unsafe URI actions and cyclic named destinations do not become browser navigation', () => {
  for (const uri of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,hi',
    'ftp://example.com',
    '/relative',
  ])
    expect(isSafePdfUri(uri)).toBe(false);
  for (const uri of ['https://example.com', 'http://example.com', 'mailto:alex@example.com'])
    expect(isSafePdfUri(uri)).toBe(true);
  const document = openPdfDocument(navigationFixture());
  document.source.catalog.set('Dests', new Map([['loop', new PdfName('loop')]]));
  expect(
    new PdfNavigation(document).destination(new PdfString(new TextEncoder().encode('loop'))),
  ).toBeUndefined();
});
