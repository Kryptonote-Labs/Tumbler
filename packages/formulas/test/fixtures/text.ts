import type { FormulaScalarValue as Scalar } from "../../src/evaluator.ts";
export interface TextCase {
  name: string;
  formula: string;
  expected: Scalar | readonly (readonly Scalar[])[];
  cells?: Record<string, Scalar>;
  requiresService?: boolean;
  oracle?: "excel" | "host" | "nondeterministic";
  dateSystem?: "1900" | "1904";
  tolerance?: number;
}
const S = (value: string): Scalar => ({ type: "string", value });
const N = (value: number): Scalar => ({ type: "number", value });
const E = (value: `#${string}` = "#VALUE!"): Scalar => ({
  type: "error",
  value,
});
export const cases: TextCase[] = [];
function add(
  name: string,
  formula: string,
  expected: TextCase["expected"],
  extra: Partial<TextCase> = {},
) {
  cases.push({ name, formula, expected, ...extra });
}
function tail(args: string): string {
  let quote = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '"') quote = !quote;
    if (args[i] === "," && !quote) return args.slice(i);
  }
  return "";
}
const simple: [string, string, Scalar][] = [
  ["ASC", '"ＡＢＣ　ガ"', S("ABC ｶﾞ")],
  ["DBCS", '"ABC ｶﾞ"', S("ＡＢＣ　ガ")],
  ["JIS", '"a1"', S("ａ１")],
  ["BAHTTEXT", "123.45", S("หนึ่งร้อยยี่สิบสามบาทสี่สิบห้าสตางค์")],
  ["CHAR", "65", S("A")],
  ["CLEAN", '"abc"', S("abc")],
  ["CODE", '"Apple"', N(65)],
  ["DOLLAR", "1234.5", S("$1,234.50")],
  ["FINDB", '"b","abc"', N(2)],
  ["FIXED", "1234.567,2", S("1,234.57")],
  ["LEFTB", '"abc",2', S("ab")],
  ["LENB", '"abc"', N(3)],
  ["MIDB", '"abcdef",2,3', S("bcd")],
  ["NUMBERVALUE", '"1.234,56",",","."', N(1234.56)],
  ["REPLACE", '"abcdef",2,3,"X"', S("aXef")],
  ["REPLACEB", '"abcdef",2,3,"X"', S("aXef")],
  ["REPT", '"ab",3', S("ababab")],
  ["RIGHTB", '"abc",2', S("bc")],
  ["SEARCHB", '"B","abc"', N(2)],
  ["T", '"hello"', S("hello")],
  ["TEXT", '12.345,"0.00"', S("12.35")],
  ["TEXTAFTER", '"a:b:c",":"', S("b:c")],
  ["TEXTBEFORE", '"a:b:c",":"', S("a")],
  ["UNICHAR", "128512", S("😀")],
  ["UNICODE", '"😀"', N(128512)],
  ["VALUE", '"$1,234.50"', N(1234.5)],
  ["VALUETOTEXT", '"a""b",1', S('"a""b"')],
  ["ARRAYTOTEXT", "123,1", S("{123}")],
  ["REGEXTEST", '"abc123","[0-9]+"', { type: "boolean", value: true }],
  ["REGEXEXTRACT", '"abc123","[0-9]+"', S("123")],
  ["REGEXREPLACE", '"a1b2","[0-9]","X"', S("aXbX")],
];
for (const [fn, args, result] of simple) {
  add(fn + " success", `${fn}(${args})`, result);
  add(
    fn + " error propagation",
    `${fn}(#N/A${tail(args)})`,
    fn === "VALUETOTEXT"
      ? S("#N/A")
      : fn === "ARRAYTOTEXT"
        ? S("{#N/A}")
        : E("#N/A"),
  );
}
add("TEXTSPLIT grid", 'TEXTSPLIT("a,b;c",",",";")', [
  [S("a"), S("b")],
  [S("c"), E("#N/A")],
]);
add("TEXTSPLIT invalid delimiter", 'TEXTSPLIT("abc","")', E());
for (const [fn, args, value] of [
  ["TRANSLATE", '"Hello","en","fr"', "Bonjour"],
  ["DETECTLANGUAGE", '"Bonjour"', "fr"],
  ["PHONETIC", "Inputs!A1", "とうきょう"],
] as const) {
  add(fn + " modeled host", `${fn}(${args})`, S(value), {
    requiresService: true,
    oracle: "host",
    ...(fn === "PHONETIC" ? { cells: { A1: S("東京") } } : {}),
  });
  add(fn + " error", `${fn}(#N/A)`, E("#N/A"));
}
const edges: [string, string, TextCase["expected"]][] = [
  ["empty clean", "CLEAN(CHAR(9))", S("")],
  ["clean keeps NBSP", "CLEAN(UNICHAR(160))", S("\u00a0")],
  ["CHAR lower bound", "CHAR(0)", E()],
  ["CHAR upper bound", "CHAR(256)", E()],
  ["UNICODE empty", 'UNICODE("")', E()],
  ["UNICHAR surrogate", "UNICHAR(55296)", E()],
  ["UNICHAR upper", "UNICHAR(1114111)", S(String.fromCodePoint(1114111))],
  ["UNICHAR overflow", "UNICHAR(1114112)", E()],
  ["CODE empty", 'CODE("")', E()],
  ["REPT negative", 'REPT("x",-1)', E()],
  ["REPT overflow", 'REPT("x",32768)', E()],
  ["REPT fractional", 'REPT("x",2.9)', S("xx")],
  ["REPT zero", 'REPT("x",0)', S("")],
  ["REPLACE append", 'REPLACE("a",9,5,"b")', S("ab")],
  ["REPLACE invalid", 'REPLACE("a",0,1,"b")', E()],
  ["LEFTB negative", 'LEFTB("abc",-1)', E()],
  ["RIGHTB zero", 'RIGHTB("abc",0)', S("")],
  ["MIDB past end", 'MIDB("abc",9,2)', S("")],
  ["FINDB case sensitive", 'FINDB("B","abc")', E()],
  ["FINDB start", 'FINDB("a","abc",0)', E()],
  ["T number", "T(123)", S("")],
  ["T boolean", "T(TRUE)", S("")],
  ["VALUE scientific", 'VALUE("1.2E3")', N(1200)],
  ["VALUE empty", 'VALUE("")', E()],
  ["NUMBERVALUE percent", 'NUMBERVALUE("9%%")', N(0.0009)],
  ["NUMBERVALUE empty", 'NUMBERVALUE("")', N(0)],
  ["NUMBERVALUE separators", 'NUMBERVALUE("1", ".", ".")', E()],
  ["NUMBERVALUE repeated decimal", 'NUMBERVALUE("1.2.3")', E()],
  ["NUMBERVALUE fractional grouping", 'NUMBERVALUE("1.2,3")', E()],
  ["NUMBERVALUE overflow", 'NUMBERVALUE("1E309")', E()],
  ["DOLLAR negative", "DOLLAR(-12.5)", S("($12.50)")],
  ["FIXED no commas", "FIXED(1234.5,1,TRUE)", S("1234.5")],
  ["FIXED hundreds", "FIXED(1234,-2)", S("1,200")],
  ["TEXT percent", 'TEXT(0.125,"0.0%")', S("12.5%")],
  ["TEXT empty format", 'TEXT(1,"")', S("")],
  ["BAHTTEXT zero", "BAHTTEXT(0)", S("ศูนย์บาทถ้วน")],
  ["BAHTTEXT million", "BAHTTEXT(1000001)", S("หนึ่งล้านหนึ่งบาทถ้วน")],
  ["BAHTTEXT negative", "BAHTTEXT(-21.01)", S("ลบยี่สิบเอ็ดบาทหนึ่งสตางค์")],
  ["TEXTAFTER reverse", 'TEXTAFTER("a:b:c",":",-1)', S("c")],
  ["TEXTBEFORE reverse", 'TEXTBEFORE("a:b:c",":",-1)', S("a:b")],
  ["TEXTAFTER fallback", 'TEXTAFTER("abc",":",1,0,0,"none")', S("none")],
  ["TEXTBEFORE missing", 'TEXTBEFORE("abc",":")', E("#N/A")],
  ["TEXTAFTER zero", 'TEXTAFTER("abc",":",0)', E()],
  ["TEXTAFTER match end", 'TEXTAFTER("abc",":",1,0,1)', S("")],
  ["TEXTBEFORE empty delim", 'TEXTBEFORE("abc","")', S("")],
  [
    "TEXTSPLIT ignore empty",
    'TEXTSPLIT("a,,b,",",","|",TRUE)',
    [[S("a"), S("b")]],
  ],
  ["REGEX no match", 'REGEXEXTRACT("abc","[0-9]+")', E("#N/A")],
  [
    "REGEX captures",
    'REGEXEXTRACT("abc123","([a-z]+)([0-9]+)",2)',
    [[S("abc"), S("123")]],
  ],
  ["REGEX all", 'REGEXEXTRACT("a1b2","[0-9]",1)', [[S("1")], [S("2")]]],
  ["REGEX replace nth", 'REGEXREPLACE("a1b2","[0-9]","X",-1)', S("a1bX")],
  [
    "REGEX replacement captures",
    'REGEXREPLACE("abc123","([a-z]+)([0-9]+)","$2-$1")',
    S("123-abc"),
  ],
  [
    "REGEX case",
    'REGEXTEST("ABC","^abc$",1)',
    { type: "boolean", value: true },
  ],
  ["REGEX invalid", 'REGEXTEST("abc","[")', E()],
  ["REGEX alternation", 'REGEXEXTRACT("cat","dog|cat")', S("cat")],
  ["REGEX lazy", 'REGEXEXTRACT("a123b456b","a.*?b")', S("a123b")],
  ["ARRAYTOTEXT invalid mode", "ARRAYTOTEXT(1,2)", E()],
  ["VALUETOTEXT error as text", "VALUETOTEXT(#N/A)", S("#N/A")],
  ["ARRAYTOTEXT error as text", "ARRAYTOTEXT(#N/A)", S("#N/A")],
  ["ASC preserves accents", 'ASC("é漢字")', S("é漢字")],
  ["JIS blank", 'JIS("")', S("")],
  ["DBCS punctuation", 'DBCS("!")', S("！")],
];
for (const [name, formula, expected] of edges) add(name, formula, expected);
add("reference numeric coercion", 'REPT(Inputs!A1,"2")', S("1212"), {
  cells: { A1: N(12) },
});
add("reference boolean T", "T(Inputs!A1)", S(""), {
  cells: { A1: { type: "boolean", value: true } },
});
add("reference error", "LEFTB(Inputs!A1)", E("#DIV/0!"), {
  cells: { A1: E("#DIV/0!") },
});

