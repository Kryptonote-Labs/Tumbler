import { describe, expect, test } from "bun:test";
import { ChartParseError, parseOoxmlChart } from "../src/index.ts";

const profiles = [
  { conformance: "strict" as const, chart: "http://purl.oclc.org/ooxml/drawingml/chart", drawing: "http://purl.oclc.org/ooxml/drawingml/main" },
  { conformance: "transitional" as const, chart: "http://schemas.openxmlformats.org/drawingml/2006/chart", drawing: "http://schemas.openxmlformats.org/drawingml/2006/main" },
];

describe("DrawingML chart parser", () => {
  for (const profile of profiles) {
    test(`reads ${profile.conformance} column semantics and caches`, () => {
      const chart = parseOoxmlChart(xml(profile, `
        <c:title><c:tx><c:rich><a:p><a:r><a:t>Quarterly sales</a:t></a:r></a:p></c:rich></c:tx></c:title>
        <c:plotArea><c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>
          <c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Revenue</c:v></c:pt></c:strCache></c:strRef></c:tx>
            <c:spPr><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></c:spPr>
            <c:cat><c:strRef><c:f>Sheet1!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt></c:strCache></c:strRef></c:cat>
            <c:val><c:numRef><c:f>Sheet1!$B$2:$B$4</c:f><c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>20</c:v></c:pt><c:pt idx="2"><c:v>15</c:v></c:pt></c:numCache></c:numRef></c:val>
          </c:ser></c:barChart>
          <c:catAx><c:axId val="1"/><c:axPos val="b"/></c:catAx><c:valAx><c:axId val="2"/><c:scaling><c:min val="0"/><c:max val="25"/></c:scaling><c:axPos val="l"/><c:majorGridlines/></c:valAx>
        </c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>`), profile.conformance);
      expect(chart).toMatchObject({ status: "supported", kind: "column", title: "Quarterly sales", grouping: "clustered", legend: { position: "bottom", overlay: false } });
      if (chart.status !== "supported") throw new Error("Expected supported chart");
      expect(chart.series[0]).toMatchObject({ title: "Revenue", titleFormula: "Sheet1!$B$1", fill: { kind: "rgb", value: "#4472C4" } });
      expect(chart.series[0]?.categories?.points.map((point) => point.value)).toEqual(["Q1", "Q2", "Q3"]);
      expect(chart.series[0]?.values?.points.map((point) => point.value)).toEqual([10, 20, 15]);
      expect(chart.axes[1]).toMatchObject({ kind: "value", position: "left", majorGridlines: true, minimum: 0, maximum: 25 });
    });
  }

  test("recognizes pie, doughnut, line, and horizontal bar types", () => {
    expect(type("pieChart")).toMatchObject({ status: "supported", kind: "pie" });
    expect(type("doughnutChart", '<c:holeSize val="65"/>')).toMatchObject({ status: "supported", kind: "doughnut", holeSize: 65 });
    expect(type("lineChart")).toMatchObject({ status: "supported", kind: "line" });
    expect(type("barChart", '<c:barDir val="bar"/>')).toMatchObject({ status: "supported", kind: "bar" });
  });

  test("returns an explicit model for unsupported and combination charts", () => {
    expect(type("scatterChart")).toMatchObject({ status: "unsupported", chartType: "scatterChart" });
    const profile = profiles[1]!;
    const result = parseOoxmlChart(xml(profile, '<c:plotArea><c:lineChart/><c:barChart/></c:plotArea>'), "transitional");
    expect(result).toMatchObject({ status: "unsupported", reason: expect.stringContaining("Combination") });
    expect(type("barChart", '<c:grouping val="stacked"/>')).toMatchObject({ status: "unsupported", reason: expect.stringContaining("stacked") });
  });

  test("rejects hostile cache shapes", () => {
    const profile = profiles[1]!;
    const source = xml(profile, '<c:plotArea><c:pieChart><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numLit><c:pt idx="0"><c:v>NaN</c:v></c:pt></c:numLit></c:val></c:ser></c:pieChart></c:plotArea>');
    expect(() => parseOoxmlChart(source, "transitional")).toThrow(ChartParseError);
    const outside = xml(profile, '<c:plotArea><c:pieChart><c:ser><c:idx val="0"/><c:order val="0"/><c:val><c:numLit><c:ptCount val="1"/><c:pt idx="1"><c:v>1</c:v></c:pt></c:numLit></c:val></c:ser></c:pieChart></c:plotArea>');
    expect(() => parseOoxmlChart(outside, "transitional")).toThrow("outside ptCount");
  });
});

function type(name: string, body = "") {
  const profile = profiles[1]!;
  return parseOoxmlChart(xml(profile, `<c:plotArea><c:${name}>${body}</c:${name}></c:plotArea>`), "transitional");
}

function xml(profile: typeof profiles[number], body: string): Uint8Array {
  return new TextEncoder().encode(`<c:chartSpace xmlns:c="${profile.chart}" xmlns:a="${profile.drawing}"><c:chart>${body}</c:chart></c:chartSpace>`);
}
