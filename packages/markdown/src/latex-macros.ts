import { readLatexColours, resolveLatexColour } from './latex-colour';
import { usesLatexPackage } from './latex-preamble';
import { commandEnd, groupAt, latexCommands, lineEnd, whitespaceEnd } from "./latex-syntax";

export type LatexTextStyle = "strong" | "em" | "sans" | "mono";
type Macro = { count: number; optional?: string; replacement: string };
type Macros = ReadonlyMap<string, Macro>;

const styles: ReadonlyMap<string, LatexTextStyle> = new Map([
  ["textbf", "strong"],
  ["emph", "em"],
  ["textit", "em"],
  ["textsf", "sans"],
  ["texttt", "mono"],
]);
const declarations = new Set([
  "newcommand",
  "renewcommand",
  "providecommand",
  "DeclareRobustCommand",
]);

/** Read ordinary LaTeX command declarations in source order. */
const documentDeclarations = new Set([
  'NewDocumentCommand', 'RenewDocumentCommand', 'ProvideDocumentCommand', 'DeclareDocumentCommand',
]);

function documentArguments(signature: string) {
  let position = whitespaceEnd(signature, 0);
  let optional: string | undefined;
  let count = 0;
  if (signature[position] === 'O') {
    const fallback = groupAt(signature, whitespaceEnd(signature, position + 1));
    if (!fallback) return;
    optional = signature.slice(fallback.from, fallback.to);
    position = whitespaceEnd(signature, fallback.end);
    count++;
  }
  while (signature[position] === 'm') {
    count++;
    position = whitespaceEnd(signature, position + 1);
  }
  if (position === signature.length && count <= 9) return { count, optional };
}

export function readLatexTextMacros(prefix: string) {
  const macros = new Map<string, Macro>();
  if (usesLatexPackage(prefix, 'siunitx')) {
    for (const name of ['qty', 'SI']) macros.set(name, { count: 2, replacement: '#1~#2' });
    macros.set('num', { count: 1, replacement: '#1' });
    for (const [name, replacement] of Object.entries({
      ampere: 'A', volt: 'V', watt: 'W', joule: 'J', kelvin: 'K',
      degreeCelsius: '°C', metre: 'm', second: 's', kilogram: 'kg', percent: '%',
    })) macros.set(name, { count: 0, replacement: replacement === '%' ? '\\%' : replacement });
  }
  let consumed = 0;
  for (const { name, start, end } of latexCommands(prefix)) {
    const documentCommand = documentDeclarations.has(name);
    if (start < consumed || (!declarations.has(name) && !documentCommand)) continue;
    const declaration = whitespaceEnd(prefix, end + Number(prefix[end] === "*"));
    const group = groupAt(prefix, declaration);
    const from = group?.from ?? declaration;
    const to = commandEnd(prefix, from);
    if (to === from || (group && to !== group.to)) continue;
    const command = prefix.slice(from + 1, to);
    const arity = groupAt(prefix, whitespaceEnd(prefix, group?.end ?? to), "[", "]");
    const count = arity ? Number(prefix.slice(arity.from, arity.to)) : 0;
    if (!Number.isInteger(count) || count < 0 || count > 9) continue;
    const fallback =
      arity && count > 0 ? groupAt(prefix, whitespaceEnd(prefix, arity.end), "[", "]") : undefined;
    const body = groupAt(
      prefix,
      whitespaceEnd(prefix, fallback?.end ?? arity?.end ?? group?.end ?? to),
    );
    if (!body) continue;
    consumed = body.end;
    if (name === "providecommand" && (macros.has(command) || styles.has(command))) continue;
    macros.set(command, {
      count,
      optional: fallback ? prefix.slice(fallback.from, fallback.to) : undefined,
      replacement: prefix.slice(body.from, body.to),
    });
  }
  return macros;
}