add("TEXT 1900 leap day", 'TEXT(60,"yyyy-mm-dd")', S("1900-02-29"));
add("TEXT 1904 epoch", 'TEXT(0,"yyyy-mm-dd")', S("1904-01-01"), {
  dateSystem: "1904",
});
add("TEXT date boundary", 'TEXT(2958465,"yyyy-mm-dd")', S("9999-12-31"));
add("TEXT date overflow", 'TEXT(2958466,"yyyy-mm-dd")', E());
add("TEXT date negative", 'TEXT(-1,"yyyy-mm-dd")', E());
add("VALUE invalid", 'VALUE("not a number")', E());
add("REPT extreme empty", 'REPT("",1E100)', S(""));
add("REPT exact cell limit", 'REPT("x",32767)', S("x".repeat(32767)));
add("TEXTSPLIT custom pad", 'TEXTSPLIT("a,b;c",",",";",FALSE,0,"-")', [
  [S("a"), S("b")],
  [S("c"), S("-")],
]);
add("REGEX zero width", 'REGEXREPLACE("ab","^","X")', S("Xab"));
add("REGEX quantifier range", 'REGEXEXTRACT("a12345","[0-9]{2,3}")', S("123"));
add("SEARCHB no match", 'SEARCHB("z","abc")', E());
add("LENB empty", 'LENB("")', N(0));

add("REGEX branch capture priority", 'REGEXEXTRACT("aa","(aa|a)+",2)', [
  [S("aa")],
]);
add("FIXED max decimals", "FIXED(1,127)", S("1." + "0".repeat(127)));
add("FIXED decimals overflow", "FIXED(1,128)", E());

add("SEARCHB wildcard", 'SEARCHB("a?c","xabcy")', N(2));
add("SEARCHB escaped wildcard", 'SEARCHB("~*","a*b")', N(2));
add("SEARCHB empty at end", 'SEARCHB("","abc",4)', N(4));
add("FINDB empty at end", 'FINDB("","abc",4)', N(4));
