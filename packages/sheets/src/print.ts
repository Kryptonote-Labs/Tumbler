import type { LosslessXmlElement } from '@tumblerjs/ooxml';
import type { SpreadsheetArtifact } from './artifact.ts';
import { parseCellRange, parseCellReference, type CellRange } from './references.ts';

const children = (element: LosslessXmlElement, name: string): LosslessXmlElement[] => element.children.filter((node): node is LosslessXmlElement => node.kind === 'element' && node.namespaceUri === element.namespaceUri && node.localName === name);
const attr = (element: LosslessXmlElement | undefined, name: string) => element?.attributes.find(a => a.localName === name && !a.namespaceUri)?.value;
const number = (element: LosslessXmlElement | undefined, name: string, fallback: number) => {
  const value = Number(attr(element, name) ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};
export interface SpreadsheetPrintPage {
  readonly range: CellRange;
  readonly width: number;
  readonly height: number;
  readonly margins: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly scale: number;
  readonly gridLines: boolean;
  readonly rows: readonly number[];
  readonly columns: readonly number[];
  readonly header: string;
  readonly footer: string;
  readonly headerMargin: number;
  readonly footerMargin: number;
  readonly headings: boolean;
  readonly horizontalCentered: boolean;
  readonly verticalCentered: boolean;
}
/** Paginates the active sheet in CSS pixels, using its saved print areas and page setup. */
export function spreadsheetPrintPages(artifact: SpreadsheetArtifact): SpreadsheetPrintPage[] {
  const sheet = artifact.worksheet;
  const root = sheet.document.root;
  const setup = children(root, 'pageSetup')[0];
  const margins = children(root, 'pageMargins')[0];
  const properties = children(root, 'sheetPr')[0];
  const fit = properties && children(properties, 'pageSetUpPr')[0];
  // OOXML paperSize values: Letter, Legal, Executive, A3, A4, A5, B4, B5.
  const sizes: Record<string, readonly [number, number]> = { '1': [816,1056], '5': [816,1344], '7': [696,1008], '8': [1122.52,1587.4], '9': [793.7,1122.52], '11': [559.37,793.7], '12': [971.34,1375.75], '13': [687.87,971.34] };
  const paper = attr(setup, 'paperSize') ?? '1';
  const custom = (value: string | undefined) => {
    const match = value && /^(\d+(?:\.\d+)?)(mm|cm|in|pt|pc|pi)$/.exec(value);
    return match ? Number(match[1]) * ({ mm: 96/25.4, cm: 96/2.54, in: 96, pt: 96/72, pc: 16, pi:16 }[match[2]!] ?? 1) : undefined;
  };
  const customWidth = custom(attr(setup,'paperWidth')), customHeight = custom(attr(setup,'paperHeight'));
  if (!sizes[paper] && !(customWidth && customHeight)) throw new Error(`Unsupported worksheet paper size ${paper}.`);
  let [width, height] = customWidth && customHeight ? [customWidth,customHeight] : sizes[paper]!;
  if (attr(setup,'orientation') === 'landscape') [width,height] = [height,width];
  const margin = { top: number(margins,'top',.75)*96, right: number(margins,'right',.7)*96, bottom: number(margins,'bottom',.75)*96, left: number(margins,'left',.7)*96 };
  let availableWidth = width-margin.left-margin.right, availableHeight = height-margin.top-margin.bottom;
  if (availableWidth <= 0 || availableHeight <= 0) throw new Error('Worksheet print margins exceed its paper size.');
  const workbook = artifact.workbook.document;
  const names = children(workbook.root,'definedNames')[0];
  const localIndex = artifact.workbook.sheets.indexOf(artifact.activeSheet);
  const area = names && children(names,'definedName').find(n => attr(n,'name') === '_xlnm.Print_Area' && Number(attr(n,'localSheetId')) === localIndex);
  const content = (element: LosslessXmlElement) => workbook.source.slice(element.startTagSpan.end,element.endTagSpan!.start).replaceAll('&apos;',"'").replaceAll('&amp;','&');
  const references = (text: string) => [...text.matchAll(/(?:'(?:[^']|'')*'|[^!,]+)!\s*(\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?|\$?[A-Z]+:\$?[A-Z]+|\$?\d+:\$?\d+)/gi)].map(m => m[1]!.replaceAll('$',''));
  const used = sheet.dimension ?? parseCellRange('A1');
  const ranges = area ? references(content(area)).map(ref => {
    if (/^[A-Z]+:[A-Z]+$/i.test(ref)) { const [a,b]=ref.split(':'); return {start:{row:used.start.row,column:parseCellReference(a+'1').column},end:{row:used.end.row,column:parseCellReference(b+'1').column}}; }
    if (/^\d+:\d+$/.test(ref)) { const [a,b]=ref.split(':').map(Number); return {start:{row:a!,column:used.start.column},end:{row:b!,column:used.end.column}}; }
    return parseCellRange(ref);
  }) : [used];
  if (!ranges.length) throw new Error('Unable to read the worksheet print area.');
  const titles = names && children(names,'definedName').find(n => attr(n,'name') === '_xlnm.Print_Titles' && Number(attr(n,'localSheetId')) === localIndex);
  let titleRows: number[] = [], titleColumns: number[] = [];
  for (const reference of titles ? references(content(titles)) : []) {
    const [a,b] = reference.split(':');
    if (/^\d+:\d+$/.test(reference)) titleRows = Array.from({length:Number(b)-Number(a)+1},(_,i)=>Number(a)+i);
    else if (/^[A-Z]+:[A-Z]+$/i.test(reference)) { const first=parseCellReference(a+'1').column,last=parseCellReference(b+'1').column; titleColumns=Array.from({length:last-first+1},(_,i)=>first+i); }
  }
  const headerFooter = children(root,'headerFooter')[0];
  const headerText = (name: string) => { const element = headerFooter && children(headerFooter,name)[0]; return element ? sheet.document.source.slice(element.startTagSpan.end,element.endTagSpan!.start).replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>') : ''; };
  const options = children(root,'printOptions')[0];
  const enabled = (element: LosslessXmlElement | undefined, name: string) => ['1','true'].includes(attr(element,name) ?? '');
  if (enabled(options,'headings')) { availableWidth -= 32; availableHeight -= 20; }
  const rows = sheet.rowGeometry(), columns = sheet.columnGeometry();
  const extent = (axis: typeof rows, start: number, end: number) => axis.start(end)+axis.size(end)-axis.start(start);
  const breaks = (name: string) => new Set((children(root,name)[0] ? children(children(root,name)[0]!, 'brk') : []).map(n=>number(n,'id',0)));
  function bands(axis: typeof rows, start: number, end: number, size: number, manual: Set<number>, titles: readonly number[]) {
    const output: [number,number][] = [];
    let first = start;

    for (let i = start; i <= end; i++) {
      if (i > first && (extent(axis,first,i) + titles.filter(n=>n<first || n>i).reduce((sum,n)=>sum+axis.size(n),0) > size || manual.has(i-1))) { output.push([first,i-1]); first=i; }
    }
    output.push([first,end]); return output;
  }
  const pages: SpreadsheetPrintPage[] = [];
  for (const range of ranges) {
    let scale = Math.max(.1, number(setup,'scale',100)/100);
    if (attr(fit,'fitToPage') === '1' || attr(fit,'fitToPage') === 'true') {
      const wide = number(setup,'fitToWidth',1), tall = number(setup,'fitToHeight',1);
      scale = Math.min(wide ? availableWidth*wide/Math.max(1,extent(columns,range.start.column,range.end.column)) : Infinity, tall ? availableHeight*tall/Math.max(1,extent(rows,range.start.row,range.end.row)) : Infinity, 1);
    }
    if (enabled(fit,'fitToPage')) {
      const wide = number(setup,'fitToWidth',1), tall = number(setup,'fitToHeight',1);
      const fits = (value: number) => (!wide || bands(columns,range.start.column,range.end.column,availableWidth/value,new Set(),titleColumns).length <= wide) && (!tall || bands(rows,range.start.row,range.end.row,availableHeight/value,new Set(),titleRows).length <= tall);
      if (!fits(scale)) { let low=0, high=scale; for (let i=0;i<32;i++) { const middle=(low+high)/2; if(fits(middle)) low=middle; else high=middle; } scale=low; }
    }
    const rowBands = bands(rows,range.start.row,range.end.row,availableHeight/scale,breaks('rowBreaks'),titleRows);
    const colBands = bands(columns,range.start.column,range.end.column,availableWidth/scale,breaks('colBreaks'),titleColumns);
    const pairs = attr(setup,'pageOrder') === 'overThenDown' ? rowBands.flatMap(r=>colBands.map(c=>({r,c}))) : colBands.flatMap(c=>rowBands.map(r=>({r,c})));
    for (const {r,c} of pairs) pages.push({range:{start:{row:r[0],column:c[0]},end:{row:r[1],column:c[1]}},width,height,margins:margin,scale,header: headerText('oddHeader'), footer: headerText('oddFooter'), headerMargin: number(margins,'header',.3)*96, footerMargin: number(margins,'footer',.3)*96, gridLines: enabled(options,'gridLines'), headings: enabled(options,'headings'), horizontalCentered: enabled(options,'horizontalCentered'), verticalCentered: enabled(options,'verticalCentered'), rows: [...titleRows.filter(i=>i<r[0] || i>r[1]),...Array.from({length:r[1]-r[0]+1},(_,i)=>r[0]+i)], columns: [...titleColumns.filter(i=>i<c[0] || i>c[1]),...Array.from({length:c[1]-c[0]+1},(_,i)=>c[0]+i)]});
  }
  return pages;
}

/** Resolves Excel header/footer text fields. Font control codes are omitted from plain text. */
export function spreadsheetPrintHeaderText(value: string, sheetName: string, page: number, pages: number): readonly string[] {
  const sections = ['', '', '']; let section=1;
  const expanded = value.replace(/&&/g,'\u0000').replace(/&P/g,String(page)).replace(/&N/g,String(pages)).replace(/&A/g,sheetName).replace(/&D/g,new Date().toLocaleDateString()).replace(/&T/g,new Date().toLocaleTimeString()).replace(/&"[^"]*"|&\d+|&[BIESUXYOGHK]/g,'');
  for (const token of expanded.split(/(&[LCR])/)) { if (token==='&L') section=0; else if(token==='&C') section=1; else if(token==='&R') section=2; else sections[section]+=token.replaceAll('\u0000','&'); }
  return sections;
}
