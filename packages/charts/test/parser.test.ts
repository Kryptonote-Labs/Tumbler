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

  test("recognizes pie, doughnut, line, scatter, and horizontal bar types", () => {
    expect(type("pieChart")).toMatchObject({ status: "supported", kind: "pie" });
    expect(type("doughnutChart", '<c:holeSize val="65"/>')).toMatchObject({ status: "supported", kind: "doughnut", holeSize: 65 });
    expect(type("lineChart")).toMatchObject({ status: "supported", kind: "line" });
    expect(type("barChart", '<c:barDir val="bar"/>')).toMatchObject({ status: "supported", kind: "bar" });
    expect(type("scatterChart", '<c:scatterStyle val="marker"/>')).toMatchObject({ status: "supported", kind: "scatter", scatterStyle: "marker" });
    expect(type("scatterChart")).toMatchObject({ status: "supported", kind: "scatter", scatterStyle: "marker" });
    expect(type("scatterChart", '<c:scatterStyle val="none"/>')).toMatchObject({ status: "supported", kind: "scatter", scatterStyle: "none" });
  });

  test("reads scatter coordinates, style, markers, axes, and numeric formats", () => {
    const profile = profiles[1]!;
    const chart = parseOoxmlChart(xml(profile, `<c:plotArea><c:scatterChart><c:scatterStyle val="smoothMarker"/>
      <c:ser><c:idx val="0"/><c:order val="0"/><c:marker><c:symbol val="diamond"/><c:size val="9"/></c:marker><c:smooth val="1"/>
        <c:xVal><c:numRef><c:f>Data!$A$2:$A$4</c:f><c:numCache><c:formatCode>yyyy-mm-dd</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="2"><c:v>3</c:v></c:pt></c:numCache></c:numRef></c:xVal>
        <c:yVal><c:numRef><c:f>Data!$B$2:$B$4</c:f><c:numCache><c:formatCode>0.0</c:formatCode><c:ptCount val="3"/><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>20</c:v></c:pt><c:pt idx="2"><c:v>30</c:v></c:pt></c:numCache></c:numRef></c:yVal>
      </c:ser><c:axId val="10"/><c:axId val="20"/></c:scatterChart>
      <c:valAx><c:axId val="10"/><c:axPos val="b"/><c:numFmt formatCode="yyyy-mm-dd" sourceLinked="0"/></c:valAx>
      <c:valAx><c:axId val="20"/><c:axPos val="l"/><c:majorGridlines/></c:valAx></c:plotArea>`), "transitional");
    expect(chart).toMatchObject({ status: "supported", kind: "scatter", scatterStyle: "smooth-marker", axisIds: [10, 20] });
    if (chart.status !== "supported") throw new Error("Expected supported chart");
    expect(chart.series[0]).toMatchObject({ marker: { symbol: "diamond", size: 9 }, smooth: true });
    expect(chart.series[0]?.xValues?.points).toEqual([{ index: 0, value: 1 }, { index: 2, value: 3 }]);
    expect(chart.series[0]?.values?.points.map((point) => point.value)).toEqual([10, 20, 30]);
    expect(chart.axes[0]).toMatchObject({ id: 10, kind: "value", position: "bottom", numberFormatCode: "yyyy-mm-dd", numberFormatSourceLinked: false });
  });

  for (const profile of profiles) {
    test(`reads ${profile.conformance} 2-D bubble series and size semantics`, () => {
      const chart = parseOoxmlChart(xml(profile, `<c:plotArea><c:bubbleChart>
        <c:ser><c:idx val="2"/><c:order val="0"/><c:tx><c:v>Pipeline</c:v></c:tx>
          <c:xVal><c:numRef><c:f>Data!$A$2:$A$5</c:f><c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="4"/><c:pt idx="0"><c:v>1</c:v></c:pt><c:pt idx="2"><c:v>8</c:v></c:pt></c:numCache></c:numRef></c:xVal>
          <c:yVal><c:numRef><c:f>Data!$B$2:$B$5</c:f><c:numCache><c:formatCode>0.0</c:formatCode><c:ptCount val="4"/><c:pt idx="0"><c:v>4</c:v></c:pt><c:pt idx="2"><c:v>10</c:v></c:pt></c:numCache></c:numRef></c:yVal>
          <c:bubbleSize><c:numRef><c:f>Data!$C$2:$C$5</c:f><c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="4"/><c:pt idx="0"><c:v>25</c:v></c:pt><c:pt idx="2"><c:v>-9</c:v></c:pt></c:numCache></c:numRef></c:bubbleSize>
        </c:ser><c:bubbleScale val="175%"/><c:showNegBubbles val="1"/><c:sizeRepresents val="w"/><c:axId val="10"/><c:axId val="20"/>
      </c:bubbleChart><c:valAx><c:axId val="10"/><c:axPos val="b"/></c:valAx><c:valAx><c:axId val="20"/><c:axPos val="l"/></c:valAx></c:plotArea>`), profile.conformance);
      expect(chart).toMatchObject({
        status: "supported", kind: "bubble", bubbleScale: 175,
        showNegativeBubbles: true, bubbleSizeRepresentation: "width", axisIds: [10, 20],
      });
      if (chart.status !== "supported") throw new Error("Expected supported bubble chart");
      expect(chart.series[0]?.xValues?.points).toEqual([{ index: 0, value: 1 }, { index: 2, value: 8 }]);
      expect(chart.series[0]?.values?.points).toEqual([{ index: 0, value: 4 }, { index: 2, value: 10 }]);
      expect(chart.series[0]?.bubbleSizes?.points).toEqual([{ index: 0, value: 25 }, { index: 2, value: -9 }]);
    });
  }

  test("uses standard bubble defaults and rejects unsafe bubble variants", () => {
    expect(type("bubbleChart", '<c:axId val="1"/><c:axId val="2"/>')).toMatchObject({
      status: "supported", kind: "bubble", bubbleScale: 100,
      showNegativeBubbles: false, bubbleSizeRepresentation: "area",
    });
    expect(type("bubbleChart", '<c:bubble3D/><c:axId val="1"/><c:axId val="2"/>')).toMatchObject({
      status: "unsupported", reason: expect.stringContaining("3-D"),
    });
    expect(type("bubbleChart", '<c:ser><c:idx val="0"/><c:order val="0"/><c:bubble3D val="true"/></c:ser><c:axId val="1"/><c:axId val="2"/>')).toMatchObject({
      status: "unsupported", reason: expect.stringContaining("3-D"),
    });
    expect(type("bubbleChart", '<c:axId val="1"/>')).toMatchObject({
      status: "unsupported", reason: expect.stringContaining("exactly two"),
    });
    expect(type("bubbleChart", '<c:ser><c:idx val="0"/><c:order val="0"/><c:xVal><c:strLit><c:ptCount val="1"/><c:pt idx="0"><c:v>A</c:v></c:pt></c:strLit></c:xVal></c:ser><c:axId val="1"/><c:axId val="2"/>')).toMatchObject({
      status: "unsupported", reason: expect.stringContaining("must be numeric"),
    });
    expect(() => type("bubbleChart", '<c:bubbleScale val="301%"/><c:axId val="1"/><c:axId val="2"/>')).toThrow(ChartParseError);
    expect(() => type("bubbleChart", '<c:sizeRepresents val="radius"/><c:axId val="1"/><c:axId val="2"/>')).toThrow(ChartParseError);
  });

  test("returns an explicit model for unsupported and combination charts", () => {
    expect(type("radarChart")).toMatchObject({ status: "unsupported", chartType: "radarChart" });
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

  test("contains single-byte chart XML damage behind the chart boundary", () => {
    const profile = profiles[1]!;
    const valid = xml(profile, '<c:plotArea><c:lineChart><c:ser><c:idx val="0"/><c:order val="0"/></c:ser></c:lineChart></c:plotArea>');
    for (let index = 0; index < valid.length; index += Math.max(1, Math.floor(valid.length / 200))) {
      const mutated = valid.slice();
      mutated[index] = mutated[index]! ^ 0xff;
      try {
        parseOoxmlChart(mutated, "transitional");
      } catch (cause) {
        expect(cause).toBeInstanceOf(ChartParseError);
      }
    }
  });
});

function type(name: string, body = "") {
  const profile = profiles[1]!;
  return parseOoxmlChart(xml(profile, `<c:plotArea><c:${name}>${body}</c:${name}></c:plotArea>`), "transitional");
}

function xml(profile: typeof profiles[number], body: string): Uint8Array {
  return new TextEncoder().encode(`<c:chartSpace xmlns:c="${profile.chart}" xmlns:a="${profile.drawing}"><c:chart>${body}</c:chart></c:chartSpace>`);
}
