# Preserving native rich chart text

Rich title edits retain native field IDs and types, field paragraph properties,
formatted line breaks, paragraph-end formatting and extension metadata. Fields
remain fields when their displayed text or formatting changes.

`ChartTextParagraph` and its runs retain a `sourceWrapper` containing native
attributes and unmodeled children. The modeled properties and text are stored
separately, so the metadata does not duplicate whole rich-text trees.

Copied fragments retain their effective markup-compatibility directives and
namespace bindings, including directives inherited from the chart root. Prefix
rebinding keeps the original expanded namespace meaning. This follows the
inherited contexts in the
[Open XML SDK MC implementation](https://github.com/dotnet/Open-XML-SDK/blob/main/src/DocumentFormat.OpenXml.Framework/MCContext.cs).
The bindings are embedded in retained metadata, so copying or native
serialization does not depend on a process-local namespace lookup.

Run-property edits preserve comments and processing instructions when schema
ordering moves a colour before an existing font. Plain inspected title text
also includes the native paragraph and line breaks.

## Validation

```sh
bun scripts/generate-chart-rich-text-fixtures.ts /tmp/chart-rich-text/input
bash scripts/validate-openxml.sh /tmp/chart-rich-text/input/*.docx /tmp/chart-rich-text/input/*.pptx /tmp/chart-rich-text/input/*.xlsx
```

The four before/after cases cover strict and transitional field, break,
paragraph-end and inherited markup-compatibility properties. All 12 Word,
PowerPoint and Excel packages pass Open XML SDK validation. The transitional
PowerPoint pair also converts to PDF in LibreOffice.

Eight focused preservation tests cover repeated edits, strict/transitional
cross-copy, structured-clone persistence, prefix rebinding and property
reordering. Together with existing title tests, 23 checks pass locally under
the memory and CPU ceiling. Broad tests and type checking run in CI.

Plain multiline string replacement still uses the existing replacement path,
which can reset native rich formatting. Paragraph-end properties are retained
here; their full influence on text metrics remains separate rendering work.
