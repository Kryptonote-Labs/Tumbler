import { tick } from "svelte";
import type { PresentationTextRange } from "@tumblerjs/slides";
export interface SlideTextEditorOptions {
  active: boolean;
  revision?: object;
  focusToken?: number;
  paragraphs: readonly string[];
  point?: { x: number; y: number };
  onselect?: (range: PresentationTextRange) => void;
  onreplace?: (range: PresentationTextRange, value: string) => void;
  onfinish?: () => void;
  onundo?: (redo: boolean) => void;
  onnavigate?: (backward: boolean) => boolean;
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
    restorePending = false;
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
    const next = { start: Math.min(a, b), end: Math.max(a, b) };
    if (next.start !== range.start || next.end !== range.end) {
      range = next;
      options.onselect?.(range);
    }
  }
  function locate(position: number): [Node, number] {
    const ps = Array.from(
      node.querySelectorAll<HTMLElement>("[data-text-paragraph]"),
    );
    let base = 0;
    for (let i = 0; i < ps.length; i++) {
      const length = options.paragraphs[i]?.length ?? 0;
      if (position <= base + length || i === ps.length - 1) {
        const p = ps[i]!;
        let left = Math.max(0, Math.min(length, position - base));
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, {
          acceptNode(n) {
            return n.parentElement?.closest("[data-bullet]")
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT;
          },
        });
        let n = walker.nextNode();
        while (n) {
          if (left <= n.textContent!.length) return [n, left];
          left -= n.textContent!.length;
          n = walker.nextNode();
        }
        return [p, p.childNodes.length];
      }
      base += length + 1;
    }
    return [node, 0];
  }
  function restore() {
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
    options.onselect?.(range);
  }
  async function replace(value: string, target = range) {
    options.onreplace?.(target, value);
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
    if (!active || composing || event.isComposing) return;
    capture();
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
      options.onundo?.(event.inputType === "historyRedo");
      return;
    }
    if (
      event.inputType === "insertText" ||
      event.inputType === "insertReplacementText"
    )
      void replace(event.data ?? "");
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
      void replace("", target);
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
    event.stopPropagation();
    if (event.key === "Tab" && options.onnavigate?.(event.shiftKey)) {
      event.preventDefault();
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
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();
      options.onundo?.(event.shiftKey);
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
    if (active) event.stopPropagation();
  }
  function drop(event: DragEvent) {
    if (active) event.preventDefault();
  }
  document.addEventListener("selectionchange", capture);
  node.addEventListener("beforeinput", before);
  node.addEventListener("paste", paste);
  node.addEventListener("cut", cut);
  node.addEventListener("keydown", keydown);
  node.addEventListener("compositionstart", compositionStart);
  node.addEventListener("compositionend", compositionEnd);
  node.addEventListener("pointerdown", pointer);
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
    const focused = document.activeElement === node;
    const changed =
      options.paragraphs.join("\n") !== next.paragraphs.join("\n");
    options = next;
    active = next.active;
    if (leaving) clearSelection();
    if (entering) {
      await tick();
      if (!active) return;
      node.focus({ preventScroll: true });
      const point = options.point;
      const caret = point
        ? document.caretRangeFromPoint?.(point.x, point.y)
        : null;
      if (caret && node.contains(caret.startContainer)) {
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(caret);
        capture();
      } else {
        range = { start: 0, end: text().length };
        restore();
      }
    } else if (
      active &&
      ((focused && revised) || refocus) &&
      !restorePending &&
      !composing
    ) {
      await tick();
      if (changed) {
        range = {
          start: Math.min(range.start, text().length),
          end: Math.min(range.end, text().length),
        };
      }
      restore();
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
      node.removeEventListener("paste", paste);
      node.removeEventListener("cut", cut);
      node.removeEventListener("keydown", keydown);
      node.removeEventListener("compositionstart", compositionStart);
      node.removeEventListener("compositionend", compositionEnd);
      node.removeEventListener("pointerdown", pointer);
      node.removeEventListener("drop", drop);
    },
  };
}
