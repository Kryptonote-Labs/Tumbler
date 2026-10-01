import { imagePlacement, type WordImagePosition } from './image-placement.ts';
import type { WordTextParagraph } from './create.ts';
import { runProperties, textContent, xml } from './create-xml.ts';

/** Authored blocks are independent of package-local XML element identifiers. */
export type WordContentBlock =
  | ({ readonly kind: 'paragraph' } & WordTextParagraph)
  | { readonly id?: string; readonly kind: 'table'; readonly rows: readonly (readonly WordContentCell[])[]; readonly columnWidths?: readonly number[] }
  | ({ readonly kind: 'image' } & WordAuthoredImage);
export interface WordAuthoredImage extends WordImagePosition { readonly bytes: Uint8Array; readonly contentType: 'image/png' | 'image/jpeg'; readonly width: number; readonly height: number; readonly alt?: string }
export interface WordContentCell { readonly blocks: readonly WordContentBlock[]; }

const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

/** One traversal writes structure, numbering and media relationships together. */
export function authoredContent(blocks: readonly WordContentBlock[], width: number) {
  const parts: { name: string; data: Uint8Array }[] = [];
  const lists = new Map<string, { id: number; kind: 'bullet' | 'decimal'; start: number }>();
  let relationships = '';
  let contentTypes = '';
  let imageId = 0;
  const media = new Map<Uint8Array, Map<string, number>>();
  const imageMarkup = (image: WordAuthoredImage, availableWidth: number) => {
          const placement = imagePlacement(image, image.width, availableWidth);
          if (!['image/png', 'image/jpeg'].includes(image.contentType) || !(image.bytes instanceof Uint8Array) || !image.bytes.length) throw new TypeError('Images need PNG or JPEG bytes.');
          if (![image.width, image.height].every(value => Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.round(value * 12700)) && Math.round(value * 12700) > 0)) throw new RangeError('Image dimensions must be positive, representable EMU coordinates.');
          const id = ++imageId;
          const types = media.get(image.bytes) ?? new Map<string, number>();
          const previous = types.get(image.contentType);
          const mediaId = previous ?? id;
          const cx = Math.round(image.width * 12700), cy = Math.round(image.height * 12700);
          if (previous === undefined) {
            types.set(image.contentType, mediaId);
            media.set(image.bytes, types);
            const name = `word/media/image${mediaId}.${image.contentType === 'image/png' ? 'png' : 'jpg'}`;
            parts.push({ name, data: image.bytes });
            relationships += `<Relationship Id="image${mediaId}" Type="${office}image" Target="media/${name.split('/').at(-1)}"/>`;
            contentTypes += `<Override PartName="/${name}" ContentType="${image.contentType}"/>`;
          }
          return `<w:r><w:drawing>${placement.open}<wp:extent cx="${cx}" cy="${cy}"/>${placement.wrap}<wp:docPr id="${id}" name="Image ${id}" descr="${xml(image.alt ?? '')}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Image ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image${mediaId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>${placement.close}</w:drawing></w:r>`;
  };
  const visit = (blocks: readonly WordContentBlock[], availableWidth: number, depth = 0): string => {
    return blocks.map(block => {
      switch (block.kind) {
        case 'paragraph': {
          if (block.alignment !== undefined && !['start', 'center', 'end', 'justify'].includes(block.alignment)) throw new TypeError('Unsupported paragraph alignment.');
          let numbering = '';
          if (block.list) {
            const { id, kind, level = 0, start = 1 } = block.list;
            if (!id || !['bullet', 'decimal'].includes(kind)) throw new TypeError('Invalid list.');
            if (!Number.isInteger(level) || level < 0 || level > 8 || !Number.isInteger(start) || start < 1 || start > 2147483647) throw new RangeError('Invalid list level or start.');
            const existing = lists.get(id);
            if (existing && (existing.kind !== kind || existing.start !== start)) throw new TypeError('A list must use consistent numbering.');
            const list = existing ?? { id: lists.size + 1, kind, start };
            lists.set(id, list);
            numbering = `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${list.id}"/></w:numPr>`;
          }
          const properties = numbering + (block.alignment ? `<w:jc w:val="${block.alignment}"/>` : '');
          return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${block.runs.map(run => run.image ? (run.text === '\uFFFC' ? imageMarkup(run.image, availableWidth) : (() => { throw new TypeError('Image runs use the object replacement character.'); })()) : `<w:r>${run.format ? `<w:rPr>${runProperties(run.format)}</w:rPr>` : ''}${textContent(run.text)}</w:r>`).join('')}</w:p>`;
        }
        case 'table': {
          const columns = block.rows[0]?.length ?? 0;
          if (!columns || columns > 63 || block.rows.some(row => row.length !== columns)) throw new RangeError('Word tables need one to 63 cells per row.');
          const widths = block.columnWidths ?? Array.from({ length: columns }, () => availableWidth / columns);
          if (widths.length !== columns || widths.some(value => !Number.isFinite(value) || value <= 0) || widths.reduce((sum, value) => sum + value, 0) > availableWidth + 0.01) throw new RangeError('Column widths must fit the available page width.');
          return `<w:tbl><w:tblPr><w:tblW w:w="${Math.round(widths.reduce((sum, value) => sum + value, 0) * 20)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="B8B8B0"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map(value => `<w:gridCol w:w="${Math.round(value * 20)}"/>`).join('')}</w:tblGrid>${block.rows.map(row => `<w:tr>${row.map((cell, index) => `<w:tc><w:tcPr><w:tcW w:w="${Math.round(widths[index]! * 20)}" w:type="dxa"/></w:tcPr>${visit(cell.blocks, widths[index]!, depth + 1)}${cell.blocks.length && cell.blocks.at(-1)?.kind !== 'table' ? '' : '<w:p/>'}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
        }
        case 'image': return `<w:p>${imageMarkup(block, availableWidth)}</w:p>`;
        default: throw new TypeError('Unsupported document block.');
      }
    }).join('');
  };
  const content = visit(blocks.length ? blocks : [{ kind: 'paragraph', runs: [] }], width);
  if (lists.size) {
    const numbering = [...lists.values()].map(list => `<w:abstractNum w:abstractNumId="${list.id}"><w:multiLevelType w:val="multilevel"/>${Array.from({ length: 9 }, (_, level) => `<w:lvl w:ilvl="${level}"><w:start w:val="${list.start}"/><w:numFmt w:val="${list.kind}"/><w:lvlText w:val="${list.kind === 'bullet' ? '•' : `%${level + 1}.`}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${(level + 1) * 720}" w:hanging="360"/></w:pPr></w:lvl>`).join('')}</w:abstractNum>`).join('') + [...lists.values()].map(list => `<w:num w:numId="${list.id}"><w:abstractNumId w:val="${list.id}"/></w:num>`).join('');
    parts.push({ name: 'word/numbering.xml', data: new TextEncoder().encode(`<w:numbering xmlns:w="${namespace}">${numbering}</w:numbering>`) });
    relationships += `<Relationship Id="numbering" Type="${office}numbering" Target="numbering.xml"/>`;
    contentTypes += '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>';
  }
  return { content, relationships, contentTypes, parts };
}
