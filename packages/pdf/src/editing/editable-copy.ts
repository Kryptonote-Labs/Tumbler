import type { PdfDocument } from "../document.ts";
import { PdfReference, PdfStream, PdfName, type PdfValue } from "../objects.ts";
import { bytes, serializePdfValue } from "./object-writer.ts";

/** Rewrite the authenticated document graph without encryption or original revisions.
 * Keeps catalog features, metadata and object identities, including cyclic references. */
export function createEditablePdfCopy(document: PdfDocument): Uint8Array {
  const source = document.source;
  const objects = new Map<string, { reference: PdfReference; value: PdfValue }>();
  const pending: PdfReference[] = [];
  function visit(value: PdfValue) {
    if (value instanceof PdfReference) {
      if (objects.has(value.key)) return;
      objects.set(value.key, { reference: value, value: null });
      pending.push(value);
    } else if (value instanceof PdfStream) visit(value.dictionary);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value instanceof Map) for (const child of value.values()) visit(child);
  }
  const trailer = new Map<string, PdfValue>();
  for (const key of ["Root", "Info", "ID"]) {
    const value = source.trailer.get(key);
    if (value !== undefined) {
      trailer.set(key, value);
      visit(value);
    }
  }
  for (let index = 0; index < pending.length; index++) {
    const reference = pending[index]!;
    const value = source.resolve(reference);
    objects.set(reference.key, { reference, value });
    visit(value);
  }
  const chunks: Uint8Array[] = [bytes(`%PDF-${source.version}\n%\xE2\xE3\xCF\xD3\n`)];
  const offsets: { reference: PdfReference; offset: number }[] = [];
  let position = chunks[0]!.length;
  for (const { reference, value } of objects.values()) {
    offsets.push({ reference, offset: position });
    const parts: Uint8Array[] = [bytes(`${reference.object} ${reference.generation} obj\n`)];
    if (value instanceof PdfStream) {
      const filters = source.resolve(value.dictionary.get("Filter"));
      if (
        (filters instanceof PdfName && filters.value === "Crypt") ||
        (Array.isArray(filters) &&
          filters.some((filter) => filter instanceof PdfName && filter.value === "Crypt"))
      )
        throw new Error("Explicit PDF crypt filters are not supported for editable copies.");
      const data = source.encodedStream(value);
      const dictionary = new Map(value.dictionary);
      dictionary.set("Length", data.length);
      parts.push(bytes(serializePdfValue(dictionary) + "\nstream\n"), data, bytes("\nendstream"));
    } else parts.push(bytes(serializePdfValue(value)));
    parts.push(bytes("\nendobj\n"));
    for (const part of parts) {
      chunks.push(part);
      position += part.length;
    }
  }
  trailer.set(
    "Size",
    offsets.reduce((maximum, { reference }) => Math.max(maximum, reference.object), 0) + 1,
  );
  chunks.push(
    bytes(
      "xref\n0 1\n0000000000 65535 f \n" +
        offsets
          .sort((a, b) => a.reference.object - b.reference.object)
          .map(
            ({ reference, offset }) =>
              `${reference.object} 1\n${String(offset).padStart(10, "0")} ${String(reference.generation).padStart(5, "0")} n \n`,
          )
          .join("") +
        `trailer\n${serializePdfValue(trailer)}\nstartxref\n${position}\n%%EOF\n`,
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
