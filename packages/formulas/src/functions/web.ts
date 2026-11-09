import type { FormulaScalarValue } from "../evaluator.ts";
import { functionError, functionScalar, functionText, type FunctionContext, type FunctionRegistry, type FunctionValue } from "../function-runtime.ts";

const CELL_LIMIT = 32767;
const textValue = (value: string): FormulaScalarValue => ({ type: "string", value });

function host(context: FunctionContext, name: string, args: readonly FunctionValue[]): FunctionValue {
  context.operation();
  const result = context.services?.invoke(name, args, context.address);
  if (result === undefined) return context.unavailable(`${name} requires an explicit host service for this request`);
  if ("kind" in result) {
    if (result.kind !== "array") return functionError();
    const width = result.rows[0]?.length ?? 0;
    if (!width || result.rows.length > context.maxArrayCells / width) return functionError();
    for (const row of result.rows) {
      context.operation(row.length);
      if (row.length !== width || row.some(value => value.type === "string" && value.value.length > CELL_LIMIT)) return functionError();
    }
  } else if (result.type === "string" && result.value.length > CELL_LIMIT) return functionError();
  return result;
}

export const webFunctions: FunctionRegistry = new Map([
  ["ENCODEURL", (args, context) => {
    if (args.length !== 1) return functionError();
    const value = functionScalar(context.evaluate(args[0]!));
    if (value.type === "error") return value;
    const text = functionText(value);
    context.operation(text.length + 1);
    if (text.length > CELL_LIMIT) return functionError();
    try {
      // RFC 3986 unreserved characters; encodeURIComponent leaves five extra characters.
      const encoded = encodeURIComponent(text).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      return encoded.length > CELL_LIMIT ? functionError() : textValue(encoded);
    } catch { return functionError(); } // Unpaired UTF-16 surrogate.
  }],
  ["WEBSERVICE", (args, context) => {
    if (args.length !== 1) return functionError();
    const value = functionScalar(context.evaluate(args[0]!));
    if (value.type === "error") return value;
    const url = functionText(value);
    context.operation(url.length + 1);
    if (url.length > 2048 || !/^https?:\/\/[^\s/]+/i.test(url)) return functionError();
    try { new URL(url); } catch { return functionError(); }
    const result = host(context, "WEBSERVICE", [textValue(url)]);
    return !("kind" in result) && (result.type === "string" || result.type === "error") ? result : functionError();
  }],
  ["FILTERXML", (args, context) => {
    if (args.length !== 2) return functionError();
    const xml = functionScalar(context.evaluate(args[0]!));
    if (xml.type === "error") return xml;
    const xpath = functionScalar(context.evaluate(args[1]!));
    if (xpath.type === "error") return xpath;
    const document = functionText(xml), path = functionText(xpath);
    context.operation(document.length + path.length + 1);
    if (!document || !path || document.length > CELL_LIMIT || path.length > CELL_LIMIT) return functionError();
    try {
      const root = parseXml(document, context);
      const values = select(root, path, context);
      if (!values.length) return functionError();
      const rows = values.map(value => [xmlValue(value)]);
      return rows.length === 1 ? rows[0]![0]! : { kind: "array", rows };
    } catch (error) {
      if (error instanceof UnsupportedXml) return host(context, "FILTERXML", [textValue(document), textValue(path)]);
      if (error instanceof InvalidXml) return functionError();
      throw error; // Never swallow operation-budget/unavailable exceptions.
    }
  }],
]);

