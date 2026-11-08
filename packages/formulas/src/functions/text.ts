import { boundedRegex, UnsupportedRegex } from "./text-regex.ts";
import {
  functionError as err,
  functionNumber as num,
  functionNumeric,
  functionScalar,
  functionText as text,
  functionMatrix,
  type FunctionContext,
  type FunctionRegistry,
  type FunctionValue,
  type ExtendedFunction,
} from "../function-runtime.ts";
import type { FormulaScalarValue as Scalar } from "../evaluator.ts";
const str = (value: string): Scalar =>
  value.length <= 32767 ? { type: "string", value } : err();
const blank: Scalar = { type: "blank" };
type Handler = (
  v: readonly FunctionValue[],
  c: FunctionContext,
) => FunctionValue;
const registry = new Map<string, ExtendedFunction>();
function define(
  name: string,
  min: number,
  max: number,
  fn: Handler,
  propagate = true,
) {
  registry.set(name, (args, c) => {
    c.operation();
    if (args.length < min || args.length > max) return err();
    const v = args.map((a) => c.evaluate(a));
    for (const x of v) {
      if ("kind" in x && x.kind === "lambda") return err();
      if (!("kind" in x) && x.type === "string") c.operation(x.value.length);
    }
    const invoke = (values: readonly FunctionValue[]) => {
      if (propagate)
        for (const x of values)
          if (!("kind" in x) && x.type === "error") return x;
      return fn(values, c);
    };
    const arrays = v.filter((x) => "kind" in x && x.kind === "array");
    if (
      arrays.length &&
      !["ARRAYTOTEXT", "TEXTSPLIT", "REGEXEXTRACT", "PHONETIC"].includes(name)
    ) {
      const matrices = v.map(functionMatrix),
        height = Math.max(...matrices.map((m) => m.length)),
        width = Math.max(...matrices.map((m) => m[0]?.length ?? 0));
      if (height * width > c.maxArrayCells) return err("#NUM!");
      c.operation(height * width);
      return {
        kind: "array",
        rows: Array.from({ length: height }, (_, r) =>
          Array.from({ length: width }, (_, col) => {
            const values = v.map((x, i) =>
              !("kind" in x) || x.kind !== "array"
                ? x
                : (matrices[i]![matrices[i]!.length === 1 ? 0 : r]?.[
                    matrices[i]![0]?.length === 1 ? 0 : col
                  ] ?? err("#N/A")),
            );
            return functionScalar(invoke(values));
          }),
        ),
      };
    }
    return invoke(v);
  });
}
function omitted(v: FunctionValue | undefined): boolean {
  return v === undefined || ("kind" in v && String(v.kind) === "omitted");
}
function s(v: FunctionValue | undefined): string {
  return text(functionScalar(v ?? blank));
}
function n(v: FunctionValue | undefined, fallback = 0): number {
  if (omitted(v)) return fallback;
  const x = functionNumeric(functionScalar(v!));
  return x.type === "number" ? x.value : NaN;
}
function host(
  name: string,
  v: readonly FunctionValue[],
  c: FunctionContext,
): FunctionValue {
  c.operation();
  return (
    c.services?.invoke(name, v, c.address) ??
    c.unavailable(`Text function ${name} requires an explicit host adapter`)
  );
}
function checked(result: string, c: FunctionContext): Scalar {
  c.operation(result.length);
  return str(result);
}

