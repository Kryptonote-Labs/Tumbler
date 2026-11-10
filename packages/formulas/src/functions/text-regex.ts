/** Bounded Excel/PCRE common subset. Every parser/matcher transition charges the
 * calculation budget; unsupported PCRE syntax is delegated explicitly. No JS RegExp
 * executes a user pattern. This is deliberately not a complete PCRE2 engine. */
import type { FunctionContext } from "../function-runtime.ts";
type Node =
  | { kind: "char"; test: (s: string) => boolean }
  | { kind: "anchor"; end: boolean }
  | { kind: "seq" | "alt"; children: Node[] }
  | { kind: "group"; child: Node; index: number }
  | { kind: "repeat"; child: Node; min: number; max: number; lazy: boolean };
type State = { pos: number; captures: string[] };
export class UnsupportedRegex extends Error {}
export function boundedRegex(
  pattern: string,
  insensitive: boolean,
  c: FunctionContext,
) {
  let p = 0,
    groups = 0,
    depth = 0;
  if (pattern.includes("[[:") || /[\uD800-\uDFFF]/.test(pattern))
    throw new UnsupportedRegex("Unicode/POSIX pattern");
  if (pattern.length > 2048) throw new UnsupportedRegex("pattern length");
  const equal = (a: string, b: string) =>
    insensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
  function escaped(): (s: string) => boolean {
    const x = pattern[p++];
    if (x === undefined) throw new SyntaxError("escape");
    if (x === "d") return (s) => /^[0-9]$/.test(s);
    if (x === "D") return (s) => !/[0-9]/.test(s);
    if (x === "w") return (s) => /^[a-zA-Z0-9_]$/.test(s);
    if (x === "W") return (s) => !/[a-zA-Z0-9_]/.test(s);
    if (x === "s") return (s) => /^[\t\n\r\f\v ]$/.test(s);
    if (x === "S") return (s) => !/[\t\n\r\f\v ]/.test(s);
    if (/[a-zA-Z0-9]/.test(x) && !["n", "r", "t"].includes(x))
      throw new UnsupportedRegex("escape " + x);
    const literal = x === "n" ? "\n" : x === "r" ? "\r" : x === "t" ? "\t" : x;
    return (s) => equal(s, literal);
  }
  function atom(): Node {
    c.operation();
    const x = pattern[p++];
    if (x === undefined) throw new SyntaxError("atom");
    if (x === "(") {
      if (++depth > 32) throw new UnsupportedRegex("depth");
      let index = 0;
      if (pattern.startsWith("?:", p)) p += 2;
      else if (pattern[p] === "?") throw new UnsupportedRegex("group");
      else index = ++groups;
      const child = expression();
      if (pattern[p++] !== ")") throw new SyntaxError("group");
      depth--;
      return index ? { kind: "group", child, index } : child;
    }
    if (x === "[") {
      const tests: ((s: string) => boolean)[] = [];
      const invert = pattern[p] === "^";
      if (invert) p++;
      function classAtom(): { literal?: string; test: (s: string) => boolean } {
        c.operation();
        const value = pattern[p++];
        if (value === undefined) throw new SyntaxError("class atom");
        if (value !== "\\") return {literal: value, test: s => equal(s, value)};
        const escape = pattern[p];
        const control: Record<string, string> = {n: "\n", r: "\r", t: "\t", f: "\f", v: "\v"};
        if (escape !== undefined && control[escape] !== undefined) {
          p++;
          const literal = control[escape]!;
          return {literal, test: s => equal(s, literal)};
        }
        const test = escaped();
        return escape !== undefined && !/[a-zA-Z0-9]/.test(escape) ? {literal: escape, test} : {test};
      }
      // A closing bracket in the first class position is a literal (also after ^).
      let firstAtom = true;
      while (p < pattern.length && (pattern[p] !== "]" || firstAtom)) {
        const a = classAtom();
        firstAtom = false;
        if (pattern[p] === "-" && pattern[p + 1] !== "]") {
          p++;
          const b = classAtom();
          if (a.literal === undefined || b.literal === undefined) throw new UnsupportedRegex("nonliteral class range");
          const first = a.literal;
          const last = b.literal;
          if (first > last) throw new SyntaxError("range");
          tests.push(s => {
            const members = insensitive ? [s, s.toLowerCase(), s.toUpperCase(), s.toLowerCase().toUpperCase()] : [s];
            return members.some(value => value.length === 1 && value >= first && value <= last);
          });
        } else tests.push(a.test);
      }
      if (pattern[p++] !== "]") throw new SyntaxError("class");
      return { kind: "char", test: (s) => tests.some((t) => { c.operation(); return t(s); }) !== invert };
    }
    if (x === "\\") return { kind: "char", test: escaped() };
    if (x === ".")
      return { kind: "char", test: (s) => s !== "\n" && s !== "\r" };
    if (x === "^" || x === "$") return { kind: "anchor", end: x === "$" };
    if ("*+?{}".includes(x)) throw new SyntaxError("quantifier");
    return { kind: "char", test: (s) => equal(s, x) };
  }
  function sequence(): Node {
    const children: Node[] = [];
    while (p < pattern.length && pattern[p] !== ")" && pattern[p] !== "|") {
      let child = atom();
      const q = pattern[p];
      let min = 0,
        max = 0;
      if (q === "*" || q === "+" || q === "?") {
        p++;
        min = q === "+" ? 1 : 0;
        max = q === "?" ? 1 : Infinity;
      } else if (q === "{") {
        const m = /^\{(\d+)(?:,(\d*)?)?\}/.exec(pattern.slice(p));
        if (!m) throw new SyntaxError("quantifier");
        p += m[0].length;
        min = Number(m[1]);
        max = m[0].includes(",") ? (m[2] ? Number(m[2]) : Infinity) : min;
        if (min > max || min > 32767) throw new SyntaxError("quantifier");
      } else {
        children.push(child);
        continue;
      }
      const lazy = pattern[p] === "?";
      if (lazy) p++;
      if (pattern[p] === "+")
        throw new UnsupportedRegex("possessive quantifier");
      child = { kind: "repeat", child, min, max, lazy };
      children.push(child);
    }
    return { kind: "seq", children };
  }
  function expression(): Node {
    const children = [sequence()];
    while (pattern[p] === "|") {
      p++;
      children.push(sequence());
    }
    return children.length === 1 ? children[0]! : { kind: "alt", children };
  }
  const root = expression();
  if (p !== pattern.length) throw new SyntaxError("unmatched group");
  function run(node: Node, state: State, input: string): State[] {
    c.operation();
    switch (node.kind) {
      case "char": {
        const cp = input.codePointAt(state.pos);
        const ch = cp === undefined ? "" : String.fromCodePoint(cp);
        return ch && node.test(ch)
          ? [{ ...state, pos: state.pos + ch.length }]
          : [];
      }
      case "anchor":
        return (
          node.end
            ? state.pos === input.length ||
              (state.pos === input.length - 1 && input.endsWith("\n"))
            : state.pos === 0
        )
          ? [state]
          : [];
      case "group":
        return run(node.child, state, input).map((next) => {
          c.operation();
          const captures = next.captures.slice();
          captures[node.index] = input.slice(state.pos, next.pos);
          return { ...next, captures };
        });
      case "alt":
        return node.children.flatMap((child) => run(child, state, input));
      case "seq": {
        let states = [state];
        for (const child of node.children) {
          states = states.flatMap((x) => run(child, x, input));
          if (states.length > c.maxArrayCells)
            throw new RangeError("regex states");
        }
        return states;
      }
      case "repeat": {
        const stack: { state: State; count: number; emit: boolean }[] = [
            { state, count: 0, emit: false },
          ],
          out: State[] = [];
        while (stack.length) {
          c.operation();
          const frame = stack.pop()!;
          if (frame.emit) {
            out.push(frame.state);
            if (out.length > c.maxArrayCells)
              throw new RangeError("regex states");
            continue;
          }
          const canEmit = frame.count >= node.min;
          if (node.lazy && canEmit) out.push(frame.state);
          if (!node.lazy && canEmit) stack.push({ ...frame, emit: true });
          if (frame.count < Math.min(node.max, input.length + 1)) {
            const next = run(node.child, frame.state, input);
            for (let j = next.length - 1; j >= 0; j--) {
              c.operation();
              const candidate = next[j]!;
              if (candidate.pos === frame.state.pos)
                throw new UnsupportedRegex("nullable quantified group");
              stack.push({
                state: candidate,
                count: frame.count + 1,
                emit: false,
              });
            }
          }
          if (stack.length + out.length > c.maxArrayCells)
            throw new RangeError("regex states");
        }
        return out;
      }
    }
  }
  return {
    groups,
    find(
      input: string,
      from = 0,
    ): { start: number; end: number; captures: string[] } | undefined {
      for (let i = from; i <= input.length;) {
        c.operation();
        const hit = run(root, { pos: i, captures: [] }, input)[0];
        if (hit) return { start: i, end: hit.pos, captures: hit.captures };
        i += (input.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
      }
      return undefined;
    },
  };
}
