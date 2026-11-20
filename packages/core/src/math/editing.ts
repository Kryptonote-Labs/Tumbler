import { MATH_COMMAND_SYMBOLS, MATH_COMMAND_TEMPLATES, MATH_DIGRAPHS } from "./commands.ts";
import {
  mathRowAt,
  mathSlot,
  mathSlots,
  samePath,
  updateMathRow,
  withMathSlot,
  type MathEquation,
  type MathNode,
  type MathPath,
  type MathPosition,
  type MathRow,
  type MathScript,
  type MathStructure,
} from "./model.ts";
import { MATH_BINARY, MATH_PUNCTUATION, MATH_RELATIONS, mathTemplate } from "./templates.ts";

export interface MathSelection {
  readonly anchor: MathPosition;
  readonly focus: MathPosition;
}

/**
 * Editing state for one equation. All commands are pure: hosts keep the returned state and
 * persist `equation` through their own document operations and undo history.
 */
export interface MathEditorState {
  readonly equation: MathEquation;
  readonly selection: MathSelection;
  /** A slot opened by typing `/`, `^` or `_`; an operator typed at its end continues after it. */
  readonly typedSlot?: MathPath;
  /** Upright text entry, used for words inside an equation. */
  readonly normalText?: boolean;
}

/** Leaving an equation hands the caret back to the host's surrounding text. */
export type MathExit = "before" | "after" | "up" | "down";
export interface MathMove {
  readonly state: MathEditorState;
  readonly exit?: MathExit;
}

export interface MathRange {
  readonly path: MathPath;
  readonly start: number;
  readonly end: number;
}

export function mathCaret(path: MathPath, offset: number): MathSelection {
  const position = { path, offset };
  return { anchor: position, focus: position };
}

export function createMathEditor(equation: MathEquation, at: "start" | "end" = "end"): MathEditorState {
  return { equation, selection: mathCaret([], at === "start" ? 0 : equation.body.length) };
}

export function isMathCollapsed(selection: MathSelection) {
  return selection.anchor.offset === selection.focus.offset && samePath(selection.anchor.path, selection.focus.path);
}

/** The selected atoms in the deepest row containing both ends of the selection. */
export function mathSelectedRange(selection: MathSelection): MathRange {
  const { anchor, focus } = selection;
  let common = 0;
  while (
    common < anchor.path.length &&
    common < focus.path.length &&
    anchor.path[common]!.index === focus.path[common]!.index &&
    anchor.path[common]!.slot === focus.path[common]!.slot
  )
    common++;
  const path = anchor.path.slice(0, common);
  const side = (position: MathPosition) =>
    position.path.length > common ? { at: position.path[common]!.index, inside: true } : { at: position.offset, inside: false };
  const a = side(anchor);
  const f = side(focus);
  if (a.inside && f.inside && a.at === f.at) return { path, start: a.at, end: a.at + 1 };
  const [low, high] = a.at < f.at || (a.at === f.at && !a.inside) ? [a, f] : [f, a];
  return { path, start: low.at, end: high.inside ? high.at + 1 : high.at };
}

export function mathSelectedNodes(state: MathEditorState): MathRow {
  const range = mathSelectedRange(state.selection);
  return mathRowAt(state.equation.body, range.path).slice(range.start, range.end);
}

function withBody(state: MathEditorState, body: MathRow, selection: MathSelection, typedSlot?: MathPath): MathEditorState {
  return {
    equation: { ...state.equation, body },
    selection,
    ...(typedSlot ? { typedSlot } : {}),
    ...(state.normalText ? { normalText: true } : {}),
  };
}

function splice(state: MathEditorState, range: MathRange, nodes: MathRow): MathRow {
  return updateMathRow(state.equation.body, range.path, (row) => [...row.slice(0, range.start), ...nodes, ...row.slice(range.end)]);
}

