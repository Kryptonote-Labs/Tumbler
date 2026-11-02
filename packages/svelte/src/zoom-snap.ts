export interface SnappedZoom {
  /** Where the gesture has really reached, so it can leave the snap point. */
  readonly raw: number;
  /** The zoom to display. */
  readonly scale: number;
}

const minimum = 0.25;
const maximum = 3;
const leeway = 0.05;

/** Apply a zoom gesture step, resting on 100% when the gesture lands near it. */
export function snappedZoom(
  level: SnappedZoom,
  current: number,
  factor: number,
): SnappedZoom {
  // Buttons and hosts can set the zoom between gesture steps.
  const base = level.scale === current ? level.raw : current;
  const raw = Math.max(minimum, Math.min(maximum, base * factor));
  return { raw, scale: Math.abs(raw - 1) <= leeway ? 1 : raw };
}