define("CLEAN", 1, 1, (v, c) =>
  checked(s(v[0]).replace(/[\x00-\x1f]/g, ""), c),
);
define("T", 1, 1, (v) => {
  const x = functionScalar(v[0]!);
  return x.type === "error" || x.type === "string" ? x : str("");
});
define("UNICHAR", 1, 1, (v) => {
  const x = Math.trunc(n(v[0]));
  return x > 0 && x <= 0x10ffff && !(x >= 0xd800 && x <= 0xdfff)
    ? str(String.fromCodePoint(x))
    : err();
});
define("UNICODE", 1, 1, (v) => {
  const x = s(v[0]).codePointAt(0);
  return x === undefined || (x >= 0xd800 && x <= 0xdfff) ? err() : num(x);
});
// ASCII is invariant; all other codes depend on Excel's host character set.
define("CHAR", 1, 1, (v, c) => {
  const x = Math.trunc(n(v[0]));
  return !Number.isFinite(x) || x < 1 || x > 255
    ? err()
    : x < 128
      ? str(String.fromCharCode(x))
      : host("CHAR", v, c);
});
define("CODE", 1, 1, (v, c) => {
  const x = s(v[0]).charCodeAt(0);
  return !Number.isFinite(x) ? err() : x < 128 ? num(x) : host("CODE", v, c);
});
define("REPT", 2, 2, (v, c) => {
  const x = s(v[0]),
    k = Math.trunc(n(v[1]));
  if (!Number.isFinite(k) || k < 0 || x.length * k > 32767) return err();
  return checked(x === "" ? "" : x.repeat(k), c);
});
define("REPLACE", 4, 4, (v, c) => {
  const a = Array.from(s(v[0])),
    start = Math.trunc(n(v[1])),
    len = Math.trunc(n(v[2]));
  if (!Number.isFinite(start + len) || start < 1 || len < 0) return err();
  return checked(
    a.slice(0, start - 1).join("") +
      s(v[3]) +
      a.slice(start - 1 + len).join(""),
    c,
  );
});

// Byte-count functions use ordinary character semantics without a DBCS language.
// Hosts opt into DBCS behavior by returning a result; undefined selects SBCS.
for (const name of [
  "LEFTB",
  "RIGHTB",
  "MIDB",
  "LENB",
  "FINDB",
  "SEARCHB",
  "REPLACEB",
]) {
  const counts: Record<string, [number, number]> = {
    LEFTB: [1, 2],
    RIGHTB: [1, 2],
    MIDB: [3, 3],
    LENB: [1, 1],
    FINDB: [2, 3],
    SEARCHB: [2, 3],
    REPLACEB: [4, 4],
  };
  define(name, ...counts[name]!, (v, c) => {
    const provided = c.services?.invoke(name, v, c.address);
    if (provided !== undefined) return provided;
    const a = Array.from(s(v[0]));
    c.operation(a.length);
    if (name === "LENB") return num(a.length);
    if (name === "REPLACEB") return c.call("REPLACE", v);
    if (name === "FINDB" || name === "SEARCHB") {
      const start = Math.trunc(n(v[2], 1)),
        hay = s(v[1]);
      if (
        !Number.isFinite(start) ||
        start < 1 ||
        start > Array.from(hay).length + 1
      )
        return err();
      if (name === "FINDB") {
        const pos = hay.indexOf(
          s(v[0]),
          Array.from(hay)
            .slice(0, start - 1)
            .join("").length,
        );
        return pos < 0 ? err() : num(Array.from(hay.slice(0, pos)).length + 1);
      }
      // Translate Excel's three wildcard tokens into our bounded matcher.
      let pattern = "";
      const needle = Array.from(s(v[0]));
      const literal = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (let i = 0; i < needle.length; i++) {
        c.operation();
        const x = needle[i]!;
        if (x === "~" && i + 1 < needle.length)
          pattern += literal(needle[++i]!);
        else pattern += x === "*" ? ".*" : x === "?" ? "." : literal(x);
      }
      try {
        const hit = boundedRegex(pattern, true, c).find(
          hay,
          Array.from(hay)
            .slice(0, start - 1)
            .join("").length,
        );
        return hit
          ? num(Array.from(hay.slice(0, hit.start)).length + 1)
          : err();
      } catch (e) {
        if (e instanceof UnsupportedRegex) return host(name, v, c);
        throw e;
      }
    }
    const start = name === "MIDB" ? Math.trunc(n(v[1])) : 1;
    const count = Math.trunc(n(v[name === "MIDB" ? 2 : 1], 1));
    if (!Number.isFinite(start + count) || start < 1 || count < 0) return err();
    return str(
      name === "RIGHTB"
        ? a.slice(Math.max(0, a.length - count)).join("")
        : a.slice(start - 1, start - 1 + count).join(""),
    );
  });
}
// Full-width Latin and Japanese half-width kana (including voiced pairs).
const kana = new Map<string, string>();
for (let i = 0xff61; i <= 0xff9f; i++) {
  const half = String.fromCharCode(i);
  kana.set(half.normalize("NFKC"), half);
}
for (let i = 0xff66; i <= 0xff9d; i++)
  for (const mark of ["\uff9e", "\uff9f"]) {
    const half = String.fromCharCode(i) + mark;
    const full = half.normalize("NFKC");
    if (Array.from(full).length === 1) kana.set(full, half);
  }
