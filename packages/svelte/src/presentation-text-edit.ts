import { presentationTextCaret } from "./presentation-text-caret.ts";
import { presentationTextPosition } from "./presentation-text-position.ts";
import { PresentationTypingHistory } from "./presentation-typing-history.ts";
import { tick } from "svelte";
import type { PresentationTextRange } from "@tumblerjs/slides";
export interface SlideTextEditorOptions {
  active: boolean;
  initialText?: string;
  selection?: PresentationTextRange & { head?: number };
  keepCaretVisible?: boolean;
  revision?: object;
  focusToken?: number;
  paragraphs: readonly string[];
  point?: { x: number; y: number };
  onselect?: (range: PresentationTextRange, head?: number) => void;
  onreplace?: (range: PresentationTextRange, value: string, undoGroup?: string) => void;
  onfinish?: () => void;
  onundo?: (redo: boolean) => void;
  onnavigate?: (backward: boolean) => boolean;
  onvertical?: (direction: -1 | 1, x: number) => boolean;
  onindent?: (amount: -1 | 1) => boolean;
  onshortcut?: (key: "bold" | "italic" | "underline") => void;
}
/** The browser owns caret movement; document commands own text mutations. */
export function presentationTextEdit(
  node: HTMLElement,
  initial: SlideTextEditorOptions,
) {
  let options = initial,
    active = false,
    composing = false,
    range: PresentationTextRange = { start: 0, end: 0 },
    restorePending = false,
    head = 0;
  const history = new PresentationTypingHistory();
  const text = () => options.paragraphs.join("\n");
  function offset(container: Node, offset: number) {
    const ps = Array.from(
      node.querySelectorAll<HTMLElement>("[data-text-paragraph]"),
    );
    const p = ps.find((p) => p === container || p.contains(container));
    if (!p) return container === node && offset === 0 ? 0 : text().length;
    const i = ps.indexOf(p),
      r = document.createRange();
    r.selectNodeContents(p);
    r.setEnd(container, offset);
    const copy = r.cloneContents();
    copy.querySelectorAll("[data-bullet]").forEach((n) => n.remove());
    return (
      options.paragraphs.slice(0, i).reduce((n, s) => n + s.length + 1, 0) +
      Math.min(
        options.paragraphs[i]?.length ?? 0,
        copy.textContent?.length ?? 0,
      )
    );
  }
  function capture() {
    const s = window.getSelection();
    if (
      !active ||
      composing ||
      restorePending ||
      !s?.anchorNode ||
      !s.focusNode ||
      !node.contains(s.anchorNode) ||
      !node.contains(s.focusNode)
    )
      return;
    const a = offset(s.anchorNode, s.anchorOffset),
      b = offset(s.focusNode, s.focusOffset);
    // Native Home can place a DOM selection inside a non-editable bullet.
    const inBullet = (point: Node) => (point instanceof HTMLElement ? point : point.parentElement)?.closest('[data-bullet]');
    if (inBullet(s.anchorNode) || inBullet(s.focusNode)) {
      const anchor = locate(a), focus = locate(b);
      node.focus({preventScroll: true});
      s.setBaseAndExtent(anchor[0], anchor[1], focus[0], focus[1]);
    }
    const next = { start: Math.min(a, b), end: Math.max(a, b) };
    if (next.start !== range.start || next.end !== range.end || b !== head) {
      history.break();
      range = next;
      head = b;
      options.onselect?.(range, head);
      revealCaret();
    }
  }
  const locate = (position: number) => presentationTextPosition(node, options.paragraphs, position);
  function revealCaret() {
    if (!options.keepCaretVisible || document.activeElement !== node) return;
    const viewport = node.closest<HTMLElement>('.presentation-view');
    const selection = window.getSelection();
    if (!viewport || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(selection.focusNode === range.startContainer && selection.focusOffset === range.startOffset);
    const caret = presentationTextCaret(node, range);
    if (!caret) return;
    const bounds = viewport.getBoundingClientRect();
    const left = Math.min(caret.start.x, caret.end.x), right = Math.max(caret.start.x, caret.end.x);
    const top = Math.min(caret.start.y, caret.end.y), bottom = Math.max(caret.start.y, caret.end.y);
    const dx = left < bounds.left + 16 ? left - bounds.left - 16 : right > bounds.right - 16 ? right - bounds.right + 16 : 0;
    const dy = top < bounds.top + 16 ? top - bounds.top - 16 : bottom > bounds.bottom - 16 ? bottom - bounds.bottom + 16 : 0;
    viewport.scrollLeft += dx;
    viewport.scrollTop += dy;
  }
  function restore(restoredHead = range.end) {
    if (!active) return;
    node.focus({ preventScroll: true });
    const r = document.createRange(),
      a = locate(range.start),
      b = locate(range.end);
    r.setStart(...a);
    r.setEnd(...b);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    if (restoredHead === range.start && range.start !== range.end)
      s?.setBaseAndExtent(b[0], b[1], a[0], a[1]);
    head = restoredHead;
    options.onselect?.(range, head);
    revealCaret();
  }
  async function replace(value: string, target = range, kind = "") {
    const undoGroup = history.group(kind, target, value);
    options.onreplace?.(target, value, undoGroup);
    range = {
      start: target.start + value.length,
      end: target.start + value.length,
    };
    restorePending = true;
    await tick();
    restorePending = false;
    range = {
      start: Math.min(range.start, text().length),
      end: Math.min(range.end, text().length),
    };
    restore();
  }
  function before(event: InputEvent) {
    if (!active) { event.preventDefault(); return; }
    if (composing || event.isComposing) return;
    capture();
    const collapsed = range.start === range.end;
    const target = event.getTargetRanges?.()[0];
    if (
      target &&
      node.contains(target.startContainer) &&
      node.contains(target.endContainer)
    )
      range = {
        start: offset(target.startContainer, target.startOffset),
        end: offset(target.endContainer, target.endOffset),
      };
    event.preventDefault();
    if (
      event.inputType === "historyUndo" ||
      event.inputType === "historyRedo"
    ) {
      history.break();
      options.onundo?.(event.inputType === "historyRedo");
      return;
    }
    if (
      event.inputType === "insertText" ||
      event.inputType === "insertReplacementText"
    )
      void replace(event.data ?? "", range, collapsed ? event.inputType : "");
    else if (
      event.inputType === "insertParagraph" ||
      event.inputType === "insertLineBreak"
    )
      void replace("\n");
    else if (event.inputType.startsWith("delete")) {
      let target = range;
      if (target.start === target.end) {
        const value = text();
        const word = event.inputType.includes("Word");
        const boundaries = [
          0,
          ...Array.from(
            new Intl.Segmenter(undefined, {
              granularity: word ? "word" : "grapheme",
            }).segment(value),
            (s) => s.index + s.segment.length,
          ),
        ];
        target = event.inputType.endsWith("Backward")
          ? {
              start: boundaries.filter((n) => n < target.start).at(-1) ?? 0,
              end: target.end,
            }
          : {
              start: target.start,
              end: boundaries.find((n) => n > target.end) ?? value.length,
            };
      }
      void replace("", target, collapsed ? event.inputType : "");
    }
  }
  function paste(event: ClipboardEvent) {
    if (!active) return;
    event.preventDefault();
    capture();
    void replace(
      (event.clipboardData?.getData("text/plain") ?? "").replace(
        /\r\n?/g,
        "\n",
      ),
    );
  }
  function cut(event: ClipboardEvent) {
    if (!active) return;
    capture();
    if (range.start === range.end) return;
    event.preventDefault();
    event.clipboardData?.setData(
      "text/plain",
      text().slice(range.start, range.end),
    );
    void replace("");
  }
  function keydown(event: KeyboardEvent) {
    if (!active) return;
    capture();
    event.stopPropagation();
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Tab", "Escape"].includes(event.key) || event.ctrlKey || event.metaKey) history.break();
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") &&
      !event.shiftKey && !event.ctrlKey && !event.metaKey && options.onvertical) {
      capture();
      const selection = window.getSelection();
      if (range.start === range.end && selection?.rangeCount) {
        const caret = selection.getRangeAt(0).getClientRects()[0];
        const edge = (event.key === "ArrowUp" ? node.firstElementChild : node.lastElementChild)?.getBoundingClientRect();
        const boundary = caret && edge && (event.key === "ArrowUp"
          ? caret.top < edge.top + caret.height : caret.bottom > edge.bottom - caret.height);
        if (boundary && options.onvertical(event.key === "ArrowUp" ? -1 : 1, caret.left)) {
          event.preventDefault();
          return;
        }
      }
    }
    if (event.key === "Tab") {
      event.preventDefault();
      capture();
      if (options.onnavigate) options.onnavigate(event.shiftKey);
      else if (!options.onindent?.(event.shiftKey ? -1 : 1) && !event.shiftKey) void replace("\t");
      return;
    }
    if (
      event.key === "Escape" ||
      (event.key === "Enter" && (event.ctrlKey || event.metaKey))
    ) {
      event.preventDefault();
      options.onfinish?.();
    } else if (
      (event.ctrlKey || event.metaKey) &&
      ["b", "i", "u"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      options.onshortcut?.(
        event.key.toLowerCase() === "b"
          ? "bold"
          : event.key.toLowerCase() === "i"
            ? "italic"
            : "underline",
      );
    } else if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey && ["z", "y"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      options.onundo?.(event.key.toLowerCase() === "y" || event.shiftKey);
    }
  }
  function compositionStart() {
    capture();
    composing = true;
  }
  function compositionEnd() {
    composing = false;
    const previous = text();
    const current = Array.from(node.querySelectorAll("[data-text-paragraph]"))
      .map((p) => {
        const c = p.cloneNode(true) as HTMLElement;
        c.querySelectorAll("[data-bullet]").forEach((n) => n.remove());
        return c.textContent ?? "";
      })
      .join("\n");
    let start = 0,
      end = previous.length,
      tail = current.length;
    while (start < end && start < tail && previous[start] === current[start])
      start++;
    while (
      end > start &&
      tail > start &&
      previous[end - 1] === current[tail - 1]
    ) {
      end--;
      tail--;
    }
    const boundaries = [
      0,
      ...Array.from(
        new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
          previous,
        ),
        (s) => s.index + s.segment.length,
      ),
    ];
    start = boundaries.filter((n) => n <= start).at(-1) ?? 0;
    const expandedEnd = boundaries.find((n) => n >= end) ?? previous.length;
    tail += expandedEnd - end;
    end = expandedEnd;
    void replace(current.slice(start, tail), { start, end });
  }
  function pointer(event: PointerEvent) {
    history.break();
    if (active) event.stopPropagation();
  }
  function doubleClick(event: MouseEvent) {
    if (!active) return;
    const caret = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (!caret || !node.contains(caret.startContainer)) return;
    const index = offset(caret.startContainer, caret.startOffset);
    const word = Array.from(new Intl.Segmenter(undefined, {granularity: "word"}).segment(text()))
      .find(part => index >= part.index && index < part.index + part.segment.length);
    if (!word) return;
    event.preventDefault();
    event.stopPropagation();
    range = {start: word.index, end: word.index + word.segment.length};
    restore();
  }
  function drop(event: DragEvent) {
    if (active) event.preventDefault();
  }
  document.addEventListener("selectionchange", capture);
  node.addEventListener("beforeinput", before);
  const blur = () => history.break();
  node.addEventListener("blur", blur);
  node.addEventListener("paste", paste);
  node.addEventListener("cut", cut);
  node.addEventListener("keydown", keydown);
  node.addEventListener("compositionstart", compositionStart);
  node.addEventListener("compositionend", compositionEnd);
  node.addEventListener("pointerdown", pointer);
  node.addEventListener("dblclick", doubleClick);
  node.addEventListener("drop", drop);
  function clearSelection() {
    const selection = window.getSelection();
    if (selection?.anchorNode && node.contains(selection.anchorNode))
      selection.removeAllRanges();
    if (document.activeElement === node) node.blur();
  }
  async function update(next: SlideTextEditorOptions) {
    const entering = next.active && !active;
    const leaving = active && !next.active;
    const revised = next.revision !== options.revision;
    const refocus = next.focusToken !== options.focusToken;
    const requested = next.selection !== options.selection ? next.selection : undefined;
    const focused = document.activeElement === node;
    const changed =
      options.paragraphs.join("\n") !== next.paragraphs.join("\n");
    options = next;
    active = next.active;
    if (leaving || entering) history.break();
    if (leaving) clearSelection();
    if (entering) {
      await tick();
      if (!active) return;
      node.focus({ preventScroll: true });
      if (options.selection) {
        range = { start: Math.min(options.selection.start, text().length), end: Math.min(options.selection.end, text().length) };
        restore(Math.min(options.selection.head ?? range.end, text().length));
        return;
      }
      if (options.initialText !== undefined) {
        range = { start: 0, end: text().length };
        await replace(options.initialText);
        return;
      }
      const point = options.point;
      const caret = point
        ? document.caretRangeFromPoint?.(point.x, point.y)
        : null;
      if (caret && node.contains(caret.startContainer)) {
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(caret);
        capture();
        revealCaret();
      } else {
        range = { start: 0, end: text().length };
        restore();
      }
    } else if (
      active &&
      ((focused && revised) || refocus || requested) &&
      !restorePending &&
      !composing
    ) {
      await tick();
      if (requested && requested !== options.selection) return;
      if (requested) range = {start: requested.start, end: requested.end};
      if (changed || requested) {
        range = {
          start: Math.min(range.start, text().length),
          end: Math.min(range.end, text().length),
        };
      }
      restore(requested ? Math.min(requested.head ?? range.end, text().length) : range.end);
    }
  }
  void update(initial);
  return {
    update,
    destroy() {
      active = false;
      clearSelection();
      document.removeEventListener("selectionchange", capture);
      node.removeEventListener("beforeinput", before);
      node.removeEventListener("blur", blur);
      node.removeEventListener("paste", paste);
      node.removeEventListener("cut", cut);
      node.removeEventListener("keydown", keydown);
      node.removeEventListener("compositionstart", compositionStart);
      node.removeEventListener("compositionend", compositionEnd);
      node.removeEventListener("pointerdown", pointer);
      node.removeEventListener("dblclick", doubleClick);
      node.removeEventListener("drop", drop);
    },
  };
}
