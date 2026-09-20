import { beginLosslessXmlEdit, type LosslessXmlElement } from "@tumblerjs/ooxml";
import { beginPackageTransaction, openOpcPackage } from "@tumblerjs/opc";
import { openWordDocument, WordError, type WordDocument, type WordParagraph } from "./document.ts";
import { wordParagraphText, wordParagraphTextSegments, type WordParagraphTextSegment, type WordTextSelection, type WordTextPosition } from "./text.ts";

const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const MAX_INSERTED_TEXT = 1_000_000;

/** Move an inline drawing to a logical text position without changing its wrapping. */
export function moveInlineWordDrawing(document: WordDocument, elementId: number, position: WordTextPosition): Uint8Array {
  if (document.drawings.get(elementId)?.placement !== "inline") throw new WordError("invalid_document", "Only inline drawings can move into text.");
  const paragraph = findParagraph(document, position.paragraphElementId);
  validateOffset(wordParagraphText(document, paragraph), position.offset);
  const segments = wordParagraphTextSegments(document, paragraph);
  const own = segments.find(segment => segment.elementId === elementId);
  if (own !== undefined && position.offset >= own.start && position.offset <= own.end) return document.bytes();
  const element = requiredElement(document, elementId);
  // Carry inherited namespace bindings when moving between paragraphs or table cells.
  const bindings = new Map<string, string>();
  let ancestor: LosslessXmlElement | undefined = element;
  while (ancestor !== undefined) {
    for (const attribute of ancestor.attributes) {
      if ((attribute.qualified === "xmlns" || attribute.prefix === "xmlns") && !bindings.has(attribute.qualified)) {
        bindings.set(attribute.qualified, document.source.source.slice(attribute.span.start, attribute.span.end));
      }
    }
    const current: LosslessXmlElement = ancestor;
    ancestor = document.source.elements().find(candidate => candidate.children.includes(current));
  }
  const declarations = [...bindings].filter(([name]) => !element.attributes.some(attribute => attribute.qualified === name)).map(([, raw]) => raw).join(" ");
  const raw = document.source.source.slice(element.span.start, element.span.end);
  const markup = raw.replace(/^<[^\s>]+/, opening => `${opening} ${declarations}`);
  const editor = beginLosslessXmlEdit(document.source);
  const target = insertionTarget(segments, position.offset, position.affinity ?? "after");
  if (target === undefined) {
    const destination = requiredElement(document, paragraph.elementId);
    const run = `<${qualified(destination.prefix, "r")}>${markup}</${qualified(destination.prefix, "r")}>`;
    if (destination.selfClosing) editor.replaceElementMarkup(destination, openSelfClosing(document, destination, run));
    else editor.appendMarkup(destination, run);
  } else {
    const destination = requiredElement(document, target.elementId);
    if (target.kind === "text") {
      const offset = Math.max(0, Math.min(target.value.length, position.offset - target.start));
      const text = (value: string) => `<${destination.qualified} xml:space="preserve">${escapeText(value)}</${destination.qualified}>`;
      editor.replaceElementMarkup(destination, text(target.value.slice(0, offset)) + markup + text(target.value.slice(offset)));
    } else {
      const original = document.source.source.slice(destination.span.start, destination.span.end);
      editor.replaceElementMarkup(destination, position.offset <= target.start ? markup + original : original + markup);
    }
  }
  editor.removeElement(element);
  return commitDocumentEdit(document, editor);
}