class InvalidXml extends Error {}
class UnsupportedXml extends Error {}
interface XmlNode {
  name: string;
  order: number;
  attributes: Map<string, string>;
  children: (XmlNode | string)[];
}
const NAME = "[A-Za-z_][A-Za-z0-9_.:-]*";
function decode(text: string): string {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\dA-Fa-f]+;)/.test(text)) throw new InvalidXml();
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\dA-Fa-f]+);/g, (_, entity: string) => {
    const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity[0] !== "#") return entities[entity]!;
    const code = entity[1] === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!validCode(code)) throw new InvalidXml();
    return String.fromCodePoint(code);
  });
}
function validCode(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff;
}
function parseXml(input: string, context: FunctionContext): XmlNode {
  for (const char of input) { context.operation(); if (!validCode(char.codePointAt(0)!)) throw new InvalidXml(); }
  const source = input.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
  const document: XmlNode = { name: "", order: 0, attributes: new Map(), children: [] };
  const stack = [document];
  let position = 0, nodes = 0;
  while (position < source.length) {
    context.operation();
    const parent = stack[stack.length - 1]!;
    if (source.startsWith("<!--", position)) {
      const end = source.indexOf("-->", position + 4);
      if (end < 0 || (source.slice(position + 4, end).includes("--") || source.slice(position + 4, end).endsWith("-"))) throw new InvalidXml();
      position = end + 3; continue;
    }
    if (source.startsWith("<?", position)) {
      const end = source.indexOf("?>", position + 2);
      if (end < 0) throw new InvalidXml();
      const instruction = source.slice(position + 2, end);
      const match = new RegExp(`^(${NAME})(?:[ \t\n\r]+([\\s\\S]*))?$`).exec(instruction);
      if (!match) throw new InvalidXml();
      if (match[1]!.toLowerCase() === "xml") {
        // XML declarations are reserved, case-sensitive, and only legal at start.
        if (position !== 0 || match[1] !== "xml" || !/^xml[ \t\n\r]+version[ \t\n\r]*=[ \t\n\r]*(?:"1\.0"|'1\.0')(?:[ \t\n\r]+encoding[ \t\n\r]*=[ \t\n\r]*(?:"[A-Za-z][A-Za-z0-9._-]*"|'[A-Za-z][A-Za-z0-9._-]*'))?(?:[ \t\n\r]+standalone[ \t\n\r]*=[ \t\n\r]*(?:"(?:yes|no)"|'(?:yes|no)'))?[ \t\n\r]*$/.test(instruction)) throw new InvalidXml();
      }
      position = end + 2; continue;
    }
    if (source.startsWith("<![CDATA[", position)) {
      const end = source.indexOf("]]>", position + 9);
      if (end < 0 || stack.length === 1) throw new InvalidXml();
      parent.children.push(source.slice(position + 9, end)); position = end + 3; continue;
    }
    if (source.startsWith("<!", position)) throw new UnsupportedXml("DTD declarations require host XML support");
    if (source[position] !== "<") {
      const end = source.indexOf("<", position);
      const text = source.slice(position, end < 0 ? source.length : end);
      if (text.includes("]]>") || stack.length === 1 && /[^ \t\r\n]/.test(text)) throw new InvalidXml();
      if (stack.length > 1) parent.children.push(decode(text));
      position += text.length; continue;
    }
    const close = new RegExp(`^</(${NAME})[ \\t\\r\\n]*>`).exec(source.slice(position));
    if (close) {
      if (stack.length === 1 || parent.name !== close[1]) throw new InvalidXml();
      stack.pop(); position += close[0].length; continue;
    }
    const open = new RegExp(`^<(${NAME})(?=[ \\t\\r\\n]|/?>)`).exec(source.slice(position));
    if (!open) {
      if (/^<[\u0080-\uffff]/.test(source.slice(position))) throw new UnsupportedXml("Unicode XML names require host support");
      throw new InvalidXml();
    }
    if (++nodes > context.maxArrayCells) throw new UnsupportedXml("XML node budget exceeded");
    const node: XmlNode = { name: open[1]!, order: nodes, attributes: new Map(), children: [] };
    if (node.name.includes(":")) throw new UnsupportedXml("Namespaces require host support");
    position += open[0].length;
    while (!/^[ \t\r\n]*\/?>/.test(source.slice(position))) {
      context.operation();
      const attribute = new RegExp(`^[ \\t\\r\\n]+(${NAME})[ \\t\\r\\n]*=[ \\t\\r\\n]*(?:"([^"<]*)"|'([^'<]*)')`).exec(source.slice(position));
      if (!attribute || node.attributes.has(attribute[1]!)) throw new InvalidXml();
      if (attribute[1]!.includes(":") || attribute[1] === "xmlns") throw new UnsupportedXml("Namespaces require host support");
      node.attributes.set(attribute[1]!, decode((attribute[2] ?? attribute[3]!).replace(/[\t\n]/g, " ")));
      position += attribute[0].length;
    }
    const end = /^[ \t\r\n]*(\/?)>/.exec(source.slice(position))!;
    parent.children.push(node); position += end[0].length;
    if (!end[1]) stack.push(node);
  }
  if (stack.length !== 1 || document.children.filter(child => typeof child !== "string").length !== 1) throw new InvalidXml();
  return document;
}

