import { mount, unmount } from 'svelte';
import WordInkPageLayer from '../../../../../packages/svelte/src/WordInkPageLayer.svelte';
import { layoutWordDocument, openWordArtifact, paintWordPage, type WordLayoutPage } from '@tumblerjs/word';
import { wordInkTiles } from '../../../../../packages/svelte/src/word-ink-tiles.ts';

export function fixture(bytes: number[]) {
  const artifact = openWordArtifact(new Uint8Array(bytes));
  return layoutWordDocument(artifact.document, { measure: text => ({ width: text.length * 6, ascent: 9, descent: 3 }) }).pages[0]!;
}

export async function show(page: WordLayoutPage, scale: number, count = 1) {
  const errors: string[] = [];
  const baselinePath = import.meta.env.VITE_INK_BASELINE;
  const Layer: typeof WordInkPageLayer = baselinePath ? (await import(/* @vite-ignore */ baselinePath)).default : WordInkPageLayer;
  const mounted = Array.from({ length: count }, () => {
    const target = document.createElement('div');
    target.setAttribute('data-word-ink-page-host', '');
    const fallback = document.createElement('img');
    fallback.setAttribute('data-word-ink-rendering', 'raster');
    target.append(fallback);
    document.body.append(target);
    return { target, component: mount(Layer, { target, props: { page, scale, onerror: message => errors.push(message) } }) };
  });
  return { errors, mounted, dispose: async () => { for (const item of mounted) { await unmount(item.component); item.target.remove(); } } };
}

/** The audit algorithm, kept here to compare identical generated pages in one browser. */
export function baseline(page: WordLayoutPage, scale: number) {
  const buffer = document.createElement('canvas'), backdrop = document.createElement('canvas'), target = document.createElement('canvas');
  buffer.width = backdrop.width = Math.ceil(page.width * scale);
  buffer.height = backdrop.height = Math.ceil(page.height * scale);
  const context = buffer.getContext('2d')!, underneath = backdrop.getContext('2d')!;
  paintWordPage(context, page, { scale, inkMaxPixels: Infinity, path: d => new Path2D(d) });
  paintWordPage(underneath, page, { scale, inkMaxPixels: Infinity, omitDestinationInk: true, path: d => new Path2D(d) });
  const pixels = context.getImageData(0, 0, buffer.width, buffer.height);
  const original = underneath.getImageData(0, 0, buffer.width, buffer.height).data;
  for (let index = 0; index < pixels.data.length; index += 4) {
    if (pixels.data[index] === original[index] && pixels.data[index + 1] === original[index + 1] && pixels.data[index + 2] === original[index + 2] && pixels.data[index + 3] === original[index + 3]) pixels.data[index + 3] = 0;
  }
  context.putImageData(pixels, 0, 0);
  target.width = buffer.width; target.height = buffer.height;
  target.getContext('2d')!.drawImage(buffer, 0, 0);
  buffer.width = backdrop.width = 0;
  return target;
}

export { paintWordPage, wordInkTiles };

export function withBrokenImage(page: WordLayoutPage, overlap: boolean): WordLayoutPage {
  const column = page.columns[0]!, line = column.lines[0]!;
  const ink = line.fragments.find(fragment => fragment.drawing?.kind === 'image')!;
  if (ink.drawing?.kind !== 'image') throw Error('Missing fixture ink');
  const { ink: _ink, inkProjection: _projection, inkRendering: _rendering, ...ordinary } = ink.drawing;
  const fragment = { ...ink, x: overlap ? ink.x : 500, y: overlap ? ink.y : 500,
    drawing: { ...ordinary, bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' } };
  return { ...page, columns: [{ ...column, lines: [{ ...line, fragments: [...line.fragments, fragment] }, ...column.lines.slice(1)] }, ...page.columns.slice(1)] };
}
