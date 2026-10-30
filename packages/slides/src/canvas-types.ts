import type { ChartCanvasContext } from '@tumblerjs/charts';
import type { DrawingPictureFill } from './appearance.ts';

/** Portable subset satisfied by browser and server Canvas 2D implementations. */
export interface SlideCanvasContext<Path, Image> extends ChartCanvasContext<Path> {
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  scale(x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  setLineDash(segments: number[]): void;
  measureText(text: string): { width: number };
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): { addColorStop(offset: number, color: string): void };
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number,
  ): { addColorStop(offset: number, color: string): void };
  drawImage(
    image: Image,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}
export interface SlideCanvasOptions<Path, Image> {
  readonly scale?: number;
  readonly path: (d: string) => Path;
  /** Hosts decode embedded bytes once before painting; missing images remain unpainted. */
  readonly image?: (
    picture: DrawingPictureFill,
  ) => { image: Image; width: number; height: number } | undefined;
  readonly prepareFont?: (family: string) => string;
}
