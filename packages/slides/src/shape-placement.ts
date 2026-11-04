import { applyPresentationCommand, type PresentationCommand } from "./commands.ts";
import type { PresentationArtifact } from "./artifact.ts";
import type { ObjectBounds, ShapeGeometry } from "./authoring-objects.ts";

type Point = { x: number; y: number };
export type ShapePlacement = { bounds: ObjectBounds; rotation: number };

/** Resolve a drag in slide coordinates, preserving its starting corner or line endpoint. */
export function shapePlacement(
  start: Point,
  end: Point,
  shape: ShapeGeometry,
  constrain: boolean,
  frame: { width: number; height: number },
): ShapePlacement {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (constrain && shape === "line") {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    dx = Math.cos(angle) * length;
    dy = Math.sin(angle) * length;
    const fit = Math.min(
      1,
      dx ? (dx < 0 ? start.x : frame.width - start.x) / Math.abs(dx) : 1,
      dy ? (dy < 0 ? start.y : frame.height - start.y) / Math.abs(dy) : 1,
    );
    dx *= fit;
    dy *= fit;
  } else if (constrain) {
    const size = Math.min(
      Math.max(Math.abs(dx), Math.abs(dy)),
      dx < 0 ? start.x : frame.width - start.x,
      dy < 0 ? start.y : frame.height - start.y,
    );
    dx = (dx < 0 ? -1 : 1) * size;
    dy = (dy < 0 ? -1 : 1) * size;
  }
  if (shape === "line") {
    const length = Math.hypot(dx, dy);
    return {
      bounds: { x: start.x + dx / 2 - length / 2, y: start.y + dy / 2, width: length, height: 0 },
      rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
  }
  return {
    bounds: {
      x: start.x + Math.min(0, dx),
      y: start.y + Math.min(0, dy),
      width: Math.abs(dx),
      height: Math.abs(dy),
    },
    rotation: 0,
  };
}

/** A rotated line uses the engine's existing rotation command in the same undoable edit. */
export function placedShapeCommand(
  artifact: PresentationArtifact,
  slideId: string,
  shape: ShapeGeometry,
  placement: ShapePlacement,
): { command: PresentationCommand; objectKey: string } {
  const insert = {
    name: "insert-object",
    slideId,
    bounds: placement.bounds,
    object: { kind: "shape", geometry: shape },
  } as const;
  // Resolve the engine-assigned identity without publishing an intermediate, unrotated line.
  const inserted = applyPresentationCommand(artifact, insert);
  const objectKey = inserted.document.slides
    .find((slide) => slide.id === slideId)!
    .objects.at(-1)!.key;
  return {
    objectKey,
    command:
      placement.rotation === 0
        ? insert
        : {
            name: "batch",
            commands: [
              insert,
              {
                name: "update-object",
                slideId,
                objectKey,
                ...placement.bounds,
                rotation: placement.rotation,
              },
            ],
          },
  };
}
