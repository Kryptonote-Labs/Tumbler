/** Counts requested canvas backing pixels and actual ImageData reads, independent of GC. */
export function inkMeter() {
  const canvases = new WeakSet<HTMLCanvasElement>(), references: WeakRef<HTMLCanvasElement>[] = [];
  const live = () => references.flatMap(reference => { const canvas = reference.deref(); return canvas ? [canvas] : []; });
  let canvasPeakBytes = 0, canvasAllocatedPixels = 0, imageDataBytes = 0, reads = 0, largestReadBytes = 0;
  let rasterAllocatedBytes = 0;
  const clamped = globalThis.Uint8ClampedArray, coverage = globalThis.Uint16Array;
  globalThis.Uint8ClampedArray = new Proxy(clamped, { construct(target, args) {
    const result: Uint8ClampedArray = Reflect.construct(target, args);
    rasterAllocatedBytes += result.byteLength; return result;
  } });
  globalThis.Uint16Array = new Proxy(coverage, { construct(target, args) {
    const result: Uint16Array = Reflect.construct(target, args);
    rasterAllocatedBytes += result.byteLength; return result;
  } });
  const prototype = HTMLCanvasElement.prototype;
  const getContext = prototype.getContext;
  const width = Object.getOwnPropertyDescriptor(prototype, 'width')!;
  const height = Object.getOwnPropertyDescriptor(prototype, 'height')!;
  const record = (canvas: HTMLCanvasElement) => {
    if (!canvases.has(canvas)) { canvases.add(canvas); references.push(new WeakRef(canvas)); }
    canvasAllocatedPixels += canvas.width * canvas.height;
    canvasPeakBytes = Math.max(canvasPeakBytes, live().reduce((sum, item) => sum + item.width * item.height * 4, 0));
  };
  for (const [name, descriptor] of [['width', width], ['height', height]] as const) {
    Object.defineProperty(prototype, name, { ...descriptor, set(this: HTMLCanvasElement, value: number) { descriptor.set!.call(this, value); if (canvases.has(this)) record(this); } });
  }
  prototype.getContext = new Proxy(getContext, { apply(target, canvas: HTMLCanvasElement, args: unknown[]) {
    const result: RenderingContext | null = Reflect.apply(target, canvas, args);
    if (result && !canvases.has(canvas)) record(canvas);
    return result;
  } });
  const get = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args: Parameters<typeof get>) {
    const result = get.apply(this, args);
    reads++; imageDataBytes += result.data.byteLength;
    largestReadBytes = Math.max(largestReadBytes, result.data.byteLength);
    return result;
  };
  return {
    finish() {
      Object.defineProperty(prototype, 'width', width); Object.defineProperty(prototype, 'height', height);
      prototype.getContext = getContext;
      CanvasRenderingContext2D.prototype.getImageData = get;
      globalThis.Uint8ClampedArray = clamped; globalThis.Uint16Array = coverage;
      // Two comparison ImageData arrays coexist; ink reads are never larger than a tile.
      return { rasterAllocatedBytes, canvasPeakBytes, canvasAllocatedPixels, imageDataBytes, reads, pairedImageDataPeakBytes: 2 * largestReadBytes,
        canvasAndImageDataUpperBytes: canvasPeakBytes + 2 * largestReadBytes,
        retainedCanvasPixels: live().reduce((sum, item) => sum + (item.isConnected ? item.width * item.height : 0), 0) };
    },
  };
}
