import { parseCellReference } from "@tumblerjs/sheets";
import { formulaFunctionCatalog } from "@tumblerjs/formulas";

const localNames = formulaFunctionCatalog.filter(entry => entry.availability === "local").map(entry => entry.name);
export interface SpreadsheetFormulaCompletion {
  readonly start: number;
  readonly end: number;
  readonly names: readonly string[];
}

/** Finds a partial function at the caret, excluding strings, sheet qualifiers and table references. */
export function spreadsheetFormulaCompletion(draft: string, start: number, end = start): SpreadsheetFormulaCompletion | undefined {
  if (!draft.startsWith("=") || start !== end || start < 1) return;
  const before = draft.slice(0, start);
  let quote = "", brackets = 0;
  for (let i = 1; i < before.length; i++) {
    const character = before[i]!;
    if (quote) {
      if (character === quote) {
        if (before[i + 1] === quote) i++;
        else quote = "";
      }
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "[") brackets++;
    else if (character === "]") brackets--;
  }
  if (quote || brackets) return;
  const token = /[A-Za-z_][A-Za-z0-9_.]*$/.exec(before);
  if (!token) return;
  const offset = start - token[0].length;
  // A function starts an expression or an argument, never a qualified cell or name.
  if (!/[=+\-*/^(,;{<>&]/.test(before.slice(0, offset).trimEnd().slice(-1))) return;
  const tail = /^[A-Za-z0-9_.]*/.exec(draft.slice(start))![0];
  if (/^\s*[!\[]/.test(draft.slice(start + tail.length))) return;
  if (tail && !/^\s*\(/.test(draft.slice(start + tail.length))) {
    try {
      parseCellReference(draft.slice(offset, start + tail.length));
      return;
    } catch (cause) {
      if (!(cause instanceof RangeError)) throw cause;
    }
  }
  const names = localNames.filter(name => name.startsWith(token[0].toUpperCase()));
  if (!names.length) return;
  return { start: offset, end: start + tail.length, names };
}

/** Completes only the current token; existing arguments and surrounding formula text survive. */
export function acceptSpreadsheetFormulaCompletion(draft: string, completion: SpreadsheetFormulaCompletion, name: string) {
  const suffix = draft.slice(completion.end);
  const opening = /^\s*\(/.exec(suffix);
  const call = opening ? name : `${name}()`;
  return {
    draft: draft.slice(0, completion.start) + call + suffix,
    caret: completion.start + name.length + (opening ? opening[0].length : 1),
  };
}
