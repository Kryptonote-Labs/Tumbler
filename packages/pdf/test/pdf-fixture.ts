/** Hand-authored object bodies with byte-accurate xrefs for focused standards fixtures. */
export function pdfFixture(objects: readonly (string | Uint8Array)[]) {
  const chunks: Uint8Array[] = [new TextEncoder().encode("%PDF-1.7\n")],
    offsets = [0];
  let length = chunks[0]!.length;
  const append = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  objects.forEach((object, index) => {
    offsets.push(length);
    append(`${index + 1} 0 obj\n`);
    append(object);
    append("\nendobj\n");
  });
  const xref = length;
  append(
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join(
        "",
      )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const result = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
export function pdfStream(data: string | Uint8Array, dictionary = "") {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const head = new TextEncoder().encode(`<< ${dictionary} /Length ${bytes.length} >>\nstream\n`),
    tail = new TextEncoder().encode("\nendstream");
  const result = new Uint8Array(head.length + bytes.length + tail.length);
  result.set(head);
  result.set(bytes, head.length);
  result.set(tail, head.length + bytes.length);
  return result;
}
export function formExpansion(depth: number) {
  return pdfFixture([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /X 5 0 R >> >> /Contents 4 0 R >>",
    pdfStream("/X Do"),
    ...Array.from({ length: depth }, (_, i) =>
      pdfStream(
        i === depth - 1 ? "0 0 1 1 re f" : "/X Do /X Do",
        `/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /XObject << /X ${6 + i} 0 R >> >>`,
      ),
    ),
  ]);
}
