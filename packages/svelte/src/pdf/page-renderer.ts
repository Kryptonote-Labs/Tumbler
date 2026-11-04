import { PdfError, type PdfDocument, type PdfExecutionLimits } from '@tumblerjs/pdf';
import type { PdfTileRequest, PdfRenderRequest, PdfRenderResponse } from './render-protocol.ts';
type Result = Extract<PdfRenderResponse, { bitmap: ImageBitmap }>;
type Job = {
  id: number;
  tile: PdfTileRequest;
  signal: AbortSignal;
  resolve: (result: Result) => void;
  reject: (error: Error) => void;
  abort: () => void;
};
/** One worker and one in-flight tile per document. Aborted work never reaches the display. */
export class PdfPageRenderer {
  private worker: Worker;
  private queue: Job[] = [];
  private active: Job | undefined;
  private sequence = 0;
  private closed = false;
  constructor(document: PdfDocument, limits: PdfExecutionLimits = {}) {
    this.worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
    const input = document.source.renderInput();
    this.send({ type: 'open', input, limits }, [input.bytes.buffer]);
    this.worker.onmessage = (event: MessageEvent<PdfRenderResponse>) => {
      const result = event.data,
        job = this.active;
      if (!job || result.id !== job.id) {
        if ('bitmap' in result) result.bitmap.close();
        return;
      }
      this.active = undefined;
      job.signal.removeEventListener('abort', job.abort);
      if (job.signal.aborted) {
        if ('bitmap' in result) result.bitmap.close();
      } else if ('error' in result)
        job.reject(result.code ? new PdfError(result.code, result.error) : new Error(result.error));
      else job.resolve(result);
      this.next();
    };
    this.worker.onerror = (event) => this.fail(new Error(event.message || 'PDF renderer failed.'));
  }
  private send(message: PdfRenderRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(message, transfer);
  }
  private next() {
    if (this.active || this.closed) return;
    this.active = this.queue.shift();
    if (this.active) this.send({ type: 'render', id: this.active.id, tile: this.active.tile });
  }
  render(tile: PdfTileRequest, signal: AbortSignal): Promise<Result> {
    if (this.closed || signal.aborted)
      return Promise.reject(new DOMException('PDF render cancelled.', 'AbortError'));
    return new Promise((resolve, reject) => {
      const job: Job = {
        id: ++this.sequence,
        tile,
        signal,
        resolve,
        reject,
        abort: () => {
          this.queue = this.queue.filter((queued) => queued !== job);
          signal.removeEventListener('abort', job.abort);
          reject(new DOMException('PDF render cancelled.', 'AbortError'));
        },
      };
      signal.addEventListener('abort', job.abort, { once: true });
      this.queue.push(job);
      this.next();
    });
  }
  release(page: number) {
    if (!this.closed) this.send({ type: 'release', page });
  }
  private fail(error: Error) {
    this.closed = true;
    for (const job of [...this.queue, ...(this.active ? [this.active] : [])]) {
      job.signal.removeEventListener('abort', job.abort);
      job.reject(error);
    }
    this.queue = [];
    this.active = undefined;
    this.worker.terminate();
  }
  destroy() {
    this.fail(new DOMException('PDF renderer closed.', 'AbortError'));
  }
}
