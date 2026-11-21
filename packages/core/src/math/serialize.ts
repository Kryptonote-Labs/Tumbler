import type { MathEquation, MathNode, MathRow } from "./model.ts";

const escapeXml = (value: string) => value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
const val = (name: string, value: string) => `<m:${name} m:val="${escapeXml(value)}"/>`;

/**
 * Office Math Markup for Word and PowerPoint. `runProperties` is host `w:rPr`/`a:rPr` markup
 * applied to every math run so the equation keeps the surrounding typography.
 */
export function mathToOmml(equation: MathEquation, runProperties = ""): string {
  const row = (nodes: MathRow): string => {
    let xml = "";
    let text = "";
    let normal = false;
    const flush = () => {
      if (!text) return;
      xml += `<m:r>${normal ? `<m:rPr>${val("sty", "p")}</m:rPr>` : ""}${runProperties}<m:t xml:space="preserve">${escapeXml(text)}</m:t></m:r>`;
      text = "";
    };
    for (const node of nodes) {
      if (node.kind === "char") {
        if (text && (node.normal ?? false) !== normal) flush();
        normal = node.normal ?? false;
        text += node.value;
      } else {
        flush();
        xml += structure(node);
      }
    }
    flush();
    return xml;
  };
  const slot = (name: string, nodes: MathRow | undefined) => `<m:${name}>${row(nodes ?? [])}</m:${name}>`;
  const structure = (node: Exclude<MathNode, { kind: "char" }>): string => {
    switch (node.kind) {
      case "fraction": {
        const type = node.style === "skewed" ? "skw" : node.style === "linear" ? "lin" : node.style === "stacked" ? "noBar" : undefined;
        return `<m:f>${type ? `<m:fPr>${val("type", type)}</m:fPr>` : ""}${slot("num", node.num)}${slot("den", node.den)}</m:f>`;
      }
      case "script":
        if (node.pre) return `<m:sPre>${slot("sub", node.sub)}${slot("sup", node.sup)}${slot("e", node.base)}</m:sPre>`;
        if (node.sub && node.sup) return `<m:sSubSup>${slot("e", node.base)}${slot("sub", node.sub)}${slot("sup", node.sup)}</m:sSubSup>`;
        return node.sup ? `<m:sSup>${slot("e", node.base)}${slot("sup", node.sup)}</m:sSup>` : `<m:sSub>${slot("e", node.base)}${slot("sub", node.sub)}</m:sSub>`;
      case "radical":
        return `<m:rad>${node.degree ? "" : `<m:radPr>${val("degHide", "1")}</m:radPr>`}${slot("deg", node.degree)}${slot("e", node.body)}</m:rad>`;
      case "delimiter":
        return `<m:d><m:dPr>${val("begChr", node.open)}${val("endChr", node.close)}</m:dPr>${slot("e", node.body)}</m:d>`;
      case "nary":
        return `<m:nary><m:naryPr>${val("chr", node.operator)}${val("limLoc", node.side ? "subSup" : "undOvr")}${node.sub ? "" : val("subHide", "1")}${node.sup ? "" : val("supHide", "1")}</m:naryPr>${slot("sub", node.sub)}${slot("sup", node.sup)}${slot("e", node.body)}</m:nary>`;
      case "function":
        return `<m:func>${slot("fName", node.name)}${slot("e", node.body)}</m:func>`;
      case "accent":
        return `<m:acc><m:accPr>${val("chr", node.accent)}</m:accPr>${slot("e", node.body)}</m:acc>`;
      case "limit": {
        const name = node.position === "lower" ? "limLow" : "limUpp";
        return `<m:${name}>${slot("e", node.base)}${slot("lim", node.limit)}</m:${name}>`;
      }
      case "matrix":
        return `<m:m>${node.rows.map((cells) => `<m:mr>${cells.map((cell) => slot("e", cell)).join("")}</m:mr>`).join("")}</m:m>`;
    }
  };
  return `<m:oMath>${row(equation.body)}</m:oMath>`;
}

/** Linear text for search, word counts, accessibility and plain-text clipboard. */
export function mathToText(equation: MathEquation): string {
  const wrap = (nodes: MathRow | undefined) => {
    const text = row(nodes ?? []);
    return nodes && nodes.length > 1 ? `(${text})` : text;
  };
  const row = (nodes: MathRow): string =>
    nodes
      .map((node) => {
        switch (node.kind) {
          case "char":
            return node.value;
          case "fraction":
            return `${wrap(node.num)}/${wrap(node.den)}`;
          case "script":
            return node.pre
              ? `${node.sub ? `_${wrap(node.sub)}` : ""}${node.sup ? `^${wrap(node.sup)}` : ""}${row(node.base)}`
              : `${row(node.base)}${node.sub ? `_${wrap(node.sub)}` : ""}${node.sup ? `^${wrap(node.sup)}` : ""}`;
          case "radical":
            return `${node.degree ? `√(${row(node.degree)}&${row(node.body)})` : `√${wrap(node.body)}`}`;
          case "delimiter":
            return `${node.open}${row(node.body)}${node.close}`;
          case "nary":
            return `${node.operator}${node.sub ? `_${wrap(node.sub)}` : ""}${node.sup ? `^${wrap(node.sup)}` : ""} ${row(node.body)}`;
          case "function":
            return `${row(node.name)} ${row(node.body)}`;
          case "accent":
            return `${row(node.body)}${node.accent}`;
          case "limit":
            return `${row(node.base)}${node.position === "lower" ? "_" : "^"}${wrap(node.limit)}`;
          case "matrix":
            return `■(${node.rows.map((cells) => cells.map(row).join("&")).join("@")})`;
        }
      })
      .join("");
  return row(equation.body);
}
