import { readLatexClass } from "./latex-flow";
import { latexLineSpacing } from "./latex-format";
import type { LatexPageLayout } from "./latex-layout";
import { latexLength } from "./latex-lengths";
import { readLatexTextMacros } from "./latex-macros";
import type { LatexTitleField } from "./latex-metadata";
import { latexFontSize } from "./latex-presentation";
import { latexCustomTitlePage } from "./latex-state-command";
import { commandEnd, groupAt, lineEnd } from "./latex-syntax";
import { texPoint } from "./latex-typography";

export type LatexTitleStyle = Readonly<{
  /** Font size in CSS pixels. */
  size: number;
  family: "roman" | "sans" | "mono";
  bold: boolean;
  italic: boolean;
  smallCaps: boolean;
}>;

/** Printed text, or a title field whose current value the editor supplies and edits in place. */
export type LatexTitleRun =
  | { kind: "text"; text: string; style: LatexTitleStyle }
  | { kind: "field"; field: LatexTitleField; style: LatexTitleStyle };

/**
 * Vertical material in TeX order. Skips with an infinite `stretch` order share the space left in
 * their box, as `\vfil` and `\vfill` do; only the highest order present receives it.
 */
export type LatexTitleBlock =
  | {
      kind: "paragraph";
      align: "justify" | "center" | "left" | "right";
      /** Baseline-to-baseline distance in CSS pixels at the end of the paragraph. */
      leading: number;
      lines: LatexTitleRun[][];
    }
  | { kind: "skip"; height: number; stretch: 0 | 1 | 2 | 3 }
  | { kind: "box"; height?: number; blocks: LatexTitleBlock[] };

type State = {
  style: LatexTitleStyle;
  baseline: number;
  stretch: number;
  pendingStretch: number;
  align: "justify" | "center" | "left" | "right";
};
type Frame = { state: State; box?: LatexTitleBlock & { kind: "box" }; environment?: string };

const titleFields: readonly LatexTitleField[] = ["title", "author", "date", "submitdate"];
const ignored = new Set([
  "relax",
  "newpage",
  "clearpage",
  "cleardoublepage",
  "noindent",
  "indent",
  "null",
  "nobreak",
  "makeatletter",
  "makeatother",
  "protect",
  "leavevmode",
]);
const ignoredWithArgument = new Map([
  ["thispagestyle", 1],
  ["pagestyle", 1],
  ["setcounter", 2],
]);
type Align = State["align"];
const families = new Map<string, LatexTitleStyle["family"]>([
  ["rmfamily", "roman"],
  ["sffamily", "sans"],
  ["ttfamily", "mono"],
]);
const oldStyles = new Map<string, Partial<LatexTitleStyle>>([
  ["rm", { family: "roman" }],
  ["sf", { family: "sans" }],
  ["tt", { family: "mono" }],
  ["bf", { bold: true }],
  ["it", { italic: true }],
  ["sl", { italic: true }],
  ["sc", { smallCaps: true }],
]);
const series = new Map<string, Partial<LatexTitleStyle>>([
  ["bfseries", { bold: true }],
  ["mdseries", { bold: false }],
  ["itshape", { italic: true }],
  ["slshape", { italic: true }],
  ["upshape", { italic: false, smallCaps: false }],
  ["scshape", { smallCaps: true }],
]);
const textCommands = new Map<string, string>([
  ["textbf", "\\bfseries"],
  ["textmd", "\\mdseries"],
  ["textit", "\\itshape"],
  ["textsl", "\\slshape"],
  ["textup", "\\upshape"],
  ["textsc", "\\scshape"],
  ["textrm", "\\rmfamily"],
  ["textsf", "\\sffamily"],
  ["texttt", "\\ttfamily"],
  ["textnormal", "\\normalfont"],
  ["emph", "\\em"],
]);
const alignments = new Map<string, Align>([
  ["centering", "center"],
  ["raggedright", "left"],
  ["raggedleft", "right"],
]);
const environments = new Map<string, Align>([
  ["center", "center"],
  ["flushleft", "left"],
  ["flushright", "right"],
]);
const symbols = new Map([
  ["&", "&"],
  ["%", "%"],
  ["$", "$"],
  ["#", "#"],
  ["_", "_"],
  ["{", "{"],
  ["}", "}"],
  [" ", " "],
  [",", " "],
  ["textbackslash", "\\"],
  ["quad", " "],
  ["qquad", "  "],
  ["TeX", "TeX"],
  ["LaTeX", "LaTeX"],
  ["ldots", "…"],
  ["dots", "…"],
]);
const namedSkips = new Map([
  ["smallskip", 3],
  ["medskip", 6],
  ["bigskip", 12],
]);
const fills = new Map<string, 1 | 2>([
  ["vfil", 1],
  ["vss", 1],
  ["vfill", 2],
]);

