import type { PdfFlowRegion, PdfEditingFonts } from '@tumblerjs/pdf';

const paths = new WeakMap<object, Path2D>();

/** Paint edited glyphs with the same metrics used by layout and PDF export. */
export function paintPdfText(
  context: CanvasRenderingContext2D,
  regions: readonly PdfFlowRegion[],
  fonts: PdfEditingFonts,
) {
  // Paint backgrounds first so italic overhangs remain above neighbouring cells.
  for (const region of regions)
    for (const glyph of region.glyphs) {
      if (glyph.style.background && /^#[0-9a-f]{6}$/i.test(glyph.style.background)) {
        context.fillStyle = glyph.style.background;
        context.fillRect(glyph.x, glyph.y - glyph.style.size * 0.85, glyph.width, glyph.style.size * 1.15);
      }
    }
  for (const region of regions)
    for (const glyph of region.glyphs) {
      if (glyph.text === '\n') continue;
      const shaped = fonts.shape(glyph.text, glyph.style),
        em = glyph.style.size / shaped.face.font.unitsPerEm;
      let x = glyph.x;
      for (let i = 0; i < shaped.glyphs.length; i++) {
        const position = shaped.positions[i]!,
          outline = shaped.glyphs[i]!;
        context.save();
        context.translate(x + position.xOffset * em, glyph.y - position.yOffset * em);
        context.scale(em, -em);
        if (shaped.italic) context.transform(1, 0, 0.2, 1, 0, 0);
        context.fillStyle = glyph.style.color;
        let path = paths.get(outline);
        if (!path) {
          path = new Path2D(outline.path.toSVG());
          paths.set(outline, path);
        }
        context.fill(path);
        if (shaped.bold) {
          context.strokeStyle = glyph.style.color;
          context.lineWidth = shaped.face.font.unitsPerEm * 0.025;
          context.stroke(path);
        }
        context.restore();
        x += position.xAdvance * em;
      }
      if (glyph.style.strike) {
        context.strokeStyle = glyph.style.color;
        context.lineWidth = glyph.style.size / 16;
        context.beginPath();
        context.moveTo(glyph.x, glyph.y - glyph.style.size * 0.3);
        context.lineTo(glyph.x + glyph.width, glyph.y - glyph.style.size * 0.3);
        context.stroke();
      }
      if (glyph.style.underline) {
        context.strokeStyle = glyph.style.color;
        context.lineWidth = glyph.style.size / 16;
        context.beginPath();
        context.moveTo(glyph.x, glyph.y + glyph.style.size * 0.12);
        context.lineTo(glyph.x + glyph.width, glyph.y + glyph.style.size * 0.12);
        context.stroke();
      }
    }
}
