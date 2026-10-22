import { expect, test } from 'bun:test';
import { ns, rel, p, open, paragraphs, selection, texts } from './structural-editor-fixture.ts';

for (const block of ['<w:tbl><w:tr><w:tc>' + p('cell') + '</w:tc></w:tr></w:tbl>', '<w:sdt><w:sdtContent>' + p('hidden') + '</w:sdtContent></w:sdt>']) {
  for (const replacement of ['', '\nX\n']) {
    test(`refuses crossing ${block.slice(0, 6)} with ${JSON.stringify(replacement)} atomically`, () => {
      const artifact = open(p('a') + block + p('b'));
      const before = artifact.bytes().slice();
      expect(() => artifact.replaceText(selection(artifact, 1, 0, 1), replacement)).toThrow();
      expect(artifact.bytes()).toEqual(before);
    });
  }
}
