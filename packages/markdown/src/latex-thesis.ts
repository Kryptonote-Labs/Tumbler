import {
  addLatexBibliographyDatabase,
  createLatexComposedPage,
  createLatexHeading,
  createLatexStructure,
  editLatexPageComposition,
  parseLatex,
  parseLatexFragment,
  serializeLatex,
  setLatexBaseSize,
  setLatexBibliographyContents,
  setLatexBibliographyEntries,
  setLatexDocumentClass,
  setLatexFrontMatter,
  setLatexGeometry,
  setLatexLineSpacing,
  setLatexPageNumberSection,
  withLatexPackage,
  type LatexComposedPageKind,
} from './latex';
import type { Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';

export const thesisTitle = 'Title of the thesis';

/** Create a composed page with the line styles used by the Thesis starter. */
export function composeLatexPage(
  document: Node,
  kind: LatexComposedPageKind,
  lines: readonly string[],
) {
  const page = createLatexComposedPage(document, kind);
  let source = String(page.attrs.source);
  for (const [index, text] of lines.entries()) {
    if (index) source = editLatexPageComposition(source, index - 1, { kind: 'add-line' });
    source = editLatexPageComposition(source, index, { kind: 'line-text', text });
  }
  source = editLatexPageComposition(source, 0, {
    kind: 'line-style',
    style:
      kind === 'title'
        ? { size: 'LARGE', bold: true }
        : { size: 'Large', bold: true, alignment: 'center' },
  });
  if (kind === 'title') {
    source = editLatexPageComposition(source, 0, { kind: 'space', length: '12mm' });
    source = editLatexPageComposition(source, 0, { kind: 'page-alignment', alignment: 'center' });
  }
  return page.type.create({ source, before: kind === 'title' ? '\n' : null });
}

const referenceKey = 'placeholder';
const chapters = [
  {
    title: 'Introduction',
    section: 'Background',
    text: 'Introduce the research question and cite your sources~\\cite{' + referenceKey + '}.',
  },
  { title: 'Methods', section: 'Approach', text: 'Describe the research methods here.' },
  { title: 'Results', section: 'Discussion', text: 'Present and discuss the findings here.' },
];

/** Seed the Thesis template with the same blocks and setup used by the editor. Lines the writer
 * has not supplied stay empty so editors can prompt for them and nothing stray reaches the PDF. */
export function latexThesis({
  title = thesisTitle,
  author = '',
  date = '',
  paperSize = 'a4paper',
  orientation = '',
  margin = '1in',
}: {
  title?: string | undefined;
  author?: string | undefined;
  date?: string | undefined;
  paperSize?: string;
  orientation?: string;
  margin?: string;
} = {}) {
  let prefix = setLatexDocumentClass('\\begin{document}', 'report');
  prefix = setLatexBaseSize(prefix, 12);
  prefix = setLatexGeometry(prefix, { paperSize, orientation, margin, twoSided: true });
  prefix = withLatexPackage(prefix, 'amsmath');
  prefix = withLatexPackage(prefix, 'parskip');
  prefix = setLatexLineSpacing(prefix, 'onehalf');
  const database = 'references';
  prefix = setLatexBibliographyEntries(prefix, database + '.bib', [
    { type: 'misc', key: referenceKey, fields: { title: 'Reference title' } },
  ]);

  const tr = new Transform(parseLatex(prefix + '\n\n\\end{document}\n'));
  const append = () => tr.doc.content.size;
  tr.replaceWith(
    0,
    append(),
    composeLatexPage(tr.doc, 'title', [title, author, date]),
  );
  setLatexPageNumberSection(tr, append(), { format: 'roman', startAt: 1 });
  setLatexFrontMatter(tr, 'abstract', true);

  for (const heading of ['Acknowledgements', 'Dedication', 'Epigraph']) {
    tr.insert(append(), composeLatexPage(tr.doc, 'page', [heading, '']));
  }
  setLatexFrontMatter(tr, 'tableofcontents', true);
  setLatexFrontMatter(tr, 'listoffigures', true);
  setLatexFrontMatter(tr, 'listoftables', true);

  const main = append();
  for (const { title, section, text } of chapters) {
    tr.insert(append(), createLatexHeading(tr.doc, 'chapter', title));
    tr.insert(append(), createLatexHeading(tr.doc, 'section', section));
    tr.insert(append(), parseLatexFragment(tr.doc, text));
  }
  setLatexPageNumberSection(tr, main, { format: 'arabic', startAt: 1 });
  tr.insert(append(), createLatexStructure(tr.doc, 'appendix'));
  tr.insert(append(), createLatexHeading(tr.doc, 'chapter', 'Supplementary material'));
  tr.insert(append(), parseLatexFragment(tr.doc, 'Add supplementary material here.'));
  addLatexBibliographyDatabase(tr, database);
  setLatexBibliographyContents(tr, true);
  return { source: serializeLatex(tr.doc), prefix: String(tr.doc.attrs.prefix) };
}
