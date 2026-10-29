import type { LosslessXmlElement } from "@tumblerjs/ooxml";
import { children } from "./authoring-slides.ts";
import { xml } from "./authoring-xml.ts";

const paragraphOrder = [
  "lnSpc",
  "spcBef",
  "spcAft",
  "buClrTx",
  "buClr",
  "buSzTx",
  "buSzPct",
  "buSzPts",
  "buFontTx",
  "buFont",
  "buNone",
  "buAutoNum",
  "buChar",
  "buBlip",
  "tabLst",
  "defRPr",
  "extLst",
];
const runOrder = [
  "ln",
  "noFill",
  "solidFill",
  "gradFill",
  "blipFill",
  "pattFill",
  "grpFill",
  "effectLst",
  "effectDag",
  "highlight",
  "uLnTx",
  "uLn",
  "uFillTx",
  "uFill",
  "latin",
  "ea",
  "cs",
  "sym",
  "hlinkClick",
  "hlinkMouseOver",
  "rtl",
  "extLst",
];
const choices = [
  ["buClrTx", "buClr"],
  ["buSzTx", "buSzPct", "buSzPts"],
  ["buFontTx", "buFont"],
  ["buNone", "buAutoNum", "buChar", "buBlip"],
  ["noFill", "solidFill", "gradFill", "blipFill", "pattFill", "grpFill"],
  ["effectLst", "effectDag"],
  ["uLnTx", "uLn"],
  ["uFillTx", "uFill"],
];
/** Move local list defaults onto paragraphs before merging cells with different text defaults. */
export function tableParagraphs(
  cell: LosslessXmlElement,
  portable: (node: LosslessXmlElement) => string,
) {
  const body = children(cell).find((e) => e.localName === "txBody");
  if (!body) return [];
  const list = children(body).find((e) => e.localName === "lstStyle");
  const merge = (name: string, sources: LosslessXmlElement[]): string => {
    const attrs = new Map<string, string>(),
      nodes = new Map<string, LosslessXmlElement>();
    const runDefaults: LosslessXmlElement[] = [];
    for (const source of sources) {
      for (const attr of source.attributes) attrs.set(attr.qualified, attr.value);
      for (const node of children(source)) {
        if (node.localName === "defRPr") {
          runDefaults.push(node);
          continue;
        }
        for (const choice of choices)
          if (choice.includes(node.localName)) for (const key of choice) nodes.delete(key);
        nodes.set(node.localName, node);
      }
    }
    const order = name === "pPr" ? paragraphOrder : runOrder;
    const content = [...nodes].map(([key, node]) => ({ key, markup: portable(node) }));
    if (runDefaults.length) content.push({ key: "defRPr", markup: merge("defRPr", runDefaults) });
    content.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    attrs.set("xmlns:a", body.namespaceUri);
    return `<a:${name} ${[...attrs].map(([key, value]) => `${key}="${xml(value)}"`).join(" ")}>${content.map((n) => n.markup).join("")}</a:${name}>`;
  };
  return children(body)
    .filter((e) => e.localName === "p")
    .map((paragraph) => {
      const props = children(paragraph).find((e) => e.localName === "pPr");
      const level = Number(props?.attributes.find((a) => a.localName === "lvl")?.value ?? 0);
      const defaults = list
        ? [
            children(list).find((e) => e.localName === "defPPr"),
            children(list).find((e) => e.localName === `lvl${level + 1}pPr`),
          ].filter((node): node is LosslessXmlElement => !!node)
        : [];
      if (!defaults.length) return portable(paragraph);
      const raw = portable(paragraph);
      const start = raw.indexOf(">") + 1;
      const content = children(paragraph)
        .filter((e) => e !== props)
        .map(portable)
        .join("");
      return (
        raw.slice(0, start) +
        merge("pPr", [...defaults, ...(props ? [props] : [])]) +
        content +
        `</${paragraph.qualified}>`
      );
    });
}
