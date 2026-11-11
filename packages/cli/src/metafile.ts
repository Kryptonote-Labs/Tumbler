import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { DOMImplementation, XMLSerializer, type Element } from '@xmldom/xmldom';

type MetafileRenderer = {
  loggingEnabled(enabled: boolean): void;
  Renderer: new (bytes: ArrayBuffer) => { render(settings: { width: string; height: string; xExt: number; yExt: number; wExt: number; hExt: number; mapMode: number }): Element };
};
const renderers = new Map<'EMFJS' | 'WMFJS', MetafileRenderer>();

/** Runs the browser metafile decoder with its own XML document, without changing host globals. */
export function officeMetafileSvg(bytes: Uint8Array, contentType: string): string {
  const kind = contentType.includes('emf') ? 'EMFJS' : 'WMFJS';
  let renderer = renderers.get(kind);
  if (!renderer) {
    const require = createRequire(import.meta.url);
    const filename = require.resolve(`rtf.js/dist/${kind}.bundle.js`);
    const module = { exports: {} };
    runInNewContext(readFileSync(filename, 'utf8'), {
      module, exports: module.exports,
      document: new DOMImplementation().createDocument('http://www.w3.org/2000/svg', 'svg'),
      btoa, atob, console,
    }, { filename });
    renderer = module.exports as MetafileRenderer;
    renderer.loggingEnabled(false);
    renderers.set(kind, renderer);
  }
  const buffer = Uint8Array.from(bytes).buffer, view = new DataView(buffer);
  let width = 1000, height = 1000;
  if (kind === 'EMFJS' && bytes.length >= 40) {
    width = Math.max(1, view.getInt32(16, true) - view.getInt32(8, true));
    height = Math.max(1, view.getInt32(20, true) - view.getInt32(12, true));
  } else if (bytes.length >= 22 && view.getUint32(0, true) === 0x9ac6cdd7) {
    width = Math.max(1, view.getInt16(10, true) - view.getInt16(6, true));
    height = Math.max(1, view.getInt16(12, true) - view.getInt16(8, true));
  }
  const svg = new renderer.Renderer(buffer).render({ width: String(width), height: String(height), xExt: width, yExt: height, wExt: width, hExt: height, mapMode: 8 });
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(svg);
}
