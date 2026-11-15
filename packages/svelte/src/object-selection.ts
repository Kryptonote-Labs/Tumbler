/** A side or corner of a selected object, as -1 (start), 0 (middle) or 1 (end) on each axis. */
export interface ObjectHandle {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
  readonly name: string;
  readonly cursor: string;
}

/** The eight resize handles Office shows around a selected object, shared by every editor. */
export const objectHandles = [
  { x: -1, y: -1, name: "top left", cursor: "nwse-resize" },
  { x: 0, y: -1, name: "top", cursor: "ns-resize" },
  { x: 1, y: -1, name: "top right", cursor: "nesw-resize" },
  { x: -1, y: 0, name: "left", cursor: "ew-resize" },
  { x: 1, y: 0, name: "right", cursor: "ew-resize" },
  { x: -1, y: 1, name: "bottom left", cursor: "nesw-resize" },
  { x: 0, y: 1, name: "bottom", cursor: "ns-resize" },
  { x: 1, y: 1, name: "bottom right", cursor: "nwse-resize" },
] as const satisfies readonly ObjectHandle[];

/**
 * Screen-pixel geometry of selection chrome, for hosts that draw it in SVG. HTML hosts use the
 * classes in object-selection.css, which carry the same sizes.
 */
export const objectSelection = {
  /** Drawn handle edge. */
  handle: 8,
  /** Outline stroke. */
  stroke: 1,
  /** Width of the transparent band around the outline that moves the object. */
  grip: 10,
} as const;
