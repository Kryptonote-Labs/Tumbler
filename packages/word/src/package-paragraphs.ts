import type { WordTextParagraph, WordTextRun } from './create.ts';
import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { WordArtifact } from './artifact.ts';
import { PackageXml } from './package-xml.ts';
import type { contentCopyScopes } from './package-copies.ts';
import { xml, runProperties } from './create-xml.ts';

/** Rebuild paragraph text while retaining source wrappers and zero-width Word markup. */
export function wordParagraphRenderer(
  markup: PackageXml,
  originals: readonly WordTextParagraph[],
  paragraphs: readonly WordTextParagraph[],
  generated: WordArtifact,
  numberingMarkup: (value: string) => string,
  remap: (value: string) => string,
  copies: ReturnType<typeof contentCopyScopes>,
  replacedImages: ReadonlySet<WordTextRun>,
) {
  const document = markup.document;
  const generatedXml = new PackageXml(generated.document);
  const originalRuns = new Map(
    originals.flatMap((p) => p.runs.map((run) => [run.source!, run] as const)),
  );
  const originalParagraphs = new Map(originals.map((p) => [p.source!, p]));
  const generatedParagraphs = generated.document.blocks.filter(
    (block) => block.kind === 'paragraph',
  );
  const indexByParagraph = new Map(paragraphs.map((p, index) => [p, index]));
  const states = new Map<number, { emitted: Set<number>; remaining: Map<number, number> }>();
  for (const p of paragraphs) {
    const scope = copies.scopes.get(p) ?? 0;
    let state = states.get(scope);
    if (!state) {
      state = { emitted: new Set(), remaining: new Map() };
      states.set(scope, state);
    }
    for (const run of p.runs)
      if (run.source !== undefined)
        state.remaining.set(run.source, (state.remaining.get(run.source) ?? 0) + 1);
  }
  let emitted = new Set<number>();
  let remaining = new Map<number, number>();
  const visible = new Set(originalRuns.keys());
  const before = new Map<number, string[]>();
  const trailing = new Map<number, string[]>();
  for (const paragraph of originals) {
    let pending: string[] = [];
    const walk = (element: LosslessXmlElement, wrappers: LosslessXmlElement[]) => {
      if (visible.has(element.id)) {
        before.set(element.id, pending);
        pending = [];
        return;
      }
      const contains = (node: LosslessXmlElement): boolean =>
        visible.has(node.id) || markup.children(node).some(contains);
      if (!contains(element)) {
        if (['pPr', 'rPr'].includes(element.localName)) return;
        let raw = markup.raw(element);
        for (const wrapper of wrappers.toReversed()) {
          const props = markup.children(wrapper, 'rPr')[0];
          raw = markup.wrap(wrapper, wrapper.localName, (props ? markup.raw(props) : '') + raw);
        }
        pending.push(raw);
        return;
      }
      for (const child of markup.children(element))
        if (!['pPr', 'rPr'].includes(child.localName)) walk(child, [...wrappers, element]);
    };
    const element = markup.element(paragraph.source, 'p')!;
    for (const child of markup.children(element)) walk(child, []);
    trailing.set(paragraph.source!, pending);
  }
  const text = (value: string) =>
    markup.word(
      value
        .split(/([\t\u2028])/)
        .map((part) =>
          part === '\t'
            ? '<w:tab/>'
            : part === '\u2028'
              ? '<w:br/>'
              : part
                ? `<w:t xml:space="preserve">${xml(part)}</w:t>`
                : '',
        )
        .join(''),
    );
  const owners = new Map(
    originals.flatMap((p) => p.runs.map((run) => [run.source!, p] as const)),
  );
  const finishSource = (paragraph: WordTextParagraph) => {
    if (
      paragraph.source === undefined ||
      paragraph.runs.some((run) => (remaining.get(run.source!) ?? 0) > 0)
    )
      return '';
    let result = '';
    for (const run of paragraph.runs)
      if (!emitted.has(run.source!)) {
        result += (before.get(run.source!) ?? []).join('');
        emitted.add(run.source!);
      }
    if (!emitted.has(-paragraph.source)) {
      result += (trailing.get(paragraph.source) ?? []).join('');
      emitted.add(-paragraph.source);
    }
    return result;
  };
  const runMarkup = (run: WordTextRun, generatedRun: string | undefined) => {
    if (run.image && !document.drawings.has(run.source!)) return remap(generatedRun ?? '');
    const original = run.source === undefined ? undefined : originalRuns.get(run.source);
    if (run.source !== undefined && !original) throw new Error('Invalid run source reference.');
    const element = markup.element(run.source);
    let parent = element && markup.parents.get(element.id);
    const runElement = parent;
    const properties = runElement && markup.children(runElement, 'rPr')[0];
    const replacements = new Map<string, string>();
    const propertyNames = {
      fontFamily: 'rFonts',
      fontSizePoints: 'sz',
      bold: 'b',
      italic: 'i',
      underline: 'u',
      color: 'color',
    } as const;
    for (const key of Object.keys(propertyNames) as (keyof typeof propertyNames)[])
      if (run.format?.[key] !== undefined && run.format[key] !== original?.format?.[key])
        replacements.set(propertyNames[key], runProperties({ [key]: run.format[key] }));
    let sourceMarkup = element ? markup.raw(element) : '';
    if (replacedImages.has(run)) {
      const relationship = remap(generatedRun ?? '').match(/r:embed="([^"]+)"/)?.[1];
      if (!relationship) throw new Error('The replacement image relationship is missing.');
      sourceMarkup = sourceMarkup.replace(/([\w]+:embed=)(['"])(.*?)\2/, `$1"${relationship}"`);
    }
    let content =
      element && original?.text === run.text && element.localName !== 't'
        ? sourceMarkup
        : element && original?.text === '\uFFFC'
          ? run.text.split('\uFFFC').map(text).join(sourceMarkup)
          : text(run.text);
    content = markup.wrap(
      runElement,
      'r',
      markup.properties(properties, 'rPr', replacements) + content,
    );
    if (parent) parent = markup.parents.get(parent.id);
    while (parent && parent.localName !== 'p') {
      content = markup.wrap(parent, parent.localName, content);
      parent = markup.parents.get(parent.id);
    }
    if (run.source !== undefined) {
      if (!emitted.has(run.source)) {
        content = (before.get(run.source) ?? []).join('') + content;
        emitted.add(run.source);
      }
      remaining.set(run.source, remaining.get(run.source)! - 1);
      const owner = owners.get(run.source);
      if (owner) content += finishSource(owner);
    }
    return content;
  };
  const paragraphCopies = new Map<number, number>();
  for (const paragraph of paragraphs)
    if (paragraph.source !== undefined)
      paragraphCopies.set(paragraph.source, (paragraphCopies.get(paragraph.source) ?? 0) + 1);
  const renderParagraph = (paragraph: WordTextParagraph) => {
    const scope = copies.scopes.get(paragraph) ?? 0;
    ({ emitted, remaining } = states.get(scope)!);
    const element = markup.element(paragraph.source, 'p');
    const original =
      paragraph.source === undefined ? undefined : originalParagraphs.get(paragraph.source);
    const properties = markup.children(element, 'pPr')[0];
    const replacements = new Map<string, string>();
    if (paragraph.source !== undefined) {
      const left = paragraphCopies.get(paragraph.source)! - 1;
      paragraphCopies.set(paragraph.source, left);
      if (left > 0) replacements.set('sectPr', '');
    }
    if (paragraph.alignment !== undefined && paragraph.alignment !== original?.alignment)
      replacements.set('jc', `<w:jc w:val="${paragraph.alignment}"/>`);
    const generatedP = generatedParagraphs[indexByParagraph.get(paragraph)!]!;
    if (JSON.stringify(paragraph.list) !== JSON.stringify(original?.list)) {
      const generatedProperties = generatedXml.children(
        generatedXml.element(generatedP.elementId),
        'pPr',
      )[0];
      const numbering = generatedXml.children(generatedProperties, 'numPr')[0];
      replacements.set(
        'numPr',
        numbering
          ? numberingMarkup(generatedXml.raw(numbering))
          : '<w:numPr><w:numId w:val="0"/></w:numPr>',
      );
    }
    const generatedRuns = generatedP.inlines.filter((inline) => inline.kind === 'run');
    let content = paragraph.runs
      .map((run, index) =>
        runMarkup(
          run,
          generatedRuns[index] &&
            generatedXml.raw(generatedXml.element(generatedRuns[index]!.elementId)!),
        ),
      )
      .join('');
    if (original) content += finishSource(original);
    return copies.markers(
      markup.wrap(element, 'p', markup.properties(properties, 'pPr', replacements) + content),
      scope,
    );
  };
  return renderParagraph;
}
