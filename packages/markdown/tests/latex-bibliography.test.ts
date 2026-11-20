import { expect, test } from 'bun:test';
import {
  bibEntryName,
  latexBibliographyDatabases,
  latexBibliographyFiles,
  latexCitationNumbers,
  parseBibtex,
  parseLatex,
  serializeLatex,
  setLatexBibliographyEntries,
} from '../src/latex';

const bib = `% My sources
@string{acm = "ACM"}
@Book{knuth84,
  author = {Donald E. Knuth},
  title = "The {\\TeX}book",
  publisher = acm # " Press",
  year = 1984
}
@article(lamport, author={Leslie Lamport and Others and Third}, title={LaTeX}, year={1994})`;

test('BibTeX entries read braced, quoted, bare and joined values', () => {
  const [book, article] = parseBibtex(bib);
  expect(book).toEqual({
    type: 'book',
    key: 'knuth84',
    fields: {
      author: 'Donald E. Knuth',
      title: 'The {\\TeX}book',
      publisher: 'acm Press',
      year: '1984',
    },
  });
  expect(article?.key).toBe('lamport');
  expect(bibEntryName(book!)).toBe('Knuth 1984');
  expect(bibEntryName(article!)).toBe('Lamport et al. 1994');
});

test('a preamble database round trips through the document', () => {
  const prefix = '\\documentclass{article}\n\\begin{document}\n';
  const entries = parseBibtex(bib);
  const written = setLatexBibliographyEntries(prefix, 'references.bib', entries);
  expect(written).toStartWith(
    '\\documentclass{article}\n\\begin{filecontents*}[overwrite]{references.bib}\n@book{knuth84,',
  );
  const [database] = latexBibliographyDatabases(written);
  expect(database?.name).toBe('references.bib');
  expect(database?.entries).toEqual(entries);
  const source =
    written + 'See \\cite{lamport} and \\cite{knuth84,lamport}.\n\n\\bibliographystyle{unsrt}\n\\bibliography{references}\n\\end{document}\n';
  const document = parseLatex(source);
  expect(serializeLatex(document)).toBe(source);
  expect(latexBibliographyFiles(source)).toEqual({ files: ['references.bib'], style: 'unsrt' });
  expect([...latexCitationNumbers(document, 'unsrt')!]).toEqual([
    ['lamport', 1],
    ['knuth84', 2],
  ]);
  // Sorted styles print numbers Visual cannot know without BibTeX.
  expect(latexCitationNumbers(document, 'plain')).toBeUndefined();
  const updated = setLatexBibliographyEntries(written, 'references.bib', entries.slice(0, 1));
  expect(latexBibliographyDatabases(updated)[0]?.entries.map((entry) => entry.key)).toEqual(['knuth84']);
});