define("ASC", 1, 1, (v, c) =>
  checked(
    Array.from(s(v[0]))
      .map(
        (x) =>
          kana.get(x) ??
          (x === "\u3000"
            ? " "
            : x.charCodeAt(0) >= 0xff01 && x.charCodeAt(0) <= 0xff5e
              ? String.fromCharCode(x.charCodeAt(0) - 0xfee0)
              : x),
      )
      .join(""),
    c,
  ),
);
for (const name of ["DBCS", "JIS"])
  define(name, 1, 1, (v, c) =>
    checked(
      s(v[0]).replace(/[\uff61-\uff9f]+|[\x20-\x7e]/g, (x) =>
        x.charCodeAt(0) >= 0xff61
          ? x.normalize("NFKC")
          : x === " "
            ? "\u3000"
            : String.fromCharCode(x.charCodeAt(0) + 0xfee0),
      ),
      c,
    ),
  );

function parseNumber(input: string, decimal: string, group: string): Scalar {
  if (decimal === group || decimal.length !== 1 || group.length !== 1)
    return err();
  let t = input.replace(/ /g, "");
  if (!t) return num(0);
  let pct = 0;
  while (t.endsWith("%")) {
    pct++;
    t = t.slice(0, -1);
  }
  if (t.includes("%")) return err();
  const parts = t.split(decimal);
  if (parts.length > 2 || parts[1]?.includes(group)) return err();
  t =
    parts[0]!.split(group).join("") +
    (parts.length === 2 ? "." + parts[1] : "");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) return err();
  const result = Number(t) / 100 ** pct;
  return Number.isFinite(result) ? num(result) : err();
}
define("NUMBERVALUE", 1, 3, (v) =>
  parseNumber(
    s(v[0]),
    s(omitted(v[1]) ? str(".") : v[1]).slice(0, 1),
    s(omitted(v[2]) ? str(",") : v[2]).slice(0, 1),
  ),
);
define("VALUE", 1, 1, (v, c) => {
  const x = functionScalar(v[0]!);
  if (x.type === "number") return x;
  const t = s(v[0]).trim();
  if (!t) return err();
  const numeric = parseNumber(
    t.replace(/^\$/, "").replace(/^\((.*)\)$/, "-$1"),
    ".",
    ",",
  );
  if (numeric.type !== "error") return numeric;
  // Recognized date/time text delegates to the shared date category, preserving dateSystem.
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(t)) return c.call("DATEVALUE", v);
  if (/^\d{1,2}:\d{2}(?::\d{2})?(?: *[AP]M)?$/i.test(t))
    return c.call("TIMEVALUE", v);
  return err();
});
for (const name of ["VALUETOTEXT", "ARRAYTOTEXT"])
  define(
    name,
    1,
    2,
    (v, c) => {
      if (v[1] && !("kind" in v[1]) && v[1].type === "error") return v[1];
      const format = n(v[1]);
      if (format !== 0 && format !== 1) return err();
      const render = (x: Scalar) =>
        format === 1 && (x.type === "string" || x.type === "blank")
          ? '"' + text(x).replace(/"/g, '""') + '"'
          : text(x);
      if (name === "VALUETOTEXT") return str(render(functionScalar(v[0]!)));
      const rows = functionMatrix(v[0]!);
      const size = rows.reduce((a, r) => a + r.length, 0);
      if (size > c.maxArrayCells) return err("#NUM!");
      c.operation(size);
      return str(
        format === 1
          ? "{" + rows.map((r) => r.map(render).join(",")).join(";") + "}"
          : rows.flat().map(render).join(", "),
      );
    },
    false,
  );

function fixed(x: number, d: number, group: boolean): string | undefined {
  if (!Number.isFinite(x + d) || d < -308 || d > 127) return undefined;
  const p = 10 ** Math.max(-308, Math.min(308, d));
  const rounded = d < 0 ? (Math.sign(x) * Math.round(Math.abs(x) * p)) / p : x;
  if (!Number.isFinite(rounded)) return undefined;
  // Intl rounds decimal ties away from zero and avoids binary toFixed artifacts.
  return (
    new Intl.NumberFormat("en-US", {
      useGrouping: group,
      minimumFractionDigits: Math.max(0, Math.min(100, d)),
      maximumFractionDigits: Math.max(0, Math.min(100, d)),
    }).format(rounded) + (d > 100 ? "0".repeat(d - 100) : "")
  );
}
for (const name of ["FIXED", "DOLLAR"])
  define(name, 1, name === "FIXED" ? 3 : 2, (v, c) => {
    const x = n(v[0]),
      d = Math.trunc(n(v[1], 2));
    const noComma = n(v[2]);
    if (!Number.isFinite(noComma)) return err();
    const t = fixed(Math.abs(x), d, name === "DOLLAR" || !noComma);
    if (t === undefined) return err();
    return checked(
      name === "DOLLAR"
        ? x < 0
          ? "($" + t + ")"
          : "$" + t
        : (x < 0 ? "-" : "") + t,
      c,
    );
  });
define("TEXT", 2, 2, (v, c) => {
  const x = n(v[0]),
    f = s(v[1]);
  if (!Number.isFinite(x)) return err();
  if (/^(?:yyyy-mm-dd|mm\/dd\/yyyy|dd\/mm\/yyyy)$/i.test(f)) {
    if (x < 0 || x >= 2958466) return err();
    const serial = Math.floor(x),
      fictitious = c.dateSystem === "1900" && serial === 60;
    const date = new Date(
      (c.dateSystem === "1904"
        ? Date.UTC(1904, 0, 1)
        : Date.UTC(1899, 11, 31)) +
        (serial - (c.dateSystem === "1900" && serial >= 60 ? 1 : 0)) * 86400000,
    );
    const year = fictitious ? 1900 : date.getUTCFullYear(),
      month = fictitious ? 2 : date.getUTCMonth() + 1,
      day = fictitious ? 29 : date.getUTCDate();
    if (year > 9999) return err();
    return str(
      f.replace(/yyyy|mm|dd/gi, (token) =>
        token.toLowerCase() === "yyyy"
          ? String(year).padStart(4, "0")
          : String(token.toLowerCase() === "mm" ? month : day).padStart(2, "0"),
      ),
    );
  }
  if (f === "") return str("");
  if (/^general$/i.test(f)) return str(String(x));
  if (/^(?:#,##)?0(?:\.0+)?%?$/.test(f)) {
    const d = (f.match(/\.(0+)/)?.[1] ?? "").length;
    const t = fixed(x * (f.endsWith("%") ? 100 : 1), d, f.includes(","));
    return t === undefined ? err() : str(t + (f.endsWith("%") ? "%" : ""));
  }
  return host("TEXT", v, c);
});
function thaiInteger(x: number): string {
  if (x === 0) return "ศูนย์";
  if (x >= 1e6)
    return (
      thaiInteger(Math.floor(x / 1e6)) +
      "ล้าน" +
      (x % 1e6 ? thaiInteger(x % 1e6) : "")
    );
  const digits = [
      "",
      "หนึ่ง",
      "สอง",
      "สาม",
      "สี่",
      "ห้า",
      "หก",
      "เจ็ด",
      "แปด",
      "เก้า",
    ],
    units = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
  let out = "";
  for (let p = 5; p >= 0; p--) {
    const d = Math.floor(x / 10 ** p) % 10;
    if (!d) continue;
    out +=
      p === 1
        ? (d === 1 ? "" : d === 2 ? "ยี่" : digits[d]!) + units[p]!
        : p === 0 && d === 1 && x > 1
          ? "เอ็ด"
          : digits[d]! + units[p]!;
  }
  return out;
}
define("BAHTTEXT", 1, 1, (v, c) => {
  const x = n(v[0]);
  if (!Number.isFinite(x)) return err();
  if (Math.abs(x) > 1e13) return host("BAHTTEXT", v, c);
  const cents = Math.round((Math.abs(x) + Number.EPSILON) * 100);
  return str(
    (x < 0 ? "ลบ" : "") +
      thaiInteger(Math.floor(cents / 100)) +
      "บาท" +
      (cents % 100 ? thaiInteger(cents % 100) + "สตางค์" : "ถ้วน"),
  );
});

for (const name of ["TEXTAFTER", "TEXTBEFORE"])
  define(name, 2, 6, (v, c) => {
    const t = s(v[0]),
      delim = s(v[1]),
      k = Math.trunc(n(v[2], 1)),
      mode = n(v[3]),
      end = n(v[4]);
    if (
      !Number.isFinite(k) ||
      k === 0 ||
      Math.abs(k) > t.length ||
      ![0, 1].includes(mode) ||
      ![0, 1].includes(end)
    )
      return t === "" && k === 1 ? str("") : err();
    if (delim === "")
      return str(name === "TEXTAFTER" ? (k > 0 ? t : "") : k > 0 ? "" : t);
    const hay = mode ? t.toLowerCase() : t,
      needle = mode ? delim.toLowerCase() : delim,
      positions: number[] = [];
    for (let from = 0; from <= hay.length;) {
      c.operation();
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      positions.push(at);
      from = at + needle.length;
    }
    const at = k > 0 ? positions[k - 1] : positions[positions.length + k];
    if (at === undefined) {
      if (end === 1 && Math.abs(k) === positions.length + 1)
        return str(name === "TEXTAFTER" ? (k > 0 ? "" : t) : k > 0 ? t : "");
      return omitted(v[5]) ? err("#N/A") : v[5]!;
    }
    return str(
      name === "TEXTAFTER" ? t.slice(at + delim.length) : t.slice(0, at),
    );
  });
define("TEXTSPLIT", 2, 6, (v, c) => {
  const t = s(v[0]),
    ignore = n(v[3]),
    mode = n(v[4]);
  if (![0, 1].includes(ignore) || ![0, 1].includes(mode)) return err();
  const delimiters = (x: FunctionValue | undefined) =>
    omitted(x) ? [] : functionMatrix(x!).flat().map(text);
  const cols = delimiters(v[1]),
    rows = delimiters(v[2]);
  if (
    [...cols, ...rows].some((x) => x === "") ||
    cols.length + rows.length === 0
  )
    return err();
  const split = (input: string, ds: string[]): string[] => {
    if (!ds.length) return [input];
    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < input.length;) {
      c.operation();
      const d = ds.find((d) =>
        mode
          ? input.slice(i, i + d.length).toLowerCase() === d.toLowerCase()
          : input.startsWith(d, i),
      );
      if (d !== undefined) {
        const part = input.slice(start, i);
        if (!ignore || part) out.push(part);
        i += d.length;
        start = i;
      } else i++;
    }
    const part = input.slice(start);
    if (!ignore || part) out.push(part);
    return out;
  };
  const matrix = split(t, rows).map((r) => split(r, cols));
  if (matrix.length === 0 || matrix.every((r) => !r.length))
    return err("#CALC!");
  const width = matrix.reduce((max, r) => Math.max(max, r.length), 0);
  if (matrix.length * width > c.maxArrayCells) return err("#NUM!");
  c.operation(matrix.length * width);
  const pad = functionScalar(omitted(v[5]) ? err("#N/A") : v[5]!);
  return {
    kind: "array",
    rows: matrix.map((r) =>
      Array.from({ length: width }, (_, i) =>
        r[i] === undefined ? pad : str(r[i]!),
      ),
    ),
  };
});
for (const [name, min, max] of [
  ["DETECTLANGUAGE", 1, 1],
  ["TRANSLATE", 1, 3],
  ["PHONETIC", 1, 1],
] as const)
  define(name, min, max, (v, c) => host(name, v, c));
for (const name of ["REGEXTEST", "REGEXEXTRACT", "REGEXREPLACE"])
  define(
    name,
    name === "REGEXREPLACE" ? 3 : 2,
    name === "REGEXREPLACE" ? 5 : name === "REGEXEXTRACT" ? 4 : 3,
    (v, c) => {
      const input = s(v[0]),
        pattern = s(v[1]),
        mode = n(
          v[name === "REGEXREPLACE" ? 4 : name === "REGEXEXTRACT" ? 3 : 2],
        );
      const which = n(v[name === "REGEXREPLACE" ? 3 : 2]);
      if (
        ![0, 1].includes(mode) ||
        (name === "REGEXEXTRACT" && ![0, 1, 2].includes(which)) ||
        (name === "REGEXREPLACE" && !Number.isInteger(which))
      )
        return err();
      try {
        const re = boundedRegex(pattern, mode === 1, c),
          first = re.find(input);
        if (name === "REGEXTEST")
          return { type: "boolean", value: first !== undefined };
        if (name === "REGEXEXTRACT") {
          if (!first) return err("#N/A");
          if (which === 0) return str(input.slice(first.start, first.end));
          if (which === 2)
            return re.groups
              ? {
                  kind: "array",
                  rows: [
                    Array.from({ length: re.groups }, (_, i) =>
                      str(first.captures[i + 1] ?? ""),
                    ),
                  ],
                }
              : err("#N/A");
          const out: Scalar[][] = [];
          let hit = first;
          while (hit) {
            c.operation();
            if (out.length >= c.maxArrayCells) return err("#NUM!");
            out.push([str(input.slice(hit.start, hit.end))]);
            const from = hit.end + (hit.end === hit.start ? 1 : 0);
            if (from > input.length) break;
            hit = re.find(input, from)!;
          }
          return { kind: "array", rows: out };
        }
        const hits: NonNullable<typeof first>[] = [];
        let hit = first;
        while (hit) {
          c.operation();
          if (hits.length >= c.maxArrayCells) return err("#NUM!");
          hits.push(hit);
          const from = hit.end + (hit.end === hit.start ? 1 : 0);
          if (from > input.length) break;
          hit = re.find(input, from);
        }
        const target = which < 0 ? hits.length + which : which - 1;
        let out = "",
          last = 0;
        for (let i = 0; i < hits.length; i++) {
          const h = hits[i]!;
          if (which !== 0 && i !== target) continue;
          const replacement = s(v[2]).replace(/\$(\d+)|\$\$/g, (m, g) =>
            g === undefined ? "$" : (h.captures[Number(g)] ?? ""),
          );
          out += input.slice(last, h.start) + replacement;
          last = h.end;
          if (out.length > 32767) return err();
        }
        return checked(out + input.slice(last), c);
      } catch (e) {
        if (e instanceof UnsupportedRegex) return host(name, v, c);
        if (e instanceof SyntaxError) return err();
        if (e instanceof RangeError) return err("#NUM!");
        throw e;
      }
    },
  );
export const textFunctions: FunctionRegistry = registry;
