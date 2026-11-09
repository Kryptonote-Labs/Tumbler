import type { PdfTextModel } from '@tumblerjs/pdf';

/** Retain relative positions while browser clipboard permission is pending. */
export async function copyPdfText(
  model: PdfTextModel,
  id: string,
  start: number,
  end: number,
  clipboard: Pick<Clipboard, 'writeText'>,
  canCut: () => boolean,
) {
  const text = model.text(id).toString();
  const first = start === end ? 0 : start,
    last = start === end ? text.length : end;
  const a = model.anchor(id, first),
    b = model.anchor(id, last);
  await clipboard.writeText(text.slice(first, last));
  if (!canCut()) return;
  const from = model.resolve(a),
    to = model.resolve(b);
  if (from && to) {
    model.undo.stopCapturing();
    model.replace(id, from.offset, to.offset, '');
    model.undo.stopCapturing();
  }
}

export async function pastePdfText(
  model: PdfTextModel,
  id: string,
  start: number,
  end: number,
  clipboard: Pick<Clipboard, 'readText'>,
  editable: () => boolean,
) {
  const a = model.anchor(id, start),
    b = model.anchor(id, end);
  const text = await clipboard.readText();
  if (!editable()) return;
  const from = model.resolve(a),
    to = model.resolve(b);
  if (from && to) {
    model.undo.stopCapturing();
    model.replace(id, from.offset, to.offset, text);
    model.undo.stopCapturing();
  }
}
