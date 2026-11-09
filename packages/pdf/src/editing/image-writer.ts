import { dictionary, PdfName, type PdfValue } from '../objects.ts';
import type { PdfDocument } from '../document.ts';
import type { PdfImagePlacement } from './image-model.ts';
import { PdfWriter, bytes, n } from './object-writer.ts';
import { pageViewport } from '../scene.ts';
import { inverse, multiply } from '../matrix.ts';

export type PdfImagePixels = { width: number; height: number; rgba: Uint8Array };
/** Append real image XObjects after text/page export. Geometry is in source viewport points. */
export function writePdfImages(document: PdfDocument, placements: { image: PdfImagePlacement; output: number; viewport: ReturnType<typeof pageViewport> }[], resolve: (asset: string) => PdfImagePixels) {
  const writer = new PdfWriter(document);
  const embedded = new Map<string, ReturnType<PdfWriter['stream']>>();
  for (const page of document.pages) {
    const images = placements.filter(p => p.output === page.index);
    if (!images.length) continue;
    const resources = new Map(page.resources);
    const xobjects = new Map(dictionary(document.source.resolve(resources.get('XObject') ?? new Map())));
    let content = '';
    for (const { image, viewport } of images) {
      let ref = embedded.get(image.asset);
      if (!ref) {
        const pixels = resolve(image.asset), { width, height, rgba } = pixels;
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || rgba.length !== width * height * 4) throw new Error('Invalid PDF image pixels.');
        const rgb = new Uint8Array(width * height * 3), alpha = new Uint8Array(width * height);
        for (let i = 0; i < alpha.length; i++) {
          rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
          alpha[i] = rgba[i * 4 + 3]!;
        }
        const info = new Map<string, PdfValue>([['Type', new PdfName('XObject')], ['Subtype', new PdfName('Image')], ['Width', width], ['Height', height], ['BitsPerComponent', 8], ['ColorSpace', new PdfName('DeviceRGB')]]);
        if (alpha.some(a => a !== 255)) info.set('SMask', writer.stream(alpha, new Map<string, PdfValue>([['Type', new PdfName('XObject')], ['Subtype', new PdfName('Image')], ['Width', width], ['Height', height], ['BitsPerComponent', 8], ['ColorSpace', new PdfName('DeviceGray')]]), true));
        ref = writer.stream(rgb, info, true);
        embedded.set(image.asset, ref);
      }
      let name = 'KNImage'; while (xobjects.has(name)) name += '_';
      xobjects.set(name, ref);
      const angle = image.rotation * Math.PI / 180, c = Math.round(Math.cos(angle)), s = Math.round(Math.sin(angle));
      const rotation = [c, s, -s, c, image.x + image.width / 2, image.y + image.height / 2] as const;
      const matrix = multiply(inverse(viewport), multiply(rotation, [image.width, 0, 0, -image.height, -image.width / 2, image.height / 2]));
      content += `q ${matrix.map(n).join(' ')} cm /${name} Do Q\n`;
    }
    resources.set('XObject', xobjects);
    const info = new Map(page.dictionary), reference = info.get('Contents') ?? null;
    const resolved = document.source.resolve(reference), original = Array.isArray(resolved) ? resolved : reference;
    info.set('Resources', resources);
    info.set('Contents', [writer.stream(bytes('q\n')), ...(original === null ? [] : Array.isArray(original) ? original : [original]), writer.stream(bytes('Q\n' + content))]);
    writer.value(info, page.reference);
  }
  return writer.finish();
}
