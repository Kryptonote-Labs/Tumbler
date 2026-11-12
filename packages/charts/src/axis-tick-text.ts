import type { ChartAxis } from "./model.ts";
import { chartMarksBounds } from "./shape-scene.ts";
import { rotateChartText } from "./text-rotation.ts";
import { translateChartMark } from "./mark-translation.ts";
import type { ChartMark, SceneContext } from "./scene-marks.ts";

/** Rotate tick text while retaining its distance from the axis and its tick-centred alignment. */
export function axisTickText(
  context: Pick<SceneContext, "measure">,
  axis: ChartAxis | undefined,
  mark: Extract<ChartMark, { kind: "text" }>,
  horizontal: boolean,
  side: number,
): ChartMark[] {
  const rotation = axis?.textStyle?.rotation ?? axis?.labelRotation;
  if (!rotation) return [mark];
  const before = chartMarksBounds(context, [mark])!;
  const rotated = rotateChartText(context, [mark], rotation),
    after = chartMarksBounds(context, rotated)!;
  const dx = horizontal
    ? before.x + before.width / 2 - after.x - after.width / 2
    : side > 0
      ? before.x - after.x
      : before.x + before.width - after.x - after.width;
  const dy = horizontal
    ? side > 0
      ? before.y - after.y
      : before.y + before.height - after.y - after.height
    : before.y + before.height / 2 - after.y - after.height / 2;
  return rotated.map((mark) => translateChartMark(mark, dx, dy));
}
