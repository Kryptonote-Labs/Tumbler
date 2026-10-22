import { authoredInkMarkup } from './authored-ink.ts';
import { validateWordStyleId } from './authored-styles.ts';
import { isWordAuthoredList, registerWordListLevel, wordListPattern, type WordAuthoredList } from './authored-list.ts';
import { isWordHyperlink } from './hyperlinks.ts';
import { wordBreakXml, validateBreakRun } from './breaks.ts';
import { wordShapeXml, validateShapeRun } from './shapes.ts';
import { paragraphFormatXml } from './paragraph-format.ts';
import { authoredCellPropertiesXml, rowFormatXml, type WordCellFormat, type WordRowFormat } from './table-format.ts';
import { paragraphPositioningXml, positionalTabXml } from './positioning.ts';
import { pageFieldXml } from './page-fields.ts';
import { authoredTableGrid } from './authored-table.ts';
import { imagePlacement, type WordImagePosition } from './image-placement.ts';
import type { WordTextParagraph } from './create.ts';
import { runProperties, textContent, xmlAttribute } from './create-xml.ts';

/** Authored blocks are independent of package-local XML element identifiers. */
export type WordContentBlock =
  | ({ readonly kind: 'paragraph' } & WordTextParagraph)
  | { readonly id?: string; readonly source?: number; readonly rowSources?: readonly (number | undefined)[]; readonly rowGrids?: readonly { before: number; after: number }[]; readonly rowFormats?: readonly (WordRowFormat | undefined)[]; readonly kind: 'table'; readonly rows: readonly (readonly WordContentCell[])[]; readonly columnWidths?: readonly number[] }
  | ({ readonly kind: 'image' } & WordAuthoredImage);
export interface WordAuthoredImage extends WordImagePosition { readonly bytes: Uint8Array; readonly contentType: 'image/png' | 'image/jpeg'; readonly width: number; readonly height: number; readonly alt?: string }
export interface WordContentCell { readonly format?: WordCellFormat; readonly source?: number; readonly gridSpan?: number; readonly verticalMerge?: "restart" | "continue"; readonly blocks: readonly WordContentBlock[]; }

const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

