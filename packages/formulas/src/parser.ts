import type {
  FormulaBinaryOperator,
  FormulaCellReference,
  FormulaExpression,
  FormulaReferenceExpression,
  ParsedFormula,
} from "./ast.ts";
import { FormulaLexError, tokenizeFormula, type FormulaSymbol, type FormulaToken } from "./lexer.ts";

export class FormulaParseError extends SyntaxError {
  readonly offset: number;

  constructor(message: string, offset: number, options: { cause?: unknown } = {}) {
    super(`${message} at offset ${offset}.`, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "FormulaParseError";
    this.offset = offset;
  }
}

export function parseFormula(source: string): ParsedFormula {
  if (source.startsWith("=")) throw new FormulaParseError("Stored formulas must not include a leading equals sign", 0);
  let tokens: readonly FormulaToken[];
  try {
    tokens = tokenizeFormula(source);
  } catch (cause) {
    if (cause instanceof FormulaLexError) throw new FormulaParseError(cause.message.replace(/ at offset [0-9]+\.$/, ""), cause.offset, { cause });
    throw cause;
  }
  const parser = new Parser(tokens);
  const expression = parser.expression(0);
  const remaining = parser.current();
  if (remaining.kind !== "eof") throw new FormulaParseError("Unexpected formula token", remaining.start);
  return Object.freeze({ source, expression });
}

class Parser {
  readonly #tokens: readonly FormulaToken[];
  #position = 0;

  constructor(tokens: readonly FormulaToken[]) {
    this.#tokens = tokens;
  }

  current(): FormulaToken {
    return this.#tokens[this.#position]!;
  }

  expression(minimumBindingPower: number): FormulaExpression {
    let left = this.prefix();
    while (true) {
      const token = this.current();
      if (token.kind === "symbol" && token.value === "%") {
        if (70 < minimumBindingPower) break;
        this.#position += 1;
        left = Object.freeze({ kind: "percent", operand: left, start: left.start, end: token.end });
        continue;
      }
      if (token.kind !== "symbol" || !isBinaryOperator(token.value)) break;
      const bindingPower = BINDING_POWER[token.value];
      if (bindingPower < minimumBindingPower) break;
      this.#position += 1;
      const right = this.expression(bindingPower + 1);
      left = Object.freeze({ kind: "binary", operator: token.value, left, right, start: left.start, end: right.end });
    }
    return left;
  }

  prefix(): FormulaExpression {
    const token = this.current();
    if (token.kind === "symbol" && (token.value === "+" || token.value === "-")) {
      this.#position += 1;
      const operand = this.expression(60);
      return Object.freeze({ kind: "unary", operator: token.value, operand, start: token.start, end: operand.end });
    }
    if (token.kind === "number") {
      this.#position += 1;
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new FormulaParseError("Formula number is not finite", token.start);
      return Object.freeze({ kind: "number", value, lexical: token.value, start: token.start, end: token.end });
    }
    if (token.kind === "string" || token.kind === "error") {
      this.#position += 1;
      return Object.freeze({ kind: token.kind, value: token.value, start: token.start, end: token.end }) as FormulaExpression;
    }
    if (token.kind === "reference") return this.reference(undefined);
    if ((token.kind === "sheet" || token.kind === "identifier") && this.peekSymbol("!")) {
      const sheet = token.value;
      this.#position += 2;
      if (this.current().kind !== "reference") throw new FormulaParseError("A sheet qualifier must be followed by a cell reference", this.current().start);
      return this.reference(sheet, token.start);
    }
    if (token.kind === "identifier") {
      this.#position += 1;
      const normalized = token.value.toUpperCase();
      if (normalized === "TRUE" || normalized === "FALSE") {
        return Object.freeze({ kind: "boolean", value: normalized === "TRUE", start: token.start, end: token.end });
      }
      if (!this.takeSymbol("(")) throw new FormulaParseError(`Unsupported name ${JSON.stringify(token.value)}`, token.start);
      const args: FormulaExpression[] = [];
      if (!this.takeSymbol(")")) {
        while (true) {
          args.push(this.expression(0));
          if (this.takeSymbol(")")) break;
          if (this.current().kind === "eof") throw new FormulaParseError("Function call is not closed", this.current().start);
          if (!this.takeSymbol(",")) throw new FormulaParseError("Function arguments must be separated by commas", this.current().start);
        }
      }
      return Object.freeze({ kind: "function", name: normalized, arguments: Object.freeze(args), start: token.start, end: this.#tokens[this.#position - 1]!.end });
    }
    if (this.takeSymbol("(")) {
      const start = token.start;
      const expression = this.expression(0);
      const closing = this.current();
      if (!this.takeSymbol(")")) throw new FormulaParseError("Formula group is not closed", closing.start);
      return Object.freeze({ ...expression, start, end: closing.end });
    }
    throw new FormulaParseError("Expected a formula expression", token.start);
  }

  reference(sheet: string | undefined, sourceStart?: number): FormulaReferenceExpression {
    const startToken = this.current();
    if (startToken.kind !== "reference") throw new FormulaParseError("Expected a cell reference", startToken.start);
    this.#position += 1;
    const startReference = parseReference(startToken.value);
    let endReference: FormulaCellReference | undefined;
    let end = startToken.end;
    if (this.takeSymbol(":")) {
      const endToken = this.current();
      if (endToken.kind !== "reference") throw new FormulaParseError("A range must end with a cell reference", endToken.start);
      this.#position += 1;
      endReference = parseReference(endToken.value);
      end = endToken.end;
    }
    return Object.freeze({ kind: "reference", sheet, startReference, endReference, start: sourceStart ?? startToken.start, end });
  }

  peekSymbol(value: FormulaSymbol): boolean {
    const token = this.#tokens[this.#position + 1];
    return token?.kind === "symbol" && token.value === value;
  }

  takeSymbol(value: FormulaSymbol): boolean {
    const token = this.current();
    if (token.kind !== "symbol" || token.value !== value) return false;
    this.#position += 1;
    return true;
  }
}

const BINDING_POWER: Readonly<Record<FormulaBinaryOperator, number>> = {
  "=": 10, "<>": 10, "<": 10, "<=": 10, ">": 10, ">=": 10,
  "&": 20,
  "+": 30, "-": 30,
  "*": 40, "/": 40,
  "^": 50,
};

function isBinaryOperator(value: FormulaSymbol): value is FormulaBinaryOperator {
  return value in BINDING_POWER;
}

function parseReference(value: string): FormulaCellReference {
  const match = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)$/.exec(value)!;
  let column = 0;
  for (const character of match[2]!.toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64;
  return Object.freeze({
    row: Number(match[4]),
    column,
    absoluteRow: match[3] === "$",
    absoluteColumn: match[1] === "$",
  });
}
