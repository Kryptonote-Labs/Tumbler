/**
 * Typed commands follow the familiar `\name` convention. A command converts when the next
 * non-letter is typed; space completes it without inserting anything.
 */
export const MATH_COMMAND_SYMBOLS: Readonly<Record<string, string>> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η",
  theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π",
  rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "ϕ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  infty: "∞", inf: "∞", pm: "±", mp: "∓", times: "×", div: "÷", cdot: "⋅", circ: "∘", ast: "∗",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", equiv: "≡", cong: "≅", sim: "∼",
  propto: "∝", ll: "≪", gg: "≫", in: "∈", notin: "∉", ni: "∋", subset: "⊂", supset: "⊃", subseteq: "⊆",
  supseteq: "⊇", cup: "∪", cap: "∩", emptyset: "∅", forall: "∀", exists: "∃", nexists: "∄", partial: "∂",
  nabla: "∇", to: "→", rightarrow: "→", leftarrow: "←", leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐",
  Leftrightarrow: "⇔", implies: "⇒", iff: "⇔", mapsto: "↦", uparrow: "↑", downarrow: "↓", therefore: "∴",
  because: "∵", angle: "∠", perp: "⊥", parallel: "∥", degree: "°", hbar: "ℏ", ell: "ℓ", aleph: "ℵ",
  Re: "ℜ", Im: "ℑ", wp: "℘", dots: "…", ldots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", neg: "¬",
  wedge: "∧", vee: "∨", oplus: "⊕", otimes: "⊗", odot: "⊙", prime: "′", R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ",
};

/** Commands that insert a structure template by id. */
export const MATH_COMMAND_TEMPLATES: Readonly<Record<string, string>> = {
  frac: "fraction", sqrt: "square-root", root: "nth-root", cbrt: "cube-root", int: "integral",
  iint: "double-integral", oint: "contour-integral", sum: "summation", prod: "product",
  bigcup: "union", bigcap: "intersection", sin: "sin", cos: "cos", tan: "tan", log: "log", ln: "ln",
  exp: "exp", lim: "limit", max: "max", hat: "hat", bar: "bar", vec: "vector", dot: "dot",
  ddot: "double-dot", tilde: "tilde", abs: "absolute", norm: "norm", matrix: "matrix-2x2",
  pmatrix: "matrix-2x2", bmatrix: "matrix-3x3",
};

/** Two-character sequences that typing converts in place, such as `<=` to ≤. */
export const MATH_DIGRAPHS: Readonly<Record<string, string>> = {
  "<=": "≤", ">=": "≥", "!=": "≠", "->": "→", "<-": "←", "=>": "⇒", "+-": "±", "-+": "∓", "~=": "≅", "<<": "≪", ">>": "≫",
};

export function mathCommandCompletions(prefix: string, limit = 8): string[] {
  const names = [...Object.keys(MATH_COMMAND_TEMPLATES), ...Object.keys(MATH_COMMAND_SYMBOLS)];
  return [...new Set(names)].filter((name) => name.startsWith(prefix) && name !== prefix).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, limit);
}
