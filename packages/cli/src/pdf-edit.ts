import { z } from 'zod';
import {
  defaultPdfTextStyle,
  layoutPdfTextFlow,
  pdfContinuationHeight,
  type PdfDocument,
  type PdfTextModel,
  type PdfEditingFonts,
} from '@tumblerjs/pdf';

const page = z.number().int().positive().safe();
const offset = z.number().int().nonnegative().safe();
const id = z.string().min(1);
const style = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    size: z.number().positive().finite().optional(),
    family: z.enum(['Sans', 'Serif', 'Mono']).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    font: z.string().min(1).optional(),
  })
  .strict()
  .transform((p) => ({
    ...(p.bold === undefined ? {} : { bold: p.bold }),
    ...(p.italic === undefined ? {} : { italic: p.italic }),
    ...(p.underline === undefined ? {} : { underline: p.underline }),
    ...(p.size === undefined ? {} : { size: p.size }),
    ...(p.family === undefined ? {} : { family: p.family }),
    ...(p.color === undefined ? {} : { color: p.color }),
    ...(p.font === undefined ? {} : { font: p.font }),
  }));
export const pdfEdits = {
  'replace-text': z
    .object({ id, text: z.string(), start: offset.optional(), end: offset.optional() })
    .strict(),
  'add-text': z
    .object({
      page,
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().positive().finite(),
      text: z.string(),
      style: style.optional(),
    })
    .strict(),
  'place-text': z
    .object({
      id,
      x: z.number().finite().optional(),
      y: z.number().finite().optional(),
      width: z.number().positive().finite().optional(),
    })
    .strict(),
  'duplicate-text': z
    .object({ id, dx: z.number().finite().default(12), dy: z.number().finite().default(12) })
    .strict(),
  'hide-text': z.object({ id, hidden: z.boolean().default(true) }).strict(),
  'format-text': z.object({ id, start: offset.optional(), end: offset.optional(), style }).strict(),
  'insert-page': z
    .object({
      after: page.optional(),
      width: z.number().positive().finite().optional(),
      height: z.number().positive().finite().optional(),
    })
    .strict(),
  'rotate-page': z
    .object({
      page,
      degrees: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    })
    .strict(),
  'move-page': z.object({ page, before: page.optional() }).strict(),
};
export const pdfEditInput = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('replace-text'), input: pdfEdits['replace-text'] }).strict(),
  z.object({ operation: z.literal('add-text'), input: pdfEdits['add-text'] }).strict(),
  z.object({ operation: z.literal('place-text'), input: pdfEdits['place-text'] }).strict(),
  z.object({ operation: z.literal('duplicate-text'), input: pdfEdits['duplicate-text'] }).strict(),
  z.object({ operation: z.literal('hide-text'), input: pdfEdits['hide-text'] }).strict(),
  z.object({ operation: z.literal('format-text'), input: pdfEdits['format-text'] }).strict(),
  z.object({ operation: z.literal('insert-page'), input: pdfEdits['insert-page'] }).strict(),
  z.object({ operation: z.literal('rotate-page'), input: pdfEdits['rotate-page'] }).strict(),
  z.object({ operation: z.literal('move-page'), input: pdfEdits['move-page'] }).strict(),
]);
export type PdfEditInput = z.infer<typeof pdfEditInput>;

