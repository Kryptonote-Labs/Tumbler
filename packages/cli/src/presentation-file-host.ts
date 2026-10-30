import {
  closeSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  applyPresentationCommand,
  createPresentation,
  inspectPresentation,
  openPresentationArtifact,
} from "@tumblerjs/slides";
import type { PresentationOperationHost } from "./presentations.ts";
const options = {
  maxSlides: Number.MAX_SAFE_INTEGER,
  maxObjects: Number.MAX_SAFE_INTEGER,
  maxGroupDepth: Number.MAX_SAFE_INTEGER,
  maxTextCharacters: Number.MAX_SAFE_INTEGER,
};
const revision = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
function check(path: string) {
  if (extname(path).toLowerCase() !== ".pptx")
    throw new Error("Presentation commands require a .pptx file.");
}
export function createPresentationFile(path: string) {
  check(path);
  const artifact = createPresentation();
  writeFileSync(path, artifact.bytes(), { flag: "wx" });
  return { page: revision(artifact.bytes()), ...inspectPresentation(artifact) };
}
/** Same sibling-lock convention as Word; reads never alter the input file. */
export function presentationFileHost(): Required<Pick<PresentationOperationHost, "readPresentation" | "operatePresentation">> {
  return {
    async readPresentation(path, slideId) {
      check(path);
      const data = readFileSync(path);
      return {
        page: revision(data),
        ...inspectPresentation(openPresentationArtifact(data, options), slideId),
      };
    },
    async operatePresentation(path, input) {
      check(path);
      path = realpathSync(path);
      if (!input.page) throw new Error("Read the presentation and supply --page before editing.");
      const lock = path + ".tumbler-lock",
        descriptor = openSync(lock, "wx"),
        temporary = path + "." + randomUUID() + ".tmp";
      try {
        const original = readFileSync(path);
        if (revision(original) !== input.page)
          throw new Error("The presentation changed. Read it again before editing.");
        const result = applyPresentationCommand(
            openPresentationArtifact(original, options),
            input.command,
          ),
          data = result.bytes();
        writeFileSync(temporary, data, { flag: "wx", mode: statSync(path).mode });
        if (revision(readFileSync(path)) !== input.page)
          throw new Error("The presentation changed while editing. Read it again.");
        renameSync(temporary, path);
        return { page: revision(data), ...inspectPresentation(result) };
      } finally {
        try {
          unlinkSync(temporary);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
        closeSync(descriptor);
        unlinkSync(lock);
      }
    },
  };
}
