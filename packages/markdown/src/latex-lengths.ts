import { texPoint } from './latex-typography';

const inch = 96;
const millimeter = inch / 25.4;

export function latexLength(value: string | undefined, quad?: number, xHeight?: number) {
  if (value?.trim() === '0') return 0;
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(in|cm|mm|pt|bp|pc|sp|dd|cc|em|ex)$/.exec(
    value?.trim() ?? '',
  );
  if (!match) return;
  const units: Record<string, number> = {
    in: inch,
    cm: 10 * millimeter,
    mm: millimeter,
    pt: texPoint,
    bp: inch / 72,
    pc: texPoint * 12,
    sp: texPoint / 65536,
    dd: (texPoint * 1238) / 1157,
    cc: (texPoint * 12 * 1238) / 1157,
    em: quad ?? NaN,
    ex: xHeight ?? NaN,
  };
  const length = Number(match[1]) * (units[match[2]!] ?? 0);
  if (Number.isFinite(length)) return length;
}
