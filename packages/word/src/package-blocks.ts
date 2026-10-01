import type { WordContentBlock } from './create-content.ts';
import type { WordTextParagraph } from './create.ts';
import { PackageXml } from './package-xml.ts';

/** Reconcile editable tables while keeping source properties and opaque children in order. */
export function renderWordBlocks(
  markup: PackageXml,
  blocks: readonly WordContentBlock[],
  renderParagraph: (paragraph: WordTextParagraph) => string,
) {
  const render = (
    content: readonly WordContentBlock[],
  ): { source?: number; markup: string }[] =>
    content.map((block) => {
      if (block.kind === 'paragraph')
        return {
          ...(block.source !== undefined ? { source: block.source } : {}),
          markup: renderParagraph(block),
        };
      if (block.kind === 'image')
        return {
          markup: renderParagraph({ runs: [{ text: '\uFFFC', image: block }] }),
        };
      const element = markup.element(block.source, 'tbl');
      const sourceGrid = markup.children(element, 'tblGrid')[0];
      const oldWidths = markup
        .children(sourceGrid, 'gridCol')
        .map(
          (column) =>
            Number(
              column.attributes.find(
                (a) => a.localName === 'w' && a.namespaceUri === element?.namespaceUri,
              )?.value ?? 0,
            ) / 20,
        );
      const widthsChanged =
        !!block.columnWidths?.length &&
        JSON.stringify(block.columnWidths) !== JSON.stringify(oldWidths);
      const rows = block.rows.map((row, index) => {
        let column = block.rowGrids?.[index]?.before ?? 0;
        const rowElement = markup.element(block.rowSources?.[index], 'tr');
        let rowMarkup = markup.container(
          rowElement,
          'tr',
          ['tc'],
          row.map((cell) => {
            const cellElement = markup.element(cell.source, 'tc');
            const contents = render(cell.blocks);
            if (!cell.blocks.length || cell.blocks.at(-1)?.kind === 'table')
              contents.push({ markup: markup.wrap(undefined, 'p', '') });
            let output = markup.container(cellElement, 'tc', ['p', 'tbl'], contents);
            const oldSpan = markup
              .children(markup.children(cellElement, 'tcPr')[0], 'gridSpan')[0]
              ?.attributes.find((a) => a.localName === 'val')?.value;
            const oldMergeElement = markup.children(
              markup.children(cellElement, 'tcPr')[0],
              'vMerge',
            )[0];
            const oldMerge = oldMergeElement
              ? (oldMergeElement.attributes.find((a) => a.localName === 'val')?.value ??
                'continue')
              : undefined;
            if (
              widthsChanged ||
              (cell.gridSpan !== undefined && cell.gridSpan !== Number(oldSpan ?? 1)) ||
              cell.verticalMerge !== oldMerge
            ) {
              const properties = markup.children(cellElement, 'tcPr')[0];
              const replacements = new Map<string, string>();
              if (widthsChanged) {
                const width = block
                  .columnWidths!.slice(column, column + (cell.gridSpan ?? 1))
                  .reduce((a, b) => a + b, 0);
                replacements.set(
                  'tcW',
                  `<w:tcW w:w="${Math.round(width * 20)}" w:type="dxa"/>`,
                );
              }
              if (cell.gridSpan !== undefined)
                replacements.set(
                  'gridSpan',
                  cell.gridSpan > 1 ? `<w:gridSpan w:val="${cell.gridSpan}"/>` : '',
                );
              replacements.set(
                'vMerge',
                cell.verticalMerge ? `<w:vMerge w:val="${cell.verticalMerge}"/>` : '',
              );
              const generatedProperties = markup.properties(properties, 'tcPr', replacements);
              if (properties)
                output = output.replace(markup.raw(properties), generatedProperties);
              else output = output.replace(/^(<[^>]+>)/, `$1${generatedProperties}`);
            }
            column += cell.gridSpan ?? 1;
            return {
              ...(cell.source !== undefined ? { source: cell.source } : {}),
              markup: output,
            };
          }),
        );
        const rowGrid = block.rowGrids?.[index];
        if (rowGrid) {
          const props = markup.children(rowElement, 'trPr')[0];
          const replacements = new Map<string, string>();
          for (const [name, value] of [
            ['gridBefore', rowGrid.before],
            ['gridAfter', rowGrid.after],
          ] as const) {
            const old = markup
              .children(props, name)[0]
              ?.attributes.find((a) => a.localName === 'val')?.value;
            if (Number(old ?? 0) !== value)
              replacements.set(name, value ? `<w:${name} w:val="${value}"/>` : '');
          }
          const next = markup.properties(props, 'trPr', replacements);
          if (props) rowMarkup = rowMarkup.replace(markup.raw(props), next);
          else if (next) rowMarkup = rowMarkup.replace(/^(<[^>]+>)/, `$1${next}`);
        }
        return {
          ...(block.rowSources?.[index] !== undefined
            ? { source: block.rowSources[index] }
            : {}),
          markup: rowMarkup,
        };
      });
      let output = markup.container(element, 'tbl', ['tr'], rows);
      if (!element) {
        const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
          .map((side) => `<w:${side} w:val="single" w:sz="4" w:color="B8B8B0"/>`)
          .join('');
        output = output.replace(
          /^(<[^>]+>)/,
          `$1${markup.word(`<w:tblPr>${block.columnWidths?.length ? `<w:tblW w:w="${Math.round(block.columnWidths.reduce((a, b) => a + b, 0) * 20)}" w:type="dxa"/>` : ''}<w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>`)}`,
        );
      }
      if (widthsChanged) {
        const props = markup.children(element, 'tblPr')[0];
        const total = block.columnWidths!.reduce((a, b) => a + b, 0);
        const nextProps = markup.properties(
          props,
          'tblPr',
          new Map([['tblW', `<w:tblW w:w="${Math.round(total * 20)}" w:type="dxa"/>`]]),
        );
        if (props) output = output.replace(markup.raw(props), nextProps);
        else if (element) output = output.replace(/^(<[^>]+>)/, `$1${nextProps}`);
        const grid = markup.children(element, 'tblGrid')[0];
        const content = markup.word(
          block
            .columnWidths!.map((width) => `<w:gridCol w:w="${Math.round(width * 20)}"/>`)
            .join(''),
        );
        const next = markup.wrap(grid, 'tblGrid', content);
        if (grid) output = output.replace(markup.raw(grid), next);
        else {
          const tableProps = props
            ? nextProps
            : output.match(/<w:tblPr[\s\S]*?<\/w:tblPr>/)?.[0];
          output = tableProps
            ? output.replace(tableProps, tableProps + next)
            : output.replace(/^(<[^>]+>)/, `$1${next}`);
        }
      }
      return {
        ...(block.source !== undefined ? { source: block.source } : {}),
        markup: output,
      };
    });
  return render(blocks);
}
