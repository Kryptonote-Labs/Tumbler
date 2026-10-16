import { expect, test } from "bun:test";
import { layoutCartesianChart, parseOoxmlChart } from "../src/index.ts";

function fixture(title: string, deleted: string, names: readonly string[], defaultTitle?: string) {
  const xml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart>${title}${deleted}<c:plotArea><c:barChart><c:barDir val="col"/>${names.map((name, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${name}</c:v></c:tx></c:ser>`).join("")}</c:barChart></c:plotArea></c:chart></c:chartSpace>`;
  const model = parseOoxmlChart(new TextEncoder().encode(xml), "transitional", defaultTitle === undefined ? {} : { defaultTitle });
  if (model.status !== "supported") throw Error("Expected chart");
  return model;
}

test("an existing title without tx gets the Office fallback and reserves plot space", () => {
  const titled = fixture('<c:title><c:overlay val="0"/></c:title>', '<c:autoTitleDeleted val="0"/>', ["Series 1", "Series 2", "Series 3"]);
  expect(titled.title).toBe("Chart Title");
  expect(layoutCartesianChart(titled, 576, 336).plot.y).toBeGreaterThan(layoutCartesianChart({ ...titled, title: undefined }, 576, 336).plot.y);
  expect(fixture('<c:title/>', '', ["A", "B"], "Diagrammtitel").title).toBe("Diagrammtitel");
});

test("single-series titles use the name, while an absent deleted title stays absent", () => {
  expect(fixture('<c:title/>', '', ["Sales"]).title).toBe("Sales");
  expect(fixture('', '<c:autoTitleDeleted val="0"/>', ["Sales"]).title).toBe("Sales");
  expect(fixture('', '<c:autoTitleDeleted val="1"/>', ["Sales"]).title).toBeUndefined();
  expect(fixture('', '', ["Sales", "Costs"]).title).toBeUndefined();
});

test("an existing explicit or default title takes precedence over the deletion flag", () => {
  expect(fixture('<c:title><c:tx><c:rich><a:p><a:r><a:t>Authored</a:t></a:r></a:p></c:rich></c:tx></c:title>', '<c:autoTitleDeleted val="1"/>', ["Sales"]).title).toBe("Authored");
  expect(fixture('<c:title/>', '<c:autoTitleDeleted val="1"/>', ["Sales", "Costs"]).title).toBe("Chart Title");
  expect(fixture('<c:title><c:tx><c:strRef><c:f>Data!A1</c:f></c:strRef></c:tx></c:title>', '', ["Sales", "Costs"]).title).toBeUndefined();
});

test("combination plots share the chart title rather than inferring separate series titles", () => {
  const xml = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea>${["barChart", "lineChart"].map((kind, i) => `<c:${kind}><c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>Series ${i}</c:v></c:tx></c:ser></c:${kind}>`).join("")}</c:plotArea></c:chart></c:chartSpace>`;
  const model = parseOoxmlChart(new TextEncoder().encode(xml), "transitional");
  if (model.status !== "supported") throw Error("Expected supported chart");
  expect(model.title).toBeUndefined();
  expect(model.plots?.map(plot => plot.title)).toEqual([undefined, undefined]);
});
