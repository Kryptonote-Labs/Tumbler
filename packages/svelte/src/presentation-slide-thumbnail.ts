import {
  paintPresentationSlide,
  presentationSlideImages,
  type PresentationDocument,
  type PresentationSlide,
  type SlideText,
} from '@tumblerjs/slides';
import type { DrawingPictureFill } from '@tumblerjs/ooxml';
import { loadPresentationFonts } from './presentation-fonts.ts';
import { presentationImageUrl } from './presentation-image-url.ts';
import { metafileSvg } from './presentation-metafiles.ts';

function needsSvgText(text: SlideText | undefined) {
  return text && (
    text.autoFit === 'shape' || text.rotation || (text.direction && text.direction !== 'horz') ||
    (text.columns ?? 1) > 1 || text.verticalOverflow === 'ellipsis' ||
    text.paragraphs.some((paragraph) =>
      paragraph.rtl || paragraph.distributed || paragraph.align === 'justify' ||
      paragraph.runs.some((run) =>
        run.text.includes('\t') || run.spacing || run.capitals === 'all' || run.capitals === 'small'
      )
    )
  );
}

async function decodePicture(picture: DrawingPictureFill) {
  if (!picture.bytes.length) throw new Error('Slide picture is not available.');
  const metafile = /(?:emf|wmf)$/.test(picture.contentType);
  const bytes = metafile
    ? new TextEncoder().encode(await metafileSvg(picture.bytes, picture.contentType))
    : picture.bytes;
  const resource = presentationImageUrl(bytes, metafile ? 'image/svg+xml' : picture.contentType);
  try {
    const image = new Image();
    image.src = resource.url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    resource.release();
  }
}

/** Paints a static sidebar preview. Use the SVG slide view when the canvas cannot represent it. */
export async function renderPresentationSlideThumbnail({
  presentation,
  slide,
  embeddedFonts = presentation.embeddedFonts,
  signal,
}: {
  presentation: PresentationDocument;
  slide: PresentationSlide;
  embeddedFonts?: PresentationDocument['embeddedFonts'];
  signal: AbortSignal;
}): Promise<Blob | undefined> {
  if (slide.objects.some((object) =>
    object.kind === 'unsupported' || (object.chart && object.chart.status !== 'supported') ||
    object.ink || object.effects?.length || object.shadow || object.reflection ||
    object.head || object.tail || needsSvgText(object.text) ||
    object.table?.cells.some((cell) => needsSvgText(cell.text))
  )) return;
  if (embeddedFonts?.some((font) => !font.bytes.length)) return;
  const scale = 320 / Math.max(presentation.width, presentation.height);
  const fonts = loadPresentationFonts(embeddedFonts ?? []);
  try {
    const pictures = await Promise.all(
      presentationSlideImages(slide, presentation, scale).map(async (picture) =>
        [picture, await decodePicture(picture)] as const),
    );
    const results = await fonts.results;
    signal.throwIfAborted();
    if (results.some((result) => result.status === 'failed')) return;
    const decoded = new Map(pictures);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(presentation.width * scale));
    canvas.height = Math.max(1, Math.round(presentation.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return;
    paintPresentationSlide(context, presentation, slide, {
      scale,
      path: (data) => new Path2D(data),
      image: (picture) => decoded.get(picture),
      fontFamily: fonts.family,
    });
    return await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png');
    });
  } finally {
    fonts.destroy();
  }
}
