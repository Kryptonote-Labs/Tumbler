import { mathChars, type MathEquation, type MathNode, type MathRow, type MathStructure } from "./model.ts";
import { MATH_BINARY, MATH_PUNCTUATION, MATH_RELATIONS } from "./templates.ts";

/**
 * LaTeX for equations, in both directions.
 *
 * `mathToLatex` writes standard amsmath LaTeX. `latexToMath` reads the same subset back and
 * returns undefined for anything it cannot represent exactly, such as macros, styling commands
 * or alignment, so hosts can keep that source as written instead of editing a lossy copy.
 * Reading what `mathToLatex` wrote gives back the same equation, except for fraction styles and
 * pre-scripts, which have no standard LaTeX and are written as plain fractions and scripts.
 */

// Commands and the characters they stand for. The first command for a character is the one written.
const SYMBOLS: readonly (readonly [string, string])[] = [
  ["alpha", "α"], ["beta", "β"], ["gamma", "γ"], ["delta", "δ"], ["epsilon", "ϵ"], ["varepsilon", "ε"],
  ["zeta", "ζ"], ["eta", "η"], ["theta", "θ"], ["vartheta", "ϑ"], ["iota", "ι"], ["kappa", "κ"],
  ["lambda", "λ"], ["mu", "μ"], ["nu", "ν"], ["xi", "ξ"], ["pi", "π"], ["varpi", "ϖ"], ["rho", "ρ"],
  ["varrho", "ϱ"], ["sigma", "σ"], ["varsigma", "ς"], ["tau", "τ"], ["upsilon", "υ"], ["phi", "ϕ"],
  ["varphi", "φ"], ["chi", "χ"], ["psi", "ψ"], ["omega", "ω"], ["Gamma", "Γ"], ["Delta", "Δ"], ["Delta", "∆"],
  ["Theta", "Θ"], ["Lambda", "Λ"], ["Xi", "Ξ"], ["Pi", "Π"], ["Sigma", "Σ"], ["Upsilon", "Υ"], ["Phi", "Φ"],
  ["Psi", "Ψ"], ["Omega", "Ω"],
  ["pm", "±"], ["mp", "∓"], ["times", "×"], ["div", "÷"], ["cdot", "⋅"], ["circ", "∘"], ["ast", "∗"],
  ["star", "⋆"], ["oplus", "⊕"], ["otimes", "⊗"], ["odot", "⊙"], ["wedge", "∧"], ["land", "∧"], ["vee", "∨"],
  ["lor", "∨"], ["cup", "∪"], ["cap", "∩"], ["setminus", "∖"], ["neg", "¬"], ["lnot", "¬"],
  ["le", "≤"], ["leq", "≤"], ["ge", "≥"], ["geq", "≥"], ["ne", "≠"], ["neq", "≠"], ["approx", "≈"],
  ["equiv", "≡"], ["cong", "≅"], ["sim", "∼"], ["simeq", "≃"], ["propto", "∝"], ["ll", "≪"], ["gg", "≫"],
  ["in", "∈"], ["notin", "∉"], ["ni", "∋"], ["subset", "⊂"], ["supset", "⊃"], ["subseteq", "⊆"],
  ["supseteq", "⊇"], ["perp", "⊥"], ["parallel", "∥"], ["mid", "∣"], ["prec", "≺"], ["succ", "≻"],
  ["to", "→"], ["rightarrow", "→"], ["leftarrow", "←"], ["gets", "←"], ["leftrightarrow", "↔"],
  ["Rightarrow", "⇒"], ["implies", "⇒"], ["Leftarrow", "⇐"], ["Leftrightarrow", "⇔"], ["iff", "⇔"],
  ["mapsto", "↦"], ["uparrow", "↑"], ["downarrow", "↓"], ["updownarrow", "↕"], ["Uparrow", "⇑"],
  ["Downarrow", "⇓"], ["Updownarrow", "⇕"], ["longrightarrow", "⟶"], ["longleftarrow", "⟵"],
  ["longleftrightarrow", "⟷"], ["nearrow", "↗"], ["searrow", "↘"], ["swarrow", "↙"], ["nwarrow", "↖"],
  ["infty", "∞"], ["partial", "∂"], ["nabla", "∇"], ["forall", "∀"], ["exists", "∃"], ["nexists", "∄"],
  ["emptyset", "∅"], ["angle", "∠"], ["measuredangle", "∡"], ["triangle", "△"], ["square", "□"],
  ["therefore", "∴"], ["because", "∵"], ["hbar", "ℏ"], ["ell", "ℓ"], ["wp", "℘"], ["Re", "ℜ"], ["Im", "ℑ"],
  ["aleph", "ℵ"], ["beth", "ℶ"], ["complement", "∁"], ["prime", "′"], ["ldots", "…"], ["dots", "…"],
  ["cdots", "⋯"], ["vdots", "⋮"], ["ddots", "⋱"], ["backslash", "\\"],
  // Spacing and escaped characters are commands without letters.
  [",", " "], [":", " "], [">", " "], [";", " "], ["quad", " "], [" ", " "],
  ["{", "{"], ["}", "}"], ["%", "%"], ["#", "#"], ["&", "&"], ["_", "_"], ["$", "$"], ["|", "‖"],
];
const SYMBOL_CHARS = new Map(SYMBOLS);
const SYMBOL_COMMANDS = new Map<string, string>();
for (const [command, char] of SYMBOLS) if (!SYMBOL_COMMANDS.has(char)) SYMBOL_COMMANDS.set(char, command);
const BLACKBOARD: Readonly<Record<string, string>> = { N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ" };
const BLACKBOARD_LETTERS = new Map(Object.entries(BLACKBOARD).map(([letter, char]) => [char, letter]));
// Characters LaTeX writes differently from how equations store them.
const PLAIN: Readonly<Record<string, string>> = { "−": "-", " ": "~", "^": "\\hat{}" };
const PLAIN_CHARS: Readonly<Record<string, string>> = { "-": "−", "~": " ", "*": "∗" };

const ACCENTS: readonly (readonly [string, string])[] = [
  ["dot", "̇"], ["ddot", "̈"], ["hat", "̂"], ["bar", "̅"], ["vec", "⃗"], ["tilde", "̃"],
];
const ACCENT_CHARS = new Map(ACCENTS);
const ACCENT_COMMANDS = new Map(ACCENTS.map(([command, accent]) => [accent, command]));

const OPERATORS: readonly (readonly [string, string, boolean])[] = [
  ["sum", "∑", false], ["prod", "∏", false], ["coprod", "∐", false], ["bigcup", "⋃", false],
  ["bigcap", "⋂", false], ["bigoplus", "⨁", false], ["bigotimes", "⨂", false], ["int", "∫", true],
  ["iint", "∬", true], ["iiint", "∭", true], ["oint", "∮", true],
];
const OPERATOR_CHARS = new Map(OPERATORS.map(([command, operator, side]) => [command, { operator, side }]));
const OPERATOR_COMMANDS = new Map(OPERATORS.map(([command, operator]) => [operator, command]));

const FUNCTIONS = new Set([
  "sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "coth", "arcsin", "arccos", "arctan",
  "log", "ln", "lg", "exp", "lim", "liminf", "limsup", "max", "min", "sup", "inf", "det", "gcd", "Pr",
  "arg", "deg", "dim", "hom", "ker",
]);
// Functions whose subscript sits below the name, as a limit.
const LIMIT_FUNCTIONS = new Set(["lim", "liminf", "limsup", "max", "min", "sup", "inf"]);

const DELIMITERS: readonly (readonly [string, string])[] = [
  ["(", "("], [")", ")"], ["[", "["], ["]", "]"], ["|", "|"], [".", ""], ["\\{", "{"], ["\\}", "}"],
  ["\\langle", "⟨"], ["\\rangle", "⟩"], ["\\lfloor", "⌊"], ["\\rfloor", "⌋"], ["\\lceil", "⌈"],
  ["\\rceil", "⌉"], ["\\|", "‖"], ["\\vert", "|"], ["\\Vert", "‖"], ["\\lbrack", "["], ["\\rbrack", "]"],
  ["\\lbrace", "{"], ["\\rbrace", "}"],
];
const DELIMITER_CHARS = new Map(DELIMITERS);
const DELIMITER_COMMANDS = new Map<string, string>();
for (const [command, char] of DELIMITERS) if (!DELIMITER_COMMANDS.has(char)) DELIMITER_COMMANDS.set(char, command);

// Bracketed matrices are written as their amsmath environment.
const MATRICES: readonly (readonly [string, string, string])[] = [
  ["pmatrix", "(", ")"], ["bmatrix", "[", "]"], ["Bmatrix", "{", "}"], ["vmatrix", "|", "|"], ["Vmatrix", "‖", "‖"],
];

// Characters that end an operator's or function's unbraced argument.
const isStop = (node: MathNode | undefined) =>
  node?.kind === "char" && !node.normal && (MATH_BINARY.has(node.value) || MATH_RELATIONS.has(node.value) || MATH_PUNCTUATION.has(node.value));

const TEXT_ESCAPES: Readonly<Record<string, string>> = {
  "{": "\\{", "}": "\\}", "%": "\\%", "#": "\\#", "&": "\\&", "_": "\\_", "$": "\\$",
  "\\": "\\textbackslash{}", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}",
};