/** Execute against the same collaborative model used by the PDF editor. Pages refer to current output order. */
export function editPdfModel(
  document: PdfDocument,
  model: PdfTextModel,
  fonts: PdfEditingFonts,
  command: PdfEditInput,
) {
  const flow = layoutPdfTextFlow(model, fonts, document.pages);
  const at = (number: number) => {
    const result = flow.pages[number - 1];
    if (!result) throw new Error('PDF page is outside the document.');
    return result;
  };
  let regionId: string | undefined;
  // Parsing each operation keeps the input correlated with its operation at runtime and in TypeScript.
  switch (command.operation) {
    case 'replace-text': {
      const p = pdfEdits['replace-text'].parse(command.input);
      model.replace(p.id, p.start ?? 0, p.end ?? model.text(p.id).length, p.text);
      break;
    }
    case 'add-text': {
      const p = pdfEdits['add-text'].parse(command.input),
        target = at(p.page);
      regionId = crypto.randomUUID();
      const style = { ...defaultPdfTextStyle, ...p.style };
      model.add({
        id: regionId,
        page: target.source.index,
        continuation: target.continuation,
        x: p.x,
        y: p.y + target.continuation * pdfContinuationHeight(target.source),
        width: p.width,
        lineHeight: style.size * 1.25,
        style,
        sources: [],
        delta: [],
      });
      model.replace(regionId, 0, 0, p.text, style);
      break;
    }
    case 'place-text': {
      const { id, ...patch } = pdfEdits['place-text'].parse(command.input);
      const region = flow.regions.find((r) => r.id === id);
      const target = region && flow.pages[region.page];
      model.place(id, {
        ...region?.origin,
        ...(patch.x === undefined ? {} : { x: patch.x }),
        ...(patch.y === undefined ? {} : { y: patch.y + (target ? target.continuation * pdfContinuationHeight(target.source) : 0) }),
        ...(patch.width === undefined ? {} : { width: patch.width }),
      });
      break;
    }
    case 'duplicate-text': {
      const p = pdfEdits['duplicate-text'].parse(command.input);
      regionId = crypto.randomUUID();
      model.duplicate(p.id, regionId, flow.regions.find((r) => r.id === p.id)?.origin, p.dx, p.dy);
      break;
    }
    case 'hide-text': {
      const p = pdfEdits['hide-text'].parse(command.input);
      model.hide(p.id, p.hidden);
      break;
    }
    case 'format-text': {
      const p = pdfEdits['format-text'].parse(command.input);
      model.format(p.id, p.start ?? 0, p.end ?? model.text(p.id).length, p.style);
      break;
    }
    case 'insert-page': {
      const p = pdfEdits['insert-page'].parse(command.input);
      if ((p.width === undefined) !== (p.height === undefined))
        throw new Error('Supply both width and height.');
      model.pages.insert(
        document.pages,
        p.after === undefined ? undefined : at(p.after).id,
        p.width === undefined ? undefined : { width: p.width, height: p.height! },
        flow.pages,
      );
      break;
    }
    case 'rotate-page': {
      const p = pdfEdits['rotate-page'].parse(command.input);
      model.pages.rotate(document.pages, [at(p.page).id], p.degrees, flow.pages);
      break;
    }
    case 'move-page': {
      const p = pdfEdits['move-page'].parse(command.input);
      model.pages.move(
        document.pages,
        at(p.page).id,
        p.before === undefined ? undefined : at(p.before).id,
        flow.pages,
      );
      break;
    }
    default:
      throw new Error('Unknown PDF operation.');
  }
  return {
    deletedPages: [],
    pageCount: layoutPdfTextFlow(model, fonts, document.pages).pages.length,
    regionId,
  };
}

export function inspectPdfModel(
  document: PdfDocument,
  model: PdfTextModel,
  fonts: PdfEditingFonts,
  page: number,
) {
  const flow = layoutPdfTextFlow(model, fonts, document.pages),
    target = flow.pages[page - 1];
  if (!target) throw new Error('PDF page is outside the document.');
  return {
    page,
    pageCount: flow.pages.length,
    pageId: target.id,
    rotation: target.rotation,
    regions: flow.regions
      .filter((r) => r.page === page - 1)
      .map((r) => {
        const geometry = model.geometry(r.id);
        return {
          id: r.id,
          text: model.text(r.id).toString(),
          bounds: { x: r.origin.x, y: r.top, width: geometry.width, height: r.bottom - r.top },
          placement: model.placement(r.id),
          style: model.styleAt(r.id, 0),
          runs: model.text(r.id).toDelta(),
          hidden: !!geometry.hidden,
        };
      }),
  };
}
