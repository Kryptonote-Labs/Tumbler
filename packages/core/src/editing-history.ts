export interface EditingHistoryOptions {
  /** Maximum retained states, including the current state. */
  readonly limit?: number;
}

export interface EditingHistory<T> {
  readonly entries: readonly T[];
  readonly index: number;
  readonly savedIndex: number | undefined;
  readonly limit: number;
}

const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = 1_000;

/** Creates bounded, format-neutral history with the initial state marked saved. */
export function createEditingHistory<T>(initial: T, options: EditingHistoryOptions = {}): EditingHistory<T> {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  if (!Number.isInteger(limit) || limit < 2 || limit > MAX_HISTORY_LIMIT) {
    throw new RangeError(`History limit must be an integer between 2 and ${MAX_HISTORY_LIMIT}.`);
  }
  return history(Object.freeze([initial]), 0, 0, limit);
}

export function editingHistoryValue<T>(state: EditingHistory<T>): T {
  return state.entries[state.index]!;
}

export function editingHistoryCanUndo(state: EditingHistory<unknown>): boolean {
  return state.index > 0;
}

export function editingHistoryCanRedo(state: EditingHistory<unknown>): boolean {
  return state.index < state.entries.length - 1;
}

export function editingHistoryIsDirty(state: EditingHistory<unknown>): boolean {
  return state.savedIndex === undefined || state.index !== state.savedIndex;
}

/** Commits one user-visible operation, discarding any redo branch. */
export function commitEditingHistory<T>(
  state: EditingHistory<T>,
  value: T,
  equals: (left: T, right: T) => boolean = Object.is,
): EditingHistory<T> {
  if (equals(editingHistoryValue(state), value)) return state;

  const entries = [...state.entries.slice(0, state.index + 1), value];
  let savedIndex = state.savedIndex !== undefined && state.savedIndex <= state.index
    ? state.savedIndex
    : undefined;
  const overflow = Math.max(0, entries.length - state.limit);
  if (overflow > 0) entries.splice(0, overflow);
  if (savedIndex !== undefined) savedIndex = savedIndex < overflow ? undefined : savedIndex - overflow;
  return history(Object.freeze(entries), entries.length - 1, savedIndex, state.limit);
}

export function undoEditingHistory<T>(state: EditingHistory<T>): EditingHistory<T> {
  return state.index === 0
    ? state
    : history(state.entries, state.index - 1, state.savedIndex, state.limit);
}

export function redoEditingHistory<T>(state: EditingHistory<T>): EditingHistory<T> {
  return state.index === state.entries.length - 1
    ? state
    : history(state.entries, state.index + 1, state.savedIndex, state.limit);
}

/** Marks the current state as the durable save point without losing history. */
export function markEditingHistorySaved<T>(state: EditingHistory<T>): EditingHistory<T> {
  return state.savedIndex === state.index
    ? state
    : history(state.entries, state.index, state.index, state.limit);
}

function history<T>(
  entries: readonly T[],
  index: number,
  savedIndex: number | undefined,
  limit: number,
): EditingHistory<T> {
  return Object.freeze({ entries, index, savedIndex, limit });
}
