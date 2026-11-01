/** A stroke in physical points, with pressure normalized from zero to one. */
export interface AuthoredInkStroke {
  readonly points: readonly (readonly [number, number, number])[];
  readonly color: string;
  readonly size: number;
  readonly highlighter?: boolean;
}
/** Office InkML with explicit calibration, independent of the host device. */
export function authoredOfficeInkXml(strokes: readonly AuthoredInkStroke[]): string {
  if (
    !strokes.length ||
    strokes.some(
      (s) =>
        !/^#[a-f\d]{6}$/i.test(s.color) ||
        !Number.isFinite(s.size) ||
        s.size <= 0 ||
        !s.points.length ||
        s.points.some((p) => p.length !== 3 || !p.every(Number.isFinite) || p[2] < 0 || p[2] > 1),
    )
  )
    throw new TypeError('Invalid ink strokes.');
  const brushes = strokes
    .map(
      (stroke, i) =>
        `<brush xml:id="pen${i}"><brushProperty name="width" value="${stroke.size}" units="pt"/><brushProperty name="height" value="${stroke.size}" units="pt"/><brushProperty name="color" value="${stroke.color}"/><brushProperty name="tip" value="${stroke.highlighter ? 'rectangle' : 'ellipse'}"/><brushProperty name="transparency" value="${stroke.highlighter ? 128 : 0}"/><brushProperty name="ignorePressure" value="${stroke.highlighter ? 'true' : 'false'}"/><brushProperty name="fitToCurve" value="false"/></brush>`,
    )
    .join('');
  const traces = strokes
    .map(
      (stroke, i) =>
        `<trace xml:id="stroke${i}" contextRef="#context" brushRef="#pen${i}">${stroke.points.map((p) => [Math.round((p[0] * 2540) / 72), Math.round((p[1] * 2540) / 72), Math.round(p[2] * 1023)].join(' ')).join(', ')}</trace>`,
    )
    .join('');
  return `<ink xmlns="http://www.w3.org/2003/InkML"><definitions><context xml:id="context"><inkSource xml:id="device"><traceFormat><channel name="X" type="integer" units="cm"/><channel name="Y" type="integer" units="cm"/><channel name="F" type="integer" units="dev" min="0" max="1023"/></traceFormat><channelProperties><channelProperty channel="X" name="resolution" value="1000" units="1/cm"/><channelProperty channel="Y" name="resolution" value="1000" units="1/cm"/></channelProperties></inkSource></context>${brushes}</definitions>${traces}</ink>`;
}
