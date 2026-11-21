import { mathChars, type MathNode, type MathRow, type MathStructure } from "./model.ts";

/**
 * Structure templates offered by galleries and typed commands. A template's first slot receives
 * the current selection, so selecting `a+b` and choosing a fraction gives (a+b)/□.
 */
export interface MathTemplate {
  readonly id: string;
  readonly label: string;
  readonly group: MathTemplateGroup;
  readonly node: MathStructure;
  /** The slot that receives selected content; defaults to the first slot. */
  readonly wrap?: string;
}

export type MathTemplateGroup =
  | "fraction"
  | "script"
  | "radical"
  | "integral"
  | "large-operator"
  | "bracket"
  | "function"
  | "accent"
  | "limit"
  | "matrix";

const e: MathRow = [];
const c = (text: string) => mathChars(text);
const upright = (text: string) => mathChars(text, true);
const matrix = (rows: number, columns: number): MathStructure => ({
  kind: "matrix",
  rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => e)),
});

export const MATH_TEMPLATES: readonly MathTemplate[] = [
  { id: "fraction", label: "Stacked fraction", group: "fraction", node: { kind: "fraction", num: e, den: e } },
  { id: "fraction-skewed", label: "Skewed fraction", group: "fraction", node: { kind: "fraction", style: "skewed", num: e, den: e } },
  { id: "fraction-linear", label: "Linear fraction", group: "fraction", node: { kind: "fraction", style: "linear", num: e, den: e } },
  { id: "fraction-dy-dx", label: "dy/dx", group: "fraction", node: { kind: "fraction", num: c("dy"), den: c("dx") } },
  { id: "superscript", label: "Superscript", group: "script", node: { kind: "script", base: e, sup: e } },
  { id: "subscript", label: "Subscript", group: "script", node: { kind: "script", base: e, sub: e } },
  { id: "sub-superscript", label: "Subscript-superscript", group: "script", node: { kind: "script", base: e, sub: e, sup: e } },
  { id: "pre-script", label: "Left subscript-superscript", group: "script", node: { kind: "script", pre: true, base: e, sub: e, sup: e } },
  { id: "x-squared", label: "x squared", group: "script", node: { kind: "script", base: c("x"), sup: c("2") } },
  { id: "e-power", label: "e to the x", group: "script", node: { kind: "script", base: c("e"), sup: c("x") } },
  { id: "square-root", label: "Square root", group: "radical", node: { kind: "radical", body: e } },
  { id: "nth-root", label: "Radical with degree", group: "radical", node: { kind: "radical", degree: e, body: e }, wrap: "body" },
  { id: "cube-root", label: "Cube root", group: "radical", node: { kind: "radical", degree: c("3"), body: e } },
  { id: "quadratic-root", label: "√(b²−4ac)", group: "radical", node: { kind: "radical", body: [{ kind: "script", base: c("b"), sup: c("2") }, ...c("−4ac")] } },
  { id: "integral", label: "Integral", group: "integral", node: { kind: "nary", operator: "∫", side: true, body: e } },
  { id: "integral-limits", label: "Integral with limits", group: "integral", node: { kind: "nary", operator: "∫", side: true, sub: e, sup: e, body: e }, wrap: "body" },
  { id: "double-integral", label: "Double integral", group: "integral", node: { kind: "nary", operator: "∬", side: true, body: e } },
  { id: "contour-integral", label: "Contour integral", group: "integral", node: { kind: "nary", operator: "∮", side: true, body: e } },
  { id: "summation", label: "Summation", group: "large-operator", node: { kind: "nary", operator: "∑", sub: e, sup: e, body: e }, wrap: "body" },
  { id: "summation-index", label: "Summation over i=0…n", group: "large-operator", node: { kind: "nary", operator: "∑", sub: c("i=0"), sup: c("n"), body: e }, wrap: "body" },
  { id: "product", label: "Product", group: "large-operator", node: { kind: "nary", operator: "∏", sub: e, sup: e, body: e }, wrap: "body" },
  { id: "union", label: "Union", group: "large-operator", node: { kind: "nary", operator: "⋃", sub: e, sup: e, body: e }, wrap: "body" },
  { id: "intersection", label: "Intersection", group: "large-operator", node: { kind: "nary", operator: "⋂", sub: e, sup: e, body: e }, wrap: "body" },
  { id: "parentheses", label: "Parentheses", group: "bracket", node: { kind: "delimiter", open: "(", close: ")", body: e } },
  { id: "brackets", label: "Square brackets", group: "bracket", node: { kind: "delimiter", open: "[", close: "]", body: e } },
  { id: "braces", label: "Braces", group: "bracket", node: { kind: "delimiter", open: "{", close: "}", body: e } },
  { id: "angle-brackets", label: "Angle brackets", group: "bracket", node: { kind: "delimiter", open: "⟨", close: "⟩", body: e } },
  { id: "absolute", label: "Absolute value", group: "bracket", node: { kind: "delimiter", open: "|", close: "|", body: e } },
  { id: "norm", label: "Norm", group: "bracket", node: { kind: "delimiter", open: "‖", close: "‖", body: e } },
  { id: "sin", label: "Sine", group: "function", node: { kind: "function", name: upright("sin"), body: e }, wrap: "body" },
  { id: "cos", label: "Cosine", group: "function", node: { kind: "function", name: upright("cos"), body: e }, wrap: "body" },
  { id: "tan", label: "Tangent", group: "function", node: { kind: "function", name: upright("tan"), body: e }, wrap: "body" },
  { id: "log", label: "Logarithm", group: "function", node: { kind: "function", name: upright("log"), body: e }, wrap: "body" },
  { id: "ln", label: "Natural logarithm", group: "function", node: { kind: "function", name: upright("ln"), body: e }, wrap: "body" },
  { id: "exp", label: "Exponential", group: "function", node: { kind: "function", name: upright("exp"), body: e }, wrap: "body" },
  { id: "dot", label: "Dot", group: "accent", node: { kind: "accent", accent: "̇", body: e } },
  { id: "double-dot", label: "Double dot", group: "accent", node: { kind: "accent", accent: "̈", body: e } },
  { id: "hat", label: "Hat", group: "accent", node: { kind: "accent", accent: "̂", body: e } },
  { id: "bar", label: "Bar", group: "accent", node: { kind: "accent", accent: "̅", body: e } },
  { id: "vector", label: "Vector", group: "accent", node: { kind: "accent", accent: "⃗", body: e } },
  { id: "tilde", label: "Tilde", group: "accent", node: { kind: "accent", accent: "̃", body: e } },
  { id: "limit", label: "Limit", group: "limit", node: { kind: "function", name: [{ kind: "limit", position: "lower", base: upright("lim"), limit: e }], body: e }, wrap: "body" },
  { id: "limit-infinity", label: "Limit as n→∞", group: "limit", node: { kind: "function", name: [{ kind: "limit", position: "lower", base: upright("lim"), limit: c("n→∞") }], body: e }, wrap: "body" },
  { id: "max", label: "Maximum", group: "limit", node: { kind: "function", name: [{ kind: "limit", position: "lower", base: upright("max"), limit: e }], body: e }, wrap: "body" },
  { id: "matrix-2x2", label: "2×2 matrix", group: "matrix", node: { kind: "delimiter", open: "(", close: ")", body: [matrix(2, 2)] } as MathStructure },
  { id: "matrix-1x2", label: "1×2 matrix", group: "matrix", node: matrix(1, 2) },
  { id: "matrix-2x1", label: "2×1 matrix", group: "matrix", node: matrix(2, 1) },
  { id: "matrix-3x3", label: "3×3 matrix", group: "matrix", node: { kind: "delimiter", open: "[", close: "]", body: [matrix(3, 3)] } as MathStructure },
  { id: "identity-2", label: "2×2 identity", group: "matrix", node: { kind: "delimiter", open: "(", close: ")", body: [{ kind: "matrix", rows: [[c("1"), c("0")], [c("0"), c("1")]] }] } as MathStructure },
];

