import type { ChartRect } from './layout.ts';

/** Exact bounds of the absolute move, line, cubic and ellipse commands emitted by chart layout. */
export function chartPathBounds(path: string): ChartRect | undefined {
  const tokens = path.match(/[MLCAZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let index = 0, command = '', x = 0, y = 0, startX = 0, startY = 0;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const point = (px: number, py: number) => { left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py); };
  const number = () => Number(tokens[index++]);
  while (index < tokens.length) {
    if (/^[MLCAZ]$/i.test(tokens[index]!)) command = tokens[index++]!.toUpperCase();
    if (command === 'Z') { point(startX, startY); x = startX; y = startY; command = ''; continue; }
    if (command === 'M' || command === 'L') {
      x = number(); y = number(); point(x, y);
      if (command === 'M') { startX = x; startY = y; command = 'L'; }
    } else if (command === 'C') {
      const ax = number(), ay = number(), bx = number(), by = number(), endX = number(), endY = number();
      const curve = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
      for (const t of [...extrema(x, ax, bx, endX), ...extrema(y, ay, by, endY)]) point(curve(x, ax, bx, endX, t), curve(y, ay, by, endY, t));
      point(endX, endY); x = endX; y = endY;
    } else if (command === 'A') {
      let rx = Math.abs(number()), ry = Math.abs(number());
      const phi = number() * Math.PI / 180, large = number(), sweep = number(), endX = number(), endY = number();
      if (rx && ry && (endX !== x || endY !== y)) {
        const cos = Math.cos(phi), sin = Math.sin(phi), dx = (x - endX) / 2, dy = (y - endY) / 2;
        const px = cos * dx + sin * dy, py = -sin * dx + cos * dy;
        const scale = Math.max(1, Math.hypot(px / rx, py / ry)); rx *= scale; ry *= scale;
        const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px) / (rx * rx * py * py + ry * ry * px * px)));
        const cxp = factor * rx * py / ry, cyp = -factor * ry * px / rx;
        const cx = cos * cxp - sin * cyp + (x + endX) / 2, cy = sin * cxp + cos * cyp + (y + endY) / 2;
        const start = Math.atan2((py - cyp) / ry, (px - cxp) / rx), end = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx);
        const turn = Math.PI * 2, positive = (angle: number) => (angle % turn + turn) % turn;
        const extent = sweep ? positive(end - start) : positive(start - end);
        for (const angle of [Math.atan2(-ry * sin, rx * cos), Math.atan2(ry * cos, rx * sin)].flatMap(value => [value, value + Math.PI])) {
          if ((sweep ? positive(angle - start) : positive(start - angle)) <= extent + 1e-12) point(cx + rx * cos * Math.cos(angle) - ry * sin * Math.sin(angle), cy + rx * sin * Math.cos(angle) + ry * cos * Math.sin(angle));
        }
      }
      point(endX, endY); x = endX; y = endY;
    } else return undefined;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  }
  return Number.isFinite(left) ? { x: left, y: top, width: right - left, height: bottom - top } : undefined;
}
function extrema(a: number, b: number, c: number, d: number): number[] {
  const qa = -a + 3 * b - 3 * c + d, qb = 2 * (a - 2 * b + c), qc = b - a;
  const discriminant = qb * qb - 4 * qa * qc;
  const roots = Math.abs(qa) < 1e-12 ? qb ? [-qc / qb] : [] : discriminant < 0 ? [] : [(-qb + Math.sqrt(discriminant)) / (2 * qa), (-qb - Math.sqrt(discriminant)) / (2 * qa)];
  return roots.filter(value => value > 0 && value < 1);
}
