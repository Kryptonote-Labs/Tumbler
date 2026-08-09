import { beginLosslessXmlEdit, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { beginPackageTransaction, openOpcPackage } from "@tumblerjs/opc";
import { openWordDocument, WordError, type WordDocument, type WordParagraph } from "./document.ts";
import { wordParagraphText, wordParagraphTextSegments, type WordParagraphTextSegment, type WordTextSelection } from "./text.ts";

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const MAX_INSERTED_TEXT = 1_000_000;

/** Replaces visible logical text inside one paragraph while preserving surrounding OOXML wrappers. */
export function replaceWordText(document: WordDocument, selection: WordTextSelection, value: string): Uint8Array {
  if (value.length > MAX_INSERTED_TEXT) throw new RangeError(`Inserted text cannot exceed ${MAX_INSERTED_TEXT} UTF-16 code units.`);
  if (value.includes("\r") || value.includes("\n")) {
    throw new WordError("invalid_document", "Paragraph text replacement cannot contain a paragraph or line break.");
  }
  if (selection.anchor.paragraphElementId !== selection.focus.paragraphElementId) {
    throw new WordError("invalid_document", "This text-editing slice requires a selection inside one paragraph.");
  }
  const paragraph = findParagraph(document, selection.anchor.paragraphElementId);
  const text = wordParagraphText(document, paragraph);
  const start = Math.min(selection.anchor.offset, selection.focus.offset);
  const end = Math.max(selection.anchor.offset, selection.focus.offset);
  validateOffset(text, start);
  validateOffset(text, end);
  if (text.slice(start, end) === value) return document.bytes();
  if (start === end && value.length === 0) return document.bytes();
  const segments = wordParagraphTextSegments(document, paragraph);
  const selected = segments.filter((segment) => segment.end > start && segment.start < end);
  const editor = beginLosslessXmlEdit(document.source);

  if (selected.length === 0) {
    const target = insertionTarget(segments, start, selection.focus.affinity ?? "after");
    if (target === undefined) appendTextRun(editor, document, paragraph, value);
    else if (target.kind === "text") replaceTextElement(editor, document, target, insertInto(target, start, value));
    else insertRunBesideControl(editor, document, target, value, selection.focus.affinity ?? "after");
  } else {
    const selectedText = selected.filter((segment) => segment.kind === "text");
    if (selectedText.length === 0) {
      for (const segment of selected) removeSegment(editor, document, segment);
      const target = insertionTarget(segments.filter((segment) => !selected.includes(segment)), start, "after");
      if (target?.kind === "text") replaceTextElement(editor, document, target, insertInto(target, start, value));
      else if (target !== undefined) insertRunBesideControl(editor, document, target, value, "after");
      else appendTextRun(editor, document, paragraph, value);
    } else {
      const insertionElementId = selectedText[0]!.elementId;
      for (const segment of selected) {
        if (segment.kind !== "text") {
          removeSegment(editor, document, segment);
          continue;
        }
        const localStart = Math.max(0, start - segment.start);
        const localEnd = Math.min(segment.value.length, end - segment.start);
        const replacement = segment.value.slice(0, localStart) +
          (segment.elementId === insertionElementId ? value : "") +
          segment.value.slice(localEnd);
        replaceTextElement(editor, document, segment, replacement);
      }
    }
  }
  const edited = editor.commit();
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, edited.bytes);
  const bytes = transaction.commit();
  // Reopening here is an intentional structural validation boundary before bytes escape.
  openWordDocument(openOpcPackage(bytes));
  return bytes;
}

function findParagraph(document: WordDocument, elementId: number): WordParagraph {
  const visit = (blocks: readonly import("./document.ts").WordBlock[]): WordParagraph | undefined => {
    for (const block of blocks) {
      if (block.kind === "paragraph" && block.elementId === elementId) return block;
      if (block.kind === "table") {
        for (const row of block.rows) for (const cell of row.cells) {
          const found = visit(cell.blocks);
          if (found !== undefined) return found;
        }
      }
    }
    return undefined;
  };
  const paragraph = visit(document.blocks);
  if (paragraph === undefined) throw new WordError("invalid_document", `Paragraph element ${elementId} does not exist.`);
  return paragraph;
}

function validateOffset(text: string, offset: number): void {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) throw new RangeError("A Word text offset is outside its paragraph.");
  if (!graphemeBoundaries(text).has(offset)) throw new RangeError("A Word text offset cannot split a grapheme cluster.");
}

