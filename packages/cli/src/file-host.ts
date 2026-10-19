import { openWordOperationDocument, prepareWordOperation } from "@tumblerjs/word/operations";
import { tableParagraphs } from "@tumblerjs/word/collaboration";
import type { OperationInput } from "./registry.ts";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  statSync,
  realpathSync,
} from "node:fs";
import { extname } from "node:path";
import { z } from "zod";
import { createWordArtifact, openWordArtifact, type WordArtifact } from "@tumblerjs/word";
import type { OperationHost, ReadInput } from "./registry.ts";

const handleSchema = z.object({
  revision: z.string(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
const revision = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const open = (bytes: Uint8Array) =>
  openWordArtifact(bytes, {
    maxBlocks: Number.MAX_SAFE_INTEGER,
    maxInlineItems: Number.MAX_SAFE_INTEGER,
    maxTextCharacters: Number.MAX_SAFE_INTEGER,
  });
function checkExtension(path: string) {
  if (extname(path).toLowerCase() !== ".docx")
    throw new Error("This CLI currently supports .docx documents.");
}
function paragraphs(artifact: WordArtifact) {
  const session = openWordOperationDocument(artifact);
  try {
    return {
      text: session.text.toString(),
      runs: session.text.toDelta(),
      tables: tableParagraphs(session.text),
    };
  } finally {
    session.destroy();
  }
}
function page(artifact: WordArtifact, offset: number) {
  const content = paragraphs(artifact);
  if (offset > content.text.length) throw new Error("Offset is outside the document.");
  // Transport pages are bounded; this does not constrain document size.
  let end = Math.min(content.text.length, offset + 4000);
  if (end < content.text.length && /[\uDC00-\uDFFF]/.test(content.text[end]!)) end--;
  const handle = { revision: revision(artifact.bytes()), start: offset, end };
  return {
    page: Buffer.from(JSON.stringify(handle)).toString("base64url"),
    region: "body",
    start: offset,
    end,
    next: end < content.text.length ? end : null,
    text: content.text.slice(offset, end),
    runs: (() => {
      let at = 0;
      return content.runs.flatMap(
        (run: { insert: string; attributes?: Record<string, unknown> }) => {
          const start = at;
          at += run.insert.length;
          const from = Math.max(offset, start),
            to = Math.min(end, at);
          return to > from
            ? [
                {
                  text: content.text.slice(from, to),
                  start: from,
                  end: to,
                  attributes: run.attributes ?? {},
                },
              ]
            : [];
        },
      );
    })(),
    tables: content.tables.filter((p) => p.table && p.start < end && p.end > offset),
  };
}
function resolveTarget(artifact: WordArtifact, input: OperationInput) {
  if (!input.page) throw new Error("Read first and supply --page <handle> when editing a file.");
  const handle = handleSchema.parse(JSON.parse(Buffer.from(input.page, "base64url").toString()));
  if (handle.revision !== revision(artifact.bytes()))
    throw new Error("The document changed. Read it again before editing.");
  const content = paragraphs(artifact);
  if (handle.end > content.text.length || handle.end < handle.start)
    throw new Error("Invalid page range.");
  let start: number;
  let end: number;
  if ("text" in input.target) {
    const target = input.target;
    const found: number[] = [];
    const visible = content.text.slice(handle.start, handle.end);
    for (
      let at = visible.indexOf(target.text);
      at >= 0;
      at = visible.indexOf(target.text, at + 1)
    ) {
      if (target.within) {
        let contained = false;
        for (
          let context = visible.indexOf(target.within);
          context >= 0;
          context = visible.indexOf(target.within, context + 1)
        )
          if (at >= context && at + target.text.length <= context + target.within.length)
            contained = true;
        if (!contained) continue;
      }
      found.push(handle.start + at);
    }
    if (found.length !== 1)
      throw new Error(
        `Expected one exact match; found ${found.length}. Narrow the target or reread.`,
      );
    start = found[0]!;
    end = start + target.text.length;
  } else if (input.target.kind === "range") {
    start = input.target.start;
    end = input.target.end;
  } else {
    const target = input.target;
    const selected = content.tables.filter(
      (p) =>
        p.table?.id === target.tableId &&
        (target.kind === "table" || p.table.cell === target.cellId),
    );
    if (!selected.length) throw new Error("Table or cell unavailable.");
    start = selected[0]!.start;
    end = selected.at(-1)!.end - (target.kind === "cell" ? 1 : 0);
  }
  if (
    "kind" in input.target && input.target.kind === "table"
      ? end <= handle.start || start >= handle.end
      : start < handle.start || end > handle.end || end < start
  )
    throw new Error("Target is outside the read page.");
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(content.text);
  for (const offset of [start, end]) {
    const segment = segments.containing(offset);
    if (segment && segment.index !== offset) throw new Error("Target splits a character.");
  }
  return { start, end, offset: handle.start };
}

/** File writes use a sibling lock and atomic replacement. Other writers should honor the lock. */
export function createFileHost(): OperationHost {
  function edit(path: string, input: OperationInput) {
    checkExtension(path);
    path = realpathSync(path);
    const lock = `${path}.tumbler-lock`;
    const descriptor = openSync(lock, "wx");
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      const original = readFileSync(path);
      const artifact = open(original);
      const target = resolveTarget(artifact, input);
      const session = openWordOperationDocument(artifact, (image) => readFileSync(image.id));
      let result: WordArtifact;
      try {
        session.text.applyDelta(prepareWordOperation(session.text, target, input.operation).delta);
        result = session.artifact();
      } finally {
        session.destroy();
      }
      writeFileSync(temporary, result.bytes(), { flag: "wx", mode: statSync(path).mode });
      if (revision(readFileSync(path)) !== revision(original))
        throw new Error("The document changed while editing. Read it again.");
      renameSync(temporary, path);
      return { page: page(result, Math.min(target.offset, paragraphs(result).text.length)) };
    } finally {
      try {
        unlinkSync(temporary);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      closeSync(descriptor);
      unlinkSync(lock);
    }
  }
  return {
    async operate(path, input) {
      return edit(path, input);
    },
    async read(path: string, input: ReadInput) {
      checkExtension(path);
      if (input.region !== "body")
        throw new Error("The file host currently reads the body region.");
      return page(open(readFileSync(path)), input.offset);
    },
    async format(path, input) {
      return edit(path, {
        page: input.page,
        target: input.target,
        operation: { name: "format", input: input.format },
      });
    },
    async replace(path, input) {
      return edit(path, {
        page: input.page,
        target: input.target,
        operation: { name: "replace", input: { value: input.value } },
      });
    },
    async create(path) {
      checkExtension(path);
      const artifact = createWordArtifact();
      writeFileSync(path, artifact.bytes(), { flag: "wx" });
      return page(artifact, 0);
    },
  };
}
