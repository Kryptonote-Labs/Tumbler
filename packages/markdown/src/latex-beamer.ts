import { environmentAt, groupAt, latexCommands, whitespaceEnd } from './latex-syntax';

type OverlayRange = { from: number; through?: number };
type ProjectedEdit = { from: number; to: number; source: string; ranges?: OverlayRange[] };

function overlay(source: string, at: number) {
  const group = groupAt(source, at, '<', '>');
  if (!group) return;
  const ranges: OverlayRange[] = [];
  for (const part of source.slice(group.from, group.to).split(',')) {
    const match = /^(\d+)(\s*-\s*(\d*))?$/.exec(part.trim());
    if (!match) return;
    const from = Number(match[1]);
    const through = match[2] === undefined ? from : match[3] ? Number(match[3]) : undefined;
    if (
      !Number.isSafeInteger(from) ||
      from < 1 ||
      (through !== undefined && (!Number.isSafeInteger(through) || through < from))
    )
      return;
    ranges.push({ from, through });
  }
  return { ranges, end: group.end };
}

const visible = (ranges: readonly OverlayRange[], step: number) =>
  ranges.some(({ from, through }) => from <= step && (through === undefined || step <= through));

/** Read one authored frame and project the pages emitted by its numeric overlays. */
export function readLatexBeamerFrame(source: string) {
  const frame = environmentAt(source, whitespaceEnd(source, 0));
  if (frame?.name !== 'frame' || source.slice(frame.end).trim()) return;
  let start = whitespaceEnd(source, frame.from);
  const selection = overlay(source, start);
  if (source[start] === '<' && !selection) return;
  if (selection) start = whitespaceEnd(source, selection.end);
  const options = groupAt(source, start, '[', ']');
  const aligned = options && /(?:^|,)\s*t\s*(?:,|$)/.test(source.slice(options.from, options.to));
  if (options) start = whitespaceEnd(source, options.end);
  const title = groupAt(source, start);
  if (title) start = whitespaceEnd(source, title.end);
  const subtitle = title && groupAt(source, start);
  if (subtitle) start = whitespaceEnd(source, subtitle.end);
  const body = source.slice(start, frame.to);
  const edits: ProjectedEdit[] = [];
  const items: OverlayRange[][] = [];
  let highest = 1;
  const setExtent = (ranges: readonly OverlayRange[]) => {
    for (const range of ranges) highest = Math.max(highest, range.from, range.through ?? 0);
  };
  if (selection) setExtent(selection.ranges);
  let erasedUntil = 0;
  for (const command of latexCommands(body)) {
    if (command.start < erasedUntil) continue;
    if (command.name !== 'item' && command.name !== 'only') continue;
    const at = whitespaceEnd(body, command.end);
    const spec = overlay(body, at);
    if (body[at] === '<' && !spec) return;
    if (command.name === 'item') {
      items.push(spec?.ranges ?? [{ from: 1 }]);
      if (spec) edits.push({ from: at, to: spec.end, source: ' ' });
    } else if (spec) {
      const group = groupAt(body, whitespaceEnd(body, spec.end));
      if (!group) return;
      edits.push({
        from: command.start,
        to: group.end,
        source: body.slice(group.from, group.to),
        ranges: spec.ranges,
      });
      erasedUntil = group.end;
    }
    if (spec) setExtent(spec.ranges);
  }
  const titlePage = body.trim() === '\\titlepage' || body.trim() === '\\maketitle';
  const overlays = [];
  for (let step = 1; step <= highest; step++) {
    if (selection && !visible(selection.ranges, step)) continue;
    let previous = 0;
    let output = '';
    for (const edit of edits) {
      output += body.slice(previous, edit.from);
      if (!edit.ranges || visible(edit.ranges, step)) output += edit.source;
      previous = edit.to;
    }
    overlays.push({
      step,
      body: output + body.slice(previous),
      hiddenItems: items.flatMap((range, index) => (visible(range, step) ? [] : [index])),
    });
  }
  return {
    title: title ? source.slice(title.from, title.to) : '',
    subtitle: subtitle ? source.slice(subtitle.from, subtitle.to) : '',
    titlePage,
    topAligned: !!aligned,
    overlays,
  };
}