function graphemeBoundaries(value: string): ReadonlySet<number> {
  const boundaries = new Set<number>([0, value.length]);
  const Segmenter = Intl.Segmenter;
  if (Segmenter === undefined) {
    let offset = 0;
    for (const scalar of value) {
      offset += scalar.length;
      boundaries.add(offset);
    }
    return boundaries;
  }
  for (const segment of new Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
    boundaries.add(segment.index);
    boundaries.add(segment.index + segment.segment.length);
  }
  return boundaries;
}

function insertionTarget(
  segments: readonly WordParagraphTextSegment[],
  offset: number,
  affinity: "before" | "after",
): WordParagraphTextSegment | undefined {
  const inside = segments.find((segment) => offset > segment.start && offset < segment.end);
  if (inside !== undefined) return inside;
  const before = segments.findLast((segment) => segment.end <= offset);
  const after = segments.find((segment) => segment.start >= offset);
  return affinity === "before" ? after ?? before : before ?? after;
}

function insertInto(segment: WordParagraphTextSegment, offset: number, value: string): string {
  const local = Math.max(0, Math.min(segment.value.length, offset - segment.start));
  return segment.value.slice(0, local) + value + segment.value.slice(local);
}

function replaceTextElement(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: WordDocument,
  segment: WordParagraphTextSegment,
  value: string,
): void {
  const element = requiredElement(document, segment.elementId);
  if (element.selfClosing) {
    const spaceAttribute = /^\s|\s$/u.test(value) ? ' xml:space="preserve"' : "";
    editor.replaceElementMarkup(element, `<${element.qualified}${spaceAttribute}>${escapeText(value)}</${element.qualified}>`);
    return;
  }
  editor.setText(element, value);
  const space = element.attributes.find((attribute) => attribute.namespaceUri === XML_NAMESPACE && attribute.localName === "space");
  if (/^\s|\s$/u.test(value)) {
    if (space === undefined) editor.insertAttribute(element, "xml:space", "preserve");
    else if (space.value !== "preserve") editor.setAttribute(space, "preserve");
  }
}

function removeSegment(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: WordDocument,
  segment: WordParagraphTextSegment,
): void {
  const element = requiredElement(document, segment.elementId);
  if (segment.kind === "text") editor.setText(element, "");
  else editor.removeElement(element);
}

function appendTextRun(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: WordDocument,
  paragraph: WordParagraph,
  value: string,
): void {
  if (value.length === 0) return;
  const element = requiredElement(document, paragraph.elementId);
  const markup = textRunMarkup(element.prefix, value);
  if (element.selfClosing) editor.replaceElementMarkup(element, openSelfClosing(document, element, markup));
  else editor.appendMarkup(element, markup);
}

function insertRunBesideControl(
  editor: ReturnType<typeof beginLosslessXmlEdit>,
  document: WordDocument,
  segment: WordParagraphTextSegment,
  value: string,
  affinity: "before" | "after",
): void {
  if (value.length === 0) return;
  const control = requiredElement(document, segment.elementId);
  const run = requiredElement(document, segment.runElementId);
  const markup = textRunMarkup(run.prefix, value);
  if (affinity === "before") editor.insertMarkupBefore(run, markup);
  else {
    const parent = parentElement(document, run);
    const siblings = parent.children.filter((child): child is LosslessXmlElement => child.kind === "element");
    const next = siblings[siblings.indexOf(run) + 1];
    if (next === undefined) editor.appendMarkup(parent, markup);
    else editor.insertMarkupBefore(next, markup);
  }
  void control;
}

function parentElement(document: WordDocument, target: LosslessXmlElement): LosslessXmlElement {
  const parent = document.source.elements().find((element) => element.children.includes(target));
  if (parent === undefined) throw new WordError("invalid_document", "Run parent is missing.");
  return parent;
}

function requiredElement(document: WordDocument, id: number): LosslessXmlElement {
  const element = document.source.element(id);
  if (element === undefined) throw new WordError("invalid_document", `Source element ${id} is missing.`);
  return element;
}

function textRunMarkup(prefix: string, value: string): string {
  return `<${qualified(prefix, "r")}><${qualified(prefix, "t")} xml:space="preserve">${escapeText(value)}</${qualified(prefix, "t")}></${qualified(prefix, "r")}>`;
}

function openSelfClosing(document: WordDocument, element: LosslessXmlElement, content: string): string {
  const start = document.source.source.slice(element.startTagSpan.start, element.startTagSpan.end).replace(/\/\s*>$/, ">");
  return `${start}${content}</${element.qualified}>`;
}

function qualified(prefix: string, localName: string): string {
  return prefix === "" ? localName : `${prefix}:${localName}`;
}

function escapeText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("]]>", "]]&gt;");
}
