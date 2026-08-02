export interface FormulaSourceSpan {
  readonly start: number;
  readonly end: number;
}

export interface FormulaCellReference {
  readonly row: number;
  readonly column: number;
  readonly absoluteRow: boolean;
  readonly absoluteColumn: boolean;
}

export interface FormulaReferenceExpression extends FormulaSourceSpan {
  readonly kind: "reference";
  readonly sheet: string | undefined;
  readonly startReference: FormulaCellReference;
  readonly endReference: FormulaCellReference | undefined;
}

export type FormulaBinaryOperator = "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | "<=" | ">" | ">=";

export type FormulaExpression =
  | (FormulaSourceSpan & { readonly kind: "number"; readonly value: number; readonly lexical: string })
  | (FormulaSourceSpan & { readonly kind: "string"; readonly value: string })
  | (FormulaSourceSpan & { readonly kind: "boolean"; readonly value: boolean })
  | (FormulaSourceSpan & { readonly kind: "error"; readonly value: FormulaErrorValue })
  | FormulaReferenceExpression
  | (FormulaSourceSpan & { readonly kind: "unary"; readonly operator: "+" | "-"; readonly operand: FormulaExpression })
  | (FormulaSourceSpan & { readonly kind: "percent"; readonly operand: FormulaExpression })
  | (FormulaSourceSpan & { readonly kind: "binary"; readonly operator: FormulaBinaryOperator; readonly left: FormulaExpression; readonly right: FormulaExpression })
  | (FormulaSourceSpan & { readonly kind: "function"; readonly name: string; readonly arguments: readonly FormulaExpression[] });

export type FormulaErrorValue = `#${string}`;

export interface ParsedFormula {
  readonly source: string;
  readonly expression: FormulaExpression;
}
