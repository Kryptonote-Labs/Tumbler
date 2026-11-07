import type { PdfDocument } from "../document.ts";
import {
  PdfName,
  PdfReference,
  PdfStream,
  type PdfDictionary,
  type PdfValue,
  dictionary,
  unsupported,
} from "../objects.ts";
import { bytes, serializePdfValue } from "./object-writer.ts";

/** Copy selected pages into a fresh object graph. No original revisions or unselected page streams are retained. */
export function extractPdfPages(document: PdfDocument, indices: readonly number[]): Uint8Array {
  if (
    !indices.length ||
    indices.some((index) => !Number.isSafeInteger(index) || !document.pages[index])
  )
    throw new Error("Select at least one valid PDF page.");
  if (new Set(indices).size !== indices.length)
    throw new Error("PDF page selection contains duplicates.");
  if (document.source.catalog.has("AcroForm"))
    unsupported("Extracting interactive PDF forms requires field-tree reconstruction.");
  if (document.source.catalog.has("StructTreeRoot"))
    unsupported("Extracting tagged PDF pages requires accessibility structure reconstruction.");
  const source = document.source,
    objects: (PdfValue | { data: Uint8Array; dictionary: PdfDictionary })[] = [],
    refs = new Map<string, PdfReference>();
  const reserve = () => {
    objects.push(null);
    return new PdfReference(objects.length);
  };
  const catalog = reserve(),
    parent = reserve();
  const selected = indices.map((index) => document.pages[index]!),
    pageRefs = selected.map((page) => {
      const ref = reserve();
      refs.set(page.reference.key, ref);
      return ref;
    });
  const excluded = new Set(
    document.pages
      .filter((page) => !refs.has(page.reference.key))
      .map((page) => page.reference.key),
  );
  const excludedValue = (value: PdfValue | undefined) =>
    value instanceof PdfReference && excluded.has(value.key);
  function copy(value: PdfValue): PdfValue {
    if (value instanceof PdfReference) {
      if (excluded.has(value.key)) return null;
      const existing = refs.get(value.key);
      if (existing) return existing;
      const ref = reserve();
      refs.set(value.key, ref);
      const original = source.resolve(value);
      if (original instanceof PdfStream)
        objects[ref.object - 1] = {
          data: original.encoded,
          dictionary: copyDictionary(original.dictionary),
        };
      else objects[ref.object - 1] = copy(original);
      return ref;
    }
    if (value instanceof PdfStream) {
      const ref = reserve();
      objects[ref.object - 1] = {
        data: value.encoded,
        dictionary: copyDictionary(value.dictionary),
      };
      return ref;
    }
    if (Array.isArray(value)) return value.map(copy);
    if (value instanceof Map) return copyDictionary(value);
    return value;
  }
  function destination(value: PdfValue): PdfValue | undefined {
    const resolved = source.resolve(value);
    if (Array.isArray(resolved)) return excludedValue(resolved[0]) ? undefined : copy(resolved);
    // Named destinations are resolved to explicit destinations so names cannot carry unrelated document graphs.
    const key =
      resolved instanceof PdfName
        ? resolved.value
        : resolved instanceof Map
          ? undefined
          : undefined;
    if (key) {
      const dests = source.resolve(source.catalog.get("Dests"));
      if (dests instanceof Map && dests.has(key)) return destination(dests.get(key)!);
    }
    return undefined;
  }
  function copyDictionary(original: PdfDictionary): PdfDictionary {
    const result = new Map<string, PdfValue>();
    for (const [key, value] of original) {
      // Page back-references never pull a page tree or another page into this standalone file.
      if (
        key === "Parent" &&
        source.resolve(original.get("Type")) instanceof PdfName &&
        (source.resolve(original.get("Type")) as PdfName).value === "Page"
      )
        continue;
      if (key === "StructParent" || key === "StructParents") continue;
      if (key === "Dest") {
        const dest = destination(value);
        if (dest) result.set(key, dest);
        continue;
      }
      if (key === "A") {
        const action = source.resolve(value);
        if (
          action instanceof Map &&
          action.get("S") instanceof PdfName &&
          (action.get("S") as PdfName).value === "GoTo"
        ) {
          const dest = action.get("D");
          const copied = dest === undefined ? undefined : destination(dest);
          if (copied)
            result.set(
              key,
              new Map<string, PdfValue>([
                ["S", new PdfName("GoTo")],
                ["D", copied],
              ]),
            );
          continue;
        }
      }
      result.set(key, copy(value));
    }
    return result;
  }
  selected.forEach((page, index) => {
    const info = copyDictionary(page.dictionary);
    info.set("Type", new PdfName("Page"));
    info.set("Parent", parent);
    info.set("Resources", copy(page.resources));
    info.set("MediaBox", [...page.mediaBox]);
    info.set("CropBox", [...page.cropBox]);
    info.set("Rotate", page.rotation);
    info.set("UserUnit", page.userUnit);
    objects[pageRefs[index]!.object - 1] = info;
  });
  objects[parent.object - 1] = new Map<string, PdfValue>([
    ["Type", new PdfName("Pages")],
    ["Kids", pageRefs],
    ["Count", selected.length],
  ]);
  objects[catalog.object - 1] = new Map<string, PdfValue>([
    ["Type", new PdfName("Catalog")],
    ["Pages", parent],
  ]);
  const chunks: Uint8Array[] = [bytes(`%PDF-${source.version}\n%\xE2\xE3\xCF\xD3\n`)],
    offsets = [0];
  let position = chunks[0]!.length;
  objects.forEach((value, index) => {
    offsets.push(position);
    const header = bytes(`${index + 1} 0 obj\n`),
      tail = bytes("\nendobj\n");
    let data: Uint8Array;
    if (value !== null && typeof value === "object" && "data" in value) {
      const dictionary = new Map(value.dictionary);
      dictionary.set("Length", value.data.length);
      const start = bytes(serializePdfValue(dictionary) + "\nstream\n"),
        end = bytes("\nendstream");
      data = new Uint8Array(start.length + value.data.length + end.length);
      data.set(start);
      data.set(value.data, start.length);
      data.set(end, start.length + value.data.length);
    } else data = bytes(serializePdfValue(value as PdfValue));
    chunks.push(header, data, tail);
    position += header.length + data.length + tail.length;
  });
  const xref = position;
  chunks.push(
    bytes(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
          .join("") +
        `trailer\n<< /Size ${objects.length + 1} /Root ${catalog.object} 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.length;
  }
  return output;
}
