# Strict theme validation

The validator uses Open XML SDK **3.5.1**, targeting Office 2007 unless
`--office2010` is passed. It opens the input package read-only. The SDK translates
Strict namespaces into its Transitional object model, but its
[`Miter.Limit` metadata](https://github.com/dotnet/Open-XML-SDK/blob/v3.5.1/generated/DocumentFormat.OpenXml/DocumentFormat.OpenXml.Generator/DocumentFormat.OpenXml.Generator.OpenXmlGenerator/schemas_openxmlformats_org_drawingml_2006_main.g.cs#L7295)
still expects `Int32Value`. It rejects the schema-valid Strict theme attribute
`<a:miter lim="800%"/>` as an invalid integer.

The published [ECMA-376 Strict schemas](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
define `CT_LineJoinMiterProperties/@lim` as optional `ST_PositivePercentage`.
`shared-commonSimpleTypes.xsd` restricts `ST_Percentage`, an `xsd:string`, with
`[0-9]+(\.[0-9]+)?%`. The base pattern is `-?[0-9]+(\.[0-9]+)?%`.
Whitespace is preserved. The actual XSD accepts `800%`, `000800.0000%`, `0%`,
`1.0001%` and `2147483.648%`; it rejects `800000`, `-1%`, `+1%`, leading or
trailing spaces and exponent notation. Strict permits arbitrary decimal
precision and does not impose the SDK's Int32 range.

`StrictThemeValidation` checks that lexical grammar on the original XML of
Strict theme parts, then converts only their miter limits into SDK thousandths
in the in-memory DOM. For example, `800%` becomes `800000` for SDK validation.
It never writes those integers into the DOCX. Missing optional limits stay
absent, and Transitional themes are unchanged. The raw and SDK element counts
must match. Unrepresentable precision or range fails with an explicit SDK
limitation rather than rounding, clamping or passing the package. The SDK still
validates every other attribute and element; no reported errors are filtered.
This adapter covers only Strict theme miter limits, not general Strict XSD
validation or all SDK translation differences.

[MS-OI29500 §2.1.1302](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/7bd817fb-79cf-4789-b733-4a29f032f5b7)
documents Office's miter limit as the maximum distance between inner and outer
corners as a percentage of line width. That explains the units, but is not a
desktop Word interoperability measurement. Desktop Word was not run.

Run the focused integration checks, retaining generated fixtures and logs:

```sh
dotnet build tools/openxml-validator/OpenXmlValidator.csproj -o /tmp/strict-theme-validator
bun tools/openxml-validator/test-strict-theme.ts /tmp/strict-theme-validator/OpenXmlValidator.dll /tmp/strict-theme-fixtures
```

The minimal Strict fixture contains one authored text paragraph and the generated
theme, including its three required line styles with `800%` miter limits. Run the
same fixture against the unmodified SDK validator to reproduce three integer
errors, then against this adapter to pass. The integration checks also cover
zero, fractional and boundary values, omitted limits, invalid Strict lexicals,
valid values outside the SDK's exact representation, a separate invalid
highlight, Transitional output and unchanged input package bytes. CI runs them
in the `open-xml-sdk` job.
