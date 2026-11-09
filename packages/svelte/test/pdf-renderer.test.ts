import assert from 'node:assert/strict';
import { expect, test } from 'bun:test';
import { openPdfDocument } from '@tumblerjs/pdf';
import { PdfPageRenderer } from '../src/pdf/page-renderer.ts';
import type { PdfRenderRequest, PdfRenderResponse } from '../src/pdf/render-protocol.ts';

const bytes = await Bun.file(new URL('../../pdf/test/fixtures/basic-text.pdf', import.meta.url)).bytes();
function fixture() {
  const sent: PdfRenderRequest[] = [];
  let terminated = 0;
  const worker = {
    onmessage: null as ((event: MessageEvent<PdfRenderResponse>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage(message: PdfRenderRequest) { sent.push(message); },
    terminate() { terminated++; },
  };
  const renderer = new PdfPageRenderer(openPdfDocument(bytes), {}, () => worker);
  const respond = (id: number) => {
    let closed = 0;
    const bitmap: ImageBitmap = { width: 1, height: 1, close() { closed++; } };
    worker.onmessage?.(new MessageEvent('message', { data: { id, bitmap } }));
    return () => closed;
  };
  const render = (page: number, signal: AbortSignal) =>
    renderer.render({ page, scale: 1, region: { x: 0, y: 0, width: 1, height: 1 } }, signal);
  return { sent, renderer, render, respond, terminated: () => terminated };
}

test('scroll cancellation discards late pixels and releases a page after its render finishes', async () => {
  const f = fixture(), controller = new AbortController();
  try {
    const pending = f.render(0, controller.signal);
    const rejected = assert.rejects(pending, /cancelled/);
    controller.abort();
    f.renderer.release(0);
    const next = f.render(1, new AbortController().signal);
    expect(f.sent.map((message) => message.type)).toEqual(['open', 'render']);
    const closed = f.respond(1);
    await rejected;
    expect(closed()).toBe(1);
    expect(f.sent.map((message) => message.type)).toEqual(['open', 'render', 'render', 'release']);
    f.respond(2);
    const pixels = await next;
    pixels.bitmap.close();
    f.renderer.destroy();
    expect(f.terminated()).toBe(1);
    expect(f.respond(2)()).toBe(1);
  } finally { f.renderer.destroy(); }
});

test('a queued page can be canceled without blocking release or sending stale render work', async () => {
  const f = fixture(), controller = new AbortController();
  try {
    const first = f.render(0, new AbortController().signal);
    const queued = f.render(1, controller.signal);
    const rejected = assert.rejects(queued, /cancelled/);
    f.renderer.release(1);
    controller.abort();
    await rejected;
    expect(f.sent.map((message) => message.type)).toEqual(['open', 'render', 'release']);
    f.respond(1);
    (await first).bitmap.close();
    expect(f.sent.filter((message) => message.type === 'render')).toHaveLength(1);
  } finally { f.renderer.destroy(); }
});