function xmlValue(text: string): FormulaScalarValue {
  // Excel converts numeric node values to numbers; retain nonnumeric XML text.
  const trimmed = text.trim();
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    const number = Number(trimmed);
    if (Number.isFinite(number)) return { type: "number", value: number };
  }
  return textValue(text);
}
function nodeText(node: XmlNode, context: FunctionContext): string {
  const parts: string[] = [], pending: (XmlNode | string)[] = [node];
  while (pending.length) {
    context.operation();
    const item = pending.pop()!;
    if (typeof item === "string") parts.push(item);
    else for (let i = item.children.length - 1; i >= 0; i--) pending.push(item.children[i]!);
  }
  return parts.join("");
}
function select(document: XmlNode, path: string, context: FunctionContext): string[] {
  // Deliberately bounded XPath subset. Other expressions use an explicit host,
  // never a misleading #VALUE! result for a valid unsupported expression.
  const steps: { descendant: boolean; name: string; position?: number; attribute?: string; equals?: string }[] = [];
  let offset = 0;
  while (offset < path.length) {
    context.operation();
    const step = /^(\/\/|\/)(@[A-Za-z_][\w.-]*|text\(\)|[A-Za-z_][\w.-]*|\*)(?:\[(\d+|@[A-Za-z_][\w.-]*=(?:"[^"]*"|'[^']*'))\])?/.exec(path.slice(offset));
    if (!step) throw new UnsupportedXml("XPath expression requires host support");
    const predicate = step[3];
    const equality = predicate?.match(/^@([^=]+)=(['"])(.*)\2$/);
    steps.push({ descendant: step[1] === "//", name: step[2]!, ...(predicate && !equality ? { position: Number(predicate) } : {}), ...(equality ? { attribute: equality[1]!, equals: equality[3]! } : {}) });
    offset += step[0].length;
  }
  let current = [document];
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!, next: XmlNode[] = [], results: string[] = [];
    const visited = new Set<XmlNode>();
    const terminal = step.name[0] === "@" || step.name === "text()";
    if (terminal && index !== steps.length - 1 || terminal && (step.position !== undefined || step.attribute !== undefined)) throw new UnsupportedXml();
    for (const parent of current) {
      const parents = [parent];
      while (parents.length) {
        context.operation();
        const candidate = parents.pop()!;
        if (visited.has(candidate)) continue;
        visited.add(candidate);
        if (step.descendant) for (let i = candidate.children.length - 1; i >= 0; i--) {
          const child = candidate.children[i]!;
          if (typeof child !== "string") parents.push(child);
        }
        if (terminal) {
          if (step.name === "text()") { for (const child of candidate.children) if (typeof child === "string") results.push(child); }
          else { const value = candidate.attributes.get(step.name.slice(1)); if (value !== undefined) results.push(value); }
        } else {
          let matched = 0;
          for (const child of candidate.children) {
            context.operation();
            if (typeof child === "string" || step.name !== "*" && step.name !== child.name) continue;
            if (step.attribute && child.attributes.get(step.attribute) !== step.equals) continue;
            if (step.position === undefined || ++matched === step.position) next.push(child);
          }
        }
        if (next.length + results.length > context.maxArrayCells) throw new UnsupportedXml("XPath result budget exceeded");
      }
    }
    if (terminal) return results;
    current = [...new Set(next)].sort((a, b) => a.order - b.order);
  }
  return current.map(node => nodeText(node, context));
}
