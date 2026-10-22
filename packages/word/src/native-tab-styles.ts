import { wordAuthoringStyles } from './authored-styles.ts';
import { missingAuthoredStyles } from './package-styles.ts';
import type { WordDocument } from './document.ts';
import type { WordContentBlock } from './create-content.ts';
import type { WordTextFormat } from './create.ts';
import type { WordStyles } from './styles.ts';

export interface NativeTabCatalog {
  readonly styles: WordStyles;
  readonly key: string;
}

/** Body and edited stories share the definitions that their combined export adds. */
export function resolveNativeTabCatalog(input: {
  document: WordDocument | undefined;
  defaults: WordTextFormat | undefined;
  fallback: WordStyles;
  contents: readonly (readonly WordContentBlock[])[];
  previous: NativeTabCatalog | undefined;
}): NativeTabCatalog {
  if (!input.document) return { styles: input.fallback, key: '' };
  const requested: string[] = [];
  const visit = (blocks: readonly WordContentBlock[]) => {
    for (const block of blocks) {
      if (block.kind === 'paragraph' && block.styleId) requested.push(block.styleId);
      else if (block.kind === 'table') for (const row of block.rows) for (const cell of row) visit(cell.blocks);
    }
  };
  for (const blocks of input.contents) visit(blocks);
  const added = missingAuthoredStyles(input.document, requested);
  const key = added.map(style => style.styleId).join(',');
  return input.previous?.key === key ? input.previous : {
    key, styles: wordAuthoringStyles(input.document.styles, input.defaults, added),
  };
}