/** A formatting alias can give its authored argument an ordinary editable text mark. */
export function latexFormattingAlias(command: string, macros: Macros) {
  const visited = new Set<string>();
  while (!visited.has(command)) {
    visited.add(command);
    const macro = macros.get(command);
    if (!macro) return styles.get(command);
    if (macro.count !== 1 || macro.optional !== undefined) return;
    const alias = /^\\([A-Za-z@]+)\s*\{#1\}$/.exec(macro.replacement.trim());
    if (!alias) return;
    command = alias[1]!;
  }
}

export type LatexPrintedText = string |
  { style: LatexTextStyle; content: LatexPrintedText[] } |
  { colour: string; content: LatexPrintedText[] };

const symbols = new Map([
  ["$", "$"],
  ["%", "%"],
  ["#", "#"],
  ["&", "&"],
  ["_", "_"],
  ["{", "{"],
  ["}", "}"],
  ["textbackslash", "\\"],
  ["textasciitilde", "~"],
  ["textasciicircum", "^"],
  [" ", "\u00a0"],
]);

/** Expand a source-backed inline command into text and native formatting. */
export function interpretLatexText(
  source: string,
  macros: Macros,
  colours = readLatexColours(''),
): LatexPrintedText[] | undefined {
  let remaining = 128;
  // Bound the work of expanding a single inline object. Its authored source stays intact.
  let remainingText = 65536;
  const active = new Set<string>();
  function read(input: string, depth: number): LatexPrintedText[] | undefined {
    remainingText -= input.length;
    if (depth > 32 || remainingText < 0) return;
    const result: LatexPrintedText[] = [];
    for (let position = 0; position < input.length;) {
      const character = input[position];
      if (character === "%") {
        position = lineEnd(input, position) + 1;
        continue;
      }
      if (character === "{") {
        const group = groupAt(input, position);
        if (!group) return;
        const content = read(input.slice(group.from, group.to), depth + 1);
        if (!content) return;
        result.push(...content);
        position = group.end;
        continue;
      }
      if (character !== "\\") {
        const end = /[\\\\{}%$#&_^]/g;
        end.lastIndex = position;
        const next = end.exec(input)?.index ?? input.length;
        if (next === position) return;
        result.push(input.slice(position, next).replace(/~/g, "\u00a0"));
        position = next;
        continue;
      }
      if (--remaining < 0) return;
      const end = commandEnd(input, position);
      const command = input.slice(position + 1, end);
      const word = /^[A-Za-z@]/.test(command);
      position = word ? whitespaceEnd(input, end) : end;
      const macro = macros.get(command);
      const style = styles.get(command);
      const symbol = symbols.get(command);
      const textColour = command === 'textcolor';
      if (!macro && !style && !textColour) {
        if (symbol === undefined) return;
        result.push(symbol);
        continue;
      }
      if (active.has(command)) return;
      const args: string[] = [];
      const count = macro?.count ?? (textColour ? 2 : 1);
      if (macro?.optional !== undefined) {
        const option = groupAt(input, position, "[", "]");
        if (option) position = whitespaceEnd(input, option.end);
        args.push(option ? input.slice(option.from, option.to) : macro.optional);
      }
      while (args.length < count) {
        const group = groupAt(input, position);
        if (!group) return;
        args.push(input.slice(group.from, group.to));
        position = args.length < count ? whitespaceEnd(input, group.end) : group.end;
      }
      if (macro) {
        active.add(command);
        let projectedSize = macro.replacement.length;
        const parameters = /\\[A-Za-z@]+|\\[^\n]|##|#([1-9])/g;
        for (const match of macro.replacement.matchAll(parameters)) {
          if (!match[1]) continue;
          projectedSize += (args[Number(match[1]) - 1]?.length ?? 2) - 2;
        }
        if (projectedSize > remainingText) return;
        const replacement = macro.replacement.replace(parameters, (token, index) =>
          index ? (args[Number(index) - 1] ?? token) : token,
        );
        const content = read(replacement, depth + 1);
        active.delete(command);
        if (!content) return;
        result.push(...content);
      } else if (textColour) {
        const colour = resolveLatexColour(args[0]!, colours);
        const content = read(args[1]!, depth + 1);
        if (!colour || !content) return;
        result.push({ colour, content });
      } else if (style) {
        const content = read(args[0]!, depth + 1);
        if (!content) return;
        result.push({ style, content });
      }
    }
    return result;
  }
  if (!source.startsWith("\\")) return;
  const command = source.slice(1, commandEnd(source, 0));
  if (!macros.has(command) && !styles.has(command) && !symbols.has(command) && command !== 'textcolor') return;
  return read(source, 0);
}


const paragraphSkips = new Map([['smallskip', 3], ['medskip', 6], ['bigskip', 12]]);

/** Paragraph macros bounded by explicit TeX paragraph breaks and ordinary vertical skips. */
export function readLatexParagraphMacro(
  source: string,
  macros: Macros,
  position = 0,
) {
  const command = commandEnd(source, position);
  const name = source.slice(position + 1, command);
  const macro = macros.get(name);
  if (!macro) return;
  const body = /^\s*\\par\b\s*(?:\\(smallskip|medskip|bigskip)\b\s*)?(\\noindent\b\s*)?([\s\S]*?)\s*\\par\b\s*(?:\\(smallskip|medskip|bigskip)\b\s*)?$/.exec(macro.replacement);
  if (!body) return;
  let end = command;
  let count = macro.count;
  if (macro.optional !== undefined) {
    const option = groupAt(source, whitespaceEnd(source, end), '[', ']');
    if (option) end = option.end;
    count--;
  }
  for (let index = 0; index < count; index++) {
    const arg = groupAt(source, whitespaceEnd(source, end));
    if (!arg) return;
    end = arg.end;
  }
  return {
    end,
    name,
    macro: { ...macro, replacement: body[3]! },
    before: paragraphSkips.get(body[1] ?? '') ?? 0,
    after: paragraphSkips.get(body[4] ?? '') ?? 0,
    noIndent: !!body[2],
  };
}

export function interpretLatexParagraphMacro(source: string, prefix: string) {
  const macros = readLatexTextMacros(prefix);
  const paragraph = readLatexParagraphMacro(source, macros);
  if (!paragraph || paragraph.end !== source.length) return;
  macros.set(paragraph.name, paragraph.macro);
  const content = interpretLatexText(source, macros, readLatexColours(prefix));
  if (content) return { ...paragraph, content };
}
