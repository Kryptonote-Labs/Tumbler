import type {
  PresentationTextEdit,
  PresentationFormatChange,
  PresentationShapeChange,
} from "./editing.ts";
import {
  commitEditingHistory,
  createEditingHistory,
  editingHistoryCanRedo,
  editingHistoryCanUndo,
  editingHistoryIsDirty,
  editingHistoryValue,
  redoEditingHistory,
  undoEditingHistory,
  type EditingHistory,
  type EditingHistoryOptions,
} from "@tumblerjs/core";
import { PresentationArtifact, openPresentationArtifact } from "./artifact.ts";
import type {
  OpenPresentationOptions,
  PresentationObjectChange,
} from "./model.ts";

/** One history entry per committed gesture or text change. Preview state stays in the view. */
export class PresentationEditingSession {
  #history: EditingHistory<PresentationArtifact>;
  constructor(
    initial: PresentationArtifact,
    options: EditingHistoryOptions = {},
  ) {
    this.#history = createEditingHistory(initial, options);
  }
  get artifact() {
    return editingHistoryValue(this.#history);
  }
  get canUndo() {
    return editingHistoryCanUndo(this.#history);
  }
  get canRedo() {
    return editingHistoryCanRedo(this.#history);
  }
  get dirty() {
    return editingHistoryIsDirty(this.#history);
  }
  updateObject(change: PresentationObjectChange) {
    this.#history = commitEditingHistory(
      this.#history,
      this.artifact.updateObject(change),
    );
    return this.artifact;
  }
  editText(change: PresentationTextEdit) {
    this.#history = commitEditingHistory(
      this.#history,
      this.artifact.editText(change),
    );
    return this.artifact;
  }
  formatText(change: PresentationFormatChange) {
    this.#history = commitEditingHistory(
      this.#history,
      this.artifact.formatText(change),
    );
    return this.artifact;
  }
  styleShape(change: PresentationShapeChange) {
    this.#history = commitEditingHistory(
      this.#history,
      this.artifact.styleShape(change),
    );
    return this.artifact;
  }
  replaceText(slideId: string, key: string, value: string) {
    this.#history = commitEditingHistory(
      this.#history,
      this.artifact.replaceText(slideId, key, value),
    );
    return this.artifact;
  }
  undo() {
    this.#history = undoEditingHistory(this.#history);
    return this.artifact;
  }
  redo() {
    this.#history = redoEditingHistory(this.#history);
    return this.artifact;
  }
}
export function openPresentationEditingSession(
  bytes: Uint8Array,
  options: OpenPresentationOptions & EditingHistoryOptions = {},
) {
  return new PresentationEditingSession(
    openPresentationArtifact(bytes, options),
    options,
  );
}
