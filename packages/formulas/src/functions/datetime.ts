import type { FormulaScalarValue } from "../evaluator.ts";
import { functionError as err, functionNumber as num, functionNumeric, functionMatrix, type ExtendedFunction, type FunctionContext, type FunctionRegistry, type FunctionValue } from "../function-runtime.ts";

const DAY = 86400000;
type Civil = { y: number; m: number; d: number };
const mod = (n: number, d: number) => ((n % d) + d) % d;
const leap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
const monthDays = (y: number, m: number) => m === 2 ? (leap(y) || y === 1900 ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
const maxDate = (c: FunctionContext) => c.dateSystem === "1900" ? 2958465 : 2957003;
function serial(y: number, m: number, d: number, c: FunctionContext): number {
  if (c.dateSystem === "1900" && y === 1900 && m === 2 && d === 29) return 60;
  const utc = Date.UTC(y, m - 1, d);
  return c.dateSystem === "1904" ? (utc - Date.UTC(1904, 0, 1)) / DAY : (utc - Date.UTC(1899, 11, 31)) / DAY + (utc >= Date.UTC(1900, 2, 1) ? 1 : 0);
}
function civil(n: number, c: FunctionContext): Civil {
  if (c.dateSystem === "1900" && n === 60) return { y: 1900, m: 2, d: 29 };
  if (c.dateSystem === "1900" && n === 0) return { y: 1900, m: 1, d: 0 };
  const dt = new Date((c.dateSystem === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31)) + (n - (c.dateSystem === "1900" && n > 60 ? 1 : 0)) * DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
const weekday = (n: number, c: FunctionContext) => mod(n + (c.dateSystem === "1900" ? 5 : 4), 7); // Monday=0; Excel's pre-March-1900 convention.
function dateText(text: string, c: FunctionContext): number | undefined {
  let y: number, m: number, d: number;
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text.trim());
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  const en = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text.trim());
  if (iso) [, y, m, d] = iso.map(Number) as [number, number, number, number];
  else if (us) [, m, d, y] = us.map(Number) as [number, number, number, number];
  else if (en) { y = Number(en[3]); d = Number(en[1]); m = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(en[2]!.toLowerCase()) + 1; }
  else return undefined;
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > monthDays(y, m)) return undefined;
  return serial(y, m, d, c);
}
function timeText(text: string, c: FunctionContext): number | undefined {
  const match = /^(?:(.+?)\s+)?(\d{1,5})(?::(\d{1,5}))?(?::(\d{1,5}(?:\.\d+)?))?\s*(AM|PM)?$/i.exec(text.trim());
  if (!match || (!match[3] && !match[5]) || (match[1] && dateText(match[1], c) === undefined)) return undefined;
  let h = Number(match[2]); const m = Number(match[3] ?? 0), s = Number(match[4] ?? 0);
  if (h > 32767 || m > 32767 || s > 32767) return undefined;
  if (match[5]) { if (h > 12) return undefined; h = h % 12 + (match[5].toUpperCase() === "PM" ? 12 : 0); }
  return ((h * 3600 + m * 60 + s) % 86400) / 86400;
}
function numeric(v: FormulaScalarValue): number | FormulaScalarValue {
  const n = functionNumeric(v); return n.type === "number" ? n.value : n;
}
function date(v: FormulaScalarValue, c: FunctionContext, time = false): number | FormulaScalarValue {
  let n: number | FormulaScalarValue;
  if (v.type === "string" && !Number.isFinite(Number(v.value))) n = (time ? timeText(v.value, c) ?? dateText(v.value, c) : dateText(v.value, c)) ?? err();
  else n = numeric(v);
  return typeof n !== "number" ? n : n < 0 || n >= maxDate(c) + 1 ? err("#NUM!") : time ? n : Math.floor(n);
}
// Elementwise scalar arguments broadcast over rectangular arrays. Holidays remain one set.
function lift(min: number, max: number, run: (v: FormulaScalarValue[], c: FunctionContext, raw: readonly FunctionValue[]) => FunctionValue, setIndex = -1): ExtendedFunction {
  return (args, c) => {
    if (args.length < min || args.length > max) return err();
    const raw = args.map(a => c.evaluate(a));
    const isOmitted = (v: FunctionValue) => (v as { kind?: string }).kind === "omitted";
    const normalized = raw.map((v, i) => isOmitted(v)
      ? (i === 2 && setIndex === 3) || (i === 1 && max === 2) ? num(1) : { type: "blank" } as FormulaScalarValue
      : v);
    const matrices = normalized.map(functionMatrix);
    const lifted = matrices.filter((_, i) => i !== setIndex);
    const h = Math.max(1, ...lifted.map(m => m.length)), w = Math.max(1, ...lifted.map(m => m[0]?.length ?? 0));
    if (h * w > c.maxArrayCells) return err("#NUM!");
    if (lifted.some(m => (m.length !== 1 && m.length !== h) || m.some(r => r.length !== 1 && r.length !== w))) return err("#N/A");
    const rows: FormulaScalarValue[][] = [];
    for (let r = 0; r < h; r++) {
      const row: FormulaScalarValue[] = [];
      for (let col = 0; col < w; col++) {
        c.operation();
        const values = matrices.map((m, i) => i === setIndex ? { type: "blank" } as FormulaScalarValue : m[m.length === 1 ? 0 : r]?.[m[0]?.length === 1 ? 0 : col] ?? err());
        for (const value of values) if (value.type === "string") c.operation(Math.ceil(value.value.length / 64));
        const error = values.find(v => v.type === "error");
        const result = error ?? run(values, c, normalized);
        row.push("kind" in result ? err() : result);
      }
      rows.push(row);
    }
    return normalized.some((v, i) => i !== setIndex && "kind" in v) ? { kind: "array", rows } : rows[0]![0]!;
  };
}
function days360(a: Civil, b: Civil, european: boolean): number {
  let ad = a.d, bd = b.d;
  if (european) { ad = Math.min(ad, 30); bd = Math.min(bd, 30); }
  else { if (ad === monthDays(a.y, a.m)) ad = 30; if (bd === monthDays(b.y, b.m) && ad >= 30) bd = 30; }
  return (b.y - a.y) * 360 + (b.m - a.m) * 30 + bd - ad;
}
function isoWeek(n: number, c: FunctionContext): number {
  const thursday = n + 3 - weekday(n, c), y = civil(thursday, c).y;
  const jan4 = serial(y, 1, 4, c);
  return 1 + Math.floor((thursday - (jan4 + 3 - weekday(jan4, c))) / 7);
}
function weekends(v: FormulaScalarValue): boolean[] | FormulaScalarValue {
  if (v.type === "string") return /^[01]{7}$/.test(v.value) ? [...v.value].map(s => s === "1") : err();
  const n = numeric(v);
  if (typeof n !== "number") return n;
  const mask = Array<boolean>(7).fill(false);
  if (n >= 1 && n <= 7 && Number.isInteger(n)) { mask[mod(n + 4, 7)] = true; mask[mod(n + 5, 7)] = true; }
  else if (n >= 11 && n <= 17 && Number.isInteger(n)) mask[mod(n - 12, 7)] = true;
  else return err("#NUM!");
  return mask;
}
function business(workday: boolean): ExtendedFunction {
  return lift(2, 4, (v, c, raw) => {
    const start = date(v[0]!, c), end = workday ? numeric(v[1]!) : date(v[1]!, c);
    if (typeof start !== "number") return start;
    if (typeof end !== "number") return end;
    const mask = weekends(v[2] ?? num(1));
    if (!Array.isArray(mask)) return mask;
    if (mask.every(Boolean)) return workday ? err() : num(0);
    const holidays = new Set<number>();
    if (raw[3]) {
      const matrix = functionMatrix(raw[3]);
      if (matrix.reduce((n, r) => n + r.length, 0) > c.maxArrayCells) return err("#NUM!");
      for (const row of matrix) for (const item of row) {
        c.operation();
        if (item.type === "blank") continue;
        const d = date(item, c); if (typeof d !== "number") return d;
        if (!mask[weekday(d, c)]) holidays.add(d);
      }
    }
    const count = (lo: number, hi: number) => {
      if (lo > hi) return 0;
      const length = hi - lo + 1;
      let result = Math.floor(length / 7) * mask.filter(x => !x).length;
      for (let i = 0; i < length % 7; i++) { c.operation(); if (!mask[weekday(lo + i, c)]) result++; }
      for (const h of holidays) { c.operation(); if (h >= lo && h <= hi) result--; }
      return result;
    };
    if (!workday) return num(start <= end ? count(start, end) : -count(end, start));
    const offset = Math.trunc(end), direction = Math.sign(offset), target = Math.abs(offset);
    if (target === 0) return num(start);
    const available = direction > 0 ? maxDate(c) - start : start;
    const distanceCount = (d: number) => direction > 0 ? count(start + 1, start + d) : count(start - d, start - 1);
    if (target > available || distanceCount(available) < target) return err("#NUM!");
    let lo = 1, hi = available;
    while (lo < hi) { c.operation(); const mid = Math.floor((lo + hi) / 2); if (distanceCount(mid) >= target) hi = mid; else lo = mid + 1; }
    return num(start + direction * lo);
  }, 3);
}
const entries: [string, ExtendedFunction][] = [];
for (const [name, divisor, modulus] of [["HOUR", 3600, 24], ["MINUTE", 60, 60], ["SECOND", 1, 60]] as const) {
  entries.push([name, lift(1, 1, (v, c) => { const d = date(v[0]!, c, true); return typeof d !== "number" ? d : num(Math.floor(Math.round((d % 1) * 86400) / divisor) % modulus); })]);
}
entries.push(["TIME", lift(3, 3, v => {
  const ns = v.map(numeric), error = ns.find(n => typeof n !== "number"); if (error !== undefined) return error as FormulaScalarValue;
  const [h, m, s] = (ns as number[]).map(Math.trunc) as [number, number, number];
  const total = h * 3600 + m * 60 + s;
  return Math.max(h, m, s) > 32767 || total < 0 ? err("#NUM!") : num(total % 86400 / 86400);
})]);
entries.push(["TIMEVALUE", lift(1, 1, (v, c) => {
  if (v[0]!.type !== "string") return err();
  const parsed = timeText(v[0]!.value, c);
  return parsed === undefined ? err() : num(parsed);
})]);
for (const name of ["NOW", "TODAY"]) entries.push([name, lift(0, 0, (_, c) => {
  const dt = c.now();
  const day = serial(dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), c);
  const value = day + (name === "TODAY" ? 0 : (dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds() + dt.getMilliseconds() / 1000) / 86400);
  return value < 0 || value >= maxDate(c) + 1 ? err("#NUM!") : num(value);
})]);
entries.push(["ISOWEEKNUM", lift(1, 1, (v, c) => { const d = date(v[0]!, c); return typeof d === "number" ? num(isoWeek(d, c)) : d; })]);
entries.push(["WEEKNUM", lift(1, 2, (v, c) => {
  const d = date(v[0]!, c), t = numeric(v[1] ?? num(1));
  if (typeof d !== "number") return d; if (typeof t !== "number") return t;
  const type = Math.trunc(t);
  if (type === 21) return num(isoWeek(d, c));
  const first = type === 1 || type === 17 ? 6 : type === 2 ? 0 : type >= 11 && type <= 16 ? type - 11 : -1;
  if (first < 0) return err("#NUM!");
  const jan1 = serial(civil(d, c).y, 1, 1, c);
  return num(1 + Math.floor((d - jan1 + mod(weekday(jan1, c) - first, 7)) / 7));
})]);
entries.push(["DAYS360", lift(2, 3, (v, c) => {
  const a = date(v[0]!, c), b = date(v[1]!, c);
  if (typeof a !== "number") return a; if (typeof b !== "number") return b;
  const method = v[2]?.type === "string" && /^(TRUE|FALSE)$/i.test(v[2].value) ? Number(v[2].value.toUpperCase() === "TRUE") : numeric(v[2] ?? num(0));
  return typeof method === "number" ? num(days360(civil(a, c), civil(b, c), method !== 0)) : method;
})]);
entries.push(["DATEDIF", lift(3, 3, (v, c) => {
  const start = date(v[0]!, c), end = date(v[1]!, c);
  if (typeof start !== "number") return start; if (typeof end !== "number") return end;
  if (start > end) return err("#NUM!");
  const a = civil(start, c), b = civil(end, c), unit = v[2]!.type === "string" ? v[2]!.value.toUpperCase() : "";
  const months = (b.y - a.y) * 12 + b.m - a.m - Number(b.d < a.d);
  switch (unit) {
    case "D": return num(end - start);
    case "Y": return num(Math.floor(months / 12));
    case "M": return num(months);
    case "YM": return num(mod(months, 12));
    case "MD": return num(b.d >= a.d ? b.d - a.d : b.d + monthDays(b.m === 1 ? b.y - 1 : b.y, b.m === 1 ? 12 : b.m - 1) - a.d);
    case "YD": { const y = b.y - Number(b.m < a.m || (b.m === a.m && b.d < a.d)); return num(end - serial(y, a.m, a.d, c)); }
    default: return err("#NUM!");
  }
})]);
entries.push(["YEARFRAC", lift(2, 3, (v, c) => {
  let start = date(v[0]!, c), end = date(v[1]!, c); const basis = numeric(v[2] ?? num(0));
  if (typeof start !== "number") return start; if (typeof end !== "number") return end; if (typeof basis !== "number") return basis;
  const mode = Math.trunc(basis); if (mode < 0 || mode > 4) return err("#NUM!");
  if (start > end) [start, end] = [end, start];
  const a = civil(start, c), b = civil(end, c);
  if (mode === 0 || mode === 4) {
    // YEARFRAC's US basis differs from DAYS360 at February month ends.
    let ad = a.d, bd = b.d;
    if (mode === 4) { ad = Math.min(ad, 30); bd = Math.min(bd, 30); }
    else { if (ad === 31) ad = 30; if (bd === 31 && ad >= 30) bd = 30; if (a.m === 2 && a.d === monthDays(a.y, 2)) { ad = 30; if (b.m === 2 && b.d === monthDays(b.y, 2)) bd = 30; } }
    return num(((b.y - a.y) * 360 + (b.m - a.m) * 30 + bd - ad) / 360);
  }
  if (mode === 2 || mode === 3) return num((end - start) / (mode === 2 ? 360 : 365));
  let denominator: number;
  if (b.y > a.y + 1 || (b.y === a.y + 1 && (b.m > a.m || (b.m === a.m && b.d > a.d)))) {
    denominator = (serial(b.y + 1, 1, 1, c) - serial(a.y, 1, 1, c)) / (b.y - a.y + 1);
  } else {
    const feb = serial(a.y, 2, 29, c), febEnd = serial(b.y, 2, 29, c);
    denominator = (a.y === b.y && leap(a.y)) || (leap(a.y) && start <= feb && end >= feb) || (leap(b.y) && start <= febEnd && end >= febEnd) ? 366 : 365;
  }
  return num((end - start) / denominator);
})]);
entries.push(["NETWORKDAYS.INTL", business(false)], ["WORKDAY.INTL", business(true)]);
export const datetimeFunctions: FunctionRegistry = new Map(entries);
