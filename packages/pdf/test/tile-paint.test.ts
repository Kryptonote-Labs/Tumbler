import { expect, test } from 'bun:test';
import { createCanvas, Path2D, ImageData, type Canvas } from '@napi-rs/canvas';
import {
  openPdfDocument,
  PdfInterpreter,
  paintPdfPage,
  type PdfPaintHost,
  type PdfCanvasContext,
} from '../src/index.ts';
const host: PdfPaintHost<Canvas, Path2D> = {
  path: (svg) => new Path2D(svg),
  surface(width, height) {
    const image = createCanvas(width, height);
    return {
      image,
      context: image.getContext('2d') as unknown as PdfCanvasContext<Canvas, Path2D>,
    };
  },
  async image(data) {
    if (!data.rgba) throw new Error('This fixture must use decoded images.');
    const canvas = createCanvas(data.width, data.height);
    canvas
      .getContext('2d')
      .putImageData(new ImageData(new Uint8ClampedArray(data.rgba), data.width, data.height), 0, 0);
    return canvas;
  },
};
for (const name of ['graphics', 'inherited-page', 'hidden-ocr', 'inline-image', 'annotation']) {
  test(`${name}: a device-pixel tile matches the full page including negative gutters`, async () => {
    const pdf = openPdfDocument(
      new Uint8Array(
        await Bun.file(new URL(`./fixtures/${name}.pdf`, import.meta.url)).arrayBuffer(),
      ),
    );
    const scene = new PdfInterpreter(pdf).page(0),
      scale = 1.75;
    const full = host.surface(Math.ceil(scene.width * scale), Math.ceil(scene.height * scale));
    await paintPdfPage(full.context, scene, pdf.source, host, { scale });
    for (const region of [
      { x: 31, y: 19, width: 79, height: 83 },
      { x: -1, y: -1, width: 64, height: 64 },
    ]) {
      const tile = host.surface(region.width, region.height);
      await paintPdfPage(tile.context, scene, pdf.source, host, { scale, region });
      const left = Math.max(0, region.x),
        top = Math.max(0, region.y);
      const width = Math.min(region.width + Math.min(0, region.x), full.image.width - left);
      const height = Math.min(region.height + Math.min(0, region.y), full.image.height - top);
      const expected = full.image.getContext('2d').getImageData(left, top, width, height).data;
      const actual = tile.image
        .getContext('2d')
        .getImageData(left - region.x, top - region.y, width, height).data;
      expect(actual).toEqual(expected);
    }
  });
}
for (const password of ['fixture-password', 'fixture-owner'])
  test(`worker input reopens an authenticated PDF with ${password}`, async () => {
    const bytes = new Uint8Array(
      await Bun.file(new URL('./fixtures/encrypted-aes256.pdf', import.meta.url)).arrayBuffer(),
    );
    const pdf = openPdfDocument(bytes, { password }),
      input = pdf.source.renderInput();
    const reopened = openPdfDocument(
      input.bytes,
      input.password === undefined ? {} : { password: input.password },
    );
    expect(new PdfInterpreter(reopened).page(0).text).toBe(new PdfInterpreter(pdf).page(0).text);
    input.bytes.fill(0);
    expect(pdf.bytes()).toEqual(bytes);
  });

for (const name of ['chromium-typography','truetype-extraction','positioned-text'])
  test(name + ': glyph bounds culling retains exact tile pixels', async () => {
    const pdf = openPdfDocument(await Bun.file(new URL('./fixtures/'+name+'.pdf',import.meta.url)).bytes());
    const scene = new PdfInterpreter(pdf).page(0);
    const unbounded = {...scene,elements:scene.elements.map((element)=>{
      if(element.kind!=='glyph')return element;
      const {bounds: _bounds,...glyph}=element.glyph;
      return {...element,glyph};
    })};
    for(const region of [{x:31,y:19,width:79,height:83},{x:-1,y:-1,width:64,height:64}]) {
      const expected=host.surface(region.width,region.height),actual=host.surface(region.width,region.height);
      await paintPdfPage(expected.context,unbounded,pdf.source,host,{scale:1.75,region});
      await paintPdfPage(actual.context,scene,pdf.source,host,{scale:1.75,region});
      expect(actual.image.getContext('2d').getImageData(0,0,region.width,region.height).data)
        .toEqual(expected.image.getContext('2d').getImageData(0,0,region.width,region.height).data);
    }
  });
