import { latexLength } from './latex-lengths';
import { commandEnd, groupAt, whitespaceEnd } from "./latex-syntax";

const counterNames = ["arabic", "alph", "Alph", "roman", "Roman"] as const;
const counters = new Set<string>(counterNames);
type Counter = (typeof counterNames)[number];
type Label = { before: string; counter: Counter; after: string; bold?: true };

/** An enumitem label expressible as ordinary text around the current item's counter. */
function listLabel(value: string): Label | undefined {
  const bold = /^\\textbf\s*/.exec(value);
  const outer = groupAt(value, bold?.[0].length ?? 0);
  if (bold && outer?.end !== value.length) return;
  if (outer?.end === value.length) value = value.slice(outer.from, outer.to);
  const slash = value.indexOf("\\");
  if (slash < 0) return;
  const end = commandEnd(value, slash);
  const counter = value.slice(slash + 1, end) as Counter;
  if (!counters.has(counter) || value[end] !== "*") return;
  const before = value.slice(0, slash);
  const after = value.slice(end + 1);
  if (/[\\{}%$#&_^~\u0000-\u001f]/.test(before + after)) return;
  return { before, counter, after, ...(bold && { bold: true }) };
}

/** Parse the list-local enumitem options represented by an editable ordered list. */
export function readLatexEnumitem(source: string) {
  let start: number | undefined;
  let label: Label | undefined;
  let leftMargin: string | undefined;
  let itemSeparation: string | undefined;
  let tight: "all" | "items" | undefined;
  for (let i = 0; i <= source.length;) {
    let end = i;
    while (end < source.length && source[end] !== ",") {
      const group = groupAt(source, end);
      end = group?.end ?? end + 1;
    }
    const option = source.slice(i, end).trim();
    if (option === "nosep") tight = "all";
    else if (option === "noitemsep") tight ??= "items";
    else if (option) {
      const equals = option.indexOf("=");
      if (equals < 0) return;
      const name = option.slice(0, equals).trim();
      const value = option.slice(equals + 1).trim();
      if (name === "label") {
        label = listLabel(value);
        if (!label) return;
      } else if (name === "start" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
        start = Number(value);
      } else if (name === 'leftmargin' && latexLength(value, 1) !== undefined) {
        leftMargin = value;
      } else if (name === 'itemsep' && latexLength(value, 1) !== undefined) {
        itemSeparation = value;
      } else return;
    }
    i = end + 1;
  }
  return {
    start, label, tight,
    ...(leftMargin !== undefined && { leftMargin }),
    ...(itemSeparation !== undefined && { itemSeparation }),
  };
}

export function latexListOptions(open: string) {
  const end = commandEnd(open, 0);
  const environment = groupAt(open, whitespaceEnd(open, end));
  const options = environment && groupAt(open, whitespaceEnd(open, environment.end), "[", "]");
  return options && readLatexEnumitem(open.slice(options.from, options.to));
}

export function latexItemLabel(open: string) {
  const end = commandEnd(open, 0);
  if (open.slice(0, end) !== '\\item') return;
  const label = groupAt(open, whitespaceEnd(open, end), '[', ']');
  if (label) return open.slice(label.from, label.to);
}
