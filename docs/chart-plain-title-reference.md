# Plain chart title edits

Plain title edits preserve the rich formatting around the changed text. This
applies to the title field in document editors and to string edits through the
headless API and CLI. Multiple paragraphs and native DrawingML line breaks use
the same path as single-line titles.

Disjoint replacements are applied independently. Editing `North\n42\nSouth`
to `East\n42\nWest` retains the unchanged native field `42`, its identity and
formatting, and the last paragraph's own formatting. Changed text inherits the
run at the edit, and newly inserted paragraphs inherit that paragraph's defaults.
Typing into an empty paragraph uses its template defaults. Clearing a title
retains an empty run with its insertion style for subsequent typing.

Existing line breaks retain their native properties. New newline characters
create paragraphs, including empty and trailing lines. Carriage returns are
encoded as character references so XML normalization does not add an extra
line break to CRLF text. Unicode pairs stay intact across diff boundaries.

Paragraphs retain their layout and opaque metadata, as do unchanged runs and
fields. Splitting a field keeps its native identity on one fragment; the other
fragments are ordinary runs with the same style. A no-op plain edit leaves the
source bytes unchanged when its existing title is already enabled. Rich edits
continue to accept explicit paragraph/run properties.

## Native validation

```sh
bun scripts/generate-chart-plain-title-fixtures.ts /tmp/chart-plain-title/input
bash scripts/validate-openxml.sh /tmp/chart-plain-title/input/*.docx /tmp/chart-plain-title/input/*.pptx /tmp/chart-plain-title/input/*.xlsx
```

All 18 strict/transitional chart fixtures in Word, PowerPoint and Excel packages
pass Open XML SDK validation. The cases include the original styled title,
disjoint replacements around a native field, and inserted paragraphs splitting
that field. Focused tests also cover native breaks, empty paragraph defaults,
CRLF, clearing/retyping, no-op bytes and edits at run/paragraph boundaries.

LibreOffice 26.8.2.2 converts the two representative edited PowerPoint files to
PDF. Extracted text preserves the three disjoint-edit lines and the four
inserted lines. The disjoint reference retains the first line's theme-derived
colour and the field's italic text. These are preservation and interoperability
checks; paragraph spacing, title wrapping and complete pixel parity require
separate renderer comparisons.