/** LaTeX for copy, conversion and LaTeX documents. */
export function mathToLatex(equation: MathEquation): string {
  const group = (nodes: MathRow | undefined) => `{${row(nodes ?? [])}}`;
  const word = (nodes: MathRow) =>
    nodes.every((node) => node.kind === "char") ? nodes.map((node) => (node as { value: string }).value).join("") : undefined;
  const operatorName = (nodes: MathRow) => {
    const name = word(nodes);
    if (name === undefined) return row(nodes);
    return FUNCTIONS.has(name) ? `\\${name}` : `\\operatorname{${name}}`;
  };
  const scripts = (sub: MathRow | undefined, sup: MathRow | undefined) =>
    `${sub ? `_${group(sub)}` : ""}${sup ? `^${group(sup)}` : ""}`;
  // An argument that reading would not end at the right place is braced.
  const argument = (body: MathRow, next: MathNode | undefined) =>
    body.some(isStop) || (next && !isStop(next)) || (!body.length && next) ? group(body) : ` ${row(body)}`;
  const char = (value: string) => {
    const command = SYMBOL_COMMANDS.get(value);
    if (command) return `\\${command}${/[a-z]$/i.test(command) ? " " : ""}`;
    const letter = BLACKBOARD_LETTERS.get(value);
    if (letter) return `\\mathbb{${letter}}`;
    return PLAIN[value] ?? value;
  };
  const node = (value: MathNode, next: MathNode | undefined): string => {
    switch (value.kind) {
      case "char":
        return value.value === "−" ? "- " : char(value.value);
      case "fraction":
        return `\\frac${group(value.num)}${group(value.den)}`;
      case "script":
        return value.pre
          ? `{}${scripts(value.sub, value.sup)}${row(value.base)}`
          : `${value.base.length === 1 ? row(value.base) : group(value.base)}${scripts(value.sub, value.sup)}`;
      case "radical":
        return `\\sqrt${value.degree ? `[${row(value.degree)}]` : ""}${group(value.body)}`;
      case "delimiter": {
        const matrix = value.body.length === 1 && value.body[0]!.kind === "matrix" ? value.body[0] : undefined;
        const environment = matrix && MATRICES.find(([, open, close]) => open === value.open && close === value.close)?.[0];
        if (matrix && environment) return `\\begin{${environment}}${cells(matrix.rows)}\\end{${environment}}`;
        const side = (char: string) => DELIMITER_COMMANDS.get(char) ?? char;
        return `\\left${side(value.open)} ${row(value.body)}\\right${side(value.close)} `;
      }
      case "nary": {
        const command = OPERATOR_COMMANDS.get(value.operator) ?? SYMBOL_COMMANDS.get(value.operator);
        return `${command ? `\\${command}` : value.operator}${scripts(value.sub, value.sup)}${argument(value.body, next)}`;
      }
      case "function": {
        const [only] = value.name;
        let name: string;
        if (value.name.length === 1 && only!.kind === "limit" && word(only.base) !== undefined)
          name = `${operatorName(only.base)}${only.position === "lower" ? "_" : "^"}${group(only.limit)}`;
        else if (value.name.length === 1 && only!.kind === "script" && !only.pre && word(only.base) !== undefined)
          name = `${operatorName(only.base)}${scripts(only.sub, only.sup)}`;
        else name = operatorName(value.name);
        return `${name}${argument(value.body, next)}`;
      }
      case "accent":
        return `\\${ACCENT_COMMANDS.get(value.accent) ?? "hat"}${group(value.body)}`;
      case "limit":
        return `\\${value.position === "lower" ? "underset" : "overset"}${group(value.limit)}${group(value.base)}`;
      case "matrix":
        return `\\begin{matrix}${cells(value.rows)}\\end{matrix}`;
    }
  };
  // Empty cells are written as {} so a blank last row is not read as a trailing row break.
  const cells = (rows: readonly (readonly MathRow[])[]) =>
    rows.map((cells) => cells.map((cell) => (cell.length ? row(cell) : "{}")).join(" & ")).join(" \\\\ ");
  // Consecutive upright characters form one \text{} run.
  const row = (nodes: MathRow): string => {
    let latex = "";
    let text = "";
    nodes.forEach((value, index) => {
      if (value.kind === "char" && value.normal && (value.value === " " || (!SYMBOL_COMMANDS.has(value.value) && value.value !== "−"))) {
        text += TEXT_ESCAPES[value.value] ?? value.value;
        return;
      }
      if (text) latex += `\\text{${text}}`;
      text = "";
      latex += node(value, nodes[index + 1]);
    });
    return text ? `${latex}\\text{${text}}` : latex;
  };
  return row(equation.body).trim();
}