/** Replaces visible logical text inside one paragraph while preserving surrounding OOXML wrappers. */
export function replaceWordText(document: WordDocument, selection: WordTextSelection, value: string): Uint8Array {
  if (value.length > MAX_INSERTED_TEXT) throw new RangeError(`Inserted text cannot exceed ${MAX_INSERTED_TEXT} UTF-16 code units.`);
  if (value.includes("\r")) throw new WordError("invalid_document", "Word text input must use line-feed paragraph boundaries.");
  if (selection.anchor.paragraphElementId !== selection.focus.paragraphElementId || value.includes("\n")) {
    return replaceWordParagraphRange(document, selection, value);
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

/** Handles paragraph boundaries as structural OOXML edits while retaining untouched paragraphs and package parts. */
function replaceWordParagraphRange(document: WordDocument, selection: WordTextSelection, value: string): Uint8Array {
  const paragraphs = documentParagraphs(document);
  const anchorIndex = paragraphs.findIndex((paragraph) => paragraph.elementId === selection.anchor.paragraphElementId);
  const focusIndex = paragraphs.findIndex((paragraph) => paragraph.elementId === selection.focus.paragraphElementId);
  if (anchorIndex < 0 || focusIndex < 0) throw new WordError("invalid_document", "A selected Word paragraph does not exist.");
  const forward = anchorIndex < focusIndex || anchorIndex === focusIndex && selection.anchor.offset <= selection.focus.offset;
  const startPosition = forward ? selection.anchor : selection.focus;
  const endPosition = forward ? selection.focus : selection.anchor;
  const startIndex = forward ? anchorIndex : focusIndex;
  const endIndex = forward ? focusIndex : anchorIndex;
  const startParagraph = paragraphs[startIndex]!;
  const endParagraph = paragraphs[endIndex]!;
  for (const paragraph of paragraphs.slice(startIndex, endIndex + 1)) assertStructuralEditSafe(document, paragraph);
  const startText = wordParagraphText(document, startParagraph);
  const endText = wordParagraphText(document, endParagraph);
  validateOffset(startText, startPosition.offset);
  validateOffset(endText, endPosition.offset);
  const startParent = parentElement(document, requiredElement(document, startParagraph.elementId));
  const endParent = parentElement(document, requiredElement(document, endParagraph.elementId));
  if (startParent !== endParent) throw new WordError("invalid_document", "A paragraph edit cannot cross table-cell or story boundaries.");

  const lines = value.split("\n");
  let working = document;
  const startEnd = wordParagraphText(working, findParagraph(working, startParagraph.elementId)).length;
  working = reopenEdited(working, replaceWordText(working, {
    anchor: { paragraphElementId: startParagraph.elementId, offset: startPosition.offset },
    focus: { paragraphElementId: startParagraph.elementId, offset: startParagraph.elementId === endParagraph.elementId ? endPosition.offset : startEnd },
  }, lines[0]!));
  const updatedParagraphs = documentParagraphs(working);
  const workingStart = updatedParagraphs[startIndex]!;
  const workingEnd = updatedParagraphs[endIndex]!;

  if (startParagraph.elementId === endParagraph.elementId) {
    if (lines.length === 1) return working.bytes();
    const editedStart = workingStart;
    const splitOffset = startPosition.offset + lines[0]!.length;
    const splitLength = wordParagraphText(working, editedStart).length;
    const typingProperties = insertionRunPropertiesMarkup(working, editedStart, splitOffset, selection.focus.affinity ?? "after");
    const suffixMarkup = paragraphRangeMarkup(working, editedStart, splitOffset, splitLength);
    working = reopenEdited(working, replaceWordText(working, {
      anchor: { paragraphElementId: editedStart.elementId, offset: splitOffset },
      focus: { paragraphElementId: editedStart.elementId, offset: wordParagraphText(working, editedStart).length },
    }, ""));
    const paragraphPrefix = requiredElement(working, documentParagraphs(working)[startIndex]!.elementId).prefix;
    const contents = lines.slice(1).map((line, index, inserted) => {
      const trailing = index === inserted.length - 1 ? suffixMarkup : "";
      const typed = line === "" && trailing !== "" ? "" : textRunMarkup(paragraphPrefix, line, typingProperties);
      return `${typed}${trailing}`;
    });
    return insertParagraphContentsAfter(working, documentParagraphs(working)[startIndex]!, contents);
  }

  working = reopenEdited(working, replaceWordText(working, {
    anchor: { paragraphElementId: workingEnd.elementId, offset: 0 },
    focus: { paragraphElementId: workingEnd.elementId, offset: endPosition.offset },
  }, lines.length === 1 ? "" : lines.at(-1)!));
  const finalParagraphs = documentParagraphs(working);
  const finalStart = finalParagraphs[startIndex]!;
  const finalEnd = finalParagraphs[endIndex]!;
  return lines.length === 1
    ? joinParagraphRange(working, finalStart.elementId, finalEnd.elementId)
    : retainParagraphBoundaries(working, finalStart.elementId, finalEnd.elementId, lines.slice(1, -1));
}

function reopenEdited(document: WordDocument, bytes: Uint8Array): WordDocument {
  return openWordDocument(openOpcPackage(bytes));
}

function documentParagraphs(document: WordDocument): WordParagraph[] {
  const result: WordParagraph[] = [];
  const visit = (blocks: readonly import("./document.ts").WordBlock[]): void => {
    for (const block of blocks) {
      if (block.kind === "paragraph") result.push(block);
      else if (block.kind === "table") for (const row of block.rows) for (const cell of row.cells) visit(cell.blocks);
    }
  };
  visit(document.blocks);
  return result;
}

function joinParagraphRange(document: WordDocument, startId: number, endId: number): Uint8Array {
  const start = requiredElement(document, startId);
  const end = requiredElement(document, endId);
  const parent = parentElement(document, start);
  if (parentElement(document, end) !== parent) throw new WordError("invalid_document", "Paragraph join crossed an OOXML container.");
  const siblings = parent.children.filter((child): child is LosslessXmlElement => child.kind === "element");
  const startIndex = siblings.indexOf(start);
  const endIndex = siblings.indexOf(end);
  if (startIndex < 0 || endIndex <= startIndex) throw new WordError("invalid_document", "Paragraph order changed during editing.");
  const editor = beginLosslessXmlEdit(document.source);
  const endContent = paragraphContentMarkup(document, end);
  if (endContent !== "") editor.appendMarkup(start, endContent);
  for (const sibling of siblings.slice(startIndex + 1, endIndex + 1)) editor.removeElement(sibling);
  return commitDocumentEdit(document, editor);
}

function retainParagraphBoundaries(document: WordDocument, startId: number, endId: number, middleLines: readonly string[]): Uint8Array {
  const start = requiredElement(document, startId);
  const end = requiredElement(document, endId);
  const parent = parentElement(document, start);
  if (parentElement(document, end) !== parent) throw new WordError("invalid_document", "Paragraph replacement crossed an OOXML container.");
  const siblings = parent.children.filter((child): child is LosslessXmlElement => child.kind === "element");
  const startIndex = siblings.indexOf(start);
  const endIndex = siblings.indexOf(end);
  const editor = beginLosslessXmlEdit(document.source);
  for (const sibling of siblings.slice(startIndex + 1, endIndex)) editor.removeElement(sibling);
  if (middleLines.length > 0) editor.insertMarkupBefore(end, middleLines.map((line) => paragraphMarkup(document, start, paragraphContentMarkupForText(document, start, line))).join(""));
  return commitDocumentEdit(document, editor);
}

function insertParagraphsAfter(document: WordDocument, paragraph: WordParagraph, values: readonly string[]): Uint8Array {
  const element = requiredElement(document, paragraph.elementId);
  return insertParagraphContentsAfter(document, paragraph, values.map((value) => paragraphContentMarkupForText(document, element, value)));
}

function insertParagraphContentsAfter(document: WordDocument, paragraph: WordParagraph, contents: readonly string[]): Uint8Array {
  if (contents.length === 0) return document.bytes();
  const element = requiredElement(document, paragraph.elementId);
  const parent = parentElement(document, element);
  const siblings = parent.children.filter((child): child is LosslessXmlElement => child.kind === "element");
  const next = siblings[siblings.indexOf(element) + 1];
  const markup = contents.map((content) => paragraphMarkup(document, element, content)).join("");
  const editor = beginLosslessXmlEdit(document.source);
  if (next === undefined) editor.appendMarkup(parent, markup);
  else editor.insertMarkupBefore(next, markup);
  return commitDocumentEdit(document, editor);
}

function paragraphContentMarkupForText(document: WordDocument, template: LosslessXmlElement, value: string): string {
  const run = template.children.find((child): child is LosslessXmlElement => child.kind === "element" && child.localName === "r");
  const runProperties = run?.children.find((child): child is LosslessXmlElement => child.kind === "element" && child.localName === "rPr");
  const runPropertiesMarkup = runProperties === undefined ? "" : document.source.source.slice(runProperties.span.start, runProperties.span.end);
  return value === "" ? "" : textRunMarkup(template.prefix, value, runPropertiesMarkup);
}

function paragraphMarkup(document: WordDocument, template: LosslessXmlElement, content: string): string {
  const prefix = template.prefix;
  const paragraphProperties = template.children.find((child): child is LosslessXmlElement => child.kind === "element" && child.localName === "pPr");
  const properties = paragraphProperties === undefined ? "" : document.source.source.slice(paragraphProperties.span.start, paragraphProperties.span.end);
  return `<${template.qualified}>${properties}${content}</${template.qualified}>`;
}

function assertStructuralEditSafe(document: WordDocument, paragraph: WordParagraph): void {
  const runs = paragraph.inlines.filter((inline) => inline.kind === "run");
  if (runs.length !== paragraph.inlines.length || runs.some((run) => run.contents.some((content) => content.kind !== "text"))) {
    throw new WordError("unsupported_document", "Paragraph boundaries cannot be edited through fields, links, revisions, drawings, or structural markers.");
  }
}

function insertionRunPropertiesMarkup(
  document: WordDocument,
  paragraph: WordParagraph,
  offset: number,
  affinity: "before" | "after",
): string {
  const target = insertionTarget(wordParagraphTextSegments(document, paragraph), offset, affinity);
  if (target === undefined) return "";
  const run = requiredElement(document, target.runElementId);
  const properties = run.children.find((child): child is LosslessXmlElement => child.kind === "element" && child.localName === "rPr");
  return properties === undefined ? "" : document.source.source.slice(properties.span.start, properties.span.end);
}

function paragraphRangeMarkup(document: WordDocument, paragraph: WordParagraph, start: number, end: number): string {
  const segments = wordParagraphTextSegments(document, paragraph);
  const runIds = [...new Set(segments.filter((segment) => segment.end > start && segment.start < end).map((segment) => segment.runElementId))];
  return runIds.map((runElementId) => {
    const runSegments = segments.filter((segment) => segment.runElementId === runElementId);
    const value = runSegments.map((segment) => {
      const localStart = Math.max(0, start - segment.start);
      const localEnd = Math.min(segment.value.length, end - segment.start);
      return localEnd <= localStart ? "" : segment.value.slice(localStart, localEnd);
    }).join("");
    if (value === "") return "";
    const run = requiredElement(document, runElementId);
    const properties = run.children.find((child): child is LosslessXmlElement => child.kind === "element" && child.localName === "rPr");
    const propertyMarkup = properties === undefined ? "" : document.source.source.slice(properties.span.start, properties.span.end);
    return textRunMarkup(run.prefix, value, propertyMarkup);
  }).join("");
}

function paragraphContentMarkup(document: WordDocument, paragraph: LosslessXmlElement): string {
  return paragraph.children
    .filter((child): child is LosslessXmlElement => child.kind === "element" && child.localName !== "pPr")
    .map((child) => document.source.source.slice(child.span.start, child.span.end))
    .join("");
}

function commitDocumentEdit(document: WordDocument, editor: ReturnType<typeof beginLosslessXmlEdit>): Uint8Array {
  const edited = editor.commit();
  const transaction = beginPackageTransaction(document.package);
  transaction.replacePart(document.part.name, edited.bytes);
  const bytes = transaction.commit();
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

function textRunMarkup(prefix: string, value: string, properties = ""): string {
  return `<${qualified(prefix, "r")}>${properties}<${qualified(prefix, "t")} xml:space="preserve">${escapeText(value)}</${qualified(prefix, "t")}></${qualified(prefix, "r")}>`;
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
