import type { FormulaErrorValue } from "./ast.ts";

export type FormulaToken =
  | { readonly kind: "number"; readonly value: string; readonly start: number; readonly end: number }
  | { readonly kind: "string"; readonly value: string; readonly start: number; readonly end: number }
  | { readonly kind: "sheet"; readonly value: string; readonly start: number; readonly end: number }
  | { readonly kind: "identifier"; readonly value: string; readonly start: number; readonly end: number }
  | { readonly kind: "reference"; readonly value: string; readonly start: number; readonly end: number }
  | { readonly kind: "error"; readonly value: FormulaErrorValue; readonly start: number; readonly end: number }
  | { readonly kind: "symbol"; readonly value: FormulaSymbol; readonly start: number; readonly end: number }
  | { readonly kind: "eof"; readonly start: number; readonly end: number };

export type FormulaSymbol = "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | "<=" | ">" | ">=" | "%" | "(" | ")" | "," | ":" | "!";

export class FormulaLexError extends SyntaxError {
  readonly offset: number;

  constructor(message: string, offset: number) {
    super(`${message} at offset ${offset}.`);
    this.name = "FormulaLexError";
    this.offset = offset;
  }
}

export function tokenizeFormula(source: string): readonly FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let offset = 0;
  while (offset < source.length) {
    const character = source[offset]!;
    if (/\s/u.test(character)) {
      offset += 1;
      continue;
    }
    const start = offset;
    if (character === '"') {
      offset += 1;
      let value = "";
      let closed = false;
      while (offset < source.length) {
        if (source[offset] === '"') {
          if (source[offset + 1] === '"') {
            value += '"';
            offset += 2;
          } else {
            offset += 1;
            closed = true;
            break;
          }
        } else value += source[offset++]!;
      }
      if (!closed) throw new FormulaLexError("Formula string is not terminated", start);
      tokens.push({ kind: "string", value, start, end: offset });
      continue;
    }
    if (character === "'") {
      offset += 1;
      let value = "";
      let closed = false;
      while (offset < source.length) {
        if (source[offset] === "'") {
          if (source[offset + 1] === "'") {
            value += "'";
            offset += 2;
          } else {
            offset += 1;
            closed = true;
            break;
          }
        } else value += source[offset++]!;
      }
      if (!closed) throw new FormulaLexError("Quoted sheet name is not terminated", start);
      tokens.push({ kind: "sheet", value, start, end: offset });
      continue;
    }
    const remaining = source.slice(offset);
    const error = ERROR_VALUES.find((candidate) => remaining.toUpperCase().startsWith(candidate));
    if (error !== undefined) {
      offset += error.length;
      tokens.push({ kind: "error", value: error, start, end: offset });
      continue;
    }
    const number = /^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?/.exec(remaining)?.[0];
    if (number !== undefined) {
      offset += number.length;
      tokens.push({ kind: "number", value: number, start, end: offset });
      continue;
    }
    const word = /^\$?[A-Za-z]{1,3}\$?[1-9][0-9]*/.exec(remaining)?.[0];
    if (word !== undefined && isBoundedReference(word) && source[offset + word.length] !== "(") {
      offset += word.length;
      tokens.push({ kind: "reference", value: word, start, end: offset });
      continue;
    }
    const identifier = /^(?:_xlfn\.)?[A-Za-z_\\][A-Za-z0-9_.]*/i.exec(remaining)?.[0];
    if (identifier !== undefined) {
      offset += identifier.length;
      tokens.push({ kind: "identifier", value: identifier, start, end: offset });
      continue;
    }
    const twoCharacter = source.slice(offset, offset + 2);
    if (twoCharacter === "<>" || twoCharacter === "<=" || twoCharacter === ">=") {
      offset += 2;
      tokens.push({ kind: "symbol", value: twoCharacter, start, end: offset });
      continue;
    }
    if (SYMBOLS.has(character as FormulaSymbol)) {
      offset += 1;
      tokens.push({ kind: "symbol", value: character as FormulaSymbol, start, end: offset });
      continue;
    }
    throw new FormulaLexError(`Unsupported formula character ${JSON.stringify(character)}`, offset);
  }
  tokens.push({ kind: "eof", start: offset, end: offset });
  return Object.freeze(tokens);
}

const ERROR_VALUES: readonly FormulaErrorValue[] = ["#DIV/0!", "#VALUE!", "#NULL!", "#REF!", "#NAME?", "#NUM!", "#N/A"];
const SYMBOLS = new Set<FormulaSymbol>(["+", "-", "*", "/", "^", "&", "=", "<", ">", "%", "(", ")", ",", ":", "!"]);

function isBoundedReference(reference: string): boolean {
  const match = /^\$?([A-Za-z]{1,3})\$?([1-9][0-9]*)$/.exec(reference);
  if (match === null) return false;
  let column = 0;
  for (const character of match[1]!.toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64;
  const row = Number(match[2]);
  return column <= 16_384 && row <= 1_048_576;
}
