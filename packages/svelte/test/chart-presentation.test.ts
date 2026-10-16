import { expect, test } from "bun:test";
import { parseOoxmlChart, resolveChartColor } from "@tumblerjs/charts";
import { chartLineCss, chartTextCss } from "../src/chart-presentation.ts";

function fixture() {
  const text = `<c:txPr><a:bodyPr/><a:p><a:pPr><a:defRPr sz="900" b="0"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="65000"/><a:lumOff val="35000"/></a:schemeClr></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:pPr></a:p></c:txPr>`;
  const xml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title>${text.replace('sz="900"', 'sz="1400"')}</c:title><c:plotArea><c:barChart><c:barDir val="col"/></c:barChart><c:valAx><c:axId val="1"/><c:axPos val="l"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:schemeClr val="tx1"><a:lumMod val="15000"/><a:lumOff val="85000"/></a:schemeClr></a:solidFill></a:ln></c:spPr></c:majorGridlines>${text}</c:valAx></c:plotArea><c:legend><c:legendPos val="b"/>${text}</c:legend></c:chart></c:chartSpace>`;
  const parsed = parseOoxmlChart(new TextEncoder().encode(xml), "transitional");
  if (parsed.status !== "supported") throw Error("Expected supported chart");
  return { ...parsed, themeColors: { tx1: "#000000" }, themeFonts: { "+mn-lt": "Aptos" } };
}

test("authored chart text resolves to 9pt Aptos, normal weight and 35% luminance", () => {
  const model = fixture();
  for (const style of [model.axes[0]?.textStyle, model.legend?.textStyle]) {
    const css = chartTextCss(style, model);
    expect(css).toContain('font-size:12px');
    expect(css).toContain('font-family:"Aptos",sans-serif');
    expect(css).toContain('font-weight:400');
    expect(css).toContain('fill:#595959');
  }
  expect(chartTextCss(model.titleStyle, model)).toContain(`font-size:${14 * 4 / 3}px`);
});

test("no-fill axes disappear while authored gridlines retain colour and width", () => {
  const model = fixture();
  expect(chartLineCss(model.axes[0]?.lineStyle, model)).toBe("stroke:none");
  expect(chartLineCss(model.axes[0]?.gridlineStyle, model)).toBe("stroke:#d9d9d9;stroke-width:1");
});

test("text inherits chart defaults and preserves an explicit non-bold override", () => {
  const model = { ...fixture(), textStyle: { fontSize: 9, bold: true, italic: true } };
  expect(chartTextCss({ bold: false }, model)).toBe("font-size:12px;font-weight:400;font-style:italic");
  const color = { kind: "rgb" as const, value: "#000000", transforms: [{ kind: "lumOff" as const, value: 0.4 }, { kind: "lumMod" as const, value: 0.5 }] };
  expect(resolveChartColor(color, model)).toBe("#333333");
});

test("rich paragraph defaults override title defaults without losing run-level overrides", () => {
  const model = parseOoxmlChart(new TextEncoder().encode(`<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:pPr><a:defRPr sz="1800" b="1"><a:latin typeface="Aptos"/></a:defRPr></a:pPr><a:r><a:rPr b="0"/><a:t>Title</a:t></a:r></a:p></c:rich></c:tx><c:txPr><a:p><a:pPr><a:defRPr sz="900" i="1"/></a:pPr></a:p></c:txPr></c:title><c:plotArea><c:barChart/></c:plotArea></c:chart></c:chartSpace>`), "transitional");
  expect(model.titleStyle).toMatchObject({ fontSize: 18, fontFamily: "Aptos", bold: false, italic: true });
});
