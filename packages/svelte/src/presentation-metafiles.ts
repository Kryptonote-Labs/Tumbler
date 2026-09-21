/** Decode Windows metafiles lazily, keeping the main Office renderer independent of the DOM. */
export async function metafileSvg(
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const { EMFJS, WMFJS } = await import("rtf.js");
  EMFJS.loggingEnabled(false);
  WMFJS.loggingEnabled(false);
  const buffer = Uint8Array.from(bytes).buffer,
    view = new DataView(buffer);
  const emf = contentType.includes("emf");
  let width = 1000,
    height = 1000;
  if (emf && bytes.length >= 40) {
    width = Math.max(1, view.getInt32(16, true) - view.getInt32(8, true));
    height = Math.max(1, view.getInt32(20, true) - view.getInt32(12, true));
  } else if (bytes.length >= 22 && view.getUint32(0, true) === 0x9ac6cdd7) {
    width = Math.max(1, view.getInt16(10, true) - view.getInt16(6, true));
    height = Math.max(1, view.getInt16(12, true) - view.getInt16(8, true));
  }
  const settings = {
    width: String(width),
    height: String(height),
    xExt: width,
    yExt: height,
    wExt: width,
    hExt: height,
    mapMode: 8,
  };
  const svg = emf
    ? new EMFJS.Renderer(buffer).render(settings)
    : new WMFJS.Renderer(buffer).render(settings);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(svg);
}