/** One traversal writes structure, numbering and media relationships together. */
export function authoredContent(blocks: readonly WordContentBlock[], width: number) {
  const parts: { name: string; data: Uint8Array }[] = [];
  const lists = new Map<string, { id: number; defaults: WordAuthoredList; levels: Map<number, WordAuthoredList> }>();
  let relationships = '';
  let contentTypes = '';
  let imageId = 0;
  let linkId = 0;
  const linked = (link: string | undefined, content: string) => {
    if (link === undefined || link === '') return content;
    if (!isWordHyperlink(link)) throw new TypeError('Invalid hyperlink target.');
    if (link.startsWith('#')) return `<w:hyperlink w:anchor="${xmlAttribute(link.slice(1))}">${content}</w:hyperlink>`;
    const id = `link${++linkId}`;
    relationships += `<Relationship Id="${id}" Type="${office}hyperlink" Target="${xmlAttribute(link)}" TargetMode="External"/>`;
    return `<w:hyperlink r:id="${id}">${content}</w:hyperlink>`;
  };
  const inkMarkup = (ink: import('./authored-ink.ts').WordAuthoredInk, availableWidth: number) => {
    const id = ++imageId;
    const { payload, markup } = authoredInkMarkup(ink, id, availableWidth);
    const name = `word/ink/ink${id}.xml`;
    parts.push({ name, data: new TextEncoder().encode(payload) });
    relationships += `<Relationship Id="ink${id}" Type="${office}customXml" Target="ink/ink${id}.xml"/>`;
    contentTypes += `<Override PartName="/${name}" ContentType="application/inkml+xml"/>`;
    return markup;
  };
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
          return `<w:r><w:drawing>${placement.open}<wp:extent cx="${cx}" cy="${cy}"/>${placement.wrap}<wp:docPr id="${id}" name="Image ${id}" descr="${xmlAttribute(image.alt ?? '')}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Image ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image${mediaId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>${placement.close}</w:drawing></w:r>`;
  };
  const visit = (blocks: readonly WordContentBlock[], availableWidth: number, depth = 0): string => {
    return blocks.map(block => {
      switch (block.kind) {
        case 'paragraph': {
          validateWordStyleId(block.styleId);
          if (block.alignment !== undefined && !['start', 'center', 'end', 'justify'].includes(block.alignment)) throw new TypeError('Unsupported paragraph alignment.');
          let numbering = '';
          if (block.list) {
            const { id, kind, level = 0, start = 1 } = block.list;
            if (!isWordAuthoredList(block.list)) throw new TypeError('Invalid list.');
            if (!Number.isInteger(level) || level < 0 || level > 8 || !Number.isInteger(start) || start < 0 || start > 2147483647) throw new RangeError('Invalid list level or start.');
            const existing = lists.get(id);
            const list = existing ?? { id: lists.size + 1, defaults: block.list, levels: new Map<number, WordAuthoredList>() };
            registerWordListLevel(list.levels, block.list);
            lists.set(id, list);
            numbering = `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${list.id}"/></w:numPr>`;
          }
          for (const run of block.runs) { validateShapeRun(run); validateBreakRun(run); }
          const positioning = block.positioning ? paragraphPositioningXml(block.positioning) : {};
          const paragraph = block.paragraph ? paragraphFormatXml(block.paragraph) : new Map<string, string>();
          const early = ['keepNext', 'keepLines', 'pageBreakBefore', 'widowControl'];
          const properties = (block.styleId ? `<w:pStyle w:val="${xmlAttribute(block.styleId)}"/>` : '') + early.map(key => paragraph.get(key) ?? '').join('') + numbering + (paragraph.get('pBdr') ?? '') + (paragraph.get('shd') ?? '') + (positioning.tabs ?? '') + (paragraph.get('spacing') ?? '') + (positioning.ind ?? '') + (paragraph.get('contextualSpacing') ?? '') + (block.alignment ? `<w:jc w:val="${block.alignment === 'justify' ? 'both' : block.alignment}"/>` : '');
          return `<w:p>${properties ? `<w:pPr>${properties}</w:pPr>` : ''}${block.runs.map(run => linked(run.link, run.ink ? (run.text === '\uFFFC' && !run.shape && !run.image && !run.field ? inkMarkup(run.ink, availableWidth) : (() => { throw new TypeError('Ink occupies one object character.'); })()) : run.shape ? (run.text === '\uFFFC' ? wordShapeXml(run.shape, ++imageId, availableWidth, paragraphs => visit(paragraphs.map(p => ({ kind: 'paragraph', ...p })), run.shape!.width)) : (() => { throw new TypeError('Shape runs occupy one object character.'); })()) : run.field ? pageFieldXml(run) : run.image ? (run.text === '\uFFFC' ? imageMarkup(run.image, availableWidth) : (() => { throw new TypeError('Image runs use the object replacement character.'); })()) : `<w:r>${run.format ? `<w:rPr>${runProperties(run.format)}</w:rPr>` : ''}${run.breakType ? wordBreakXml(run.breakType, run.text) : run.tab ? positionalTabXml(run.tab, run.text) : textContent(run.text)}</w:r>`)).join('')}</w:p>`;
        }
        case 'table': {
          const grid = authoredTableGrid(block.rows, block.columnWidths, availableWidth, block.rowGrids);
          const widths = grid.widths;
          return `<w:tbl><w:tblPr><w:tblW w:w="${Math.round(widths.reduce((sum, value) => sum + value, 0) * 20)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="000000"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map(value => `<w:gridCol w:w="${Math.round(value * 20)}"/>`).join('')}</w:tblGrid>${grid.rows.map((row, rowIndex) => `<w:tr><w:trPr>${block.rowFormats?.[rowIndex] ? rowFormatXml(block.rowFormats[rowIndex]!) : ''}<w:gridBefore w:val="${grid.rowGrids[rowIndex]!.before}"/><w:gridAfter w:val="${grid.rowGrids[rowIndex]!.after}"/></w:trPr>${row.map(({ cell, width, span }) => `<w:tc><w:tcPr>${authoredCellPropertiesXml(width, span, cell.verticalMerge, cell.format)}</w:tcPr>${visit(cell.blocks, width, depth + 1)}${cell.blocks.length && cell.blocks.at(-1)?.kind !== 'table' ? '' : '<w:p/>'}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
        }
        case 'image': return `<w:p>${imageMarkup(block, availableWidth)}</w:p>`;
        default: throw new TypeError('Unsupported document block.');
      }
    }).join('');
  };
  const content = visit(blocks.length ? blocks : [{ kind: 'paragraph', runs: [] }], width);
  if (lists.size) {
    const numbering = [...lists.values()].map(list => `<w:abstractNum w:abstractNumId="${list.id}"><w:multiLevelType w:val="multilevel"/>${Array.from({ length: 9 }, (_, level) => { const definition = list.levels.get(level) ?? list.defaults; return `<w:lvl w:ilvl="${level}"><w:start w:val="${definition.start ?? 1}"/><w:numFmt w:val="${definition.kind}"/><w:lvlText w:val="${xmlAttribute(wordListPattern(definition, level))}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${(level + 1) * 720}" w:hanging="360"/></w:pPr></w:lvl>`; }).join('')}</w:abstractNum>`).join('') + [...lists.values()].map(list => `<w:num w:numId="${list.id}"><w:abstractNumId w:val="${list.id}"/></w:num>`).join('');
    parts.push({ name: 'word/numbering.xml', data: new TextEncoder().encode(`<w:numbering xmlns:w="${namespace}">${numbering}</w:numbering>`) });
    relationships += `<Relationship Id="numbering" Type="${office}numbering" Target="numbering.xml"/>`;
    contentTypes += '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>';
  }
  return { content, relationships, contentTypes, parts };
}