export function setMathSelection(state: MathEditorState, anchor: MathPosition, focus: MathPosition = anchor): MathEditorState {
  const { typedSlot: _, ...rest } = state;
  return { ...rest, selection: { anchor, focus } };
}

export function selectAllMath(state: MathEditorState): MathEditorState {
  return setMathSelection(state, { path: [], offset: 0 }, { path: [], offset: state.equation.body.length });
}

/** Replace the selection with nodes and place the caret after them. */
export function insertMathNodes(state: MathEditorState, nodes: MathRow): MathEditorState {
  const range = mathSelectedRange(state.selection);
  return withBody(state, splice(state, range, nodes), mathCaret(range.path, range.start + nodes.length));
}

/** The first empty slot inside the node at `index` of `path`, in caret order. */
function emptySlotPosition(node: MathNode, path: MathPath, index: number): MathPosition | undefined {
  for (const slot of mathSlots(node)) {
    const row = mathSlot(node, slot);
    const slotPath = [...path, { index, slot }];
    if (!row.length) return { path: slotPath, offset: 0 };
    for (const [childIndex, child] of row.entries()) {
      const nested = emptySlotPosition(child, slotPath, childIndex);
      if (nested) return nested;
    }
  }
  return undefined;
}

/**
 * Insert a structure. Selected content moves into the template's wrap slot and the caret lands
 * in the first empty slot, or after the structure when every slot is filled.
 */
export function insertMathStructure(state: MathEditorState, structure: MathStructure, wrap?: string): MathEditorState {
  const range = mathSelectedRange(state.selection);
  const selected = mathRowAt(state.equation.body, range.path).slice(range.start, range.end);
  const slot = wrap ?? mathSlots(structure)[0];
  const node = selected.length && slot ? withMathSlot(structure, slot, [...selected, ...mathSlot(structure, slot)]) : structure;
  const body = splice(state, range, [node]);
  const caret = emptySlotPosition(node, range.path, range.start) ?? { path: range.path, offset: range.start + 1 };
  return withBody(state, body, { anchor: caret, focus: caret });
}

export function insertMathTemplate(state: MathEditorState, id: string): MathEditorState {
  const template = mathTemplate(id);
  if (!template) throw new RangeError(`Unknown equation template ${id}.`);
  return insertMathStructure(state, template.node, template.wrap);
}

const isLetter = (value: string) => /^\p{L}$/u.test(value);
const isDigit = (value: string) => /^[\p{Nd}.]$/u.test(value);
const charAt = (row: MathRow, index: number) => {
  const node = row[index];
  return node?.kind === "char" ? node.value : undefined;
};

/** Operand immediately before the caret for typed fractions and scripts. */
function operandStart(row: MathRow, offset: number, kind: "fraction" | "script") {
  const previous = row[offset - 1];
  if (!previous) return offset;
  if (previous.kind !== "char") return offset - 1;
  if (MATH_BINARY.has(previous.value) || MATH_RELATIONS.has(previous.value) || MATH_PUNCTUATION.has(previous.value) || previous.value === " " || "([{".includes(previous.value)) return offset;
  let start = offset - 1;
  const word = isDigit(previous.value) ? isDigit : kind === "fraction" && isLetter(previous.value) ? (value: string) => isLetter(value) || isDigit(value) : undefined;
  if (word) while (start > 0 && charAt(row, start - 1) !== undefined && word(charAt(row, start - 1)!)) start--;
  return start;
}

/** `(a+b)/c` puts a+b in the numerator, as in linear math notation. */
function unwrapParentheses(nodes: MathRow): MathRow {
  const only = nodes.length === 1 ? nodes[0] : undefined;
  return only?.kind === "delimiter" && only.open === "(" && only.close === ")" ? only.body : nodes;
}

