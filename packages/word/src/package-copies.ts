import type { WordContentBlock } from './create-content.ts';
import type { WordTextParagraph, WordTextRun } from './create.ts';
import type { PackageXml } from './package-xml.ts';

/** A copied table owns its own marker ranges; splitting a paragraph stays in its original scope. */
export function contentCopyScopes(blocks: readonly WordContentBlock[], markup: PackageXml) {
  const scopes = new Map<WordTextParagraph | WordTextRun, number>();
  const seen = new Set<number>();
  let nextScope = 0;
  const explicit = new Map<string, number>();
  const copyScope = (key: string | undefined, fallback: number) => {
    if (key === undefined) return fallback;
    if (!explicit.has(key)) explicit.set(key, ++nextScope);
    return explicit.get(key)!;
  };
  const visit = (content: readonly WordContentBlock[], scope: number) => {
    for (const block of content) {
      if (block.kind === 'paragraph') {
        const paragraphScope = copyScope(block.sourceCopy, scope);
        scopes.set(block, paragraphScope);
        for (const run of block.runs)
          scopes.set(run, copyScope(run.sourceCopy, paragraphScope));
      }
      if (block.kind !== 'table') continue;
      let childScope = scope;
      if (block.source !== undefined) {
        if (!scope && seen.has(block.source)) childScope = ++nextScope;
        seen.add(block.source);
      }
      const seenRows = new Set<number>();
      for (const [index, row] of block.rows.entries()) {
        const source = block.rowSources?.[index];
        const rowScope =
          source !== undefined && seenRows.has(source) ? ++nextScope : childScope;
        if (source !== undefined) seenRows.add(source);
        for (const cell of row) visit(cell.blocks, rowScope);
      }
    }
  };
  visit(blocks, 0);
  let nextId = markup.document.source
    .elements()
    .flatMap((element) =>
      element.localName === 'bookmarkStart'
        ? element.attributes
            .filter((a) => a.localName === 'id')
            .map((a) => Number(a.value) || 0)
        : [],
    )
    .reduce((maximum, value) => Math.max(maximum, value), 0);
  const ids = new Map<string, number>();
  const names = new Set(
    markup.document.source
      .elements()
      .filter((e) => e.localName === 'bookmarkStart')
      .flatMap((e) => e.attributes.filter((a) => a.localName === 'name').map((a) => a.value)),
  );
  const copiedNames = new Map<string, string>();
  let nextName = 0;
  return {
    scopes,
    markers(value: string, scope: number) {
      if (!scope) return value;
      return value.replace(/<(?:[\w]+:)?bookmark(?:Start|End)\b[^>]*>/g, (tag) =>
        tag.replace(
          /(\b(?:[\w]+:)?)(id|name)=(['"])(.*?)\3/g,
          (_match, prefix: string, key: string, quote: string, original: string) => {
            if (key === 'name') {
              const lookup = `${scope}:${original}`;
              if (!copiedNames.has(lookup)) {
                let name: string;
                do {
                  name = `tumbler_copy_${++nextName}`;
                } while (names.has(name));
                names.add(name);
                copiedNames.set(lookup, name);
              }
              return `${prefix}name=${quote}${copiedNames.get(lookup)}${quote}`;
            }
            const lookup = `${scope}:${original}`;
            if (!ids.has(lookup)) ids.set(lookup, ++nextId);
            return `${prefix}id=${quote}${ids.get(lookup)}${quote}`;
          },
        ),
      );
    },
  };
}