type Token =
  | { readonly kind: "command"; readonly name: string }
  | { readonly kind: "char"; readonly value: string }
  | { readonly kind: "open" | "close" | "sup" | "sub" | "cell" | "end" };

class Unsupported extends Error {}
const fail = (): never => {
  throw new Unsupported();
};

/**
 * Reads LaTeX math into an equation. Returns undefined when the source uses anything the
 * equation model cannot hold exactly, so the source can be kept and edited as written.
 */
export function latexToMath(source: string): MathEquation | undefined {
  try {
    const reader = new LatexReader(source);
    const body = reader.row();
    if (reader.peek().kind !== "end") return undefined;
    return { body };
  } catch (error) {
    if (error instanceof Unsupported) return undefined;
    throw error;
  }
}

class LatexReader {
  #at = 0;
  constructor(private readonly source: string) {}

  /** The next token without reading it. */
  peek(): Token {
    const at = this.#at;
    const token = this.next();
    this.#at = at;
    return token;
  }

  next(): Token {
    const { source } = this;
    while (this.#at < source.length && /\s/.test(source[this.#at]!)) this.#at++;
    if (this.#at >= source.length) return { kind: "end" };
    const value = String.fromCodePoint(source.codePointAt(this.#at)!);
    this.#at += value.length;
    switch (value) {
      case "{":
        return { kind: "open" };
      case "}":
        return { kind: "close" };
      case "^":
        return { kind: "sup" };
      case "_":
        return { kind: "sub" };
      case "&":
        return { kind: "cell" };
      case "%":
      case "#":
      case "$":
        return fail();
      case "\\": {
        const name = /^(?:[a-zA-Z]+|[^a-zA-Z])/.exec(source.slice(this.#at))?.[0];
        if (!name) return fail();
        this.#at += name.length;
        return { kind: "command", name };
      }
    }
    return { kind: "char", value };
  }

  /** A braced group's raw text, for names and \text. */
  raw(): string {
    if (this.next().kind !== "open") fail();
    const close = this.source.indexOf("}", this.#at);
    let text = this.source.slice(this.#at, close);
    if (close < 0 || text.includes("{")) fail();
    // Escaped braces inside \text{} would end the group early; they need a full reader.
    if (/\\$/.test(text)) fail();
    this.#at = close + 1;
    return text;
  }

  /**
   * Reads nodes until a closing token. With `argument`, reading also stops before an operator,
   * relation or punctuation, the way an unbraced function or operator argument ends.
   */
  row(argument = false, closing?: string): MathNode[] {
    const nodes: MathNode[] = [];
    // The last atom's first node, so scripts take a whole group as their base.
    let atom = -1;
    let scripted: MathStructure | undefined;
    for (;;) {
      const at = this.#at;
      const token = this.next();
      if (token.kind === "end" || token.kind === "close" || token.kind === "cell") {
        this.#at = at;
        return nodes;
      }
      if (token.kind === "command" && (token.name === "right" || token.name === "end" || token.name === "\\")) {
        this.#at = at;
        return nodes;
      }
      if (closing && token.kind === "char" && token.value === closing) {
        this.#at = at;
        return nodes;
      }
      if (token.kind === "sup" || token.kind === "sub") {
        const slot = token.kind;
        const last = nodes.at(-1);
        if (scripted && last === scripted && last.kind === "script" && !last[slot]) {
          nodes[nodes.length - 1] = scripted = { ...last, [slot]: this.argument() };
          continue;
        }
        const base = atom < 0 ? [] : nodes.splice(atom);
        nodes.push((scripted = { kind: "script", base, [slot]: this.argument() }));
        atom = nodes.length - 1;
        continue;
      }
      const added = this.atom(token);
      if (argument && added.length === 1 && isStop(added[0])) {
        this.#at = at;
        return nodes;
      }
      atom = added.length ? nodes.length : -1;
      scripted = undefined;
      nodes.push(...added);
    }
  }

  /** A script or command argument: a group, or one token. */
  argument(): MathNode[] {
    const token = this.next();
    if (token.kind === "open") return this.group();
    if (token.kind !== "char" && token.kind !== "command") return fail();
    return this.atom(token);
  }

  group(): MathNode[] {
    const nodes = this.row();
    if (this.next().kind !== "close") fail();
    return nodes;
  }

  /** An operator's or function's argument: a group, or what follows up to the next operator. */
  body(): MathNode[] {
    const at = this.#at;
    if (this.next().kind === "open") {
      const nodes = this.group();
      const after = this.peek().kind;
      if (after !== "sup" && after !== "sub") return nodes;
    }
    this.#at = at;
    return this.row(true);
  }

  atom(token: Token): MathNode[] {
    if (token.kind === "open") return this.group();
    if (token.kind === "char") return [{ kind: "char", value: PLAIN_CHARS[token.value] ?? token.value }];
    if (token.kind !== "command") return fail();
    const { name } = token;
    const symbol = SYMBOL_CHARS.get(name);
    if (symbol) return [{ kind: "char", value: symbol }];
    const accent = ACCENT_CHARS.get(name);
    if (accent) return [{ kind: "accent", accent, body: this.argument() }];
    const operator = OPERATOR_CHARS.get(name);
    if (operator) {
      let sub: MathRow | undefined;
      let sup: MathRow | undefined;
      for (let token = this.peek(); token.kind === "sub" || token.kind === "sup"; token = this.peek()) {
        this.next();
        if ((token.kind === "sub" ? sub : sup) !== undefined) fail();
        if (token.kind === "sub") sub = this.argument();
        else sup = this.argument();
      }
      return [{ kind: "nary", operator: operator.operator, ...(operator.side ? { side: true } : {}), ...(sub ? { sub } : {}), ...(sup ? { sup } : {}), body: this.body() }];
    }
    if (FUNCTIONS.has(name) || name === "operatorname") return [this.function(name === "operatorname" ? this.raw() : name)];
    switch (name) {
      case "frac":
        return [{ kind: "fraction", num: this.argument(), den: this.argument() }];
      case "sqrt": {
        const at = this.#at;
        const open = this.next();
        if (open.kind === "char" && open.value === "[") {
          const degree = this.row(false, "]");
          if (this.next().kind !== "char") fail();
          return [{ kind: "radical", degree, body: this.argument() }];
        }
        this.#at = at;
        return [{ kind: "radical", body: this.argument() }];
      }
      case "text": {
        const text = this.raw();
        if (/\\(?![{}%#&_$])/.test(text)) fail();
        return mathChars(text.replace(/\\([{}%#&_$])/g, "$1"), true);
      }
      case "mathbb": {
        const char = BLACKBOARD[this.raw()];
        return char ? [{ kind: "char", value: char }] : fail();
      }
      case "underset":
      case "overset": {
        const limit = this.argument();
        return [{ kind: "limit", position: name === "underset" ? "lower" : "upper", base: this.argument(), limit }];
      }
      case "left": {
        const open = this.delimiter();
        const body = this.row();
        const right = this.next();
        if (right.kind !== "command" || right.name !== "right") fail();
        return [{ kind: "delimiter", open, close: this.delimiter(), body }];
      }
      case "begin":
        return [this.matrix()];
      // Empty slots left by an earlier formula editor.
      case "placeholder":
        if (this.raw()) fail();
        return [];
    }
    return fail();
  }

  function(name: string): MathNode {
    if (!/^[a-zA-Z]+$/.test(name)) fail();
    const upright = mathChars(name, true);
    let sub: MathRow | undefined;
    let sup: MathRow | undefined;
    for (let token = this.peek(); token.kind === "sub" || token.kind === "sup"; token = this.peek()) {
      this.next();
      if ((token.kind === "sub" ? sub : sup) !== undefined) fail();
      if (token.kind === "sub") sub = this.argument();
      else sup = this.argument();
    }
    const label: MathRow =
      sub && !sup && LIMIT_FUNCTIONS.has(name)
        ? [{ kind: "limit", position: "lower", base: upright, limit: sub }]
        : sub || sup
          ? [{ kind: "script", base: upright, ...(sub ? { sub } : {}), ...(sup ? { sup } : {}) }]
          : upright;
    return { kind: "function", name: label, body: this.body() };
  }

  delimiter(): string {
    const token = this.next();
    const key = token.kind === "char" ? token.value : token.kind === "command" ? `\\${token.name}` : "";
    const char = DELIMITER_CHARS.get(key);
    return char ?? fail();
  }

  matrix(): MathNode {
    const environment = this.raw();
    const bracket = MATRICES.find(([name]) => name === environment);
    if (environment !== "matrix" && !bracket) fail();
    const rows: MathRow[][] = [[]];
    let blank = false;
    for (;;) {
      const at = this.#at;
      rows.at(-1)!.push(this.row());
      blank = rows.at(-1)!.length === 1 && !this.source.slice(at, this.#at).trim();
      const token = this.next();
      if (token.kind === "cell") continue;
      if (token.kind === "command" && token.name === "\\") {
        rows.push([]);
        continue;
      }
      if (token.kind !== "command" || token.name !== "end" || this.raw() !== environment) fail();
      break;
    }
    // A trailing row break does not start a row.
    if (rows.length > 1 && blank) rows.pop();
    const width = Math.max(...rows.map((cells) => cells.length));
    const matrix: MathNode = { kind: "matrix", rows: rows.map((cells) => [...cells, ...Array.from({ length: width - cells.length }, () => [])]) };
    return bracket ? { kind: "delimiter", open: bracket[1], close: bracket[2], body: [matrix] } : matrix;
  }
}
