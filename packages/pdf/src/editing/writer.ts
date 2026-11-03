import {
  PdfName,
  PdfReference,
  PdfStream,
  PdfString,
  dictionary,
  type PdfValue,
  type PdfDictionary,
  unsupported,
} from '../objects.ts';
import type { PdfDocument } from '../document.ts';
import { PdfSyntax } from '../syntax.ts';
import { readContentToken, isOperator } from '../content-syntax.ts';
import { inverse, multiply } from '../matrix.ts';
import { pageViewport } from '../scene.ts';
import { layoutPdfTextFlow } from './layout.ts';
import type { PdfEditingFonts, PdfEditingFont } from './fonts.ts';
import type { PdfTextModel, PdfTextSeed } from './model.ts';
import { PdfWriter, enc, bytes, hex, n, serializePdfValue } from './object-writer.ts';
const utf16 = (text: string) => {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    out[i * 2] = text.charCodeAt(i) >>> 8;
    out[i * 2 + 1] = text.charCodeAt(i) & 255;
  }
  return hex(out);
};
type Embedded = {
  resource: string;
  face: PdfEditingFont;
  codes: Map<string, { cid: number; glyph: number; text: string; width: number }>;
};
/** ISO 32000-1 §7.5.6 incremental export. Unchanged objects retain their original bytes. */
export function exportEditedPdf(
  document: PdfDocument,
  model: PdfTextModel,
  fonts: PdfEditingFonts,
) {
  fonts.importDocument(document);
  const flow = layoutPdfTextFlow(model, fonts, document.pages);
  const dirty = [
    ...new Set(flow.regions.filter((region) => region.render).map((region) => region.id)),
  ];
  if (!dirty.length) return document.bytes();
  if (document.source.trailer.has('Encrypt'))
    unsupported('Encrypted PDF editing requires an encryption-aware writer.');
  const writer = new PdfWriter(document),
    embedded = new Map<string, Embedded>();
  const fontFor = (face: PdfEditingFont) => {
    const candidates = [...embedded.values()].filter((font) => font.face.key === face.key);
    let font = candidates.at(-1);
    if (font && font.codes.size >= 65535) font = undefined;
    if (!font) {
      font = { resource: `KNFont${embedded.size}`, face, codes: new Map() };
      embedded.set(font.resource, font);
    }
    return font;
  };
  const pageContent = new Map<number, string>();
  for (const layout of flow.regions.filter((region) => region.render)) {
    const page = flow.pages[layout.page]!.source;
    let content = pageContent.get(layout.page) ?? '';
    const viewport = inverse(pageViewport(page));
    for (const glyph of layout.glyphs) {
      if (glyph.text === '\n') continue;
      const style = glyph.style,
        shaped = fonts.shape(glyph.text, style),
        face = shaped.face;
      let embeddedFont = fontFor(face);
      const scale = style.size / face.font.unitsPerEm;
      let x = glyph.x;
      const color = /^#[0-9a-f]{6}$/i.test(style.color) ? style.color : '#000000';
      const rgb = [1, 3, 5]
        .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
        .map(n)
        .join(' ');
      content += `q ${rgb} rg ${rgb} RG\n`;
      for (let i = 0; i < shaped.glyphs.length; i++) {
        const g = shaped.glyphs[i]!,
          p = shaped.positions[i]!,
          text = i === 0 ? glyph.text : '';
        if (g.id === 0 && glyph.text.trim())
          throw new Error(`The editing font has no glyph for ${glyph.text}.`);
        const key = `${g.id}:${text}`;
        let code = embeddedFont.codes.get(key);
        if (!code) {
          if (embeddedFont.codes.size >= 65535) embeddedFont = fontFor(face);
          code = {
            cid: embeddedFont.codes.size + 1,
            glyph: g.id,
            text,
            width: (g.advanceWidth * 1000) / face.font.unitsPerEm,
          };
          embeddedFont.codes.set(key, code);
        }
        const tm = multiply(viewport, [
          1,
          0,
          shaped.italic ? -0.2 : 0,
          -1,
          x + p.xOffset * scale,
          glyph.y - p.yOffset * scale,
        ]);
        if (shaped.bold) content += `${n(style.size * 0.025)} w\n`;
        content += `BT /${embeddedFont.resource} ${n(style.size)} Tf ${shaped.bold ? '2 Tr ' : ''}${tm.map(n).join(' ')} Tm <${code.cid.toString(16).padStart(4, '0')}> Tj ET\n`;
        x += p.xAdvance * scale;
      }
      if (style.underline) {
        const [a, b, c, d, e, f] = viewport;
        content += `${[a, b, c, d, e, f].map(n).join(' ')} cm ${n(style.size / 16)} w ${n(glyph.x)} ${n(glyph.y + style.size * 0.12)} m ${n(glyph.x + glyph.width)} ${n(glyph.y + style.size * 0.12)} l S\n`;
      }
      content += 'Q\n';
    }
    pageContent.set(layout.page, content);
  }
  const fontRefs = new Map<string, PdfReference>();
  for (const font of embedded.values()) {
    const face = font.face.font,
      scale = 1000 / face.unitsPerEm;
    const program = writer.stream(font.face.bytes, new Map([['Length1', font.face.bytes.length]]));
    const name = new PdfName(font.face.font.postscriptName.replace(/^[A-Z]{6}\+/, ''));
    const descriptor = writer.value(
      new Map<string, PdfValue>([
        ['Type', new PdfName('FontDescriptor')],
        ['FontName', name],
        ['Flags', 32],
        [
          'FontBBox',
          [
            face.bbox.minX * scale,
            face.bbox.minY * scale,
            face.bbox.maxX * scale,
            face.bbox.maxY * scale,
          ],
        ],
        ['ItalicAngle', face.italicAngle],
        ['Ascent', face.ascent * scale],
        ['Descent', face.descent * scale],
        ['CapHeight', face.capHeight * scale],
        ['StemV', 80],
        ['FontFile2', program],
      ]),
    );
    const cmap = new Uint8Array((font.codes.size + 1) * 2),
      widths: PdfValue[] = [];
    for (const code of font.codes.values()) {
      cmap[code.cid * 2] = code.glyph >>> 8;
      cmap[code.cid * 2 + 1] = code.glyph & 255;
      widths.push(code.width);
    }
    const descendant = writer.value(
      new Map<string, PdfValue>([
        ['Type', new PdfName('Font')],
        ['Subtype', new PdfName('CIDFontType2')],
        ['BaseFont', name],
        [
          'CIDSystemInfo',
          new Map<string, PdfValue>([
            ['Registry', new PdfString(bytes('Adobe'))],
            ['Ordering', new PdfString(bytes('Identity'))],
            ['Supplement', 0],
          ]),
        ],
        ['FontDescriptor', descriptor],
        ['CIDToGIDMap', writer.stream(cmap)],
        ['W', [1, widths]],
      ]),
    );
    const mappings = [...font.codes.values()]
      .filter((c) => c.text)
      .map((c) => `<${c.cid.toString(16).padStart(4, '0')}> <${utf16(c.text)}>`);
    let unicode =
      '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /KNUCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n';
    for (let i = 0; i < mappings.length; i += 100) {
      const group = mappings.slice(i, i + 100);
      unicode += `${group.length} beginbfchar\n${group.join('\n')}\nendbfchar\n`;
    }
    unicode += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    fontRefs.set(
      font.resource,
      writer.value(
        new Map<string, PdfValue>([
          ['Type', new PdfName('Font')],
          ['Subtype', new PdfName('Type0')],
          ['BaseFont', name],
          ['Encoding', new PdfName('Identity-H')],
          ['DescendantFonts', [descendant]],
          ['ToUnicode', writer.stream(bytes(unicode))],
        ]),
      ),
    );
  }
  const hasContinuations = flow.pages.length !== document.pages.length;
  const parent = hasContinuations
    ? writer.value(new Map<string, PdfValue>([['Type', new PdfName('Pages')]]))
    : undefined;
  const pageRefs: PdfReference[] = [];
  for (const outputPage of flow.pages) {
    const page = outputPage.source,
      pageIndex = outputPage.index,
      content = pageContent.get(pageIndex) ?? '';
    const continuation = outputPage.continuation > 0;
    const seeds = dirty
      .filter((id) => model.seed(id).page === page.index)
      .map((id) => model.seed(id));
    const resources = continuation ? new Map<string, PdfValue>() : new Map(page.resources);
    const info = continuation
      ? new Map<string, PdfValue>([['Type', new PdfName('Page')]])
      : new Map(page.dictionary);
    if (content || (!continuation && seeds.length)) {
      // Resource names are scoped to a Form, avoiding collisions with imported font names.
      const overlay = writer.stream(
        bytes(content),
        new Map<string, PdfValue>([
          ['Type', new PdfName('XObject')],
          ['Subtype', new PdfName('Form')],
          ['BBox', [...page.mediaBox]],
          ['Resources', new Map<string, PdfValue>([['Font', new Map(fontRefs)]])],
        ]),
      );
      const xobjects = new Map(
        dictionary(document.source.resolve(resources.get('XObject') ?? new Map())),
      );
      let overlayName = 'KNText';
      while (xobjects.has(overlayName)) overlayName += '_';
      xobjects.set(overlayName, overlay);
      resources.set('XObject', xobjects);
      const original = continuation
        ? null
        : document.source.resolve(page.dictionary.get('Contents'));
      const streams = original === null ? [] : Array.isArray(original) ? original : [original];
      const rewritten = streams.map((value) => {
        const stream = document.source.resolve(value);
        if (!(stream instanceof PdfStream)) throw new Error('Invalid page content stream.');
        return rewrite(stream, `page:${page.id}:stream:${stream.object.key}`, resources, seeds);
      });
      // Isolate appended content from the original page's persistent graphics and text state.
      info.set('Contents', [
        writer.stream(bytes('q\n')),
        ...rewritten,
        writer.stream(bytes(`Q\nq /${overlayName} Do Q\n`)),
      ]);
    }
    if (parent || continuation) {
      if (parent) info.set('Parent', parent);
      info.set('MediaBox', [...page.mediaBox]);
      info.set('CropBox', [...page.cropBox]);
      info.set('Rotate', page.rotation);
      info.set('UserUnit', page.userUnit);
    }
    info.set('Resources', resources);
    if (continuation) pageRefs.push(writer.value(info));
    else {
      pageRefs.push(page.reference);
      if (parent || pageContent.has(pageIndex) || seeds.length) writer.value(info, page.reference);
    }
  }
  if (parent) {
    writer.value(
      new Map<string, PdfValue>([
        ['Type', new PdfName('Pages')],
        ['Count', pageRefs.length],
        ['Kids', pageRefs],
      ]),
      parent,
    );
    const catalog = new Map(document.source.catalog);
    catalog.set('Pages', parent);
    const root = document.source.trailer.get('Root');
    if (!(root instanceof PdfReference)) throw new Error('Invalid PDF catalog reference.');
    writer.value(catalog, root);
  }
  function rewrite(
    stream: PdfStream,
    instance: string,
    resources: PdfDictionary,
    seeds: PdfTextSeed[],
  ): PdfReference {
    const source = document.source,
      data = source.stream(stream),
      patches = new Map<number, { end: number; text: string }>();
    const localResources = new Map(resources),
      xobjects = new Map(dictionary(source.resolve(resources.get('XObject') ?? new Map())));
    const targets = seeds.flatMap((s) => s.sources);
    for (const target of targets)
      if (target.instance === instance && target.object === stream.object.key) {
        const syntax = new PdfSyntax(data.subarray(target.start, target.end));
        const operands: PdfValue[] = [];
        let operator = '';
        while (syntax.position < syntax.bytes.length) {
          const token = readContentToken(syntax);
          if (isOperator(token)) {
            operator = token.operator;
            break;
          }
          operands.push(token);
        }
        const prefix =
          operator === "'"
            ? 'T* '
            : operator === '"'
              ? `${serializePdfValue(operands[0]!)} Tw ${serializePdfValue(operands[1]!)} Tc T* `
              : '';
        // Replace glyph codes with their exact displacement. Deleted text is absent from extraction.
        patches.set(target.start, {
          end: target.end,
          text: `${prefix}[${n(target.displacement + (operator === 'TJ' && Array.isArray(operands[0]) ? operands[0].reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0) : 0))}] TJ`,
        });
      }
    const children = [
      ...new Set(
        targets
          .filter((t) => t.instance.startsWith(instance + ':form:'))
          .map((t) => t.instance.slice(instance.length + 6).split(':')[0]!),
      ),
    ];
    for (const offset of children) {
      const start = Number(offset),
        syntax = new PdfSyntax(data);
      syntax.position = start;
      const operand = readContentToken(syntax),
        op = readContentToken(syntax);
      if (!(operand instanceof PdfName) || !isOperator(op) || op.operator !== 'Do') continue;
      const nested = source.resolve(xobjects.get(operand.value));
      if (!(nested instanceof PdfStream)) continue;
      const childInstance = `${instance}:form:${offset}`;
      const nestedResources = nested.dictionary.has('Resources')
        ? dictionary(source.resolve(nested.dictionary.get('Resources')))
        : resources;
      const ref = rewrite(nested, childInstance, nestedResources, seeds);
      let key = `KNForm${offset}`;
      while (xobjects.has(key)) key += '_';
      xobjects.set(key, ref);
      patches.set(start, { end: syntax.position, text: `/${key} Do` });
    }
    localResources.set('XObject', xobjects);
    if (instance.startsWith('page:') && !instance.includes(':form:'))
      resources.set('XObject', xobjects);
    const chunks: Uint8Array[] = [];
    let at = 0;
    for (const [start, patch] of [...patches].sort((a, b) => a[0] - b[0])) {
      chunks.push(data.subarray(at, start), bytes(patch.text));
      at = patch.end;
    }
    chunks.push(data.subarray(at));
    const result = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
    at = 0;
    for (const c of chunks) {
      result.set(c, at);
      at += c.length;
    }
    const info = new Map(stream.dictionary);
    if (instance.includes(':form:')) info.set('Resources', localResources);
    return writer.stream(result, info);
  }
  return writer.finish();
}