const FUNCTION_WORDS = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "arcsin", "arccos", "arctan", "log", "ln", "exp", "lim", "max", "min", "det", "gcd"]);
const CLOSERS: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{", "⟩": "⟨" };

function collapsed(state: MathEditorState) {
  return isMathCollapsed(state.selection) ? state.selection.focus : undefined;
}

/** Move a collapsed caret out of its structure, after it. Leaving `lim` under a function name enters its argument. */
function leaveStructure(state: MathEditorState, position: MathPosition): MathEditorState {
  const parent = position.path.slice(0, -1);
  const step = parent.at(-1);
  if (step?.slot === "name") {
    const fn = mathRowAt(state.equation.body, parent.slice(0, -1))[step.index];
    if (fn?.kind === "function") return withBody(state, state.equation.body, mathCaret([...parent.slice(0, -1), { index: step.index, slot: "body" }], fn.body.length), [...parent.slice(0, -1), { index: step.index, slot: "body" }]);
  }
  return withBody(state, state.equation.body, mathCaret(parent, position.path.at(-1)!.index + 1));
}

/** The structure that owns the slot a caret is in. */
function owner(state: MathEditorState, position: MathPosition) {
  const step = position.path.at(-1);
  if (!step) return undefined;
  const node = mathRowAt(state.equation.body, position.path.slice(0, -1))[step.index];
  return node && { node, step };
}

/**
 * `\sum_(i=0)^n`: script keys inside an operator's limits, or at the start of its empty body,
 * move to that limit instead of nesting a script.
 */
function typeLimit(state: MathEditorState, position: MathPosition, slot: "sub" | "sup"): MathEditorState | undefined {
  const parent = owner(state, position);
  // `\\lim_(n→∞)`: the limit slot is already where the script key points.
  if (parent?.node.kind === "limit" && parent.step.slot === "limit" && !mathRowAt(state.equation.body, position.path).length && (slot === "sub") === (parent.node.position === "lower")) return state;
  if (parent?.node.kind !== "nary") return undefined;
  const { node, step } = parent;
  const inLimit = step.slot === "sub" || step.slot === "sup";
  if (!inLimit && !(step.slot === "body" && !node.body.length)) return undefined;
  const container = position.path.slice(0, -1);
  const limit = node[slot] ?? [];
  const body = node[slot] ? state.equation.body : updateMathRow(state.equation.body, container, (row) => row.map((value, index) => (index === step.index ? { ...node, [slot]: limit } : value)));
  return withBody(state, body, mathCaret([...container, { index: step.index, slot }], limit.length));
}

/** Slots where parentheses only group input, as in `e^(iπ)` or `√(b²−4ac)`, and are removed. */
const GROUPING_SLOTS: Readonly<Record<string, readonly string[]>> = {
  fraction: ["num", "den"],
  script: ["sub", "sup"],
  radical: ["degree", "body"],
  nary: ["sub", "sup"],
  limit: ["limit"],
  accent: ["body"],
};

function typeScript(state: MathEditorState, slot: "sub" | "sup"): MathEditorState {
  const range = mathSelectedRange(state.selection);
  const row = mathRowAt(state.equation.body, range.path);
  if (range.start === range.end) {
    const previous = row[range.start - 1];
    if (previous?.kind === "script" && !previous.pre && !previous[slot]) {
      const node: MathScript = { ...previous, [slot]: [] };
      const body = splice(state, { ...range, start: range.start - 1 }, [node]);
      const path = [...range.path, { index: range.start - 1, slot }];
      return withBody(state, body, mathCaret(path, 0), path);
    }
  }
  const start = range.start === range.end ? operandStart(row, range.start, "script") : range.start;
  const base = row.slice(start, range.end);
  const node: MathScript = { kind: "script", base, [slot]: [] };
  const body = splice(state, { ...range, start }, [node]);
  const path = [...range.path, { index: start, slot }];
  return withBody(state, body, mathCaret(path, 0), path);
}

function typeFraction(state: MathEditorState): MathEditorState {
  const range = mathSelectedRange(state.selection);
  const row = mathRowAt(state.equation.body, range.path);
  const start = range.start === range.end ? operandStart(row, range.start, "fraction") : range.start;
  const num = unwrapParentheses(row.slice(start, range.end));
  const body = splice(state, { ...range, start }, [{ kind: "fraction", num, den: [] }]);
  const caret = num.length ? [...range.path, { index: start, slot: "den" }] : [...range.path, { index: start, slot: "num" }];
  return withBody(state, body, mathCaret(caret, 0), num.length ? caret : undefined);
}

/** Replace `\name` before the caret when the name is a known command. */
function completeCommand(state: MathEditorState, position: MathPosition): MathEditorState | undefined {
  const row = mathRowAt(state.equation.body, position.path);
  let start = position.offset;
  while (start > 0 && charAt(row, start - 1) !== undefined && /^[A-Za-z]$/.test(charAt(row, start - 1)!)) start--;
  if (start === position.offset || charAt(row, start - 1) !== "\\") return undefined;
  const name = row.slice(start, position.offset).map((node) => (node as { value: string }).value).join("");
  const range = { path: position.path, start: start - 1, end: position.offset };
  const symbol = MATH_COMMAND_SYMBOLS[name];
  const selected = { ...state, selection: { anchor: { path: range.path, offset: range.start }, focus: { path: range.path, offset: range.end } } };
  if (symbol) return insertMathNodes(selected, [{ kind: "char", value: symbol }]);
  const template = MATH_COMMAND_TEMPLATES[name];
  if (!template) return undefined;
  const next = insertMathTemplate(insertMathNodes(selected, []), template);
  // `\sqrt x+1` and `\hat a+b` and `\\sin x+1` take one operand, like a typed script.
  const group = mathTemplate(template)?.group;
  return group === "radical" || group === "accent" || group === "function" ? { ...next, typedSlot: next.selection.focus.path } : next;
}

/** Plain `sin`, `log` and friends become functions when followed by a space or parenthesis. */
function completeFunction(state: MathEditorState, position: MathPosition): MathEditorState | undefined {
  const row = mathRowAt(state.equation.body, position.path);
  let start = position.offset;
  while (start > 0 && charAt(row, start - 1) !== undefined && /^[a-z]$/.test(charAt(row, start - 1)!)) start--;
  if (start > 0 && charAt(row, start - 1) === "\\") return undefined;
  const name = row.slice(start, position.offset).map((node) => (node as { value: string }).value).join("");
  if (!FUNCTION_WORDS.has(name)) return undefined;
  const cleared = insertMathNodes({ ...state, selection: { anchor: { path: position.path, offset: start }, focus: position } }, []);
  const id = name === "lim" ? "limit" : mathTemplate(name) ? name : undefined;
  const next = id
    ? insertMathTemplate(cleared, id)
    : insertMathStructure(cleared, { kind: "function", name: [...name].map((value) => ({ kind: "char", value, normal: true })), body: [] }, "body");
  // `sin α ± sin β`: an operator ends the argument unless parentheses are still open. A limit
  // such as `n→∞` ends with a space instead.
  return id === "limit" ? next : { ...next, typedSlot: next.selection.focus.path };
}

/** `)` closes the nearest unmatched `(` in the same row into a delimiter that grows with its contents. */
function closeDelimiter(state: MathEditorState, position: MathPosition, close: string): MathEditorState | undefined {
  const open = CLOSERS[close] ?? (close === "|" ? "|" : undefined);
  if (!open) return undefined;
  const row = mathRowAt(state.equation.body, position.path);
  let depth = 0;
  for (let index = position.offset - 1; index >= 0; index--) {
    const value = charAt(row, index);
    if (value === close && close !== "|") depth++;
    else if (value === open) {
      if (depth) depth--;
      else {
        const body = row.slice(index + 1, position.offset);
        if (close === "|" && !body.length) return undefined;
        const next = splice(state, { path: position.path, start: index, end: position.offset }, [{ kind: "delimiter", open, close, body }]);
        return withBody(state, next, mathCaret(position.path, index + 1));
      }
    }
  }
  return undefined;
}

/** Whether an unmatched `(` before the caret is still collecting input. */
function openParenthesis(row: MathRow, offset: number) {
  let depth = 0;
  for (let index = offset - 1; index >= 0; index--) {
    const value = charAt(row, index);
    if (value === ")") depth++;
    else if (value === "(" && !depth--) return true;
  }
  return false;
}

/** A grouping `( … )` that fills its slot is removed; outside an operator's limits the caret leaves. */
function ungroup(state: MathEditorState): MathEditorState {
  const position = collapsed(state);
  const parent = position && owner(state, position);
  const row = position && mathRowAt(state.equation.body, position.path);
  const only = row?.length === 1 ? row[0] : undefined;
  if (!position || !parent || only?.kind !== "delimiter" || only.open !== "(" || only.close !== ")") return state;
  if (!GROUPING_SLOTS[parent.node.kind]?.includes(parent.step.slot)) return state;
  const body = updateMathRow(state.equation.body, position.path, () => only.body);
  const inside = withBody(state, body, mathCaret(position.path, only.body.length));
  return parent.node.kind === "nary" ? inside : leaveStructure(inside, inside.selection.focus);
}

/** Type one character, applying the build-up shortcuts that make linear input feel natural. */
export function typeMathCharacter(state: MathEditorState, character: string): MathEditorState {
  if (character === "/") return typeFraction(state);
  const position = collapsed(state);
  if (position && (character === "^" || character === "_")) {
    const row = mathRowAt(state.equation.body, position.path);
    const step = position.path.at(-1);
    // x_1^2: a script key typed at the end of a script slot adds to the same script.
    if (step && (step.slot === "sub" || step.slot === "sup") && position.offset === row.length && row.length) {
      const parent = mathRowAt(state.equation.body, position.path.slice(0, -1))[step.index];
      if (parent?.kind === "script") return typeScript(leaveStructure(state, position), character === "^" ? "sup" : "sub");
    }
  }
  if (position && (character === "^" || character === "_")) {
    const limit = typeLimit(state, position, character === "^" ? "sup" : "sub");
    if (limit) return limit;
  }
  if (character === "^") return typeScript(state, "sup");
  if (character === "_") return typeScript(state, "sub");
  if (!position) return insertMathNodes(state, [{ kind: "char", value: character === "-" ? "−" : character }]);
  const row = mathRowAt(state.equation.body, position.path);
  if (!/^[A-Za-z]$/.test(character)) {
    const command = completeCommand(state, position);
    if (command) return character === " " ? command : typeMathCharacter(command, character);
    if (character === " " || character === "(") {
      const fn = completeFunction(state, position);
      if (fn) return character === " " ? fn : typeMathCharacter(fn, character);
    }
  }
  const typed = state.typedSlot && samePath(state.typedSlot, position.path) && position.offset === row.length && row.length > 0;
  if (character === " ") {
    // Space builds up: it finishes the current slot and continues after the structure, or from
    // an operator's limits into its body.
    const parent = owner(state, position);
    if (parent?.node.kind === "nary" && parent.step.slot !== "body" && position.offset === row.length)
      return withBody(state, state.equation.body, mathCaret([...position.path.slice(0, -1), { index: parent.step.index, slot: "body" }], parent.node.body.length));
    if (position.path.length && position.offset === row.length) return leaveStructure(state, position);
    // Like linear math input, spaces only build up; upright text keeps them as words.
    if (!state.normalText) return state;
  }
  if (typed && !openParenthesis(row, position.offset) && (MATH_BINARY.has(character) || MATH_RELATIONS.has(character) || character === "-" || MATH_PUNCTUATION.has(character)))
    return typeMathCharacter(leaveStructure(state, position), character);
  const close = closeDelimiter(state, position, character);
  if (close) return ungroup(close);
  // An unmatched `)` closes the slot it is typed in, so `√(x)` and `(a+√b)` both work.
  if (CLOSERS[character] && position.path.length) return typeMathCharacter(leaveStructure(state, position), character);
  const previous = charAt(row, position.offset - 1);
  const digraph = previous && MATH_DIGRAPHS[(previous === "−" ? "-" : previous) + character];
  if (digraph) {
    const body = splice(state, { path: position.path, start: position.offset - 1, end: position.offset }, [{ kind: "char", value: digraph }]);
    return withBody(state, body, mathCaret(position.path, position.offset), state.typedSlot);
  }
  const value = character === "-" ? "−" : character === "*" ? "∗" : character;
  const normal = state.normalText || position.path.at(-1)?.slot === "name";
  const next = insertMathNodes(state, [normal ? { kind: "char", value, normal: true } : { kind: "char", value }]);
  return state.typedSlot && samePath(state.typedSlot, position.path) ? { ...next, typedSlot: state.typedSlot } : next;
}

export function typeMathText(state: MathEditorState, text: string): MathEditorState {
  let next = state;
  for (const character of text.replace(/\r\n?|\n/g, " ")) next = typeMathCharacter(next, character);
  return next;
}

function structureAt(state: MathEditorState, path: MathPath) {
  const step = path.at(-1)!;
  const parent = path.slice(0, -1);
  const node = mathRowAt(state.equation.body, parent)[step.index]!;
  return { node, parent, step, slots: mathSlots(node) };
}

const OPTIONAL_SLOTS: Readonly<Record<string, readonly string[]>> = { script: ["sub", "sup"], radical: ["degree"], nary: ["sub", "sup"] };

function selectNode(state: MathEditorState, path: MathPath, index: number): MathEditorState {
  return setMathSelection(state, { path, offset: index }, { path, offset: index + 1 });
}

/** Backspace: characters delete; a structure is selected first, so its contents are never lost by surprise. */
export function deleteMathBackward(state: MathEditorState): MathEditorState {
  const position = collapsed(state);
  if (!position) return insertMathNodes(state, []);
  const row = mathRowAt(state.equation.body, position.path);
  if (position.offset > 0) {
    const previous = row[position.offset - 1]!;
    if (previous.kind !== "char") return selectNode(state, position.path, position.offset - 1);
    return withBody(state, splice(state, { path: position.path, start: position.offset - 1, end: position.offset }, []), mathCaret(position.path, position.offset - 1));
  }
  if (!position.path.length) return state;
  return removeAtSlotEdge(state, position, "start");
}

export function deleteMathForward(state: MathEditorState): MathEditorState {
  const position = collapsed(state);
  if (!position) return insertMathNodes(state, []);
  const row = mathRowAt(state.equation.body, position.path);
  if (position.offset < row.length) {
    const next = row[position.offset]!;
    if (next.kind !== "char") return selectNode(state, position.path, position.offset);
    return withBody(state, splice(state, { path: position.path, start: position.offset, end: position.offset + 1 }, []), mathCaret(position.path, position.offset));
  }
  if (!position.path.length) return state;
  return removeAtSlotEdge(state, position, "end");
}

function removeAtSlotEdge(state: MathEditorState, position: MathPosition, edge: "start" | "end"): MathEditorState {
  const { node, parent, step, slots } = structureAt(state, position.path);
  const slotIndex = slots.indexOf(step.slot);
  const empty = slots.filter((slot) => mathSlot(node, slot).length === 0);
  const replace = (nodes: MathRow, caret: number) =>
    withBody(state, splice(state, { path: parent, start: step.index, end: step.index + 1 }, nodes), mathCaret(parent, caret));
  if (empty.length === slots.length) return replace([], step.index);
  const current = mathSlot(node, step.slot);
  const optional = OPTIONAL_SLOTS[node.kind]?.includes(step.slot) && !current.length;
  if (optional) {
    const { [step.slot]: _, ...rest } = node as unknown as Record<string, unknown>;
    const reduced = rest as unknown as MathStructure;
    if (reduced.kind === "script" && !reduced.sub && !reduced.sup) return replace(reduced.base, step.index + reduced.base.length);
    const body = splice(state, { path: parent, start: step.index, end: step.index + 1 }, [reduced]);
    const remaining = mathSlots(reduced);
    const target = remaining[Math.max(0, Math.min(remaining.length - 1, edge === "start" ? slotIndex - 1 : slotIndex))]!;
    const targetPath = [...parent, { index: step.index, slot: target }];
    return withBody(state, body, mathCaret(targetPath, edge === "start" ? mathSlot(reduced, target).length : 0));
  }
  // The only filled slot unwraps: backspace at the start of x in x^□ leaves x.
  if (empty.length === slots.length - 1 && current.length) {
    return replace(current, step.index + (edge === "start" ? 0 : current.length));
  }
  const neighbour = slots[slotIndex + (edge === "start" ? -1 : 1)];
  if (!neighbour) return withBody(state, state.equation.body, mathCaret(parent, step.index + (edge === "start" ? 0 : 1)));
  const path = [...parent, { index: step.index, slot: neighbour }];
  return withBody(state, state.equation.body, mathCaret(path, edge === "start" ? mathSlot(node, neighbour).length : 0));
}

/** Arrow keys walk through every slot in reading order; leaving the outer row exits the equation. */
export function moveMathHorizontal(state: MathEditorState, direction: -1 | 1, extend = false): MathMove {
  if (extend) {
    const focus = state.selection.focus;
    const row = mathRowAt(state.equation.body, focus.path);
    const offset = focus.offset + direction;
    if (offset >= 0 && offset <= row.length) return { state: setMathSelection(state, state.selection.anchor, { path: focus.path, offset }) };
    if (!focus.path.length) return { state };
    const step = focus.path.at(-1)!;
    return { state: setMathSelection(state, state.selection.anchor, { path: focus.path.slice(0, -1), offset: step.index + (direction > 0 ? 1 : 0) }) };
  }
  if (!isMathCollapsed(state.selection)) {
    const range = mathSelectedRange(state.selection);
    return { state: setMathSelection(state, { path: range.path, offset: direction > 0 ? range.end : range.start }) };
  }
  const { path, offset } = state.selection.focus;
  const row = mathRowAt(state.equation.body, path);
  const caret = (target: MathPath, at: number): MathMove => ({ state: setMathSelection(state, { path: target, offset: at }) });
  if (direction > 0 && offset < row.length) {
    const next = row[offset]!;
    const slots = mathSlots(next);
    return slots.length ? caret([...path, { index: offset, slot: slots[0]! }], 0) : caret(path, offset + 1);
  }
  if (direction < 0 && offset > 0) {
    const previous = row[offset - 1]!;
    const slots = mathSlots(previous);
    if (!slots.length) return caret(path, offset - 1);
    const slot = slots.at(-1)!;
    return caret([...path, { index: offset - 1, slot }], mathSlot(previous, slot).length);
  }
  if (!path.length) return { state, exit: direction > 0 ? "after" : "before" };
  const { node, parent, step, slots } = structureAt(state, path);
  const neighbour = slots[slots.indexOf(step.slot) + direction];
  if (neighbour) return caret([...parent, { index: step.index, slot: neighbour }], direction > 0 ? 0 : mathSlot(node, neighbour).length);
  return caret(parent, step.index + (direction > 0 ? 1 : 0));
}

const VERTICAL: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  fraction: { num: "den" },
  script: { sup: "sub", base: "sub" },
  nary: { sup: "sub" },
  limit: { base: "limit" },
};

