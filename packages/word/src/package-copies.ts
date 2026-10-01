import type { WordContentBlock } from './create-content.ts';
import type { WordTextParagraph } from './create.ts';
import type { PackageXml } from './package-xml.ts';

/** A copied table owns its own marker ranges; splitting a paragraph stays in its original scope. */
export function contentCopyScopes(blocks: readonly WordContentBlock[], markup: PackageXml) {
  const scopes = new Map<WordTextParagraph, number>();
  const seen = new Set<number>();
  let nextScope = 0;
  const visit = (content: readonly WordContentBlock[], scope: number) => {
    for (const block of content) {
      if (block.kind === 'paragraph') scopes.set(block, scope);
      if (block.kind !== 'table') continue;
      let childScope = scope;
      if (block.source !== undefined) {
        if (!scope && seen.has(block.source)) childScope = ++nextScope;
        seen.add(block.source);
      }
      for (const row of block.rows) for (const cell of row) visit(cell.blocks, childScope);
    }
  };
  visit(blocks, 0);
  let nextId = Math.max(
    0,
    ...markup.document.source
      .elements()
      .flatMap((element) =>
        element.localName === 'bookmarkStart'
          ? element.attributes
              .filter((a) => a.localName === 'id')
              .map((a) => Number(a.value) || 0)
          : [],
      ),
  );
  const ids = new Map<string, number>();
  return {
    scopes,
    markers(value: string, scope: number) {
      if (!scope) return value;
      return value.replace(/<(?:[\w]+:)?bookmark(?:Start|End)\b[^>]*>/g, (tag) =>
        tag.replace(
          /(\b(?:[\w]+:)?)(id|name)=(['"])(.*?)\3/g,
          (_match, prefix: string, key: string, quote: string, original: string) => {
            if (key === 'name')
              return `${prefix}name=${quote}${original.slice(0, 24)}_copy${scope}${quote}`;
            const lookup = `${scope}:${original}`;
            if (!ids.has(lookup)) ids.set(lookup, ++nextId);
            return `${prefix}id=${quote}${ids.get(lookup)}${quote}`;
          },
        ),
      );
    },
  };
}