export function mathTemplate(id: string): MathTemplate | undefined {
  return MATH_TEMPLATES.find((template) => template.id === id);
}

export interface MathSymbolGroup {
  readonly id: string;
  readonly label: string;
  readonly symbols: readonly string[];
}

/** Common symbols in gallery order. Operators come first because they are used most. */
export const MATH_SYMBOL_GROUPS: readonly MathSymbolGroup[] = [
  { id: "basic", label: "Basic math", symbols: [..."±∞=≠~×÷!∝<≪>≫≤≥∓≅≈≡∀∁∂√∛∜∪∩∅%°℉℃∆∇∃∄∈∋←↑→↓↔∴∵"] },
  { id: "greek", label: "Greek letters", symbols: [..."αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ"] },
  { id: "operators", label: "Operators", symbols: [..."⋅∘∗⊕⊗⊙∧∨¬⊂⊃⊆⊇⊄∉∌≺≻≼≽⊥∥∠∡△□"] },
  { id: "arrows", label: "Arrows", symbols: [..."⇐⇒⇔⟵⟶⟷↦↗↘↙↖↕⇑⇓⇕↺↻"] },
  { id: "letter-like", label: "Letter-like", symbols: [..."ℂℕℚℝℤℏℓ℘ℜℑℵℶ"] },
];

/** Characters that take operator spacing in layout and end typed script arguments. */
export const MATH_BINARY = new Set([..."+−-±∓×÷⋅∘∗⊕⊗⊙∧∨∪∩"]);
export const MATH_RELATIONS = new Set([..."=≠<>≤≥≪≫≈≅≡∼~∝∈∉∋⊂⊃⊆⊇→←↔⇒⇐⇔⟶↦"]);
export const MATH_PUNCTUATION = new Set([...",;"]);

export function isMathOperator(node: MathNode | undefined) {
  return node?.kind === "char" && (MATH_BINARY.has(node.value) || MATH_RELATIONS.has(node.value));
}