/** Up and down move between stacked slots; at the outer edge they leave the equation. */
export function moveMathVertical(state: MathEditorState, direction: -1 | 1): MathMove {
  const { path, offset } = state.selection.focus;
  const row = mathRowAt(state.equation.body, path);
  const ratio = row.length ? offset / row.length : 0;
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const step = path[depth]!;
    const parent = path.slice(0, depth);
    const node = mathRowAt(state.equation.body, parent)[step.index]!;
    let target: string | undefined;
    if (node.kind === "matrix") {
      const [, r, c] = /^r(\d+)c(\d+)$/.exec(step.slot)!;
      const nextRow = Number(r) + direction;
      if (nextRow >= 0 && nextRow < node.rows.length) target = `r${nextRow}c${c}`;
    } else {
      const pairs = VERTICAL[node.kind] ?? {};
      const below = pairs[step.slot];
      const above = Object.entries(pairs).find(([, value]) => value === step.slot)?.[0];
      target = direction > 0 ? below : above;
      if (node.kind === "limit" && node.position === "upper") target = direction > 0 ? above : below;
    }
    if (target && mathSlots(node).includes(target)) {
      const length = mathSlot(node, target).length;
      const caretPath = [...parent, { index: step.index, slot: target }];
      return { state: setMathSelection(state, { path: caretPath, offset: depth === path.length - 1 ? Math.round(ratio * length) : length }) };
    }
  }
  return { state, exit: direction > 0 ? "down" : "up" };
}

