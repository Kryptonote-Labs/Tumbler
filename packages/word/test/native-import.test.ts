import { expect, test, spyOn } from 'bun:test';
import { NativeWordDocument, createWordArtifact, importWordContent, layoutWordDocument, openWordArtifact, type WordContentBlock, type WordLayout } from '../src/index.ts';
import { buildWordDocumentFixture } from './document-fixture.ts';
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const measurer = { measure: (text: string, format: { fontSizePoints: number }) => ({ width: text.length * format.fontSizePoints / 2, ascent: format.fontSizePoints * .8, descent: format.fontSizePoints * .2 }) };
function geometry(layout: WordLayout) {
  return JSON.parse(JSON.stringify(layout, (key, value: unknown) => ['elementId', 'paragraphElementId', 'runElementId', 'contentElementId', 'tableElementId', 'cellElementId', 'continuationElementIds', 'drawing', 'section'].includes(key) ? undefined : typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value));
}
function richSource() {
  return openWordArtifact(buildWordDocumentFixture({
    documentXml: `<w:document xmlns:w="${ns}" xmlns:r="${rel.slice(0,-1)}"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading"/><w:keepNext/><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs></w:pPr><w:hyperlink r:id="link"><w:r><w:rPr><w:strike/><w:vertAlign w:val="superscript"/></w:rPr><w:t>Heading</w:t><w:tab/><w:t>Link</w:t></w:r></w:hyperlink></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Number one</w:t></w:r></w:p>
      <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Number two</w:t><w:footnoteReference w:id="1"/></w:r></w:p>
      <w:tbl><w:tblPr><w:tblW w:w="4000" w:type="dxa"/><w:jc w:val="center"/><w:tblCellMar><w:top w:w="200" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="800" w:hRule="atLeast"/><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:r><w:t>Merged cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
      <w:p><w:pPr><w:sectPr><w:pgSz w:w="8000" w:h="10000"/><w:pgMar w:top="900" w:right="700" w:bottom="900" w:left="700"/><w:headerReference w:type="default" r:id="header"/></w:sectPr></w:pPr><w:r><w:t>Section</w:t><w:br w:type="page"/><w:t>After break</w:t></w:r></w:p>
      <w:p><w:r><w:t>Last</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading"/></w:pPr></w:p>
      <w:sectPr><w:pgSz w:w="12000" w:h="8000" w:orient="landscape"/></w:sectPr>
      </w:body></w:document>`,
    relationships: [
      { id:'styles',type:rel+'styles',target:'styles.xml' },
      { id:'numbering',type:rel+'numbering',target:'numbering.xml' },
      { id:'header',type:rel+'header',target:'header1.xml' },
      { id:'notes',type:rel+'footnotes',target:'footnotes.xml' },
      { id:'link',type:rel+'hyperlink',target:'https://example.com',targetMode:'External' },
    ],
    parts: [
      { itemName:'word/styles.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml',xml:`<w:styles xmlns:w="${ns}"><w:style w:type="paragraph" w:styleId="Heading"><w:pPr><w:spacing w:before="200" w:after="100" w:line="320"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="008855"/></w:rPr></w:style></w:styles>` },
      { itemName:'word/numbering.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml',xml:`<w:numbering xmlns:w="${ns}"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="upperRoman"/><w:lvlText w:val="%1)"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>` },
      { itemName:'word/header1.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',xml:`<w:hdr xmlns:w="${ns}"><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:hdr>` },
      { itemName:'word/footnotes.xml',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',xml:`<w:footnotes xmlns:w="${ns}"><w:footnote w:id="1"><w:p><w:r><w:t>Footnote</w:t></w:r></w:p></w:footnote></w:footnotes>` },
    ],
  }));
}

test('native import retains rich layout through edits, including styles, sections, stories and numbering', () => {
  const source = richSource();
  const model = new NativeWordDocument({ source });
  expect(geometry(model.layout(measurer))).toEqual(geometry(layoutWordDocument(source.document, measurer)));
  const blocks = importWordContent(source);
  const first = blocks[0]!;
  if (first.kind !== 'paragraph') throw Error('paragraph');
  model.update([{ ...first, runs: first.runs.map((run, index) => index === 0 ? { ...run, text: 'Edited heading', format: {...run.format, italic:true} } : run) }, ...blocks.slice(1)]);
  expect(geometry(model.layout(measurer))).toEqual(geometry(layoutWordDocument(model.artifact().document, measurer)));
  expect([...model.listMarkers.values()].map(marker => marker.text)).toEqual(['III)', 'IV)']);
});

test('editing and layout cannot access XML or the source package after import', () => {
  const source = richSource();
  const model = new NativeWordDocument({ source });
  const blocks = importWordContent(source);
  model.layout(measurer);
  const before = model.cache.measuredParagraphs;
  const fail = () => { throw new Error('Package access during editing'); };
  const spies = [spyOn(source, 'bytes').mockImplementation(fail), spyOn(source.document.source, 'element').mockImplementation(fail), spyOn(source.document.package, 'readPart').mockImplementation(fail)];
  try {
    const first = blocks[0]!;
    if (first.kind !== 'paragraph') throw Error('paragraph');
    model.update([{ ...first, runs: [{ ...first.runs[0]!, text:'Changed' }] }, ...blocks.slice(1)]);
    expect(model.layout(measurer).pages.length).toBeGreaterThan(0);
    expect(model.cache.measuredParagraphs - before).toBe(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { for (const spy of spies) spy.mockRestore(); }
});

test('export and reimport use the same incremental editing and layout path', () => {
  const blocks: WordContentBlock[] = Array.from({length:100}, (_,index) => ({kind:'paragraph',id:String(index),runs:[{text:`Paragraph ${index} `+'words '.repeat(30),format:{bold:index%5===0}}]}));
  const native = new NativeWordDocument();
  native.update(blocks);
  const imported = new NativeWordDocument({source:native.artifact()});
  const reimported = importWordContent(native.artifact());
  native.layout(measurer); imported.layout(measurer);
  const counts = [native.cache.measuredParagraphs, imported.cache.measuredParagraphs];
  const change = (blocks:readonly WordContentBlock[]) => blocks.map((block,index) => index===50 && block.kind==='paragraph' ? {...block,runs:[{...block.runs[0]!,text:'Edited '+block.runs[0]!.text}]} : block);
  native.update(change(blocks)); imported.update(change(reimported));
  expect(geometry(imported.layout(measurer))).toEqual(geometry(native.layout(measurer)));
  expect(native.cache.measuredParagraphs-counts[0]!).toBe(1);
  expect(imported.cache.measuredParagraphs-counts[1]!).toBe(1);
});

test('opaque blocks remain in native reading order when a neighbouring paragraph is removed', () => {
  const source=openWordArtifact(buildWordDocumentFixture({documentXml:`<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>A</w:t></w:r></w:p><w:altChunk/><w:p><w:r><w:t>B</w:t></w:r></w:p><w:p><w:r><w:t>C</w:t></w:r></w:p></w:body></w:document>`}));
  const model=new NativeWordDocument({source});
  const content=importWordContent(source);
  model.update(content.slice(1));
  expect(model.blocks.map(block => block.kind)).toEqual(['unsupported','paragraph','paragraph']);
  expect(geometry(model.layout(measurer))).toEqual(geometry(layoutWordDocument(model.artifact().document,measurer)));
});

test('imported paragraph continuations and independent copies retain the compatibility API', () => {
  const source=richSource();const content=importWordContent(source);const first=content[0]!;
  if(first.kind!=='paragraph') throw Error('paragraph');
  const model=new NativeWordDocument({source});
  model.update([first,{...first,sourceCopy:'copy'},...content.slice(1)]);
  expect(model.paragraphs().slice(0,2).map(p=>p.text)).toEqual(['Heading\tLink','Heading\tLink']);
  expect(geometry(model.layout(measurer))).toEqual(geometry(layoutWordDocument(model.artifact().document,measurer)));
  const table=content.find(block=>block.kind==='table')!;
  model.update([...content,table]);
  expect(model.blocks.filter(block=>block.kind==='table')).toHaveLength(2);
  expect(geometry(model.layout(measurer))).toEqual(geometry(layoutWordDocument(model.artifact().document,measurer)));
});

test('automatic and omitted source table grids retain native and exported geometry', () => {
  for (const grid of ['', '<w:tblGrid><w:gridCol w:w="0"/><w:gridCol w:w="0"/></w:tblGrid>']) {
    const source=openWordArtifact(buildWordDocumentFixture({documentXml:`<w:document xmlns:w="${ns}"><w:body><w:tbl><w:tblPr><w:tblW w:w="2500" w:type="pct"/></w:tblPr>${grid}<w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`}));
    const model=new NativeWordDocument({source});
    expect(geometry(model.layout(measurer))).toEqual(geometry(layoutWordDocument(source.document,measurer)));
    const content=importWordContent(source);const table=content[0]!;
    if(table.kind!=='table') throw Error('table');
    model.update([{...table,rows:table.rows.map(row=>row.map(cell=>({...cell,blocks:cell.blocks.map(block=>block.kind==='paragraph'?{...block,runs:block.runs.map(run=>({...run,text:run.text+' changed'}))}:block)})))}]);
    expect(geometry(model.layout(measurer))).toEqual(geometry(layoutWordDocument(model.artifact().document,measurer)));
  }
});

test('new content in imported documents inherits the source document defaults', () => {
  const source=createWordArtifact({defaultFormat:{fontFamily:'Courier New',fontSizePoints:16,color:'#882244'},lineSpacing:1.4,paragraphs:[{runs:[{text:'Existing'}]}]});
  const model=new NativeWordDocument({source,defaultFormat:{fontFamily:'Arial',fontSizePoints:13},lineSpacing:1.8});
  model.update([...importWordContent(source),{kind:'paragraph',id:'new',runs:[{text:'New content'}]}]);
  expect(geometry(model.layout(measurer))).toEqual(geometry(layoutWordDocument(model.artifact().document,measurer)));
});
