/** Synthetic Office-profile InkML, authored for these tests under the repository's MIT license. */
export function officeInk(options: { trace?: string; channels?: string; properties?: string; brush?: string; extra?: string; attributes?: string } = {}): string {
  return `<ink xmlns="http://www.w3.org/2003/InkML" xmlns:custom="urn:tumbler:test">
  <!-- retained metadata -->
  <definitions><context xml:id="context"><inkSource xml:id="device"><traceFormat>${options.channels ?? '<channel name="X" type="integer" units="cm"/><channel name="Y" type="integer" units="cm"/>'}</traceFormat>
  <channelProperties>${options.properties ?? '<channelProperty channel="X" name="resolution" value="1000" units="1/cm"/><channelProperty channel="Y" name="resolution" value="1000" units="1/cm"/>'}</channelProperties></inkSource></context>
  <brush xml:id="pen">${options.brush ?? '<brushProperty name="width" value="0.05" units="cm"/><brushProperty name="height" value="0.05" units="cm"/>'}</brush></definitions>
  <trace xml:id="stroke" contextRef="#context" brushRef="#pen" ${options.attributes ?? ''}>${options.trace ?? '0 0, 1000 1000'}</trace>
  ${options.extra ?? '<annotationXML><custom:data answer="42"/></annotationXML>'}</ink>`;
}
export const bytes = (xml: string) => new TextEncoder().encode(xml);
