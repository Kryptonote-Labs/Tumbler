import { expect, test } from 'bun:test';
import { PartName } from '@tumblerjs/opc';
import { createWordStory, importWordContent, openWordArtifact, reconcileWordContent, wordStoryArtifact, type WordContentBlock } from '../src/index.ts';
import { reconcileWordContentAndStories } from '../src/content-export-batch.ts';
import { storyMainArtifact } from '../src/stories.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';

const image = { bytes: Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')), contentType: 'image/png' as const, width: 20, height: 30 };
const content = (styleId: string): WordContentBlock[] => [{ kind: 'paragraph', styleId, runs: [
  { text: 'Story link', link: 'https://example.com/story', format: { color: { theme: 'accent1', fallback: '#156082' } } }, { text: '\uFFFC', image },
] }];

for (const conformance of ['strict', 'transitional'] as const) {
  for (const kind of ['header', 'footer'] as const) {
    test(`${conformance} ${kind}-first resources belong to main; media and links remain local`, () => {
      const source = openWordArtifact(buildWordDocumentFixture({ conformance }));
      const created = createWordStory(source, { kind, type: 'default', section: 0 });
      const bodyBytes = created.artifact.document.package.readPart(created.artifact.document.part);
      const edited = reconcileWordContent(wordStoryArtifact(created.artifact, created.partName), content('Heading1'));
      const reopened = openWordArtifact(edited.bytes());
      const main = reopened.document;
      const office = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      const shared = main.package.relationships(main.part.name).items;
      expect(shared.filter(rel => rel.type === `${office}/styles`)).toHaveLength(1);
      expect(shared.filter(rel => rel.type === `${office}/theme`)).toHaveLength(1);
      expect(main.styles.style('Heading1')).toBeDefined();
      expect(main.styles.themeColors).toBeDefined();
      expect(main.package.readPart(main.part)).toEqual(bodyBytes);
      const local = main.package.relationships(PartName.parse(created.partName)).items;
      expect(local.filter(rel => /\/(styles|theme)$/.test(rel.type))).toHaveLength(0);
      expect(local.filter(rel => rel.type === `${office}/image`)).toHaveLength(1);
      expect(local.filter(rel => rel.type === `${office}/hyperlink`)).toHaveLength(1);
      const story = wordStoryArtifact(reopened, created.partName);
      expect(importWordContent(story)[0]).toMatchObject({ styleId: 'Heading1', runs: [{ text: 'Story link', link: 'https://example.com/story' }, { text: '\uFFFC' }] });
      expect([...story.document.drawings.values()][0]).toMatchObject({ kind: 'image', bytes: image.bytes, widthPoints: 20, heightPoints: 30 });
      const stylesName = main.styles.partName!;
      const theme = shared.find(rel => rel.type === `${office}/theme`)!;
      if (theme.targetMode !== 'Internal') throw new Error('Expected internal theme');
      const themeBytes = main.package.readPart(main.package.getPart(theme.targetPartName)!);
      expect(new TextDecoder().decode(themeBytes)).toContain(conformance === 'strict' ? '<a:miter lim="800%"' : '<a:miter lim="800000"');
      const updated = storyMainArtifact(reconcileWordContent(story, content('Heading2')));
      expect(updated.document.styles.partName).toEqual(stylesName);
      expect(updated.document.styles.style('Heading1')).toBeDefined();
      expect(updated.document.styles.style('Heading2')).toBeDefined();
      expect(updated.document.package.readPart(updated.document.package.getPart(theme.targetPartName)!)).toEqual(themeBytes);
    });
  }

  test(`${conformance} shared allocation avoids main relationship ID collisions at a nonstandard path`, () => {
    const office = conformance === 'strict' ? 'http://purl.oclc.org/ooxml/officeDocument/relationships' : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const initial = openWordArtifact(buildWordDocumentFixture({ conformance, documentItemName: 'custom/main.xml', relationships: ['tumbler-styles', 'tumbler-content-theme'].map(id => ({ id, type: `${office}/hyperlink`, target: 'https://example.com/original', targetMode: 'External' as const })) }));
    const header = createWordStory(initial, { kind: 'header', type: 'default', section: 0 });
    const main = storyMainArtifact(reconcileWordContent(wordStoryArtifact(header.artifact, header.partName), content('Heading1')));
    const rels = main.document.package.relationships(main.document.part.name).items;
    for (const id of ['tumbler-styles', 'tumbler-content-theme']) expect(rels.find(rel => rel.id === id)).toMatchObject({ type: `${office}/hyperlink`, target: 'https://example.com/original' });
    expect(main.document.styles.style('Heading1')).toBeDefined();
    expect(main.document.styles.themeColors).toBeDefined();
    const theme = rels.find(rel => rel.type === `${office}/theme`)!;
    if (theme.targetMode !== 'Internal') throw new Error('Expected internal theme');
    const xml = new TextDecoder().decode(main.document.package.readPart(main.document.package.getPart(theme.targetPartName)!));
    expect(xml).toContain(conformance === 'strict' ? 'http://purl.oclc.org/ooxml/drawingml/main' : 'http://schemas.openxmlformats.org/drawingml/2006/main');
  });

  test(`${conformance} edited body and multiple stories share styles/theme and preserve existing definitions`, () => {
    const header = createWordStory(openWordArtifact(buildWordDocumentFixture({ conformance })), { kind: 'header', type: 'default', section: 0 });
    const footer = createWordStory(header.artifact, { kind: 'footer', type: 'default', section: 0 });
    const body: WordContentBlock[] = [{ kind: 'paragraph', runs: [{ text: 'Edited body' }] }];
    const edits = [header.partName, footer.partName].map((partName, i) => ({ partName, blocks: content(`Heading${i + 1}`) }));
    const combined = reconcileWordContentAndStories(footer.artifact, body, edits);
    const sequential = edits.reduce((main, edit) => storyMainArtifact(reconcileWordContent(wordStoryArtifact(main, edit.partName), edit.blocks)), reconcileWordContent(footer.artifact, body));
    expect(combined.bytes()).toEqual(sequential.bytes());
    const main = openWordArtifact(combined.bytes());
    expect(importWordContent(main)[0]).toMatchObject(body[0]!);
    expect(main.document.styles.style('Heading1')).toBeDefined();
    expect(main.document.styles.style('Heading2')).toBeDefined();
    expect(main.document.package.parts.filter(part => /\.(styles|theme)\+xml$/.test(part.contentType))).toHaveLength(2);
    for (const edit of edits) expect(main.document.package.relationships(PartName.parse(edit.partName)).items.some(rel => /\/(styles|theme)$/.test(rel.type))).toBe(false);
    const again = reconcileWordContentAndStories(main, body, edits);
    for (const part of main.document.package.parts.filter(part => /\.(styles|theme)\+xml$/.test(part.contentType))) {
      expect(again.document.package.readPart(again.document.package.getPart(part.name)!)).toEqual(main.document.package.readPart(part));
    }
  });
}
