import type { FormulaScalarValue } from "./evaluator.ts";
import { functionText as text } from "./function-runtime.ts";
const NUMBER_CRITERION =
  /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?$/;
const MAX_CRITERION_CHARACTERS = 8_192;
const number = (value: number) => ({ type: "number" as const, value });
const boolean = (value: boolean) => ({ type: "boolean" as const, value });
const string = (value: string) => ({ type: "string" as const, value });

type CriterionOperator = "=" | "<>" | "<" | "<=" | ">" | ">=";

export interface FormulaCriterion {
  readonly operator: CriterionOperator;
  readonly operand: Exclude<FormulaScalarValue, { type: "error" }>;
  readonly wildcard: readonly WildcardToken[] | undefined;
}

type WildcardToken =
  | { readonly kind: "many" }
  | { readonly kind: "one" }
  | { readonly kind: "literal"; readonly value: string };

export function compileCriterion(
  value: Exclude<FormulaScalarValue, { type: "error" }>,
  unavailable: (message: string) => never,
): FormulaCriterion {
  if (value.type === "blank")
    return Object.freeze({
      operator: "=",
      operand: number(0),
      wildcard: undefined,
    });
  if (value.type !== "string")
    return Object.freeze({
      operator: "=",
      operand: value,
      wildcard: undefined,
    });
  if ([...value.value].length > MAX_CRITERION_CHARACTERS) {
    return unavailable("Formula criterion exceeds the character limit.");
  }
  const operatorMatch = /^(<=|>=|<>|=|<|>)/.exec(value.value);
  const operator = (operatorMatch?.[1] ?? "=") as CriterionOperator;
  const source = value.value.slice(operatorMatch?.[1]?.length ?? 0);
  const trimmed = source.trim();
  if (NUMBER_CRITERION.test(trimmed)) {
    return Object.freeze({
      operator,
      operand: number(Number(trimmed)),
      wildcard: undefined,
    });
  }
  if (/^(?:TRUE|FALSE)$/i.test(trimmed)) {
    return Object.freeze({
      operator,
      operand: boolean(trimmed.toUpperCase() === "TRUE"),
      wildcard: undefined,
    });
  }
  if (source.length === 0)
    return Object.freeze({
      operator,
      operand: string(""),
      wildcard: undefined,
    });
  const wildcard =
    operator === "=" || operator === "<>"
      ? tokenizeWildcard(source)
      : undefined;
  const hasWildcard =
    wildcard?.some((token) => token.kind !== "literal") ?? false;
  const operand = string(
    wildcard === undefined
      ? source
      : wildcard
          .map((token) =>
            token.kind === "literal"
              ? token.value
              : token.kind === "one"
                ? "?"
                : "*",
          )
          .join(""),
  );
  return Object.freeze({
    operator,
    operand,
    wildcard: hasWildcard ? wildcard : undefined,
  });
}

export function matchesCriterion(
  value: FormulaScalarValue,
  criterion: FormulaCriterion,
): boolean {
  const equal =
    criterion.wildcard === undefined
      ? criterionEquals(value, criterion.operand)
      : value.type === "string" &&
        wildcardMatches(criterion.wildcard, value.value);
  if (criterion.operator === "=") return equal;
  if (criterion.operator === "<>") return !equal;
  if (!sameComparableType(value, criterion.operand)) return false;
  const comparison = compareCriterion(value, criterion.operand);
  switch (criterion.operator) {
    case "<":
      return comparison < 0;
    case "<=":
      return comparison <= 0;
    case ">":
      return comparison > 0;
    case ">=":
      return comparison >= 0;
  }
}

function criterionEquals(
  value: FormulaScalarValue,
  operand: Exclude<FormulaScalarValue, { type: "error" }>,
): boolean {
  if (operand.type === "string" && operand.value === "")
    return (
      value.type === "blank" || (value.type === "string" && value.value === "")
    );
  if (value.type === "error" && operand.type === "string")
    return (
      value.value.toLocaleLowerCase("en-US") ===
      operand.value.toLocaleLowerCase("en-US")
    );
  if (value.type !== operand.type) return false;
  return compareCriterion(value, operand) === 0;
}

function sameComparableType(
  value: FormulaScalarValue,
  operand: Exclude<FormulaScalarValue, { type: "error" }>,
): boolean {
  return value.type === operand.type && value.type !== "blank";
}

function compareCriterion(
  value: FormulaScalarValue,
  operand: Exclude<FormulaScalarValue, { type: "error" }>,
): number {
  if (value.type === "number" && operand.type === "number")
    return value.value - operand.value;
  if (value.type === "boolean" && operand.type === "boolean")
    return Number(value.value) - Number(operand.value);
  return text(value).localeCompare(text(operand), "en-US", {
    sensitivity: "base",
  });
}

export function tokenizeWildcard(source: string): readonly WildcardToken[] {
  const tokens: WildcardToken[] = [];
  const characters = [...source];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    if (
      character === "~" &&
      (characters[index + 1] === "~" ||
        characters[index + 1] === "*" ||
        characters[index + 1] === "?")
    ) {
      tokens.push(
        Object.freeze({ kind: "literal", value: characters[index + 1]! }),
      );
      index += 1;
    } else if (character === "*") {
      if (tokens.at(-1)?.kind !== "many")
        tokens.push(Object.freeze({ kind: "many" }));
    } else if (character === "?") tokens.push(Object.freeze({ kind: "one" }));
    else tokens.push(Object.freeze({ kind: "literal", value: character }));
  }
  return Object.freeze(tokens);
}

/** The capped pattern keeps greedy matching linear in candidate length without regex backtracking. */
export function wildcardMatches(
  tokens: readonly WildcardToken[],
  candidate: string,
): boolean {
  const text = [...candidate.toLocaleLowerCase("en-US")];
  const pattern: WildcardToken[] = [];
  for (const token of tokens) {
    if (token.kind !== "literal") pattern.push(token);
    else
      for (const value of token.value.toLocaleLowerCase("en-US"))
        pattern.push(Object.freeze({ kind: "literal", value }));
  }
  let textIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let starTextIndex = -1;
  while (textIndex < text.length) {
    const token = pattern[patternIndex];
    if (
      token?.kind === "one" ||
      (token?.kind === "literal" && token.value === text[textIndex])
    ) {
      textIndex += 1;
      patternIndex += 1;
      continue;
    }
    if (token?.kind === "many") {
      starIndex = patternIndex;
      starTextIndex = textIndex;
      patternIndex += 1;
      continue;
    }
    if (starIndex >= 0) {
      starTextIndex += 1;
      textIndex = starTextIndex;
      patternIndex = starIndex + 1;
      continue;
    }
    return false;
  }
  while (pattern[patternIndex]?.kind === "many") patternIndex += 1;
  return patternIndex === pattern.length;
}