/**
 * Interpret a class-defined `\maketitle` that sets its own title page, so the page can be shown
 * and edited as text. Field macros such as `\@title` become editable runs. Returns undefined
 * when the definition uses TeX this interpreter does not model; the caller then typesets it.
 */
export function interpretLatexTitlePage(prefix: string, layout: LatexPageLayout) {
  const macros = readLatexTextMacros(prefix);
  if (!latexCustomTitlePage(prefix, macros)) return;
  const { options } = readLatexClass(prefix);
  const points = options.includes("12pt") ? 12 : options.includes("11pt") ? 11 : 10;
  const normalSize = layout.fontSize;
  const textHeight = layout.height - layout.top - layout.bottom;
  const normal: LatexTitleStyle = {
    size: normalSize,
    family: "roman",
    bold: false,
    italic: false,
    smallCaps: false,
  };
  const initialStretch = latexLineSpacing(prefix, points).stretch;
  let state: State = {
    style: normal,
    baseline: layout.leading,
    stretch: initialStretch,
    pendingStretch: initialStretch,
    align: "justify",
  };
  const page: LatexTitleBlock & { kind: "box" } = { kind: "box", blocks: [] };
  const frames: Frame[] = [];
  let box = page;
  let lines: LatexTitleRun[][] | undefined;
  let source = "\\maketitle";
  let budget = 4096;

  const selectFont = () => {
    state = { ...state, stretch: state.pendingStretch };
  };
  const quad = () => state.style.size;
  /** TeX trims glue at line ends; an empty paragraph leaves nothing on the page. */
  const endParagraph = () => {
    if (!lines) return;
    const trimmed = lines.map(trimLine);
    lines = undefined;
    if (!trimmed.some((line) => line.length)) return;
    box.blocks.push({
      kind: "paragraph",
      align: state.align,
      leading: state.baseline * state.stretch,
      lines: trimmed,
    });
  };
  const startParagraph = () => {
    if (lines) return lines;
    // TeX adds \parskip before every paragraph except the first in an internal vertical list.
    if (box.blocks.length && layout.paragraphSpacing)
      box.blocks.push({ kind: "skip", height: layout.paragraphSpacing, stretch: 0 });
    return (lines = [[]]);
  };
  const append = (run: LatexTitleRun) => {
    const line = startParagraph().at(-1)!;
    const last = line.at(-1);
    if (run.kind === "text" && last?.kind === "text" && sameStyle(last.style, run.style))
      line[line.length - 1] = { ...last, text: last.text + run.text };
    else line.push(run);
  };
  const skip = (height: number, stretch: 0 | 1 | 2 | 3 = 0) => {
    endParagraph();
    box.blocks.push({ kind: "skip", height, stretch });
  };
  const open = (frame: Omit<Frame, "state"> = {}) => frames.push({ state, ...frame });
  const close = (environment?: string) => {
    const frame = frames.pop();
    if (!frame || frame.environment !== environment) return false;
    if (frame.box) {
      endParagraph();
      box = frames.findLast((entry) => entry.box)?.box ?? page;
      box.blocks.push(frame.box);
    }
    state = frame.state;
    return true;
  };
  const splice = (from: number, to: number, replacement: string) => {
    source = source.slice(0, from) + replacement + source.slice(to);
    return source.length <= 65536;
  };

  for (let position = 0; position < source.length;) {
    if (--budget < 0) return;
    const character = source[position]!;
    if (character === "%") {
      position = lineEnd(source, position) + 1;
      continue;
    }
    if (/\s/.test(character)) {
      const end = spaceEnd(source, position);
      // A blank line ends the paragraph. Other spaces print once, and only within a paragraph.
      if (/\n[ \t]*\n/.test(source.slice(position, end))) endParagraph();
      else if (lines) append({ kind: "text", text: " ", style: state.style });
      position = end;
      continue;
    }
    if (character === "{") {
      open();
      position++;
      continue;
    }
    if (character === "}") {
      if (!close()) return;
      position++;
      continue;
    }
    if (character !== "\\") {
      const end = /[\\{}%$&#^_\s]/g;
      end.lastIndex = position;
      const next = end.exec(source)?.index ?? source.length;
      if (next === position) return;
      append({ kind: "text", text: printable(source.slice(position, next)), style: state.style });
      position = next;
      continue;
    }

    const end = commandEnd(source, position);
    const command = source.slice(position + 1, end);
    const after = /^[A-Za-z@]/.test(command) ? controlWordEnd(source, end) : end;
    const argument = (at = after) => groupAt(source, at);
    const field = titleFields.find((name) => command === "@" + name);
    const macro = macros.get(command);
    const selected = latexFontSize(command, normalSize);
    if (field) {
      append({ kind: "field", field, style: state.style });
      position = after;
    } else if (command === "begin" || command === "end") {
      const group = argument();
      if (!group) return;
      const name = source.slice(group.from, group.to).trim();
      const definition = macros.get(command === "begin" ? name : "end" + name);
      if (command === "begin") {
        const align = environments.get(name);
        if (align) endParagraph();
        open({ environment: name });
        if (align) state = { ...state, align };
        if (definition && (definition.count || definition.optional !== undefined)) return;
        if (!splice(position, group.end, definition?.replacement ?? "")) return;
        continue;
      }
      if (definition?.count) return;
      // The environment's end code runs inside its group, before the group closes.
      if (!splice(position, group.end, (definition?.replacement ?? "") + "\\@close{" + name + "}"))
        return;
      continue;
    } else if (command === "@close") {
      const group = argument()!;
      if (environments.has(source.slice(group.from, group.to))) endParagraph();
      if (!close(source.slice(group.from, group.to))) return;
      position = group.end;
    } else if (macro) {
      if (macro.count || macro.optional !== undefined) return;
      if (!splice(position, after, macro.replacement)) return;
      continue;
    } else if (selected) {
      state = {
        ...state,
        style: { ...state.style, size: selected.size },
        baseline: selected.leading,
      };
      selectFont();
      position = after;
    } else if (command === "normalfont") {
      state = { ...state, style: { ...normal, size: state.style.size } };
      position = after;
    } else if (oldStyles.has(command)) {
      state = { ...state, style: { ...normal, size: state.style.size, ...oldStyles.get(command) } };
      position = after;
    } else if (series.has(command) || families.has(command)) {
      const family = families.get(command);
      state = {
        ...state,
        style: { ...state.style, ...series.get(command), ...(family && { family }) },
      };
      position = after;
    } else if (command === "em") {
      state = { ...state, style: { ...state.style, italic: !state.style.italic } };
      position = after;
    } else if (textCommands.has(command)) {
      const group = argument();
      if (!group) return;
      if (
        !splice(
          position,
          group.end,
          `{${textCommands.get(command)} ${source.slice(group.from, group.to)}}`,
        )
      )
        return;
      continue;
    } else if (alignments.has(command)) {
      state = { ...state, align: alignments.get(command)! };
      position = after;
    } else if (command === "linespread") {
      const group = argument();
      const factor = group && Number(source.slice(group.from, group.to));
      if (!group || !factor || factor <= 0) return;
      state = { ...state, pendingStretch: factor };
      position = group.end;
    } else if (command === "selectfont") {
      selectFont();
      position = after;
    } else if (command === "par") {
      endParagraph();
      position = after;
    } else if (command === "\\" || command === "linebreak" || command === "newline") {
      let next = command === "\\" && source[after] === "*" ? after + 1 : after;
      // Extra space after a line is not modelled yet; the compiler sets those pages.
      if (command === "\\" && source[skipSpaces(source, next)] === "[") return;
      // \\ in vertical mode is an error in TeX. Here it has nothing to break.
      lines?.push([]);
      position = next;
    } else if (command === "vskip" || command === "kern") {
      const read = readGlue(source, after, quad(), textHeight);
      if (!read) return;
      // A horizontal kern has no vertical extent.
      if (command === "vskip" || !lines) skip(read.height, read.stretch);
      position = read.end;
    } else if (command === "vspace") {
      const starred = source[after] === "*";
      const group = argument(skipSpaces(source, after + Number(starred)));
      if (!group) return;
      const value = source.slice(group.from, group.to).trim();
      const fill = value === "\\fill" || /^\\stretch\s*\{[^{}]*\}$/.test(value);
      const height = fill ? 0 : dimension(value, quad(), textHeight);
      if (height === undefined) return;
      skip(height, fill ? 2 : 0);
      position = group.end;
    } else if (namedSkips.has(command)) {
      skip(namedSkips.get(command)! * texPoint);
      position = after;
    } else if (fills.has(command)) {
      skip(0, fills.get(command)!);
      position = after;
    } else if (command === "vbox") {
      if (lines) return;
      let next = skipSpaces(source, after);
      let height: number | undefined;
      if (source.startsWith("to", next)) {
        const read = readGlue(source, skipSpaces(source, next + 2), quad(), textHeight);
        if (!read || read.stretch) return;
        height = read.height;
        next = skipSpaces(source, read.end);
      }
      if (source[next] === "{") next++;
      else if (source.startsWith("\\bgroup", next)) next = controlWordEnd(source, next + 7);
      else return;
      open({ box: { kind: "box", ...(height !== undefined && { height }), blocks: [] } });
      box = frames.at(-1)!.box!;
      position = next;
    } else if (command === "bgroup" || command === "begingroup") {
      open();
      position = after;
    } else if (command === "egroup" || command === "endgroup") {
      if (!close()) return;
      position = after;
    } else if (ignored.has(command)) {
      position = after;
    } else if (ignoredWithArgument.has(command)) {
      let next = after;
      for (let index = 0; index < ignoredWithArgument.get(command)!; index++) {
        const group = argument(skipSpaces(source, next));
        if (!group) return;
        next = group.end;
      }
      position = next;
    } else if (symbols.has(command)) {
      append({ kind: "text", text: symbols.get(command)!, style: state.style });
      position = command === " " ? end : after;
    } else return;
  }
  endParagraph();
  if (frames.length) return;
  return page.blocks;
}

function sameStyle(left: LatexTitleStyle, right: LatexTitleStyle) {
  return (
    left.size === right.size &&
    left.family === right.family &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.smallCaps === right.smallCaps
  );
}

function trimLine(line: LatexTitleRun[]) {
  const runs = line.map((run) => ({ ...run }));
  const first = runs[0];
  if (first?.kind === "text") first.text = first.text.trimStart();
  const last = runs.at(-1);
  if (last?.kind === "text") last.text = last.text.trimEnd();
  return runs.filter((run) => run.kind === "field" || run.text);
}

function printable(text: string) {
  return text
    .replace(/~/g, " ")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/``/g, "“")
    .replace(/''/g, "”")
    .replace(/`/g, "‘")
    .replace(/'/g, "’");
}

function skipSpaces(source: string, position: number) {
  while (source[position] === " " || source[position] === "\t") position++;
  return position;
}

/** TeX skips spaces after a control word, including one line end, but not a blank line. */
function controlWordEnd(source: string, position: number) {
  const next = skipSpaces(source, position);
  return source[next] === "\n" && !/^\n[ \t]*\n/.test(source.slice(next))
    ? skipSpaces(source, next + 1)
    : next;
}

function spaceEnd(source: string, position: number) {
  while (/\s/.test(source[position] ?? "")) position++;
  return position;
}

function dimension(value: string, quad: number, textHeight?: number) {
  const relative = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)\s*\\(?:textheight|vsize)$/.exec(value.trim());
  if (relative) return textHeight === undefined ? undefined : Number(relative[1] || 1) * textHeight;
  return latexLength(value, quad, quad * 0.430555);
}

const number = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const length = String.raw`(?:${number}\s*(?:in|cm|mm|pt|bp|pc|sp|dd|cc|em|ex)|(?:${number})?\s*\\(?:textheight|vsize))`;
const glue = new RegExp(
  String.raw`(${length})(?:\s+plus\s+(?:${number}\s*(fil{1,3})\b|${length}))?(?:\s+minus\s+${length})?`,
  "y",
);

/** Read TeX glue after a primitive such as `\vskip`, keeping its natural size and fill order. */
function readGlue(source: string, position: number, quad: number, textHeight: number) {
  glue.lastIndex = position;
  const match = glue.exec(source);
  if (!match) return;
  const height = dimension(match[1]!, quad, textHeight);
  if (height === undefined) return;
  const stretch = match[2] === "fil" ? 1 : match[2] === "fill" ? 2 : match[2] === "filll" ? 3 : 0;
  return { height, stretch, end: controlWordEnd(source, glue.lastIndex) } as const;
}