function allSlots(row: MathRow, path: MathPath, into: MathPath[]) {
  for (const [index, node] of row.entries())
    for (const slot of mathSlots(node)) {
      const slotPath = [...path, { index, slot }];
      into.push(slotPath);
      allSlots(mathSlot(node, slot), slotPath, into);
    }
  return into;
}

/** Tab moves to the next slot in reading order, so templates fill in without the mouse. */
export function moveMathSlot(state: MathEditorState, direction: -1 | 1): MathMove {
  const slots = allSlots(state.equation.body, [], [[]]);
  const current = slots.findIndex((path) => samePath(path, state.selection.focus.path));
  const target = slots[current + direction];
  if (!target || (direction < 0 && !target.length && current <= 0)) return { state, exit: direction > 0 ? "after" : "before" };
  const length = mathRowAt(state.equation.body, target).length;
  return { state: setMathSelection(state, { path: target, offset: direction > 0 ? 0 : length }, { path: target, offset: length }) };
}

export function moveMathToEdge(state: MathEditorState, edge: "start" | "end", extend = false): MathEditorState {
  const { path, offset } = state.selection.focus;
  const row = mathRowAt(state.equation.body, path);
  const atEdge = edge === "start" ? offset === 0 : offset === row.length;
  const target = atEdge || !path.length ? { path: [], offset: edge === "start" ? 0 : state.equation.body.length } : { path, offset: edge === "start" ? 0 : row.length };
  return setMathSelection(state, extend ? state.selection.anchor : target, target);
}

export function toggleMathNormalText(state: MathEditorState): MathEditorState {
  const { normalText, ...rest } = state;
  return normalText ? rest : { ...rest, normalText: true };
}

/**
 * Adopt an equation changed outside the editor, such as by undo or a collaborator. The caret
 * stays where it still exists; otherwise it moves to the end of the equation.
 */
export function rebaseMathEditor(state: MathEditorState, equation: MathEquation): MathEditorState {
  const valid = ({ path, offset }: MathPosition) => {
    try {
      return offset <= mathRowAt(equation.body, path).length;
    } catch {
      return false;
    }
  };
  const { typedSlot, ...rest } = state;
  if (!valid(state.selection.anchor) || !valid(state.selection.focus)) return { equation, selection: mathCaret([], equation.body.length) };
  return typedSlot && valid({ path: typedSlot, offset: 0 }) ? { ...state, equation } : { ...rest, equation };
}
