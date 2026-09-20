import type { WordDrawingChange, WordDrawingResize } from "./drawings.ts";
import {
  commitEditingHistory,
  createEditingHistory,
  editingHistoryCanRedo,
  editingHistoryCanUndo,
  editingHistoryIsDirty,
  editingHistoryValue,
  markEditingHistorySaved,
  redoEditingHistory,
  undoEditingHistory,
  type EditingHistory,
  type EditingHistoryOptions,
} from "@tumblerjs/core";
import { type OpenWordArtifactOptions, WordArtifact, openWordArtifact } from "./artifact.ts";
import type { WordTextSelection } from "./text.ts";
import type { FormattingPatch } from "@tumblerjs/core";

export interface WordEditingSessionOptions extends EditingHistoryOptions, OpenWordArtifactOptions {}

export type WordSessionChangeReason = "edit" | "undo" | "redo" | "save" | "external-revision";

export interface WordSessionChange {
  readonly reason: WordSessionChangeReason;
  readonly revision: number;
  readonly artifact: WordArtifact;
  readonly dirty: boolean;
}

export type WordSessionListener = (change: WordSessionChange) => void;

/** Bounded host-facing history over immutable, validated package revisions. */
export class WordEditingSession {
  #history: EditingHistory<WordArtifact>;
  #revision = 0;
  readonly #options: WordEditingSessionOptions;
  readonly #listeners = new Set<WordSessionListener>();

  constructor(initial: WordArtifact, options: WordEditingSessionOptions = {}) {
    this.#options = Object.freeze({ ...options });
    this.#history = createEditingHistory(initial, options);
  }

  get artifact(): WordArtifact { return editingHistoryValue(this.#history); }
  get revision(): number { return this.#revision; }
  get canUndo(): boolean { return editingHistoryCanUndo(this.#history); }
  get canRedo(): boolean { return editingHistoryCanRedo(this.#history); }
  get dirty(): boolean { return editingHistoryIsDirty(this.#history); }

  replaceText(selection: WordTextSelection, value: string, typingFormatting?: FormattingPatch): WordArtifact {
    return this.#commit(this.artifact.replaceText(selection, value, typingFormatting));
  }

  updateDrawing(change: WordDrawingChange): WordArtifact {
    return this.#commit(this.artifact.updateDrawing(change));
  }

  resizeDrawing(size: WordDrawingResize): WordArtifact {
    return this.#commit(this.artifact.resizeDrawing(size));
  }

  applyFormatting(selection: WordTextSelection, patch: FormattingPatch): WordArtifact {
    return this.#commit(this.artifact.applyFormatting(selection, patch));
  }

  undo(): WordArtifact {
    const next = undoEditingHistory(this.#history);
    if (next !== this.#history) {
      this.#history = next;
      this.#emit("undo");
    }
    return this.artifact;
  }

  redo(): WordArtifact {
    const next = redoEditingHistory(this.#history);
    if (next !== this.#history) {
      this.#history = next;
      this.#emit("redo");
    }
    return this.artifact;
  }

  markSaved(): WordArtifact {
    const next = markEditingHistorySaved(this.#history);
    if (next !== this.#history) {
      this.#history = next;
      this.#emit("save");
    }
    return this.artifact;
  }

  /** Replaces agent/server bytes and intentionally starts a fresh saved history. */
  replaceExternalRevision(bytes: Uint8Array): WordArtifact {
    const next = openWordArtifact(bytes, this.#options);
    if (equalBytes(next.bytes(), this.artifact.bytes())) return this.artifact;
    this.#history = createEditingHistory(next, this.#options);
    this.#emit("external-revision");
    return next;
  }

  subscribe(listener: WordSessionListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #commit(next: WordArtifact): WordArtifact {
    const history = commitEditingHistory(this.#history, next, Object.is);
    if (history !== this.#history) {
      this.#history = history;
      this.#emit("edit");
    }
    return this.artifact;
  }

  #emit(reason: WordSessionChangeReason): void {
    this.#revision += 1;
    const change = Object.freeze({ reason, revision: this.#revision, artifact: this.artifact, dirty: this.dirty });
    for (const listener of [...this.#listeners]) listener(change);
  }
}

export function openWordEditingSession(bytes: Uint8Array, options: WordEditingSessionOptions = {}): WordEditingSession {
  return new WordEditingSession(openWordArtifact(bytes, options), options);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
