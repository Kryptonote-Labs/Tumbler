import type { FormulaScalarValue } from "../../src/evaluator.ts";

const s = (value: string): FormulaScalarValue => ({ type: "string", value });
const n = (value: number): FormulaScalarValue => ({ type: "number", value });
const e = (value: `#${string}` = "#VALUE!"): FormulaScalarValue => ({ type: "error", value });
interface WebCase {
  name: string;
  formula: string;
  expected: FormulaScalarValue | FormulaScalarValue[][];
  requiresService?: boolean;
  oracle?: "excel" | "host" | "nondeterministic";
  cells?: Record<string, FormulaScalarValue>;
}
export const cases: WebCase[] = [
  { name: "service-modeled-response", formula: 'WEBSERVICE("https://example.test/quote")', requiresService: true, oracle: "host", expected: s("<quote><price>42.75</price></quote>") },
  { name: "service-modeled-nested", formula: 'FILTERXML(WEBSERVICE("https://example.test/quote"),"//price")', requiresService: true, oracle: "host", expected: n(42.75) },
  { name: "encode-sharepoint", formula: 'ENCODEURL("http://contoso.sharepoint.com/Finance/Profit and Loss Statement.xlsx")', expected: s("http%3A%2F%2Fcontoso.sharepoint.com%2FFinance%2FProfit%20and%20Loss%20Statement.xlsx") },
  { name: "encode-unreserved", formula: 'ENCODEURL("abcXYZ019-._~")', expected: s("abcXYZ019-._~") },
  { name: "encode-reserved", formula: 'ENCODEURL(" !*\'();:@&=+$,/?#[]%")', expected: s("%20%21%2A%27%28%29%3B%3A%40%26%3D%2B%24%2C%2F%3F%23%5B%5D%25") },
  { name: "encode-unicode", formula: 'ENCODEURL("café 東京 😀")', expected: s("caf%C3%A9%20%E6%9D%B1%E4%BA%AC%20%F0%9F%98%80") },
  { name: "encode-empty", formula: 'ENCODEURL("")', expected: s("") },
  { name: "encode-number", formula: "ENCODEURL(-12.5)", expected: s("-12.5") },
  { name: "encode-boolean", formula: "ENCODEURL(TRUE)", expected: s("TRUE") },
  { name: "encode-reference", formula: "ENCODEURL(Inputs!A1)", cells: { A1: s("profit & loss") }, expected: s("profit%20%26%20loss") },
  { name: "encode-number-reference", formula: "ENCODEURL(Inputs!A1)", cells: { A1: n(42) }, expected: s("42") },
  { name: "encode-blank-reference", formula: "ENCODEURL(Inputs!A1)", cells: { A1: { type: "blank" } }, expected: s("") },
  { name: "encode-error", formula: "ENCODEURL(#N/A)", expected: e("#N/A") },
  { name: "encode-nested", formula: 'ENCODEURL(ENCODEURL("a b"))', expected: s("a%2520b") },
  { name: "encode-output-overflow", formula: "ENCODEURL(Inputs!A1)", cells: { A1: s(" ".repeat(10923)) }, expected: e() },
  { name: "encode-output-boundary", formula: "ENCODEURL(Inputs!A1)", cells: { A1: s(" ".repeat(10922) + "a") }, expected: s("%20".repeat(10922) + "a") },
  { name: "xml-element", formula: 'FILTERXML("<root><item>apple</item></root>","/root/item")', expected: s("apple") },
  { name: "xml-descendants", formula: 'FILTERXML("<root><group><item>apple</item><item>pear</item></group></root>","//item")', expected: [[s("apple")], [s("pear")]] },
  { name: "xml-document-order", formula: 'FILTERXML("<r><item>a<item>b</item></item><item>c</item></r>","//item")', expected: [[s("ab")], [s("b")], [s("c")]] },
  { name: "xml-duplicate-descendants", formula: 'FILTERXML("<r><r><item>a</item></r></r>","//r//item")', expected: s("a") },
  { name: "xml-position-per-parent", formula: 'FILTERXML("<r><g><item>a</item><item>b</item></g><g><item>c</item><item>d</item></g></r>","//item[2]")', expected: [[s("b")], [s("d")]] },
  { name: "xml-reference", formula: 'FILTERXML(Inputs!A1,"//item")', cells: { A1: s("<root><item>12.5</item></root>") }, expected: n(12.5) },
  { name: "xml-attributes", formula: 'FILTERXML("<root><item id=""a""/><item id=""b""/></root>","//item/@id")', expected: [[s("a")], [s("b")]] },
  { name: "xml-position", formula: 'FILTERXML("<root><item>a</item><item>b</item></root>","//item[2]")', expected: s("b") },
  { name: "xml-predicate", formula: 'FILTERXML("<root><item id=""a"">first</item><item id=""b"">second</item></root>","//item[@id=\'b\']")', expected: s("second") },
  { name: "xml-text", formula: 'FILTERXML("<root><item>a</item></root>","//item/text()")', expected: s("a") },
  { name: "xml-mixed-content", formula: 'FILTERXML("<root>hello <b>world</b>!</root>","/root")', expected: s("hello world!") },
  { name: "xml-entities", formula: 'FILTERXML("<r>&amp;&lt;&gt;&quot;&apos;&#65;&#x1F600;</r>","/r")', expected: s('&<>"\'A😀') },
  { name: "xml-cdata", formula: 'FILTERXML("<r><![CDATA[a < b]]></r>","/r")', expected: s("a < b") },
  { name: "xml-empty-element", formula: 'FILTERXML("<r/>","/r")', expected: s("") },
  { name: "xml-no-match", formula: 'FILTERXML("<r/>","//missing")', expected: e() },
  { name: "xml-mismatched", formula: 'FILTERXML("<r></x>","/r")', expected: e() },
  { name: "xml-multiple-roots", formula: 'FILTERXML("<r/><r/>","/r")', expected: e() },
  { name: "xml-unknown-entity", formula: 'FILTERXML("<r>&unknown;</r>","/r")', expected: e() },
  { name: "xml-error", formula: 'FILTERXML(#REF!,"/r")', expected: e("#REF!") },
  { name: "xml-path-error", formula: 'FILTERXML("<r/>",#N/A)', expected: e("#N/A") },
  { name: "xml-empty", formula: 'FILTERXML("","/r")', expected: e() },
  { name: "xml-encoded-result", formula: 'ENCODEURL(FILTERXML("<r>a b</r>","/r"))', expected: s("a%20b") },
  { name: "service-file-protocol", formula: 'WEBSERVICE("file:///etc/passwd")', expected: e() },
  { name: "service-ftp-protocol", formula: 'WEBSERVICE("ftp://example.test/data")', expected: e() },
  { name: "service-empty", formula: 'WEBSERVICE("")', expected: e() },
  { name: "service-url-overflow", formula: "WEBSERVICE(Inputs!A1)", cells: { A1: s("https://example.test/" + "a".repeat(2048)) }, expected: e() },
  { name: "service-error", formula: "WEBSERVICE(#DIV/0!)", expected: e("#DIV/0!") },
];
cases.push(
 {name:"xml invalid empty PI target",formula:'FILTERXML("<r><??><x>7</x></r>","/r/x")',expected:e()},
 {name:"xml misplaced declaration",formula:'FILTERXML("<r><?xml version=\'1.0\'?><x>7</x></r>","/r/x")',expected:e()},
 {name:"xml invalid declaration version",formula:'FILTERXML("<?xml bad?><r>7</r>","/r")',expected:e()},
 {name:"xml reserved PI target case",formula:'FILTERXML("<?XML version=\'1.0\'?><r>7</r>","/r")',expected:e()},
 {name:"xml valid PI",formula:'FILTERXML("<r><?processing data?><x>7</x></r>","/r/x")',expected:n(7)},
 {name:"xml valid declaration",formula:'FILTERXML("<?xml version=\'1.0\'?><r>7</r>","/r")',expected:n(7)},
);
cases.push(
 {name:"xml rejects comment ending in hyphen",formula:'FILTERXML("<r><!--x--->7</r>","/r")',expected:e()},
 {name:"xml accepts trailing comment space",formula:'FILTERXML("<r><!--x- -->7</r>","/r")',expected:n(7)},
 {name:"xml rejects NBSP attribute separator",formula:'FILTERXML("<r\u00a0a=\'v\'>7</r>","/r")',expected:e()},
 {name:"xml rejects NBSP before closing tag bracket",formula:'FILTERXML("<r>7</r\u00a0>","/r")',expected:e()},
 {name:"xml rejects NBSP before self close",formula:'FILTERXML("<r\u00a0/>","/r")',expected:e()},
 {name:"xml rejects document leading NBSP",formula:'FILTERXML("\u00a0<r>7</r>","/r")',expected:e()},
 {name:"xml rejects document trailing NBSP",formula:'FILTERXML("<r>7</r>\u00a0","/r")',expected:e()},
 {name:"xml accepts XML syntax whitespace",formula:'FILTERXML(" \t\n<r\ta = \'v\'\n>7</r\t>\r\n","/r")',expected:n(7)},
 {name:"xml preserves NBSP in attribute values",formula:'FILTERXML("<r a=\'x\u00a0y\'>7</r>","/r/@a")',expected:s("x\u00a0y")},
);
