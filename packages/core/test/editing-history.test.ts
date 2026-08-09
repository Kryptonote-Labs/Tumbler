import { describe, expect, test } from "bun:test";
import fc from "fast-check";
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
} from "../src/index.ts";

describe("format-neutral editing history", () => {
  test("moves around a saved point without losing redo state", () => {
    const initial = createEditingHistory("one");
    const changed = commitEditingHistory(initial, "two");
    const saved = markEditingHistorySaved(changed);
    const third = commitEditingHistory(saved, "three");

    expect(editingHistoryIsDirty(third)).toBeTrue();
    const undone = undoEditingHistory(third);
    expect(editingHistoryValue(undone)).toBe("two");
    expect(editingHistoryIsDirty(undone)).toBeFalse();
    expect(editingHistoryCanRedo(undone)).toBeTrue();
    expect(editingHistoryValue(redoEditingHistory(undone))).toBe("three");
  });

  test("discards redo branches and invalidates unreachable save points", () => {
    const saved = markEditingHistorySaved(
      commitEditingHistory(commitEditingHistory(createEditingHistory(0), 1), 2),
    );
    const rewound = undoEditingHistory(saved);
    const branched = commitEditingHistory(rewound, 3);

    expect(branched.entries).toEqual([0, 1, 3]);
    expect(branched.savedIndex).toBeUndefined();
    expect(editingHistoryCanRedo(branched)).toBeFalse();
    expect(editingHistoryIsDirty(branched)).toBeTrue();
  });

  test("deduplicates semantic no-ops and remains bounded", () => {
    let state = createEditingHistory({ value: 0 }, { limit: 3 });
    state = commitEditingHistory(state, { value: 0 }, (left, right) => left.value === right.value);
    expect(state.entries).toHaveLength(1);
    for (let value = 1; value <= 5; value += 1) state = commitEditingHistory(state, { value });
    expect(state.entries.map((entry) => entry.value)).toEqual([3, 4, 5]);
    expect(state.savedIndex).toBeUndefined();
    expect(editingHistoryValue(undoEditingHistory(state)).value).toBe(4);
  });

  test("keeps generated navigation inside its retained states", () => {
    fc.assert(fc.property(
      fc.array(fc.constantFrom("commit", "undo", "redo", "save"), { minLength: 1, maxLength: 500 }),
      (commands) => {
        let state = createEditingHistory(0, { limit: 17 });
        let value = 0;
        for (const command of commands) {
          if (command === "commit") state = commitEditingHistory(state, ++value);
          else if (command === "undo") state = undoEditingHistory(state);
          else if (command === "redo") state = redoEditingHistory(state);
          else state = markEditingHistorySaved(state);
          expect(state.index).toBeGreaterThanOrEqual(0);
          expect(state.index).toBeLessThan(state.entries.length);
          expect(state.entries.length).toBeLessThanOrEqual(state.limit);
          expect(editingHistoryCanUndo(state)).toBe(state.index > 0);
          expect(editingHistoryCanRedo(state)).toBe(state.index < state.entries.length - 1);
        }
      },
    ), { numRuns: 1_000 });
  });

  test("validates resource limits", () => {
    expect(() => createEditingHistory(0, { limit: 1 })).toThrow(RangeError);
    expect(() => createEditingHistory(0, { limit: 1_001 })).toThrow(RangeError);
    expect(() => createEditingHistory(0, { limit: 2.5 })).toThrow(RangeError);
  });
});
