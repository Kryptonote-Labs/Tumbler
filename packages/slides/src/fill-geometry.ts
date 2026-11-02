import type { DrawingGradient, DrawingPattern } from './appearance.ts';
/** Shared SVG/canvas endpoints, including DrawingML's aspect-scaled linear shading. */
export function linearGradientLine(value: DrawingGradient, width: number, height: number) {
  const angle = (value.angle * Math.PI) / 180;
  const gx = Math.cos(angle) * (value.scaled ? width : 1),
    gy = Math.sin(angle) * (value.scaled ? height : 1);
  const length = (Math.abs(width * gx) + Math.abs(height * gy)) / (gx * gx + gy * gy || 1);
  return [
    width / 2 - (gx * length) / 2,
    height / 2 - (gy * length) / 2,
    width / 2 + (gx * length) / 2,
    height / 2 + (gy * length) / 2,
  ] as const;
}
const bayer = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28,
  52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7,
  39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];
/** Common hatch/pattern geometry in CSS pixels, reused by the editor and exported images. */
export function drawingPatternGeometry(preset: DrawingPattern['preset']) {
  const size = preset.startsWith('sm') || preset.startsWith('lt') ? 4 : 8;
  const strokeWidth = preset.startsWith('dk') ? 3 : preset.startsWith('wd') ? 2 : 1;
  if (preset.startsWith('pct'))
    return {
      size: 8,
      strokeWidth,
      rects: bayer.flatMap((threshold, i) =>
        threshold < Number(preset.slice(3)) * 0.64
          ? [{ x: i % 8, y: Math.floor(i / 8), width: 1, height: 1 }]
          : [],
      ),
      path: '',
      filled: false,
    };
  if (/Check/.test(preset))
    return {
      size,
      strokeWidth,
      rects: [
        { x: 0, y: 0, width: size / 2, height: size / 2 },
        { x: size / 2, y: size / 2, width: size / 2, height: size / 2 },
      ],
      path: '',
      filled: false,
    };
  const path =
    preset === 'dotGrid'
      ? 'M1.7 1A0.7 0.7 0 1 0 0.3 1A0.7 0.7 0 1 0 1.7 1Z'
      : /DnDiag/.test(preset)
        ? `M0 0L${size} ${size} M-${size / 2} ${size / 2}L${size / 2} ${size * 1.5} M${size / 2} -${size / 2}L${size * 1.5} ${size / 2}`
        : /UpDiag/.test(preset)
          ? `M0 ${size}L${size} 0 M-${size / 2} ${size / 2}L${size / 2} -${size / 2} M${size / 2} ${size * 1.5}L${size * 1.5} ${size / 2}`
          : preset === 'diagCross'
            ? `M0 0L${size} ${size} M0 ${size}L${size} 0`
            : /Horz/.test(preset) || preset === 'horz'
              ? `M0 0H${size}`
              : /Vert/.test(preset) || preset === 'vert'
                ? `M0 0V${size}`
                : `M0 0H${size} M0 0V${size}`;
  return { size, strokeWidth, rects: [], path, filled: preset === 'dotGrid' };
}
