import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { openSpreadsheetArtifact } from "../packages/sheets/src/index.ts";
import { buildWorkbookFixture } from "../packages/sheets/test/workbook-fixture.ts";

const outputDirectory = resolve(process.argv[2] ?? "compatibility-results/input");
await mkdir(outputDirectory, { recursive: true });

const namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const original = buildWorkbookFixture({
  sheets: [{
    name: "Values",
    sheetId: 1,
    relationshipId: "sheet1",
    xml: `<worksheet xmlns="${namespace}"><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Source</t></is></c><c r="B1"><v>4</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Untouched</t></is></c><c r="B2"><f>B1*2</f><v>8</v></c></row></sheetData></worksheet>`,
  }],
});
const edited = openSpreadsheetArtifact(original).editCell("B1", 5).bytes();
const table = buildWorkbookFixture({
  sheets: [{
    name: "Table",
    sheetId: 1,
    relationshipId: "sheet1",
    xml: `<worksheet xmlns="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:C4"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c><c r="C1" t="inlineStr"><is><t>Status</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Alpha</t></is></c><c r="B2"><v>5</v></c><c r="C2" t="inlineStr"><is><t>Ready</t></is></c></row><row r="3" hidden="1"><c r="A3" t="inlineStr"><is><t>Beta</t></is></c><c r="B3"><v>2</v></c><c r="C3" t="inlineStr"><is><t>Waiting</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Gamma</t></is></c><c r="B4"><f>4+5</f><v>9</v></c><c r="C4" t="inlineStr"><is><t>Ready</t></is></c></row></sheetData><tableParts count="1"><tablePart r:id="table1"/></tableParts></worksheet>`,
    tables: [{
      relationshipId: "table1",
      target: "../tables/table1.xml",
      xml: `<table xmlns="${namespace}" id="1" name="SampleData" displayName="SampleData" ref="A1:C4"><autoFilter ref="A1:C4"><filterColumn colId="2"><filters><filter val="Ready"/></filters></filterColumn><sortState ref="A2:C4"><sortCondition ref="B2:B4" descending="1"/></sortState></autoFilter><tableColumns count="3"><tableColumn id="1" name="Item"/><tableColumn id="2" name="Value"/><tableColumn id="3" name="Status"/></tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`,
    }],
  }],
});
const formulas = buildWorkbookFixture({
  sheets: [{
    name: "Sample Data",
    sheetId: 1,
    relationshipId: "sheet1",
    xml: `<worksheet xmlns="${namespace}"><dimension ref="B5:D10"/><sheetData>
      <row r="5"><c r="B5"><v>13</v></c><c r="D5" t="str"><f>IF(B5&gt;0,&quot;OK&quot;,&quot;Check&quot;)</f><v/></c></row>
      <row r="6"><c r="B6"><v>4</v></c><c r="D6" t="str"><f>IF(B6&gt;0,&quot;OK&quot;,&quot;Check&quot;)</f><v/></c></row>
      <row r="7"><c r="B7"><v>1</v></c><c r="D7" t="str"><f>IF(B7&gt;0,&quot;OK&quot;,&quot;Check&quot;)</f><v/></c></row>
      <row r="10"><c r="C10"><f>SUM(B5:B7)</f><v/></c></row>
    </sheetData></worksheet>`,
  }],
});
const officeRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const drawing = "http://schemas.openxmlformats.org/drawingml/2006/main";
const spreadsheetDrawing = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const chartNamespace = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const charts = buildWorkbookFixture({
  sheets: [{
    name: "Values",
    sheetId: 1,
    relationshipId: "sheet1",
    xml: `<worksheet xmlns="${namespace}" xmlns:r="${officeRelationships}"><dimension ref="A1:B4"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Quarter</t></is></c><c r="B1" t="inlineStr"><is><t>Revenue</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Q1</t></is></c><c r="B2"><v>12</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Q2</t></is></c><c r="B3"><v>18</v></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>Q3</t></is></c><c r="B4"><f>SUM(B2:B3)</f><v>30</v></c></row></sheetData><drawing r:id="drawing1"/></worksheet>`,
    relationships: [{ id: "drawing1", type: `${officeRelationships}/drawing`, target: "../drawings/drawing1.xml" }],
  }],
  parts: [
    {
      itemName: "xl/drawings/drawing1.xml",
      contentType: "application/vnd.openxmlformats-officedocument.drawing+xml",
      xml: `<xdr:wsDr xmlns:xdr="${spreadsheetDrawing}" xmlns:a="${drawing}" xmlns:c="${chartNamespace}" xmlns:r="${officeRelationships}"><xdr:twoCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>15</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="${chartNamespace}"><c:chart r:id="chart1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`,
    },
    {
      itemName: "xl/drawings/_rels/drawing1.xml.rels",
      xml: `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="chart1" Type="${officeRelationships}/chart" Target="../charts/chart1.xml"/></Relationships>`,
    },
    {
      itemName: "xl/charts/chart1.xml",
      contentType: "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
      xml: `<c:chartSpace xmlns:c="${chartNamespace}" xmlns:a="${drawing}"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Quarterly revenue</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title><c:plotArea><c:layout/><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Values!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Revenue</c:v></c:pt></c:strCache></c:strRef></c:tx><c:spPr><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></c:spPr><c:cat><c:strRef><c:f>Values!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Values!$B$2:$B$4</c:f><c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>12</c:v></c:pt><c:pt idx="1"><c:v>18</c:v></c:pt><c:pt idx="2"><c:v>30</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser><c:gapWidth val="150"/><c:axId val="100001"/><c:axId val="100002"/></c:barChart><c:catAx><c:axId val="100001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="100002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="100002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="100001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="r"/><c:layout/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart></c:chartSpace>`,
    },
  ],
});

await Promise.all([
  Bun.write(resolve(outputDirectory, "spreadsheet-original.xlsx"), original),
  Bun.write(resolve(outputDirectory, "spreadsheet-edited.xlsx"), edited),
  Bun.write(resolve(outputDirectory, "spreadsheet-table.xlsx"), table),
  Bun.write(resolve(outputDirectory, "spreadsheet-formulas.xlsx"), formulas),
  Bun.write(resolve(outputDirectory, "spreadsheet-charts.xlsx"), charts),
]);

console.log(outputDirectory);
